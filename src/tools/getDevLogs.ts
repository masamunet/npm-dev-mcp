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
      },
      directory: {
        type: 'string',
        description: '対象ディレクトリ（複数起動時に指定）'
      }
    },
    additionalProperties: false
  }
};

export async function getDevLogs(args: { lines?: number; directory?: string }): Promise<string> {
  try {
    const requestedLines = args.lines || 50;

    const processManager = ProcessManager.getInstance();

    // Determine which process to look at
    const processInfo = processManager.getProcess(args.directory);

    if (!processInfo) {
      return JSON.stringify({
        success: false,
        message: 'Dev serverが起動していません（または指定されたディレクトリが見つかりません）',
        logs: []
      });
    }

    const logManager = processManager.getLogManager(processInfo.directory);

    if (!logManager) {
      return JSON.stringify({
        success: false,
        message: 'ログマネージャーが見つかりませんでした',
        logs: []
      });
    }

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
        pid: processInfo.pid,
        directory: processInfo.directory,
        status: processInfo.status
      }
    };

    if (logStats.errors > 0) {
      result.message += `\n⚠️ ${logStats.errors}個のエラーが含まれています`;
    }

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