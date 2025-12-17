import { spawn, ChildProcess } from 'child_process';
import { DevProcess } from '../types.js';
import { isProcessRunning, killProcess, parsePort } from '../utils/processUtils.js';
import { Logger } from '../utils/logger.js';
import { LogManager } from './LogManager.js';
import { PortDetector } from './PortDetector.js';
import { ProjectContextManager } from '../context/ProjectContextManager.js';
import { StateManager } from './StateManager.js';

interface RunningProcess {
  info: DevProcess;
  child: ChildProcess | null;
  logManager: LogManager;
}

export class ProcessManager {
  private static instance: ProcessManager | null = null;
  private logger = Logger.getInstance();
  private processes: Map<string, RunningProcess> = new Map();
  private portDetector: PortDetector;

  constructor() {
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

    // Check if a process is already running for this directory
    const existingProcess = this.processes.get(targetDirectory);
    if (existingProcess && await this.isProcessRunning(existingProcess)) {
      this.logger.info(`Dev server is already running for ${targetDirectory}`);
      return existingProcess.info;
    }

    try {
      // Clean up any stale process for this directory
      if (existingProcess) {
        await this.cleanupProcess(targetDirectory);
      }

      // Spawn the npm run dev process
      const childProcess = spawn('npm', ['run', 'dev'], {
        cwd: targetDirectory,
        env: env || process.env,
        detached: false, // Keep attached for better control
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const pid = childProcess.pid!;

      // Create properties
      const logManager = new LogManager();

      const processInfo: DevProcess = {
        pid,
        directory: targetDirectory,
        status: 'starting',
        startTime: new Date(),
        ports: []
      };

      // Store in map
      this.processes.set(targetDirectory, {
        info: processInfo,
        child: childProcess,
        logManager
      });

      // Start logging
      await logManager.startLogging(childProcess);

      // Set up process event handlers
      this.setupProcessHandlers(targetDirectory, childProcess);

      // Wait a moment for the process to potentially start
      await this.waitForProcessStart(targetDirectory);

      // Detect ports after a short delay
      setTimeout(async () => {
        const proc = this.processes.get(targetDirectory);
        if (proc) {
          proc.info.ports = await this.portDetector.getPortsByPid(pid);
          this.logger.info(`Detected ports for ${targetDirectory}: ${proc.info.ports.join(', ')}`);
          this.saveCurrentState();
        }
      }, 3000);

      this.logger.info(`Dev server started with PID ${pid} for ${targetDirectory}`);
      return processInfo;

    } catch (error) {
      this.logger.error(`Failed to start dev server for ${targetDirectory}`, { error });
      const proc = this.processes.get(targetDirectory);
      if (proc) {
        proc.info.status = 'error';
      }
      throw new Error(`Failed to start dev server: ${error}`);
    }
  }

  async stopDevServer(directory?: string): Promise<boolean> {
    this.logger.info(`Stopping dev server${directory ? ` for ${directory}` : ''}`);

    const targetDirectory = this.resolveTargetDirectory(directory);
    const processData = this.processes.get(targetDirectory);

    if (!processData) {
      this.logger.info(`No dev server running for ${targetDirectory}`);
      return true; // Already stopped or not found
    }

    try {
      const pid = processData.info.pid;

      // Try graceful shutdown first
      if (processData.child) {
        processData.child.kill('SIGTERM');
      } else {
        await killProcess(pid, 'SIGTERM');
      }

      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if process is still running
      if (await isProcessRunning(pid)) {
        this.logger.warn(`Process ${pid} did not stop gracefully, forcing termination`);
        await killProcess(pid, 'SIGKILL');
      }

      await this.cleanupProcess(targetDirectory);
      this.logger.info(`Dev server stopped successfully for ${targetDirectory}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to stop dev server for ${targetDirectory}`, { error });
      await this.cleanupProcess(targetDirectory); // Clean up anyway
      return false;
    }
  }

  async restartDevServer(directory?: string): Promise<DevProcess> {
    this.logger.info(`Restarting dev server${directory ? ` for ${directory}` : ''}`);

    const targetDirectory = this.resolveTargetDirectory(directory);

    await this.stopDevServer(targetDirectory);

    // Wait a moment before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));

    return this.startDevServer(targetDirectory);
  }

  async getStatus(): Promise<DevProcess[]> {
    const activeProcesses: DevProcess[] = [];

    for (const [dir, proc] of this.processes.entries()) {
      // Update the process status
      const isRunning = await this.isProcessRunning(proc);

      if (!isRunning && proc.info.status === 'running') {
        proc.info.status = 'stopped';
      }

      // Try to update ports if the process is running
      if (isRunning && proc.info.ports.length === 0) {
        try {
          proc.info.ports = await this.portDetector.getPortsByPid(proc.info.pid);
        } catch {
          // Ignore port detection errors
        }
      }

      activeProcesses.push({ ...proc.info });
    }

    return activeProcesses;
  }

  getProcess(directory?: string): DevProcess | null {
    const targetDirectory = this.resolveTargetDirectory(directory);
    return this.processes.get(targetDirectory)?.info || null;
  }

  private resolveTargetDirectory(directory?: string): string {
    if (directory) return directory;

    // If no directory specified, and only one process running, return that
    if (this.processes.size === 1) {
      const dir = this.processes.keys().next().value;
      if (dir) return dir;
    }

    // Fallback to project context or CWD
    const contextManager = ProjectContextManager.getInstance();
    if (contextManager.isInitialized()) {
      return contextManager.getContext().rootDirectory;
    }
    return process.cwd();
  }

  private async isProcessRunning(proc: RunningProcess): Promise<boolean> {
    return await isProcessRunning(proc.info.pid);
  }

  private setupProcessHandlers(directory: string, childProcess: ChildProcess): void {
    const proc = this.processes.get(directory);
    if (!proc) return;

    childProcess.on('spawn', () => {
      this.logger.debug(`Process spawned successfully for ${directory}`);
      if (proc.info) {
        proc.info.status = 'running';
        this.saveCurrentState();
      }
    });

    childProcess.on('error', (error) => {
      this.logger.error(`Process error for ${directory}`, { error });
      if (proc.info) {
        proc.info.status = 'error';
        this.saveCurrentState();
      }
    });

    childProcess.on('exit', (code, signal) => {
      this.logger.info(`Process for ${directory} exited with code ${code}, signal ${signal}`);
      if (proc.info) {
        proc.info.status = 'stopped';
        this.saveCurrentState();
      }
    });

    // Listen for port information in the output
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        const ports = parsePort(output);
        if (ports.length > 0) {
          // Merge with existing ports
          const allPorts = [...proc.info.ports, ...ports];
          proc.info.ports = [...new Set(allPorts)]; // Remove duplicates
          this.saveCurrentState();
        }
      });
    }
  }

  private async waitForProcessStart(directory: string): Promise<void> {
    const proc = this.processes.get(directory);
    if (!proc) return;

    // Wait up to 10 seconds for the process to start properly
    const maxWaitTime = 10000;
    const checkInterval = 500;
    let waited = 0;

    while (waited < maxWaitTime) {
      if (proc.info.status === 'error') {
        throw new Error('Process failed to start');
      }

      if (proc.info.status === 'running') {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    // If we're still starting after the wait time, assume it's running
    if (proc.info.status === 'starting') {
      proc.info.status = 'running';
    }
  }

  private async cleanupProcess(directory: string): Promise<void> {
    const proc = this.processes.get(directory);
    if (proc) {
      try {
        await proc.logManager.stopLogging();
      } catch {
        // Ignore cleanup errors
      }
      this.processes.delete(directory);
      this.saveCurrentState();
    }
  }

  private async cleanup(): Promise<void> {
    for (const directory of this.processes.keys()) {
      await this.cleanupProcess(directory);
    }
  }

  getLogManager(directory?: string): LogManager | null {
    const targetDirectory = this.resolveTargetDirectory(directory);
    return this.processes.get(targetDirectory)?.logManager || null;
  }

  /**
   * 現在の状態をStateManagerに保存
   */
  private saveCurrentState(): void {
    try {
      const stateManager = StateManager.getInstance();
      const processes = Array.from(this.processes.values()).map(p => p.info);
      stateManager.saveDevProcessState(processes).catch(error => {
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

      if (state?.devProcesses) {
        for (const [dir, processInfo] of Object.entries(state.devProcesses)) {
          // プロセスがまだ実行中かチェック
          if (await isProcessRunning(processInfo.pid)) {
            // LogManagerは新規作成（既存ログは復元できないが、インスタンスは必要）
            const logManager = new LogManager();

            this.processes.set(dir, {
              info: {
                pid: processInfo.pid,
                directory: processInfo.directory,
                status: 'running',
                startTime: new Date(processInfo.startTime),
                ports: processInfo.ports
              },
              child: null, // 再接続不可
              logManager
            });

            this.logger.info(`Restored existing dev server process for ${dir}: PID ${processInfo.pid}`);
          }
        }

        // 実行していないプロセスのクリーンアップは saveCurrentState で自然に行われる（あるいは明示的に行う）
        if (this.processes.size === 0 && Object.keys(state.devProcesses).length > 0) {
          await stateManager.clearDevProcessState();
          this.logger.debug('Cleared stale process state');
        }
      }
    } catch (error) {
      this.logger.warn('Failed to restore process state', { error });
    }
  }
}