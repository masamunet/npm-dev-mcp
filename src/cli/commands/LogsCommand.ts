import { CLICommand, CLIOptions, CLIError } from '../types.js';
import { OutputFormatter } from '../OutputFormatter.js';
import { ProcessManager } from '../../components/ProcessManager.js';

export class LogsCommand implements CLICommand {
  name = 'logs';
  description = 'Show logs from current project dev server';
  usage = 'npx npm-dev-mcp logs [lines] [options]';
  options = [
    {
      long: 'json',
      description: 'Output in JSON format',
      type: 'boolean' as const
    },
    {
      long: 'follow',
      short: 'f',
      description: 'Follow log output',
      type: 'boolean' as const
    },
    {
      long: 'level',
      description: 'Filter by log level (info, warn, error)',
      type: 'string' as const
    }
  ];

  private formatter = new OutputFormatter();

  async execute(args: string[], options: CLIOptions): Promise<void> {
    try {
      const processManager = new ProcessManager();
      const status = await processManager.getStatus();
      
      if (!status) {
        const message = options.json 
          ? JSON.stringify({ success: false, error: 'No dev server is running' }, null, 2)
          : '💤 No dev server is running. Start it with "start" command.';
        console.log(message);
        return;
      }

      // Parse lines argument
      let lines = 50; // default
      if (options._args && options._args.length > 0) {
        const linesArg = parseInt(options._args[0]);
        if (!isNaN(linesArg) && linesArg > 0) {
          lines = Math.min(linesArg, 1000); // cap at 1000
        }
      }

      if (options.follow) {
        await this.followLogs(processManager, lines, options);
      } else {
        await this.showLogs(processManager, lines, options);
      }

    } catch (error) {
      throw new CLIError(`Failed to get logs: ${error}`, 1);
    }
  }

  private async showLogs(processManager: ProcessManager, lines: number, options: CLIOptions): Promise<void> {
    const logManager = processManager.getLogManager();
    let logs = await logManager.getLogs(lines);
    
    // Filter by level if specified
    if (options.level) {
      const level = options.level.toLowerCase();
      logs = logs.filter(log => log.level === level);
    }

    const output = this.formatter.formatLogs(logs, options.json);
    console.log(output);
  }

  private async followLogs(processManager: ProcessManager, lines: number, options: CLIOptions): Promise<void> {
    console.log(`👀 Following logs (Press Ctrl+C to exit)...\n`);
    
    // Show initial logs
    await this.showLogs(processManager, lines, { ...options, json: false });
    
    const logManager = processManager.getLogManager();
    let lastLogCount = (await logManager.getLogs(1000)).length;
    
    const checkForNewLogs = async () => {
      try {
        const currentLogs = await logManager.getLogs(1000);
        if (currentLogs.length > lastLogCount) {
          // Show only new logs
          const newLogs = currentLogs.slice(lastLogCount);
          let filteredLogs = newLogs;
          
          // Apply level filter
          if (options.level) {
            const level = options.level.toLowerCase();
            filteredLogs = newLogs.filter(log => log.level === level);
          }
          
          // Display new logs
          filteredLogs.forEach(log => {
            const timestamp = log.timestamp.toLocaleTimeString();
            const levelIcon = this.getLogLevelIcon(log.level);
            const sourceIcon = log.source === 'stderr' ? '🔴' : '🔵';
            console.log(`${timestamp} ${levelIcon}${sourceIcon} ${log.message}`);
          });
          
          lastLogCount = currentLogs.length;
        }
      } catch (error) {
        console.error(`❌ Error reading logs: ${error}`);
      }
    };

    // Check for new logs every second
    const interval = setInterval(checkForNewLogs, 1000);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n👋 Log following stopped');
      process.exit(0);
    });
  }

  private getLogLevelIcon(level: string): string {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️ ';
      case 'info': return 'ℹ️ ';
      default: return '📄';
    }
  }
}