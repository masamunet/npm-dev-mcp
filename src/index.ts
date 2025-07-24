#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Logger } from './utils/logger.js';
import { ProjectContextManager } from './context/ProjectContextManager.js';
import { CommandRegistry } from './cli/CommandRegistry.js';
import { HealthChecker } from './components/HealthChecker.js';
import { StateManager } from './components/StateManager.js';
import { HealthEndpoint } from './components/HealthEndpoint.js';

// Import tool schemas and handlers
import { scanProjectDirsSchema, scanProjectDirs } from './tools/scanProjectDirs.js';
import { startDevServerSchema, startDevServer } from './tools/startDevServer.js';
import { getDevStatusSchema, getDevStatus } from './tools/getDevStatus.js';
import { getDevLogsSchema, getDevLogs } from './tools/getDevLogs.js';
import { stopDevServerSchema, stopDevServer } from './tools/stopDevServer.js';
import { restartDevServerSchema, restartDevServer } from './tools/restartDevServer.js';
import { getHealthStatusSchema, getHealthStatus } from './tools/getHealthStatus.js';
import { recoverFromStateSchema, recoverFromState } from './tools/recoverFromState.js';

// Initialize logger
const logger = Logger.getInstance();
logger.setLogLevel('info');

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
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('Listing available tools');
  return {
    tools,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  logger.info(`Executing tool: ${name}`, { args });
  
  try {
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
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // 状態管理を初期化
    const stateManager = StateManager.getInstance();
    await stateManager.initialize();
    
    // ヘルスチェックを開始
    const healthChecker = HealthChecker.getInstance();
    healthChecker.startPeriodicHealthCheck(30000); // 30秒間隔
    
    // ヘルスエンドポイントを開始（環境変数で有効化）
    const healthEndpoint = HealthEndpoint.getInstance({
      port: parseInt(process.env.HEALTH_PORT || '8080'),
      host: process.env.HEALTH_HOST || '127.0.0.1',
      enabled: process.env.HEALTH_ENDPOINT === 'true',
      path: process.env.HEALTH_PATH || '/health'
    });
    
    if (process.env.HEALTH_ENDPOINT === 'true') {
      try {
        await healthEndpoint.start();
      } catch (error) {
        logger.warn('Failed to start health endpoint', { error });
      }
    }
    
    logger.info('npm-dev-mcp server started successfully');
    logger.info('Available tools: ' + tools.map(t => t.name).join(', '));
    logger.info('Health monitoring started (30s interval)');
    logger.info('State management initialized');
    
    if (process.env.HEALTH_ENDPOINT === 'true') {
      logger.info('Health endpoint available', {
        url: `http://${process.env.HEALTH_HOST || '127.0.0.1'}:${process.env.HEALTH_PORT || '8080'}${process.env.HEALTH_PATH || '/health'}`
      });
    }
    
  } catch (error) {
    logger.error('Failed to start server', { error });
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

main().catch((error) => {
  logger.error('Main function failed', { error });
  process.exit(1);
});