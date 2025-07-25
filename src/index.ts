#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Logger } from './utils/logger.js';
import { SafeErrorHandler } from './utils/safeErrorHandler.js';
import { ProjectContextManager } from './context/ProjectContextManager.js';
import { CommandRegistry } from './cli/CommandRegistry.js';
import { HealthChecker } from './components/HealthChecker.js';
import { StateManager } from './components/StateManager.js';
import { HealthEndpoint } from './components/HealthEndpoint.js';
import { MCPServerInitializer, SERVICE_DEPENDENCIES } from './initialization/MCPServerInitializer.js';

// Import tool schemas and handlers
import { scanProjectDirsSchema, scanProjectDirs } from './tools/scanProjectDirs.js';
import { startDevServerSchema, startDevServer } from './tools/startDevServer.js';
import { getDevStatusSchema, getDevStatus } from './tools/getDevStatus.js';
import { getDevLogsSchema, getDevLogs } from './tools/getDevLogs.js';
import { stopDevServerSchema, stopDevServer } from './tools/stopDevServer.js';
import { restartDevServerSchema, restartDevServer } from './tools/restartDevServer.js';
import { getHealthStatusSchema, getHealthStatus } from './tools/getHealthStatus.js';
import { recoverFromStateSchema, recoverFromState } from './tools/recoverFromState.js';
import { autoRecoverSchema, autoRecover } from './tools/autoRecover.js';

// Initialize logger and safe error handler
const logger = Logger.getInstance();
const safeErrorHandler = SafeErrorHandler.getInstance();
logger.setLogLevel('info');

// Setup safe error handlers (non-fatal error handling)
safeErrorHandler.setupSafeErrorHandlers();

// Global initializer instance for MCP server
let mcpInitializer: MCPServerInitializer | null = null;

// Create server instance
const server = new Server(
  {
    name: 'npm-dev-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const tools = [
  scanProjectDirsSchema,
  startDevServerSchema,
  getDevStatusSchema,
  getDevLogsSchema,
  stopDevServerSchema,
  restartDevServerSchema,
  getHealthStatusSchema,
  recoverFromStateSchema,
  autoRecoverSchema,
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('Listing available tools');
  return {
    tools,
  };
});

// Helper function for dependency checking
async function handleDependencyCheck(toolName: string): Promise<any | null> {
  if (!mcpInitializer || !(toolName in SERVICE_DEPENDENCIES)) {
    return null;
  }

  try {
    await mcpInitializer.ensureToolDependencies(toolName as keyof typeof SERVICE_DEPENDENCIES);
    return null;
  } catch (dependencyError) {
    const errorMessage = dependencyError instanceof Error ? dependencyError.message : String(dependencyError);
    logger.warn(`Tool ${toolName} dependency not ready`, { 
      error: errorMessage,
      tool: toolName 
    });
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `サービス初期化中のため一時的に利用できません: ${errorMessage}`,
            tool: toolName,
            retry: true,
            retryAfter: 5000
          }),
        },
      ],
    };
  }
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  logger.info(`Executing tool: ${name}`, { args });
  
  try {
    // 依存関係チェック
    const dependencyError = await handleDependencyCheck(name);
    if (dependencyError) {
      return dependencyError;
    }
    
    switch (name) {
      case 'scan_project_dirs':
        return {
          content: [
            {
              type: 'text',
              text: await scanProjectDirs(),
            },
          ],
        };
        
      case 'start_dev_server':
        return {
          content: [
            {
              type: 'text',
              text: await startDevServer(args as { directory?: string }),
            },
          ],
        };
        
      case 'get_dev_status':
        return {
          content: [
            {
              type: 'text',
              text: await getDevStatus(),
            },
          ],
        };
        
      case 'get_dev_logs':
        return {
          content: [
            {
              type: 'text',
              text: await getDevLogs(args as { lines?: number }),
            },
          ],
        };
        
      case 'stop_dev_server':
        return {
          content: [
            {
              type: 'text',
              text: await stopDevServer(),
            },
          ],
        };
        
      case 'restart_dev_server':
        return {
          content: [
            {
              type: 'text',
              text: await restartDevServer(),
            },
          ],
        };
        
      case 'get_health_status':
        return {
          content: [
            {
              type: 'text',
              text: await getHealthStatus(args as { detailed?: boolean }),
            },
          ],
        };
        
      case 'recover_from_state':
        return {
          content: [
            {
              type: 'text',
              text: await recoverFromState(args as { force?: boolean }),
            },
          ],
        };
        
      case 'auto_recover':
        return {
          content: [
            {
              type: 'text',
              text: await autoRecover(args as { maxRetries?: number; forceRecover?: boolean; restartMcp?: boolean }),
            },
          ],
        };
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Tool execution failed: ${name}`, { error, args });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `ツール実行エラー: ${error}`,
            tool: name,
            error: String(error)
          }),
        },
      ],
    };
  }
});

// Error handling
server.onerror = (error) => {
  logger.error('Server error', { error });
};

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  
  // ヘルスチェックを停止
  const healthChecker = HealthChecker.getInstance();
  healthChecker.cleanup();
  
  // 状態管理をクリーンアップ
  const stateManager = StateManager.getInstance();
  stateManager.cleanup();
  
  // ヘルスエンドポイントを停止
  const healthEndpoint = HealthEndpoint.getInstance();
  healthEndpoint.cleanup();
  
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  
  // ヘルスチェックを停止
  const healthChecker = HealthChecker.getInstance();
  healthChecker.cleanup();
  
  // 状態管理をクリーンアップ
  const stateManager = StateManager.getInstance();
  stateManager.cleanup();
  
  // ヘルスエンドポイントを停止
  const healthEndpoint = HealthEndpoint.getInstance();
  healthEndpoint.cleanup();
  
  await server.close();
  process.exit(0);
});

// Determine run mode based on command line arguments
function determineRunMode(): 'mcp' | 'cli' {
  // If no arguments or only stdio-related arguments, run as MCP server
  const args = process.argv.slice(2);
  
  // If executed via npx npm-dev-mcp with --mcp flag, run as MCP server
  if (args.includes('--mcp')) {
    return 'mcp';
  }
  
  return args.length === 0 ? 'mcp' : 'cli';
}

// Start MCP server mode
async function startMCPServer() {
  try {
    // フェーズ1: 最小限初期化（STDIO接続のみ）
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info('MCP JSON-RPC connection established');
    logger.info('Available tools: ' + tools.map(t => t.name).join(', '));
    
    // 初期化インスタンスを作成
    mcpInitializer = new MCPServerInitializer();
    
    // フェーズ2: 背景初期化（非同期実行）
    setImmediate(() => {
      mcpInitializer!.startBackgroundInitialization()
        .then(() => {
          logger.info('All background services initialized successfully');
        })
        .catch(error => {
          logger.error('Background service initialization failed', { error });
        });
    });
    
  } catch (error) {
    logger.error('Failed to establish MCP connection', { error });
    process.exit(1);
  }
}

// Start CLI mode
async function startCLIMode() {
  try {
    const args = process.argv.slice(2);
    const commandRegistry = new CommandRegistry();
    await commandRegistry.executeCommand(args);
    
  } catch (error) {
    logger.error('CLI execution failed', { error });
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${errorMessage}`);
    process.exit(1);
  }
}

// Main entry point
async function main() {
  try {
    // Initialize project context
    const contextManager = ProjectContextManager.getInstance();
    await contextManager.initialize(process.cwd());
    
    // Determine and execute run mode
    const runMode = determineRunMode();
    
    if (runMode === 'mcp') {
      await startMCPServer();
    } else {
      await startCLIMode();
    }
    
  } catch (error) {
    logger.error('Initialization failed', { error });
    process.exit(1);
  }
}

// Error handlers are now managed by SafeErrorHandler
// (setupSafeErrorHandlers() called above replaces the fatal handlers)

main().catch((error) => {
  logger.error('Main function failed', { error });
  safeErrorHandler.handleFatalError(error instanceof Error ? error : new Error(String(error)), 'main');
});