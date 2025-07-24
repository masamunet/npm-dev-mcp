import { spawn, ChildProcess } from 'child_process';
import { DevProcess } from '../types.js';
import { isProcessRunning, killProcess, parsePort } from '../utils/processUtils.js';
import { Logger } from '../utils/logger.js';
import { LogManager } from './LogManager.js';
import { PortDetector } from './PortDetector.js';
import { ProjectContextManager } from '../context/ProjectContextManager.js';
import { StateManager } from './StateManager.js';

export class ProcessManager {
  private static instance: ProcessManager | null = null;
  private logger = Logger.getInstance();
  private currentProcess: DevProcess | null = null;
  private childProcess: ChildProcess | null = null;
  private logManager: LogManager;
  private portDetector: PortDetector;

  constructor() {
    this.logManager = new LogManager();
    this.portDetector = new PortDetector();
    
    // 既存のプロセス状態を復元（非同期で実行）
    this.restoreProcessState().catch(error => {
      this.logger.warn('Failed to restore process state during construction', { error });
    });
  }

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  async startDevServer(
    directory?: string, 
    env?: Record<string, string>
  ): Promise<DevProcess> {
    // Use project context if no directory specified
    let targetDirectory = directory;
    if (!targetDirectory) {
      const contextManager = ProjectContextManager.getInstance();
      if (contextManager.isInitialized()) {
        targetDirectory = contextManager.getContext().rootDirectory;
      } else {
        targetDirectory = process.cwd();
      }
    }
    
    this.logger.info(`Starting dev server in ${targetDirectory}`);

    // Check if a process is already running
    if (this.currentProcess && await this.isCurrentProcessRunning()) {
      this.logger.info('Dev server is already running');
      return this.currentProcess;
    }

    try {
      // Clean up any stale process references
      await this.cleanup();

      // Spawn the npm run dev process
      this.childProcess = spawn('npm', ['run', 'dev'], {
        cwd: targetDirectory,
        env: env || process.env,
        detached: false, // Keep attached for better control
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const pid = this.childProcess.pid!;
      
      // Create process info
      this.currentProcess = {
        pid,
        directory: targetDirectory,
        status: 'starting',
        startTime: new Date(),
        ports: []
      };

      // Start logging
      await this.logManager.startLogging(this.childProcess);

      // Set up process event handlers
      this.setupProcessHandlers();

      // Wait a moment for the process to potentially start
      await this.waitForProcessStart();

      // Detect ports after a short delay
      setTimeout(async () => {
        if (this.currentProcess) {
          this.currentProcess.ports = await this.portDetector.getPortsByPid(pid);
          this.logger.info(`Detected ports: ${this.currentProcess.ports.join(', ')}`);
        }
      }, 3000);

      this.logger.info(`Dev server started with PID ${pid}`);
      return this.currentProcess;

    } catch (error) {
      this.logger.error('Failed to start dev server', { error });
      if (this.currentProcess) {
        this.currentProcess.status = 'error';
      }
      throw new Error(`Failed to start dev server: ${error}`);
    }
  }

  async stopDevServer(): Promise<boolean> {
    this.logger.info('Stopping dev server');

    if (!this.currentProcess) {
      this.logger.info('No dev server is running');
      return true;
    }

    try {
      const pid = this.currentProcess.pid;
      
      // Try graceful shutdown first
      if (this.childProcess) {
        this.childProcess.kill('SIGTERM');
      } else {
        await killProcess(pid, 'SIGTERM');
      }

      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if process is still running
      if (await isProcessRunning(pid)) {
        this.logger.warn('Process did not stop gracefully, forcing termination');
        await killProcess(pid, 'SIGKILL');
      }

      await this.cleanup();
      this.logger.info('Dev server stopped successfully');
      return true;

    } catch (error) {
      this.logger.error('Failed to stop dev server', { error });
      await this.cleanup(); // Clean up anyway
      return false;
    }
  }

  async restartDevServer(): Promise<DevProcess> {
    this.logger.info('Restarting dev server');
    
    let directory = this.currentProcess?.directory;
    if (!directory) {
      const contextManager = ProjectContextManager.getInstance();
      if (contextManager.isInitialized()) {
        directory = contextManager.getContext().rootDirectory;
      } else {
        directory = process.cwd();
      }
    }
    
    await this.stopDevServer();
    
    // Wait a moment before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return this.startDevServer(directory);
  }

  async getStatus(): Promise<DevProcess | null> {
    if (!this.currentProcess) {
      return null;
    }

    // Update the process status
    const isRunning = await this.isCurrentProcessRunning();
    
    if (!isRunning && this.currentProcess.status === 'running') {
      this.currentProcess.status = 'stopped';
    }

    // Try to update ports if the process is running
    if (isRunning && this.currentProcess.ports.length === 0) {
      try {
        this.currentProcess.ports = await this.portDetector.getPortsByPid(this.currentProcess.pid);
      } catch {
        // Ignore port detection errors
      }
    }

    return { ...this.currentProcess };
  }

  getCurrentProcess(): DevProcess | null {
    return this.currentProcess;
  }

  private async isCurrentProcessRunning(): Promise<boolean> {
    if (!this.currentProcess) {
      return false;
    }
    
    return await isProcessRunning(this.currentProcess.pid);
  }

  private setupProcessHandlers(): void {
    if (!this.childProcess || !this.currentProcess) {
      return;
    }

    this.childProcess.on('spawn', () => {
      this.logger.debug('Process spawned successfully');
      if (this.currentProcess) {
        this.currentProcess.status = 'running';
        this.saveCurrentState();
      }
    });

    this.childProcess.on('error', (error) => {
      this.logger.error('Process error', { error });
      if (this.currentProcess) {
        this.currentProcess.status = 'error';
        this.saveCurrentState();
      }
    });

    this.childProcess.on('exit', (code, signal) => {
      this.logger.info(`Process exited with code ${code}, signal ${signal}`);
      if (this.currentProcess) {
        this.currentProcess.status = 'stopped';
        this.saveCurrentState();
      }
    });

    // Listen for port information in the output
    if (this.childProcess.stdout) {
      this.childProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        const ports = parsePort(output);
        if (ports.length > 0 && this.currentProcess) {
          // Merge with existing ports
          const allPorts = [...this.currentProcess.ports, ...ports];
          this.currentProcess.ports = [...new Set(allPorts)]; // Remove duplicates
          this.saveCurrentState();
        }
      });
    }
  }

  private async waitForProcessStart(): Promise<void> {
    if (!this.currentProcess) {
      return;
    }

    // Wait up to 10 seconds for the process to start properly
    const maxWaitTime = 10000;
    const checkInterval = 500;
    let waited = 0;

    while (waited < maxWaitTime) {
      if (this.currentProcess.status === 'error') {
        throw new Error('Process failed to start');
      }
      
      if (this.currentProcess.status === 'running') {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    // If we're still starting after the wait time, assume it's running
    if (this.currentProcess.status === 'starting') {
      this.currentProcess.status = 'running';
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await this.logManager.stopLogging();
    } catch {
      // Ignore cleanup errors
    }

    this.childProcess = null;
    this.currentProcess = null;
  }

  getLogManager(): LogManager {
    return this.logManager;
  }

  /**
   * 現在の状態をStateManagerに保存
   */
  private saveCurrentState(): void {
    try {
      const stateManager = StateManager.getInstance();
      stateManager.saveDevProcessState(this.currentProcess).catch(error => {
        this.logger.warn('Failed to save process state', { error });
      });
    } catch (error) {
      this.logger.warn('StateManager not available for state saving', { error });
    }
  }

  /**
   * StateManagerから既存のプロセス状態を復元
   */
  private async restoreProcessState(): Promise<void> {
    try {
      const stateManager = StateManager.getInstance();
      const state = await stateManager.loadState();
      
      if (state?.devProcess) {
        const processInfo = state.devProcess;
        
        // プロセスがまだ実行中かチェック
        if (await isProcessRunning(processInfo.pid)) {
          this.currentProcess = {
            pid: processInfo.pid,
            directory: processInfo.directory,
            status: 'running',
            startTime: new Date(processInfo.startTime),
            ports: processInfo.ports
          };
          
          this.logger.info(`Restored existing dev server process: PID ${processInfo.pid}`);
          
          // 既存プロセスのstdout/stderrを再接続することはできないため、
          // ログマネージャーは新しいプロセス起動時のみ有効
        } else {
          // プロセスが存在しない場合は状態をクリア
          await stateManager.clearDevProcessState();
          this.logger.debug('Cleared stale process state');
        }
      }
    } catch (error) {
      this.logger.warn('Failed to restore process state', { error });
    }
  }
}