import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from '../components/ProcessManager.js';
import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

export const restartDevServerSchema: Tool = {
  name: 'restart_dev_server',
  description: 'npm run devプロセス再起動',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
};

export async function restartDevServer(): Promise<string> {
  try {
    logger.info('Restarting dev server');
    
    const processManager = ProcessManager.getInstance();
    
    // Get current status before restarting
    const previousStatus = await processManager.getStatus();
    
    if (!previousStatus) {
      return JSON.stringify({
        success: false,
        message: 'Dev serverが起動していません。start_dev_serverを使用して開始してください。',
        restarted: false
      });
    }
    
    const previousDirectory = previousStatus.directory;
    const previousPid = previousStatus.pid;
    const previousPorts = [...previousStatus.ports];
    const previousUptime = Date.now() - previousStatus.startTime.getTime();
    
    // Restart the dev server
    const newProcess = await processManager.restartDevServer();
    
    // Wait a moment to get updated status
    await new Promise(resolve => setTimeout(resolve, 3000));
    const newStatus = await processManager.getStatus();
    
    const result = {
      success: true,
      message: 'Dev serverを正常に再起動しました',
      restarted: true,
      previousProcess: {
        pid: previousPid,
        directory: previousDirectory,
        ports: previousPorts,
        uptime: previousUptime
      },
      newProcess: {
        pid: newProcess.pid,
        directory: newProcess.directory,
        status: newProcess.status,
        startTime: newProcess.startTime,
        ports: newStatus?.ports || newProcess.ports
      }
    };
    
    if (newProcess.ports.length > 0) {
      result.message += `\n新しいプロセスのポート: ${newProcess.ports.join(', ')}`;
    }
    
    // Compare ports if they changed
    const portsChanged = JSON.stringify(previousPorts.sort()) !== JSON.stringify((newStatus?.ports || newProcess.ports).sort());
    if (portsChanged) {
      result.message += `\nポートが変更されました: ${previousPorts.join(', ')} → ${(newStatus?.ports || newProcess.ports).join(', ')}`;
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