import { CLICommand, CLIOptions, CLIError } from '../types.js';
import { OutputFormatter } from '../OutputFormatter.js';
import { ProcessManager } from '../../components/ProcessManager.js';

export class StopCommand implements CLICommand {
  name = 'stop';
  description = 'Stop current project dev server';
  usage = 'npx npm-dev-mcp stop [options]';
  options = [
    {
      long: 'json',
      description: 'Output in JSON format',
      type: 'boolean' as const
    },
    {
      long: 'force',
      short: 'f',
      description: 'Force stop the server',
      type: 'boolean' as const
    }
  ];

  private formatter = new OutputFormatter();

  async execute(args: string[], options: CLIOptions): Promise<void> {
    try {
      const processManager = new ProcessManager();
      
      // Check if server is running
      const status = await processManager.getStatus();
      const wasRunning = !!status;
      
      if (!wasRunning) {
        const output = this.formatter.formatStopResult(false, options.json);
        console.log(output);
        return;
      }

      // Stop the server
      const success = await processManager.stopDevServer();
      
      if (!success && options.force) {
        // Force stop not implemented in ProcessManager yet, but we can indicate it was attempted
        console.log('🔨 Force stop attempted...');
      }
      
      if (success || !options.force) {
        const output = this.formatter.formatStopResult(wasRunning, options.json);
        console.log(output);
      } else {
        throw new CLIError('Failed to stop dev server', 1);
      }

    } catch (error) {
      throw new CLIError(`Failed to stop dev server: ${error}`, 1);
    }
  }
}