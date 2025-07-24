import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from '../components/ProcessManager.js';
import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

export const stopDevServerSchema: Tool = {
  name: 'stop_dev_server',
  description: 'npm run devプロセス停止',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
};

export async function stopDevServer(): Promise<string> {
  try {
    logger.info('Stopping dev server');
    
    const processManager = ProcessManager.getInstance();
    
    // Get current status before stopping
    const currentStatus = await processManager.getStatus();
    
    if (!currentStatus) {
      return JSON.stringify({
        success: true,
        message: 'Dev serverは既に停止しています',
        wasRunning: false
      });
    }
    
    const logManager = processManager.getLogManager();
    const finalLogStats = logManager.getLogStats();
    
    // Stop the dev server
    const stopResult = await processManager.stopDevServer();
    
    const result = {
      success: stopResult,
      message: stopResult 
        ? 'Dev serverを正常に停止しました' 
        : 'Dev serverの停止中にエラーが発生しましたが、プロセスは終了した可能性があります',
      wasRunning: true,
      stoppedProcess: {
        pid: currentStatus.pid,
        directory: currentStatus.directory,
        status: currentStatus.status,
        startTime: currentStatus.startTime,
        uptime: Date.now() - currentStatus.startTime.getTime(),
        ports: currentStatus.ports
      },
      finalLogStats: {
        total: finalLogStats.total,
        errors: finalLogStats.errors,
        warnings: finalLogStats.warnings,
        info: finalLogStats.info
      }
    };
    
    if (currentStatus.ports.length > 0) {
      result.message += `\nポート ${currentStatus.ports.join(', ')} が解放されました`;
    }
    
    if (finalLogStats.errors > 0) {
      result.message += `\n最終ログに${finalLogStats.errors}個のエラーが記録されています`;
    }
    
    logger.info('Dev server stop completed', { 
      success: stopResult,
      pid: currentStatus.pid 
    });
    
    return JSON.stringify(result, null, 2);
    
  } catch (error) {
    logger.error('Failed to stop dev server', { error });
    return JSON.stringify({
      success: false,
      message: `Dev serverの停止に失敗しました: ${error}`,
      wasRunning: false,
      error: String(error)
    });
  }
}