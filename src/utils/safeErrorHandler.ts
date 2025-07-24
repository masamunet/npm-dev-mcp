import { Logger } from './logger.js';

/**
 * MCPサーバーの安定性を向上させるエラーハンドラー
 */
export class SafeErrorHandler {
  private static instance: SafeErrorHandler | null = null;
  private logger: Logger;
  private errorCount = 0;
  private lastErrorTime = 0;
  private readonly MAX_ERRORS_PER_MINUTE = 10;
  private readonly GRACE_PERIOD_MS = 5000; // 5秒の猶予期間

  private constructor() {
    this.logger = Logger.getInstance();
  }

  static getInstance(): SafeErrorHandler {
    if (!SafeErrorHandler.instance) {
      SafeErrorHandler.instance = new SafeErrorHandler();
    }
    return SafeErrorHandler.instance;
  }

  /**
   * 安全なJSONパース（エラー時はデフォルト値を返す）
   */
  safeJsonParse<T>(jsonString: string, defaultValue: T): T {
    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      this.logger.warn('JSON parse failed, using default value', { 
        error: error instanceof Error ? error.message : String(error),
        jsonString: jsonString.substring(0, 100) + '...' 
      });
      return defaultValue;
    }
  }

  /**
   * 安全なJSON文字列化（循環参照を処理）
   */
  safeJsonStringify(obj: any, space?: number): string {
    try {
      return JSON.stringify(obj, this.getCircularReplacer(), space);
    } catch (error) {
      this.logger.warn('JSON stringify failed, using fallback', { error });
      return JSON.stringify({ 
        error: 'Serialization failed',
        type: typeof obj,
        constructor: obj?.constructor?.name 
      });
    }
  }

  /**
   * 循環参照を処理するreplacer関数
   */
  private getCircularReplacer() {
    const seen = new WeakSet();
    return (key: string, value: any) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    };
  }

  /**
   * 非致命的エラーの処理（MCPサーバーを落とさない）
   */
  handleNonFatalError(error: Error, context: string): void {
    this.logger.error(`Non-fatal error in ${context}`, { 
      error: error.message,
      stack: error.stack,
      context
    });

    // エラー頻度をチェック
    const now = Date.now();
    if (now - this.lastErrorTime < 60000) { // 1分以内
      this.errorCount++;
    } else {
      this.errorCount = 1;
    }
    this.lastErrorTime = now;

    // エラーが頻発している場合の警告
    if (this.errorCount > this.MAX_ERRORS_PER_MINUTE) {
      this.logger.warn('High error rate detected', { 
        errorCount: this.errorCount,
        context,
        action: 'Consider investigating system stability'
      });
    }
  }

  /**
   * 致命的エラーの処理（グレースフル シャットダウン）
   */
  handleFatalError(error: Error, context: string): void {
    this.logger.error(`Fatal error in ${context} - initiating graceful shutdown`, {
      error: error.message,
      stack: error.stack,
      context
    });

    // グレースフル シャットダウンを試行
    this.gracefulShutdown(context);
  }

  /**
   * Uncaught Exception/Rejection の安全な処理
   */
  setupSafeErrorHandlers(): void {
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception - attempting recovery', { 
        error: error.message,
        stack: error.stack 
      });

      // 即座に終了せず、復旧を試行
      this.attemptRecovery('uncaughtException', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection - attempting recovery', { 
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: String(promise)
      });

      // 即座に終了せず、復旧を試行
      this.attemptRecovery('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
    });
  }

  /**
   * エラーからの復旧を試行
   */
  private attemptRecovery(errorType: string, error: Error): void {
    setTimeout(async () => {
      try {
        this.logger.info(`Attempting recovery from ${errorType}`);
        
        // 基本的な復旧処理
        await this.performBasicRecovery();
        
        this.logger.info('Recovery completed successfully');
      } catch (recoveryError) {
        this.logger.error('Recovery failed - shutting down', { recoveryError });
        this.gracefulShutdown(`${errorType}-recovery-failed`);
      }
    }, this.GRACE_PERIOD_MS);
  }

  /**
   * 基本的な復旧処理
   */
  private async performBasicRecovery(): Promise<void> {
    try {
      // StateManagerの整合性確保
      const { StateManager } = await import('../components/StateManager.js');
      const stateManager = StateManager.getInstance();
      await stateManager.ensureStateConsistency();

      // メモリ使用量チェック
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > 400 * 1024 * 1024) { // 400MB以上
        this.logger.warn('High memory usage detected', { 
          heapUsed: `${Math.floor(memUsage.heapUsed / 1024 / 1024)}MB`
        });
        
        // ガベージコレクション強制実行
        if (global.gc) {
          global.gc();
          this.logger.info('Forced garbage collection completed');
        }
      }

    } catch (error) {
      throw new Error(`Recovery process failed: ${error}`);
    }
  }

  /**
   * グレースフル シャットダウン
   */
  private gracefulShutdown(reason: string): void {
    this.logger.info(`Initiating graceful shutdown: ${reason}`);

    setTimeout(() => {
      this.logger.error('Graceful shutdown timeout - forcing exit');
      process.exit(1);
    }, 10000); // 10秒でタイムアウト

    // クリーンアップ処理
    this.performCleanup()
      .then(() => {
        this.logger.info('Cleanup completed - exiting');
        process.exit(0);
      })
      .catch((error) => {
        this.logger.error('Cleanup failed - forcing exit', { error });
        process.exit(1);
      });
  }

  /**
   * クリーンアップ処理
   */
  private async performCleanup(): Promise<void> {
    try {
      // ヘルスチェック停止
      const { HealthChecker } = await import('../components/HealthChecker.js');
      const healthChecker = HealthChecker.getInstance();
      healthChecker.cleanup();

      // 状態管理クリーンアップ
      const { StateManager } = await import('../components/StateManager.js');
      const stateManager = StateManager.getInstance();
      stateManager.cleanup();

      // ヘルスエンドポイント停止
      const { HealthEndpoint } = await import('../components/HealthEndpoint.js');
      const healthEndpoint = HealthEndpoint.getInstance();
      healthEndpoint.cleanup();

    } catch (error) {
      this.logger.warn('Some cleanup operations failed', { error });
    }
  }

  /**
   * エラー統計の取得
   */
  getErrorStats(): { errorCount: number; lastErrorTime: number } {
    return {
      errorCount: this.errorCount,
      lastErrorTime: this.lastErrorTime
    };
  }

  /**
   * エラーカウンターをリセット
   */
  resetErrorCount(): void {
    this.errorCount = 0;
    this.lastErrorTime = 0;
  }
}