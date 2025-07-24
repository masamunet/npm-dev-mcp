import { CLICommand, CLIOptions, CLIError } from '../types.js';
import { OutputFormatter } from '../OutputFormatter.js';
import { ProcessManager } from '../../components/ProcessManager.js';

export class StatusCommand implements CLICommand {
  name = 'status';
  description = 'Show status of current project dev server';
  usage = 'npx npm-dev-mcp status [options]';
  options = [
    {
      long: 'json',
      description: 'Output in JSON format',
      type: 'boolean' as const
    },
    {
      long: 'watch',
      short: 'w',
      description: 'Watch status continuously',
      type: 'boolean' as const
    }
  ];

  private formatter = new OutputFormatter();

  async execute(args: string[], options: CLIOptions): Promise<void> {
    try {
      const processManager = new ProcessManager();
      
      if (options.watch) {
        await this.watchStatus(processManager, options);
      } else {
        await this.showStatus(processManager, options);
      }

    } catch (error) {
      throw new CLIError(`Failed to get status: ${error}`, 1);
    }
  }

  private async showStatus(processManager: ProcessManager, options: CLIOptions): Promise<void> {
    const status = await processManager.getStatus();
    
    if (!status) {
      const message = options.json 
        ? JSON.stringify({ success: true, isRunning: false, message: 'No dev server is running' }, null, 2)
        : '💤 No dev server is running';
      console.log(message);
      return;
    }

    const output = this.formatter.formatProcess(status, options.json);
    console.log(output);
  }

  private async watchStatus(processManager: ProcessManager, options: CLIOptions): Promise<void> {
    console.log('👀 Watching dev server status (Press Ctrl+C to exit)...\n');
    
    const updateStatus = async () => {
      // Clear screen
      process.stdout.write('\x1B[2J\x1B[0f');
      
      const timestamp = new Date().toLocaleTimeString();
      console.log(`🕐 Last updated: ${timestamp}\n`);
      
      await this.showStatus(processManager, options);
    };

    // Initial status
    await updateStatus();
    
    // Update every 2 seconds
    const interval = setInterval(updateStatus, 2000);
    
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n👋 Watch mode stopped');
      process.exit(0);
    });
  }
}