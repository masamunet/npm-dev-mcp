import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from '../components/ProcessManager.js';
import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

export const getDevStatusSchema: Tool = {
  name: 'get_dev_status',
  description: 'npm run devプロセスの状態確認',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
};

export async function getDevStatus(): Promise<string> {
  try {
    logger.debug('Getting dev server status');
    
    const processManager = ProcessManager.getInstance();
    const status = await processManager.getStatus();
    
    if (!status) {
      return JSON.stringify({
        success: true,
        message: 'Dev serverは起動していません',
        isRunning: false,
        process: null
      });
    }
    
    // Get additional log statistics
    const logManager = processManager.getLogManager();
    const logStats = logManager.getLogStats();
    const hasRecentErrors = logManager.hasRecentErrors();
    
    const result = {
      success: true,
      message: `Dev serverは${status.status}状態です`,
      isRunning: status.status === 'running',
      process: {
        pid: status.pid,
        directory: status.directory,
        status: status.status,
        startTime: status.startTime,
        ports: status.ports,
        uptime: Date.now() - status.startTime.getTime()
      },
      logs: {
        total: logStats.total,
        errors: logStats.errors,
        warnings: logStats.warnings,
        info: logStats.info,
        hasRecentErrors
      }
    };
    
    if (status.ports.length > 0) {
      result.message += `\n利用可能なポート: ${status.ports.join(', ')}`;
    }
    
    if (hasRecentErrors) {
      result.message += '\n⚠️ 最近エラーが発生しています。ログを確認してください。';
    }
    
    logger.debug('Dev server status retrieved', { 
      status: status.status, 
      ports: status.ports 
    });
    
    return JSON.stringify(result, null, 2);
    
  } catch (error) {
    logger.error('Failed to get dev server status', { error });
    return JSON.stringify({
      success: false,
      message: `ステータス取得に失敗しました: ${error}`,
      isRunning: false,
      process: null
    });
  }
}