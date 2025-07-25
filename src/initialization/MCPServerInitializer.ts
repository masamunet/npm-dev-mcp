import { Logger } from '../utils/logger.js';
import { StateManager } from '../components/StateManager.js';
import { HealthChecker } from '../components/HealthChecker.js';
import { HealthEndpoint } from '../components/HealthEndpoint.js';

type ServiceStatus = 'pending' | 'initializing' | 'ready' | 'failed';
type ServiceName = 'stateManager' | 'healthChecker' | 'healthEndpoint' | 'projectContext';

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

export class MCPServerInitializer {
  private serviceStatus = new Map<ServiceName, ServiceStatus>();
  private servicePromises = new Map<ServiceName, Promise<void>>();
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
    
    // 全サービスを初期状態に設定
    const services: ServiceName[] = ['stateManager', 'healthChecker', 'healthEndpoint', 'projectContext'];
    services.forEach(service => {
      this.serviceStatus.set(service, 'pending');
    });
  }

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

  async waitForService(name: ServiceName, timeoutMs: number): Promise<void> {
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
      const timeout = setTimeout(() => {
        reject(new Error(`Service initialization timeout: ${name}`));
      }, timeoutMs);

      const checkStatus = () => {
        const currentStatus = this.serviceStatus.get(name);
        if (currentStatus === 'ready') {
          clearTimeout(timeout);
          resolve();
        } else if (currentStatus === 'failed') {
          clearTimeout(timeout);
          reject(new Error(`Service failed: ${name}`));
        } else {
          setTimeout(checkStatus, 100);
        }
      };

      checkStatus();
    });
  }

  isServiceReady(name: ServiceName): boolean {
    return this.serviceStatus.get(name) === 'ready';
  }

  getServiceStatuses(): Map<ServiceName, ServiceStatus> {
    return new Map(this.serviceStatus);
  }

  async startBackgroundInitialization(): Promise<void> {
    this.logger.info('Starting background service initialization');

    const initTasks = [
      this.initializeService('stateManager', async () => {
        const stateManager = StateManager.getInstance();
        await stateManager.initialize();
      }),

      this.initializeService('healthChecker', async () => {
        const healthChecker = HealthChecker.getInstance();
        healthChecker.startPeriodicHealthCheck(30000); // 30秒間隔
      }),

      this.initializeService('healthEndpoint', async () => {
        const healthEndpoint = HealthEndpoint.getInstance({
          port: parseInt(process.env.HEALTH_PORT || '8080'),
          host: process.env.HEALTH_HOST || '127.0.0.1',
          enabled: process.env.HEALTH_ENDPOINT === 'true',
          path: process.env.HEALTH_PATH || '/health'
        });

        if (process.env.HEALTH_ENDPOINT === 'true') {
          try {
            await healthEndpoint.start();
            this.logger.info('Health endpoint started', {
              url: `http://${process.env.HEALTH_HOST || '127.0.0.1'}:${process.env.HEALTH_PORT || '8080'}${process.env.HEALTH_PATH || '/health'}`
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

  async ensureToolDependencies(toolName: keyof typeof SERVICE_DEPENDENCIES): Promise<void> {
    const dependencies = SERVICE_DEPENDENCIES[toolName] || [];

    for (const dep of dependencies) {
      try {
        await this.waitForService(dep as ServiceName, 5000); // 5秒タイムアウト
      } catch (error) {
        throw new Error(`Tool ${toolName} requires ${dep} service, but initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // デバッグ用: 全サービスの状態を取得
  getInitializationStatus(): Record<string, string> {
    const status: Record<string, string> = {};
    this.serviceStatus.forEach((value, key) => {
      status[key] = value;
    });
    return status;
  }
}