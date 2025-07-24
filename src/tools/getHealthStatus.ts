import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { HealthChecker } from '../components/HealthChecker.js';

export const getHealthStatusSchema: Tool = {
  name: 'get_health_status',
  description: 'MCPサーバーのヘルス状態を取得',
  inputSchema: {
    type: 'object',
    properties: {
      detailed: {
        type: 'boolean',
        description: '詳細なヘルスレポートを取得するかどうか（デフォルト: false）',
        default: false
      }
    },
    additionalProperties: false
  }
};

export async function getHealthStatus(args: { detailed?: boolean } = {}): Promise<string> {
  const logger = Logger.getInstance();
  const healthChecker = HealthChecker.getInstance();
  
  try {
    logger.info('Getting health status', { detailed: args.detailed });
    
    if (args.detailed) {
      // 詳細なヘルスレポートを取得
      const report = await healthChecker.generateHealthReport();
      
      logger.info('Generated detailed health report');
      
      return JSON.stringify({
        success: true,
        message: 'MCPサーバーの詳細ヘルス状態を取得しました',
        report: JSON.parse(report)
      });
    } else {
      // 基本的なヘルス状態を取得
      const status = await healthChecker.performHealthCheck();
      
      logger.info('Health status retrieved', { 
        isHealthy: status.isHealthy,
        devServerStatus: status.devServerStatus
      });
      
      return JSON.stringify({
        success: true,
        message: `MCPサーバーは${status.isHealthy ? '正常' : '異常'}状態です`,
        health: {
          isHealthy: status.isHealthy,
          uptime: Math.floor(status.uptime / 1000),
          devServerStatus: status.devServerStatus,
          memoryUsage: {
            heapUsed: Math.floor(status.memoryUsage.heapUsed / 1024 / 1024),
            rss: Math.floor(status.memoryUsage.rss / 1024 / 1024)
          },
          checks: status.checks,
          lastError: status.lastError,
          timestamp: status.timestamp
        }
      });
    }
    
  } catch (error) {
    logger.error('Failed to get health status', { error });
    
    return JSON.stringify({
      success: false,
      message: `ヘルス状態の取得に失敗しました: ${error}`,
      error: String(error)
    });
  }
}