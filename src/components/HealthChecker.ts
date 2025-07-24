import { Logger } from '../utils/logger.js';
import { ProcessManager } from './ProcessManager.js';
import { ProjectContextManager } from '../context/ProjectContextManager.js';

export interface HealthStatus {
  isHealthy: boolean;
  timestamp: string;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  devServerStatus: 'running' | 'stopped' | 'error';
  lastError?: string;
  checks: {
    memory: boolean;
    processManager: boolean;
    devServer: boolean;
  };
}

export class HealthChecker {
  private static instance: HealthChecker | null = null;
  private logger: Logger;
  private startTime: number;
  private lastHealthCheck: HealthStatus | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  private constructor() {
    this.logger = Logger.getInstance();
    this.startTime = Date.now();
  }

  static getInstance(): HealthChecker {
    if (!HealthChecker.instance) {
      HealthChecker.instance = new HealthChecker();
    }
    return HealthChecker.instance;
  }

  /**
   * ヘルスチェックを開始（定期実行）
   */
  startPeriodicHealthCheck(intervalMs: number = 30000): void {
    this.logger.info('Starting periodic health checks', { intervalMs });
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const status = await this.performHealthCheck();
        if (!status.isHealthy) {
          this.logger.warn('Health check failed', { status });
        }
      } catch (error) {
        this.logger.error('Health check error', { error });
      }
    }, intervalMs);
  }

  /**
   * 定期ヘルスチェックを停止
   */
  stopPeriodicHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.logger.info('Stopped periodic health checks');
    }
  }

  /**
   * 即座にヘルスチェックを実行
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = Date.now() - this.startTime;
    const memoryUsage = process.memoryUsage();
    
    const checks = {
      memory: this.checkMemoryUsage(memoryUsage),
      processManager: await this.checkProcessManager(),
      devServer: await this.checkDevServer()
    };

    let devServerStatus: 'running' | 'stopped' | 'error' = 'stopped';
    let lastError: string | undefined;

    try {
      const processManager = ProcessManager.getInstance();
      const currentProcess = processManager.getCurrentProcess();
      
      if (currentProcess && currentProcess.status === 'running') {
        devServerStatus = 'running';
      } else if (currentProcess && currentProcess.status === 'error') {
        devServerStatus = 'error';
        lastError = 'Dev server process in error state';
      }
    } catch (error) {
      devServerStatus = 'error';
      lastError = error instanceof Error ? error.message : String(error);
    }

    const status: HealthStatus = {
      isHealthy: checks.memory && checks.processManager && checks.devServer,
      timestamp,
      uptime,
      memoryUsage,
      devServerStatus,
      lastError,
      checks
    };

    this.lastHealthCheck = status;
    return status;
  }

  /**
   * 最後のヘルスチェック結果を取得
   */
  getLastHealthCheck(): HealthStatus | null {
    return this.lastHealthCheck;
  }

  /**
   * メモリ使用量をチェック
   */
  private checkMemoryUsage(memoryUsage: NodeJS.MemoryUsage): boolean {
    const maxHeapUsed = 500 * 1024 * 1024; // 500MB
    const maxRss = 750 * 1024 * 1024; // 750MB
    
    return memoryUsage.heapUsed < maxHeapUsed && memoryUsage.rss < maxRss;
  }

  /**
   * ProcessManagerの状態をチェック
   */
  private async checkProcessManager(): boolean {
    try {
      const processManager = ProcessManager.getInstance();
      // ProcessManagerが正常に動作するかテスト
      processManager.getCurrentProcess();
      return true;
    } catch (error) {
      this.logger.error('ProcessManager health check failed', { error });
      return false;
    }
  }

  /**
   * 開発サーバーの状態をチェック
   */
  private async checkDevServer(): boolean {
    try {
      const processManager = ProcessManager.getInstance();
      const currentProcess = processManager.getCurrentProcess();
      
      // プロセスがない場合は正常（停止状態）
      if (!currentProcess) {
        return true;
      }
      
      // プロセスがある場合は、正常に動作しているかチェック
      return currentProcess.status !== 'error';
    } catch (error) {
      this.logger.error('Dev server health check failed', { error });
      return false;
    }
  }

  /**
   * システムの全体的な健全性レポートを生成
   */
  async generateHealthReport(): Promise<string> {
    const status = await this.performHealthCheck();
    
    const report = {
      status: status.isHealthy ? 'healthy' : 'unhealthy',
      timestamp: status.timestamp,
      uptime: `${Math.floor(status.uptime / 1000)}s`,
      memory: {
        heapUsed: `${Math.floor(status.memoryUsage.heapUsed / 1024 / 1024)}MB`,
        rss: `${Math.floor(status.memoryUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.floor(status.memoryUsage.external / 1024 / 1024)}MB`
      },
      devServer: status.devServerStatus,
      checks: status.checks,
      lastError: status.lastError
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.stopPeriodicHealthCheck();
    HealthChecker.instance = null;
  }
}