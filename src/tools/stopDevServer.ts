import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from '../components/ProcessManager.js';
import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

export const stopDevServerSchema: Tool = {
  name: 'stop_dev_server',
  description: 'npm run devプロセス停止',
  inputSchema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: '停止対象のディレクトリ（複数起動時に指定。未指定時は唯一のプロセスまたはエラー）'
      }
    },
    additionalProperties: false
  }
};

export async function stopDevServer(args: { directory?: string }): Promise<string> {
  try {
    const processManager = ProcessManager.getInstance();

    // Check if target process exists BEFORE stopping
    const targetProcess = processManager.getProcess(args.directory);
    if (!targetProcess) {
      return JSON.stringify({
        success: false,
        message: '指定されたディレクトリのDev serverは見つかりませんでした（または起動していません）',
        wasRunning: false
      });
    }

    logger.info('Stopping dev server', { directory: targetProcess.directory });

    const logManager = processManager.getLogManager(targetProcess.directory);
    const finalLogStats = logManager?.getLogStats();

    // Stop the dev server
    const stopResult = await processManager.stopDevServer(args.directory);

    const result: any = {
      success: stopResult,
      message: stopResult
        ? 'Dev serverを正常に停止しました'
        : 'Dev serverの停止中にエラーが発生しましたが、プロセスは終了した可能性があります',
      wasRunning: true,
      stoppedProcess: {
        pid: targetProcess.pid,
        directory: targetProcess.directory,
        ports: targetProcess.ports
      }
    };

    if (finalLogStats) {
      result.finalLogStats = {
        total: finalLogStats.total,
        errors: finalLogStats.errors,
        warnings: finalLogStats.warnings
      };
      if (finalLogStats.errors > 0) {
        result.message += `\n最終ログに${finalLogStats.errors}個のエラーが記録されています`;
      }
    }

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