import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { Logger } from '../utils/logger.js';
import { DevProcess } from '../types.js';

export interface ServerState {
  timestamp: string;
  version: string;
  devProcess?: {
    pid: number;
    directory: string;
    status: 'running' | 'stopped' | 'error' | 'starting';
    startTime: string;
    ports: number[];
    command: string;
  };
  projectContext?: {
    currentDirectory: string;
    detectedProjects: Array<{
      directory: string;
      name: string;
      devScript: string;
      hasEnvFile: boolean;
      envPath?: string;
    }>;
  };
  healthStatus?: {
    lastHealthy: string;
    consecutiveFailures: number;
    lastError?: string;
  };
}

export class StateManager {
  private static instance: StateManager | null = null;
  private logger: Logger;
  private stateFilePath: string;
  private lockFilePath: string;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.logger = Logger.getInstance();
    
    // 状態ファイルのパスを設定
    const stateDir = join(homedir(), '.npm-dev-mcp');
    this.stateFilePath = join(stateDir, 'state.json');
    this.lockFilePath = join(stateDir, 'state.lock');
  }

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  /**
   * 状態管理を初期化
   */
  async initialize(): Promise<void> {
    try {
      // ディレクトリを作成
      const stateDir = dirname(this.stateFilePath);
      if (!existsSync(stateDir)) {
        await mkdir(stateDir, { recursive: true });
        this.logger.info('Created state directory', { stateDir });
      }

      // 既存の状態を読み込み
      await this.loadState();

      // 自動保存を開始
      this.startAutoSave();

      this.logger.info('State manager initialized', { 
        stateFile: this.stateFilePath 
      });

    } catch (error) {
      this.logger.error('Failed to initialize state manager', { error });
      throw error;
    }
  }

  /**
   * 現在の状態を保存
   */
  async saveState(state: Partial<ServerState>): Promise<void> {
    try {
      // ロックファイルをチェック
      if (await this.isLocked()) {
        this.logger.warn('State file is locked, skipping save');
        return;
      }

      // ロックファイルを作成
      await this.createLock();

      try {
        // 既存の状態を読み込み
        let currentState: ServerState;
        try {
          currentState = await this.loadStateFromFile();
        } catch {
          // ファイルが存在しない場合は新しい状態を作成
          currentState = {
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          };
        }

        // 状態をマージ
        const newState: ServerState = {
          ...currentState,
          ...state,
          timestamp: new Date().toISOString()
        };

        // ファイルに保存
        await writeFile(this.stateFilePath, JSON.stringify(newState, null, 2), 'utf8');
        
        this.logger.debug('State saved successfully', { 
          timestamp: newState.timestamp,
          hasDevProcess: !!newState.devProcess
        });

      } finally {
        // ロックファイルを削除
        await this.removeLock();
      }

    } catch (error) {
      this.logger.error('Failed to save state', { error });
      await this.removeLock(); // エラー時もロックを削除
    }
  }

  /**
   * 状態を読み込み
   */
  async loadState(): Promise<ServerState | null> {
    try {
      return await this.loadStateFromFile();
    } catch (error) {
      this.logger.warn('Failed to load state, starting with empty state', { error });
      return null;
    }
  }

  /**
   * 開発サーバーの状態を保存
   */
  async saveDevProcessState(process: DevProcess | null): Promise<void> {
    let devProcess = undefined;
    
    if (process) {
      devProcess = {
        pid: process.pid,
        directory: process.directory,
        status: process.status,
        startTime: process.startTime.toISOString(),
        ports: process.ports,
        command: 'npm run dev'
      };
    }

    await this.saveState({ devProcess });
  }

  /**
   * プロジェクトコンテキストを保存
   */
  async saveProjectContext(context: {
    currentDirectory: string;
    detectedProjects: Array<{
      directory: string;
      name: string;
      devScript: string;
      hasEnvFile: boolean;
      envPath?: string;
    }>;
  }): Promise<void> {
    await this.saveState({ projectContext: context });
  }

  /**
   * ヘルス状態を保存
   */
  async saveHealthStatus(isHealthy: boolean, error?: string): Promise<void> {
    const currentState = await this.loadState();
    const currentHealth = currentState?.healthStatus;

    const healthStatus = {
      lastHealthy: isHealthy ? new Date().toISOString() : (currentHealth?.lastHealthy || new Date().toISOString()),
      consecutiveFailures: isHealthy ? 0 : (currentHealth?.consecutiveFailures || 0) + 1,
      lastError: error
    };

    await this.saveState({ healthStatus });
  }

  /**
   * 復旧用の状態情報を取得
   */
  async getRecoveryInfo(): Promise<{
    canRecover: boolean;
    devProcess?: ServerState['devProcess'];
    projectContext?: ServerState['projectContext'];
    lastHealthy?: string;
    consecutiveFailures: number;
  }> {
    const state = await this.loadState();
    
    if (!state) {
      return {
        canRecover: false,
        consecutiveFailures: 0
      };
    }

    return {
      canRecover: !!state.devProcess && state.devProcess.status === 'running',
      devProcess: state.devProcess,
      projectContext: state.projectContext,
      lastHealthy: state.healthStatus?.lastHealthy,
      consecutiveFailures: state.healthStatus?.consecutiveFailures || 0
    };
  }

  /**
   * 開発プロセス状態をクリア
   */
  async clearDevProcessState(): Promise<void> {
    try {
      const currentState = await this.loadState();
      if (currentState) {
        const { devProcess, ...restState } = currentState;
        await this.saveState(restState);
        this.logger.debug('Dev process state cleared');
      }
    } catch (error) {
      this.logger.error('Failed to clear dev process state', { error });
    }
  }

  /**
   * 状態ファイルをクリア
   */
  async clearState(): Promise<void> {
    try {
      if (existsSync(this.stateFilePath)) {
        await writeFile(this.stateFilePath, JSON.stringify({
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }, null, 2), 'utf8');
        
        this.logger.info('State cleared');
      }
    } catch (error) {
      this.logger.error('Failed to clear state', { error });
    }
  }

  /**
   * 自動保存を開始
   */
  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    // 5分ごとに自動保存（タイムスタンプ更新）
    this.autoSaveInterval = setInterval(async () => {
      try {
        await this.saveState({});
      } catch (error) {
        this.logger.error('Auto-save failed', { error });
      }
    }, 5 * 60 * 1000);
  }

  /**
   * 自動保存を停止
   */
  private stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * ファイルから状態を読み込み
   */
  private async loadStateFromFile(): Promise<ServerState> {
    try {
      const data = await readFile(this.stateFilePath, 'utf8');
      
      // 空ファイルチェック
      if (!data.trim()) {
        this.logger.warn('State file is empty, creating default state');
        throw new Error('Empty state file');
      }
      
      // JSONパース
      try {
        const parsed = JSON.parse(data);
        
        // 基本的な構造検証
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid state structure');
        }
        
        return parsed;
      } catch (parseError) {
        this.logger.error('JSON parse error in state file, backing up and creating new state', { 
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          data: data.substring(0, 200) // 最初の200文字のみログ
        });
        
        // 壊れたファイルをバックアップ
        const backupPath = this.stateFilePath + '.backup.' + Date.now();
        try {
          await writeFile(backupPath, data, 'utf8');
          this.logger.info('Backed up corrupted state file', { backupPath });
        } catch (backupError) {
          this.logger.warn('Failed to backup corrupted state file', { backupError });
        }
        
        throw new Error('JSON parse failed');
      }
    } catch (error) {
      // ファイル読み込みエラーまたはJSON解析エラー
      throw error;
    }
  }

  /**
   * ロックファイルをチェック
   */
  private async isLocked(): Promise<boolean> {
    return existsSync(this.lockFilePath);
  }

  /**
   * ロックファイルを作成
   */
  private async createLock(): Promise<void> {
    await writeFile(this.lockFilePath, process.pid.toString(), 'utf8');
  }

  /**
   * ロックファイルを削除
   */
  private async removeLock(): Promise<void> {
    try {
      if (existsSync(this.lockFilePath)) {
        await import('fs').then(fs => fs.promises.unlink(this.lockFilePath));
      }
    } catch (error) {
      // ロックファイル削除の失敗は警告レベル
      this.logger.warn('Failed to remove lock file', { error });
    }
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.stopAutoSave();
    this.removeLock().catch(() => {}); // エラーは無視
    StateManager.instance = null;
  }
}