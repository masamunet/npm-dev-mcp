import { Logger } from '../utils/logger.js';
import { StateManager } from '../components/StateManager.js';
import { HealthChecker } from '../components/HealthChecker.js';
import { HealthEndpoint } from '../components/HealthEndpoint.js';
import { ConfigValidator, ServerConfig } from '../config/HealthEndpointConfig.js';

type ServiceStatus = 'pending' | 'initializing' | 'ready' | 'failed';
type ServiceName = 'stateManager' | 'healthChecker' | 'healthEndpoint' | 'projectContext';

/**
 * MCPツールとその依存サービスのマッピング定義
 */
export const SERVICE_DEPENDENCIES = {
  'scan_project_dirs': ['projectContext'],
  'start_dev_server': ['stateManager'],
  'get_dev_status': ['stateManager'],
  'get_dev_logs': ['stateManager'],
  'stop_dev_server': ['stateManager'],
  'restart_dev_server': ['stateManager'],
  'get_health_status': ['healthChecker'],
  'recover_from_state': ['stateManager'],
  'auto_recover': ['stateManager', 'healthChecker']
} as const;

/**
 * MCPサーバーの段階的初期化を管理するクラス
 * 
 * JSON-RPC通信の確立を最優先とし、重い初期化処理を背景で非同期実行する。
 * サービス間の依存関係を管理し、ツール実行時に必要なサービスが初期化済みかを確認する。
 */
export class MCPServerInitializer {
  private serviceStatus = new Map<ServiceName, ServiceStatus>();
  private servicePromises = new Map<ServiceName, Promise<void>>();
  private dependencyCheckPromises = new Map<string, Promise<void>>();
  private logger: Logger;
  private config: ServerConfig;

  /**
   * MCPServerInitializerのコンストラクタ
   * 
   * 環境変数から設定を読み込み、全サービスを初期状態に設定する。
   * @throws {Error} 設定validation失敗時
   */
  constructor() {
    this.logger = Logger.getInstance();
    
    try {
      this.config = ConfigValidator.validateServerConfig(process.env);
    } catch (error) {
      this.logger.error('Configuration validation failed', { error });
      throw error;
    }
    
    // 全サービスを初期状態に設定
    const services: ServiceName[] = ['stateManager', 'healthChecker', 'healthEndpoint', 'projectContext'];
    services.forEach(service => {
      this.serviceStatus.set(service, 'pending');
    });
  }

  /**
   * 指定されたサービスを初期化する
   * 
   * @param name - 初期化するサービス名
   * @param initFn - 初期化処理を行う関数
   * @returns 初期化完了のPromise
   * @throws {Error} 初期化処理でエラーが発生した場合
   */
  async initializeService(name: ServiceName, initFn: () => Promise<void>): Promise<void> {
    if (this.serviceStatus.get(name) === 'ready') {
      return;
    }

    // 既に初期化中の場合は既存のPromiseを返す
    if (this.servicePromises.has(name)) {
      return this.servicePromises.get(name)!;
    }

    this.serviceStatus.set(name, 'initializing');
    const startTime = Date.now();

    const initPromise = (async () => {
      try {
        await initFn();
        this.serviceStatus.set(name, 'ready');
        this.logger.info(`Service initialized: ${name} (${Date.now() - startTime}ms)`);
      } catch (error) {
        this.serviceStatus.set(name, 'failed');
        this.logger.error(`Service initialization failed: ${name}`, { 
          error, 
          duration: Date.now() - startTime 
        });
        throw error;
      } finally {
        this.servicePromises.delete(name);
      }
    })();

    this.servicePromises.set(name, initPromise);
    return initPromise;
  }

  /**
   * 指定されたサービスの初期化完了を待機する
   * 
   * @param name - 待機するサービス名
   * @param timeoutMs - タイムアウト時間（ミリ秒）、デフォルトは設定値
   * @returns サービス初期化完了のPromise
   * @throws {Error} サービス初期化失敗またはタイムアウト時
   */
  async waitForService(name: ServiceName, timeoutMs: number = this.config.dependencyTimeout): Promise<void> {
    const status = this.serviceStatus.get(name);
    if (status === 'ready') return;
    if (status === 'failed') {
      throw new Error(`Service failed: ${name}`);
    }

    // 初期化中の場合は既存のPromiseを待機
    if (this.servicePromises.has(name)) {
      const promise = this.servicePromises.get(name)!;
      return Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Service initialization timeout: ${name}`)), timeoutMs);
        })
      ]);
    }

    return new Promise((resolve, reject) => {
      const abortController = new AbortController();
      let pollingTimeout: NodeJS.Timeout | null = null;
      
      const timeout = setTimeout(() => {
        abortController.abort();
        if (pollingTimeout) clearTimeout(pollingTimeout);
        reject(new Error(`Service initialization timeout: ${name}`));
      }, timeoutMs);

      const checkStatus = () => {
        if (abortController.signal.aborted) return;
        
        const currentStatus = this.serviceStatus.get(name);
        if (currentStatus === 'ready') {
          clearTimeout(timeout);
          if (pollingTimeout) clearTimeout(pollingTimeout);
          resolve();
        } else if (currentStatus === 'failed') {
          clearTimeout(timeout);
          if (pollingTimeout) clearTimeout(pollingTimeout);
          reject(new Error(`Service failed: ${name}`));
        } else {
          pollingTimeout = setTimeout(checkStatus, this.config.pollingInterval);
        }
      };

      checkStatus();
    });
  }

  /**
   * 指定されたサービスが初期化完了しているかチェック
   * 
   * @param name - チェックするサービス名
   * @returns サービスが準備完了の場合true
   */
  isServiceReady(name: ServiceName): boolean {
    return this.serviceStatus.get(name) === 'ready';
  }

  getServiceStatuses(): Map<ServiceName, ServiceStatus> {
    return new Map(this.serviceStatus);
  }

  /**
   * 全サービスの背景初期化を開始する
   * 
   * 各サービスを並行で初期化し、失敗したサービスがあっても他の初期化を継続する。
   * @returns 背景初期化完了のPromise
   */
  async startBackgroundInitialization(): Promise<void> {
    this.logger.info('Starting background service initialization');

    const initTasks = [
      this.initializeService('stateManager', async () => {
        const stateManager = StateManager.getInstance();
        await stateManager.initialize();
      }),

      this.initializeService('healthChecker', async () => {
        const healthChecker = HealthChecker.getInstance();
        healthChecker.startPeriodicHealthCheck(this.config.healthCheckInterval);
      }),

      this.initializeService('healthEndpoint', async () => {
        const healthEndpoint = HealthEndpoint.getInstance(this.config.healthEndpoint);

        if (this.config.healthEndpoint.enabled) {
          try {
            await healthEndpoint.start();
            this.logger.info('Health endpoint started', {
              url: `http://${this.config.healthEndpoint.host}:${this.config.healthEndpoint.port}${this.config.healthEndpoint.path}`
            });
          } catch (error) {
            this.logger.warn('Failed to start health endpoint', { error });
            throw error;
          }
        }
      }),

      this.initializeService('projectContext', async () => {
        // ProjectContextManagerは既にmain()で初期化済み
        // 追加の初期化処理が必要な場合はここで実行
        this.logger.debug('Project context already initialized in main()');
      })
    ];

    // 並行初期化（一つが失敗しても他は続行）
    const results = await Promise.allSettled(initTasks);

    // 結果をログ出力
    const serviceNames: ServiceName[] = ['stateManager', 'healthChecker', 'healthEndpoint', 'projectContext'];
    results.forEach((result, index) => {
      const serviceName = serviceNames[index];
      if (result.status === 'rejected') {
        this.logger.warn(`Background service initialization failed: ${serviceName}`, { 
          error: result.reason 
        });
      } else {
        this.logger.debug(`Background service initialized: ${serviceName}`);
      }
    });

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    this.logger.info(`Background initialization completed: ${successCount}/${results.length} services ready`);
  }

  /**
   * ツール実行に必要な依存サービスの初期化完了を確認する
   * 
   * 競合状態を防ぐため、同じツールの依存チェックが実行中の場合は既存のPromiseを返す。
   * @param toolName - 実行するツール名
   * @returns 依存サービス準備完了のPromise
   * @throws {Error} 依存サービスの初期化に失敗した場合
   */
  async ensureToolDependencies(toolName: keyof typeof SERVICE_DEPENDENCIES): Promise<void> {
    const cacheKey = `tool:${toolName}`;
    
    // 既に同じツールの依存関係チェックが実行中の場合は、そのPromiseを返す
    if (this.dependencyCheckPromises.has(cacheKey)) {
      return this.dependencyCheckPromises.get(cacheKey)!;
    }

    const dependencies = SERVICE_DEPENDENCIES[toolName] || [];
    
    const checkPromise = (async () => {
      try {
        // 依存関係を並行でチェック（順序依存がない場合）
        const dependencyChecks = dependencies.map(dep => 
          this.waitForService(dep as ServiceName).catch(error => {
            throw new Error(`Tool ${toolName} requires ${dep} service, but initialization failed: ${error instanceof Error ? error.message : String(error)}`);
          })
        );
        
        await Promise.all(dependencyChecks);
        this.logger.debug(`Tool ${toolName} dependencies satisfied`);
      } finally {
        // 完了後はキャッシュから削除
        this.dependencyCheckPromises.delete(cacheKey);
      }
    })();

    this.dependencyCheckPromises.set(cacheKey, checkPromise);
    return checkPromise;
  }

  /**
   * デバッグ用: 全サービスの現在の初期化状態を取得
   * 
   * @returns サービス名と状態のマッピング
   */
  getInitializationStatus(): Record<string, string> {
    const status: Record<string, string> = {};
    this.serviceStatus.forEach((value, key) => {
      status[key] = value;
    });
    return status;
  }

  /**
   * 将来拡張: サービスヘルスモニタリング機能
   * 
   * 初期化状態だけでなく、実行時のサービス健全性を継続的に監視する機能の設計
   * 
   * @param name - チェックするサービス名
   * @returns サービスが健全な状態かどうか
   * 
   * 実装予定機能:
   * - 定期的なヘルスチェック (ping/pong)
   * - メモリ使用量監視
   * - レスポンス時間測定
   * - エラー率の監視
   * - 自動復旧メカニズム
   */
  // async isServiceHealthy(name: ServiceName): Promise<boolean> {
  //   // 将来の実装:
  //   // 1. サービスの基本ヘルスチェック
  //   // 2. パフォーマンス指標の確認
  //   // 3. エラー率の監視
  //   // 4. 必要に応じた自動復旧トリガー
  //   // return Promise<boolean>
  // }
}