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

// Import tool schemas and handlers
import { scanProjectDirsSchema, scanProjectDirs } from './tools/scanProjectDirs.js';
import { startDevServerSchema, startDevServer } from './tools/startDevServer.js';
import { getDevStatusSchema, getDevStatus } from './tools/getDevStatus.js';
import { getDevLogsSchema, getDevLogs } from './tools/getDevLogs.js';
import { stopDevServerSchema, stopDevServer } from './tools/stopDevServer.js';
import { restartDevServerSchema, restartDevServer } from './tools/restartDevServer.js';

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
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
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
    
    logger.info('npm-dev-mcp server started successfully');
    logger.info('Available tools: ' + tools.map(t => t.name).join(', '));
    
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