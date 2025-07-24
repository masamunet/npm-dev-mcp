import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from '../components/ProcessManager.js';
import { ProjectScanner } from '../components/ProjectScanner.js';
import { EnvLoader } from '../components/EnvLoader.js';
import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

export const startDevServerSchema: Tool = {
  name: 'start_dev_server',
  description: '指定ディレクトリでnpm run devをバックグラウンドで開始',
  inputSchema: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: '実行ディレクトリ（オプション、未指定時は自動検出）'
      }
    },
    additionalProperties: false
  }
};

export async function startDevServer(args: { directory?: string }): Promise<string> {
  try {
    logger.info('Starting dev server', { directory: args.directory });
    
    let targetDirectory = args.directory;
    let envPath: string | undefined;
    
    // If no directory specified, auto-detect
    if (!targetDirectory) {
      const scanner = new ProjectScanner();
      const bestProject = await scanner.findBestProject();
      
      if (!bestProject) {
        return JSON.stringify({
          success: false,
          message: 'devスクリプトが定義されたpackage.jsonが見つかりませんでした。scan_project_dirsを実行して利用可能なプロジェクトを確認してください。'
        });
      }
      
      targetDirectory = bestProject.directory;
      envPath = bestProject.envPath;
      logger.info(`Auto-detected project directory: ${targetDirectory}`);
    }
    
    // Load environment variables
    const envLoader = new EnvLoader();
    const env = await envLoader.prepareEnvironment(envPath);
    
    // Start the dev server
    const processManager = ProcessManager.getInstance();
    const devProcess = await processManager.startDevServer(targetDirectory, env);
    
    // Wait a moment to get initial status
    await new Promise(resolve => setTimeout(resolve, 2000));
    const status = await processManager.getStatus();
    
    const result = {
      success: true,
      message: 'Dev serverが開始されました',
      process: {
        pid: devProcess.pid,
        directory: devProcess.directory,
        status: devProcess.status,
        startTime: devProcess.startTime,
        ports: devProcess.ports
      },
      environment: {
        hasEnvFile: !!envPath,
        envPath,
        nodeEnv: env.NODE_ENV || 'development'
      }
    };
    
    if (devProcess.ports.length > 0) {
      result.message += `\n起動ポート: ${devProcess.ports.join(', ')}`;
    }
    
    logger.info(`Dev server started successfully`, { 
      pid: devProcess.pid, 
      ports: devProcess.ports 
    });
    
    return JSON.stringify(result, null, 2);
    
  } catch (error) {
    logger.error('Failed to start dev server', { error });
    return JSON.stringify({
      success: false,
      message: `Dev serverの開始に失敗しました: ${error}`,
      error: String(error)
    });
  }
}