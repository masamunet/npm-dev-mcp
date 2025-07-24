import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from '../components/ProcessManager.js';
import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

export const getDevLogsSchema: Tool = {
  name: 'get_dev_logs',
  description: 'npm run devのログ取得',
  inputSchema: {
    type: 'object',
    properties: {
      lines: {
        type: 'number',
        description: '取得行数（デフォルト：50）',
        minimum: 1,
        maximum: 1000
      }
    },
    additionalProperties: false
  }
};

export async function getDevLogs(args: { lines?: number }): Promise<string> {
  try {
    const requestedLines = args.lines || 50;
    logger.debug(`Getting dev server logs`, { lines: requestedLines });
    
    const processManager = ProcessManager.getInstance();
    const status = await processManager.getStatus();
    
    if (!status) {
      return JSON.stringify({
        success: false,
        message: 'Dev serverが起動していません。ログを取得できません。',
        logs: []
      });
    }
    
    const logManager = processManager.getLogManager();
    const logs = await logManager.getLogs(requestedLines);
    
    // Format logs for better readability
    const formattedLogs = logs.map(log => ({
      timestamp: log.timestamp.toISOString(),
      level: log.level,
      source: log.source,
      message: log.message
    }));
    
    const logStats = logManager.getLogStats();
    
    const result = {
      success: true,
      message: `${logs.length}行のログを取得しました`,
      logs: formattedLogs,
      statistics: {
        totalLogs: logStats.total,
        errors: logStats.errors,
        warnings: logStats.warnings,
        info: logStats.info,
        requested: requestedLines,
        returned: logs.length
      },
      process: {
        pid: status.pid,
        directory: status.directory,
        status: status.status,
        startTime: status.startTime
      }
    };
    
    if (logStats.errors > 0) {
      result.message += `\n⚠️ ${logStats.errors}個のエラーが含まれています`;
    }
    
    if (logStats.warnings > 0) {
      result.message += `\n警告: ${logStats.warnings}個の警告が含まれています`;
    }
    
    logger.debug('Dev server logs retrieved', { 
      logsCount: logs.length,
      errors: logStats.errors,
      warnings: logStats.warnings
    });
    
    return JSON.stringify(result, null, 2);
    
  } catch (error) {
    logger.error('Failed to get dev server logs', { error });
    return JSON.stringify({
      success: false,
      message: `ログ取得に失敗しました: ${error}`,
      logs: [],
      error: String(error)
    });
  }
}