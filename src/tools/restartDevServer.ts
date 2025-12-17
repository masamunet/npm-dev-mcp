import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from '../components/ProcessManager.js';
import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

export const restartDevServerSchema: Tool = {
  name: 'restart_dev_server',
  description: 'npm run devプロセス再起動',
  inputSchema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: '再起動対象のディレクトリ（複数起動時に指定。未指定時は唯一のプロセスまたはエラー）'
      }
    },
    additionalProperties: false
  }
};

export async function restartDevServer(args: { directory?: string } = {}): Promise<string> {
  try {
    const processManager = ProcessManager.getInstance();

    // Check if target process exists BEFORE restarting
    const targetProcess = processManager.getProcess(args.directory);
    const directoryToRestart = targetProcess?.directory || args.directory;

    if (!targetProcess && !args.directory) {
      return JSON.stringify({
        success: false,
        message: 'Dev serverが起動していません（またはディレクトリが指定されていません）。start_dev_serverを使用して開始してください。',
        restarted: false
      });
    }

    logger.info('Restarting dev server', { directory: directoryToRestart });

    const previousDirectory = targetProcess?.directory || args.directory || 'unknown';
    const previousPid = targetProcess?.pid;
    const previousPorts = targetProcess ? [...targetProcess.ports] : [];
    const previousUptime = targetProcess ? Date.now() - targetProcess.startTime.getTime() : 0;

    // Restart the dev server
    const newProcess = await processManager.restartDevServer(args.directory);

    // Wait a moment to get updated status
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get new status from correct process
    const allProcesses = await processManager.getStatus();
    const newStatus = allProcesses.find(p => p.directory === newProcess.directory);

    const result: any = {
      success: true,
      message: 'Dev serverを正常に再起動しました',
      restarted: true,
      newProcess: {
        pid: newProcess.pid,
        directory: newProcess.directory,
        status: newProcess.status,
        startTime: newProcess.startTime,
        ports: newStatus?.ports || newProcess.ports
      }
    };

    if (previousPid) {
      result.previousProcess = {
        pid: previousPid,
        directory: previousDirectory,
        ports: previousPorts,
        uptime: previousUptime
      };
    }

    if (newProcess.ports.length > 0) {
      result.message += `\n新しいプロセスのポート: ${newProcess.ports.join(', ')}`;
    }

    // Compare ports if they changed
    const currentPorts = newStatus?.ports || newProcess.ports;
    const portsChanged = JSON.stringify(previousPorts.sort()) !== JSON.stringify([...currentPorts].sort());
    if (portsChanged && previousPorts.length > 0) {
      result.message += `\nポートが変更されました: ${previousPorts.join(', ')} → ${currentPorts.join(', ')}`;
    }

    logger.info('Dev server restart completed', {
      previousPid: previousPid,
      newPid: newProcess.pid,
      newPorts: newProcess.ports
    });

    return JSON.stringify(result, null, 2);

  } catch (error) {
    logger.error('Failed to restart dev server', { error });
    return JSON.stringify({
      success: false,
      message: `Dev serverの再起動に失敗しました: ${error}`,
      restarted: false,
      error: String(error)
    });
  }
}