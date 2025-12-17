import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { HealthChecker } from '../components/HealthChecker.js';
import { recoverFromState } from './recoverFromState.js';
import { ProcessManager } from '../components/ProcessManager.js';
import { StateManager } from '../components/StateManager.js';

export const autoRecoverSchema: Tool = {
  name: 'auto_recover',
  description: 'MCPサーバーの自動復旧を実行（ヘルスチェック→復旧→再検証）',
  inputSchema: {
    type: 'object',
    properties: {
      maxRetries: {
        type: 'number',
        description: '最大復旧試行回数（デフォルト: 3）',
        default: 3,
        minimum: 1,
        maximum: 10
      },
      forceRecover: {
        type: 'boolean',
        description: '強制復旧モード（デフォルト: false）',
        default: false
      },
      restartMcp: {
        type: 'boolean',
        description: 'MCPサーバー自体の再起動を含むか（デフォルト: false）',
        default: false
      }
    },
    additionalProperties: false
  }
};

export interface AutoRecoveryResult {
  success: boolean;
  message: string;
  steps: {
    healthCheck: boolean;
    processRecovery: boolean;
    stateRecovery: boolean;
    mcpRestart?: boolean;
  };
  attempts: number;
  finalHealth?: any;
  warnings: string[];
  timestamp: string;
}

export async function autoRecover(args: {
  maxRetries?: number;
  forceRecover?: boolean;
  restartMcp?: boolean;
} = {}): Promise<string> {
  const logger = Logger.getInstance();
  const healthChecker = HealthChecker.getInstance();
  const processManager = ProcessManager.getInstance();
  const stateManager = StateManager.getInstance();

  const maxRetries = args.maxRetries || 3;
  const forceRecover = args.forceRecover || false;
  const restartMcp = args.restartMcp || false;

  let attempts = 0;
  const warnings: string[] = [];
  const steps = {
    healthCheck: false,
    processRecovery: false,
    stateRecovery: false,
    mcpRestart: false
  };

  try {
    logger.info('Starting auto recovery process', { maxRetries, forceRecover, restartMcp });

    while (attempts < maxRetries) {
      attempts++;
      logger.info(`Recovery attempt ${attempts}/${maxRetries}`);

      // Step 1: ヘルスチェック
      try {
        const healthStatus = await healthChecker.performHealthCheck();
        steps.healthCheck = true;

        if (healthStatus.isHealthy) {
          logger.info('System is healthy, no recovery needed');
          return JSON.stringify({
            success: true,
            message: 'システムは正常状態です。復旧は不要でした。',
            steps,
            attempts,
            finalHealth: healthStatus,
            warnings,
            timestamp: new Date().toISOString()
          } as AutoRecoveryResult);
        }

        logger.warn('System unhealthy, proceeding with recovery', {
          devServerStatus: healthStatus.devServerStatus,
          checks: healthStatus.checks
        });

      } catch (error) {
        logger.error('Health check failed', { error });
        warnings.push(`ヘルスチェック失敗: ${error}`);
      }

      // Step 2: プロセス復旧
      try {
        const activeProcesses = await processManager.getStatus();
        const noRunningProcesses = activeProcesses.every(p => p.status !== 'running');

        if (noRunningProcesses) {
          logger.info('Attempting process recovery');

          // 状態から復旧を試行
          const recoveryResult = await recoverFromState({ force: forceRecover });
          const result = JSON.parse(recoveryResult);

          if (result.success) {
            steps.processRecovery = true;
            logger.info('Process recovery successful');
          } else {
            warnings.push(`プロセス復旧失敗: ${result.message}`);

            // 復旧に失敗した場合は新しいプロセスを開始
            try {
              // Start a default one if none exist? Or just skip?
              // Maybe start in CWD as fallback
              await processManager.startDevServer();
              steps.processRecovery = true;
              logger.info('Started new dev server process');
            } catch (startError) {
              warnings.push(`新プロセス開始失敗: ${startError}`);
            }
          }
        } else {
          steps.processRecovery = true;
          logger.info('At least one process is already running');
        }
      } catch (error) {
        logger.error('Process recovery failed', { error });
        warnings.push(`プロセス復旧エラー: ${error}`);
      }

      // Step 3: 状態復旧
      try {
        await stateManager.ensureStateConsistency();
        steps.stateRecovery = true;
        logger.info('State recovery completed');
      } catch (error) {
        logger.error('State recovery failed', { error });
        warnings.push(`状態復旧エラー: ${error}`);
      }

      // Step 4: MCPサーバー再起動（要求された場合）
      if (restartMcp && attempts === maxRetries) {
        try {
          logger.warn('Attempting MCP server restart as last resort');
          // 注意: 実際のMCPサーバー再起動は外部プロセス管理が必要
          // PM2やsystemdなどでの管理が前提
          warnings.push('MCPサーバー再起動が要求されましたが、外部管理ツールでの実行が必要です');
          steps.mcpRestart = true;
        } catch (error) {
          logger.error('MCP restart failed', { error });
          warnings.push(`MCP再起動エラー: ${error}`);
        }
      }

      // 復旧後のヘルスチェック
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒待機
        const postRecoveryHealth = await healthChecker.performHealthCheck();

        if (postRecoveryHealth.isHealthy) {
          logger.info('Recovery successful, system is now healthy');
          return JSON.stringify({
            success: true,
            message: `自動復旧が成功しました（${attempts}回目の試行）`,
            steps,
            attempts,
            finalHealth: postRecoveryHealth,
            warnings,
            timestamp: new Date().toISOString()
          } as AutoRecoveryResult);
        } else {
          logger.warn('System still unhealthy after recovery attempt', {
            attempt: attempts,
            devServerStatus: postRecoveryHealth.devServerStatus
          });

          if (attempts < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機してリトライ
          }
        }
      } catch (error) {
        logger.error('Post-recovery health check failed', { error });
        warnings.push(`復旧後ヘルスチェック失敗: ${error}`);
      }
    }

    // 最大試行回数に達した場合
    logger.error('Auto recovery failed after maximum attempts', { attempts: maxRetries });

    return JSON.stringify({
      success: false,
      message: `自動復旧が失敗しました（${maxRetries}回試行）`,
      steps,
      attempts,
      warnings,
      timestamp: new Date().toISOString()
    } as AutoRecoveryResult);

  } catch (error) {
    logger.error('Auto recovery process failed', { error });

    return JSON.stringify({
      success: false,
      message: `自動復旧プロセスでエラーが発生しました: ${error}`,
      steps,
      attempts,
      warnings: [...warnings, String(error)],
      timestamp: new Date().toISOString()
    } as AutoRecoveryResult);
  }
}

/**
 * Claude Codeセッション向けの簡易復旧コマンド
 */
export async function quickRecover(): Promise<string> {
  const logger = Logger.getInstance();

  try {
    logger.info('Starting quick recovery for Claude Code session');

    // 基本的な自動復旧を実行
    const result = await autoRecover({
      maxRetries: 2,
      forceRecover: true,
      restartMcp: false
    });

    const recovery = JSON.parse(result) as AutoRecoveryResult;

    if (recovery.success) {
      return `✓ 復旧完了: ${recovery.message}\n${recovery.warnings.length > 0 ? `警告: ${recovery.warnings.join(', ')}` : ''}`;
    } else {
      return `✗ 復旧失敗: ${recovery.message}\n手動での \`recover_from_state\` 実行または PM2 再起動を検討してください。`;
    }

  } catch (error) {
    logger.error('Quick recovery failed', { error });
    return `✗ 復旧エラー: ${error}\n手動復旧が必要です。`;
  }
}