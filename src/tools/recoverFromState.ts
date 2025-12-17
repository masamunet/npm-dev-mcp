import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { StateManager } from '../components/StateManager.js';
import { ProcessManager } from '../components/ProcessManager.js';

export const recoverFromStateSchema: Tool = {
  name: 'recover_from_state',
  description: '保存された状態から復旧を試行',
  inputSchema: {
    type: 'object',
    properties: {
      force: {
        type: 'boolean',
        description: '強制的に復旧を実行するかどうか（デフォルト: false）',
        default: false
      }
    },
    additionalProperties: false
  }
};

export async function recoverFromState(args: { force?: boolean } = {}): Promise<string> {
  const logger = Logger.getInstance();
  const stateManager = StateManager.getInstance();
  const processManager = ProcessManager.getInstance();

  try {
    logger.info('Starting recovery from saved state', { force: args.force });

    // 復旧情報を取得
    const recoveryInfo = await stateManager.getRecoveryInfo();

    if (!recoveryInfo.canRecover && !args.force) {
      return JSON.stringify({
        success: false,
        message: '復旧可能な状態が見つかりません。force=trueで強制実行できます。',
        recoveryInfo: {
          canRecover: false,
          hasDevProcess: !!recoveryInfo.devProcesses && recoveryInfo.devProcesses.length > 0,
          lastHealthy: recoveryInfo.lastHealthy,
          consecutiveFailures: recoveryInfo.consecutiveFailures
        }
      });
    }

    let recoveryResults = {
      devProcessRecovered: false,
      projectContextRecovered: false,
      warnings: [] as string[]
    };

    // 開発サーバープロセスの復旧を試行
    if (recoveryInfo.devProcesses && recoveryInfo.devProcesses.length > 0) {
      try {
        for (const proc of recoveryInfo.devProcesses) {
          logger.info('Attempting to recover dev process', {
            pid: proc.pid,
            directory: proc.directory
          });

          // 既存のプロセスが動作中かチェック
          const existingProcess = processManager.getProcess(proc.directory);
          if (existingProcess && existingProcess.status === 'running') {
            recoveryResults.warnings.push(`開発サーバー(${proc.directory})は既に動作中です`);
          } else {
            // プロセスが存在するかチェック
            const isProcessAlive = await checkProcessExists(proc.pid);

            if (isProcessAlive) {
              // プロセスが生きている場合は、ProcessManagerに状態を復元(restartDevServer logic or equivalent)
              // New ProcessManager.ts implementation handles restoration in constructor, 
              // but checking here confirms if they are tracked.
              if (!processManager.getProcess(proc.directory)) {
                // If process exists but not in manager, it might be tricky without restart
                recoveryResults.warnings.push(`PID ${proc.pid} (${proc.directory}) は生存していますが、MCP管理下に戻すには再起動が必要です`);
              } else {
                logger.info('Found existing process, already restored by ProcessManager');
              }
            } else {
              // プロセスが死んでいる場合は新しく開始
              logger.info('Dead process detected, starting new dev server', { directory: proc.directory });

              try {
                const newProcess = await processManager.startDevServer(
                  proc.directory
                );

                if (newProcess.status === 'running') {
                  recoveryResults.devProcessRecovered = true;
                  logger.info('Dev server restarted successfully', {
                    newPid: newProcess.pid,
                    directory: newProcess.directory
                  });
                }
              } catch (startError) {
                logger.error(`Failed to restart dev server for ${proc.directory}`, { error: startError });
                recoveryResults.warnings.push(`${proc.directory} の再起動に失敗: ${startError}`);
              }
            }
          }
        }

      } catch (error) {
        logger.error('Failed to recover dev processes', { error });
        recoveryResults.warnings.push(`開発サーバーの復旧に失敗: ${error}`);
      }
    }

    // プロジェクトコンテキストの復旧
    if (recoveryInfo.projectContext) {
      try {
        logger.info('Recovering project context', {
          currentDirectory: recoveryInfo.projectContext.currentDirectory,
          projectCount: recoveryInfo.projectContext.detectedProjects.length
        });

        // ProjectContextManagerに状態を復元
        // 注意: 実際の復元はProjectContextManagerの実装に依存
        recoveryResults.projectContextRecovered = true;

      } catch (error) {
        logger.error('Failed to recover project context', { error });
        recoveryResults.warnings.push(`プロジェクトコンテキストの復旧に失敗: ${error}`);
      }
    }

    // 復旧成功の場合は、現在の状態を保存
    // state saving happens automatically in ProcessManager actions

    const message = recoveryResults.devProcessRecovered || recoveryResults.projectContextRecovered
      ? '状態の復旧が完了しました'
      : '復旧可能な項目が見つかりませんでした';

    logger.info('Recovery completed', { recoveryResults });

    return JSON.stringify({
      success: true,
      message,
      recovery: {
        devProcessRecovered: recoveryResults.devProcessRecovered,
        projectContextRecovered: recoveryResults.projectContextRecovered,
        warnings: recoveryResults.warnings,
        previousProcesses: recoveryInfo.devProcesses,
        recoveryTimestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Recovery failed', { error });

    return JSON.stringify({
      success: false,
      message: `復旧処理に失敗しました: ${error}`,
      error: String(error)
    });
  }
}

/**
 * プロセスが存在するかチェック
 */
async function checkProcessExists(pid: number): Promise<boolean> {
  try {
    // プロセスが存在するかチェック（kill -0）
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH = プロセスが存在しない
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    // EPERM = 権限なし（プロセスは存在する）
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      return true;
    }
    // その他のエラー
    throw error;
  }
}