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
    const processes = await processManager.getStatus();

    if (processes.length === 0) {
      return JSON.stringify({
        success: true,
        message: 'Dev serverは起動していません',
        isRunning: false,
        processes: []
      });
    }

    const processesInfo = processes.map(status => {
      const logManager = processManager.getLogManager(status.directory);
      const logStats = logManager?.getLogStats();
      const hasRecentErrors = logManager?.hasRecentErrors() || false;

      return {
        pid: status.pid,
        directory: status.directory,
        status: status.status,
        startTime: status.startTime,
        ports: status.ports,
        uptime: Date.now() - status.startTime.getTime(),
        stats: logStats ? {
          errors: logStats.errors,
          warnings: logStats.warnings
        } : undefined,
        hasRecentErrors
      };
    });

    const result = {
      success: true,
      message: `${processes.length}個のDev serverが稼働中です`,
      isRunning: true,
      processes: processesInfo
    };

    const ports = processes.flatMap(p => p.ports);
    if (ports.length > 0) {
      result.message += `\n利用可能なポート: ${ports.join(', ')}`;
    }

    if (processesInfo.some(p => p.hasRecentErrors)) {
      result.message += '\n⚠️ 一部のプロセスでエラーが発生しています。';
    }

    return JSON.stringify(result, null, 2);

  } catch (error) {
    logger.error('Failed to get dev server status', { error });
    return JSON.stringify({
      success: false,
      message: `ステータス取得に失敗しました: ${error}`,
      isRunning: false,
      processes: []
    });
  }
}