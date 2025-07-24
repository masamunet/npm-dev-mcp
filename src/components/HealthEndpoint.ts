import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Logger } from '../utils/logger.js';
import { HealthChecker } from './HealthChecker.js';

export interface HealthEndpointConfig {
  port: number;
  host: string;
  enabled: boolean;
  path: string;
}

export class HealthEndpoint {
  private static instance: HealthEndpoint | null = null;
  private logger: Logger;
  private server: ReturnType<typeof createServer> | null = null;
  private config: HealthEndpointConfig;
  private healthChecker: HealthChecker;

  private constructor(config: HealthEndpointConfig) {
    this.logger = Logger.getInstance();
    this.config = config;
    this.healthChecker = HealthChecker.getInstance();
  }

  static getInstance(config?: HealthEndpointConfig): HealthEndpoint {
    if (!HealthEndpoint.instance) {
      const defaultConfig: HealthEndpointConfig = {
        port: 8080,
        host: '127.0.0.1',
        enabled: false,
        path: '/health'
      };
      HealthEndpoint.instance = new HealthEndpoint(config || defaultConfig);
    }
    return HealthEndpoint.instance;
  }

  /**
   * ヘルスチェックエンドポイントを開始
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Health endpoint is disabled');
      return;
    }

    if (this.server) {
      this.logger.warn('Health endpoint is already running');
      return;
    }

    try {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });

      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.config.port, this.config.host, () => {
          this.logger.info('Health endpoint started', {
            host: this.config.host,
            port: this.config.port,
            path: this.config.path
          });
          resolve();
        });

        this.server!.on('error', (error) => {
          this.logger.error('Failed to start health endpoint', { error });
          reject(error);
        });
      });

    } catch (error) {
      this.logger.error('Health endpoint startup failed', { error });
      throw error;
    }
  }

  /**
   * ヘルスチェックエンドポイントを停止
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    try {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          this.logger.info('Health endpoint stopped');
          resolve();
        });
      });
      
      this.server = null;
      
    } catch (error) {
      this.logger.error('Failed to stop health endpoint', { error });
    }
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<HealthEndpointConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * エンドポイントが動作中かどうか
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * HTTPリクエストを処理
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url;
    const method = req.method;

    // CORS ヘッダーを設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONS リクエスト（プリフライト）
    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // ヘルスチェックエンドポイント
    if (method === 'GET' && url === this.config.path) {
      await this.handleHealthCheck(res);
      return;
    }

    // 詳細ヘルスレポート
    if (method === 'GET' && url === `${this.config.path}/detailed`) {
      await this.handleDetailedHealthCheck(res);
      return;
    }

    // メトリクス（Prometheus形式）
    if (method === 'GET' && url === '/metrics') {
      await this.handleMetrics(res);
      return;
    }

    // 404 Not Found
    this.sendResponse(res, 404, {
      error: 'Not Found',
      message: `Path ${url} not found`,
      availableEndpoints: [
        this.config.path,
        `${this.config.path}/detailed`,
        '/metrics'
      ]
    });
  }

  /**
   * 基本的なヘルスチェック
   */
  private async handleHealthCheck(res: ServerResponse): Promise<void> {
    try {
      const healthStatus = await this.healthChecker.performHealthCheck();
      
      const response = {
        status: healthStatus.isHealthy ? 'healthy' : 'unhealthy',
        timestamp: healthStatus.timestamp,
        uptime: Math.floor(healthStatus.uptime / 1000),
        checks: healthStatus.checks
      };

      const statusCode = healthStatus.isHealthy ? 200 : 503;
      this.sendResponse(res, statusCode, response);
      
    } catch (error) {
      this.sendResponse(res, 500, {
        status: 'error',
        message: `Health check failed: ${error}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 詳細なヘルスチェック
   */
  private async handleDetailedHealthCheck(res: ServerResponse): Promise<void> {
    try {
      const reportJson = await this.healthChecker.generateHealthReport();
      const report = JSON.parse(reportJson);
      
      const statusCode = report.status === 'healthy' ? 200 : 503;
      this.sendResponse(res, statusCode, report);
      
    } catch (error) {
      this.sendResponse(res, 500, {
        status: 'error',
        message: `Detailed health check failed: ${error}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Prometheusメトリクス
   */
  private async handleMetrics(res: ServerResponse): Promise<void> {
    try {
      const healthStatus = await this.healthChecker.performHealthCheck();
      
      const metrics = [
        `# HELP npm_dev_mcp_health Health status of the MCP server (1 = healthy, 0 = unhealthy)`,
        `# TYPE npm_dev_mcp_health gauge`,
        `npm_dev_mcp_health ${healthStatus.isHealthy ? 1 : 0}`,
        '',
        `# HELP npm_dev_mcp_uptime_seconds Uptime in seconds`,
        `# TYPE npm_dev_mcp_uptime_seconds counter`,
        `npm_dev_mcp_uptime_seconds ${Math.floor(healthStatus.uptime / 1000)}`,
        '',
        `# HELP npm_dev_mcp_memory_usage_bytes Memory usage in bytes`,
        `# TYPE npm_dev_mcp_memory_usage_bytes gauge`,
        `npm_dev_mcp_memory_usage_bytes{type="heap_used"} ${healthStatus.memoryUsage.heapUsed}`,
        `npm_dev_mcp_memory_usage_bytes{type="rss"} ${healthStatus.memoryUsage.rss}`,
        `npm_dev_mcp_memory_usage_bytes{type="external"} ${healthStatus.memoryUsage.external}`,
        '',
        `# HELP npm_dev_mcp_dev_server_status Status of the dev server (1 = running, 0 = stopped, -1 = error)`,
        `# TYPE npm_dev_mcp_dev_server_status gauge`,
        `npm_dev_mcp_dev_server_status ${
          healthStatus.devServerStatus === 'running' ? 1 : 
          healthStatus.devServerStatus === 'stopped' ? 0 : -1
        }`,
        ''
      ].join('\n');

      res.setHeader('Content-Type', 'text/plain');
      res.writeHead(200);
      res.end(metrics);
      
    } catch (error) {
      this.sendResponse(res, 500, {
        error: 'Failed to generate metrics',
        message: String(error)
      });
    }
  }

  /**
   * JSON レスポンスを送信
   */
  private sendResponse(res: ServerResponse, statusCode: number, data: any): void {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(statusCode);
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.stop().catch(() => {});
    HealthEndpoint.instance = null;
  }
}