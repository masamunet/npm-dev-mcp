import { CLICommand, CLIOptions, CLIError } from '../types.js';
import { OutputFormatter } from '../OutputFormatter.js';
import { ProcessManager } from '../../components/ProcessManager.js';

export class RestartCommand implements CLICommand {
  name = 'restart';
  description = 'Restart current project dev server';
  usage = 'npx npm-dev-mcp restart [options]';
  options = [
    {
      long: 'json',
      description: 'Output in JSON format',
      type: 'boolean' as const
    },
    {
      long: 'wait',
      description: 'Seconds to wait before restarting',
      type: 'number' as const,
      default: 1
    }
  ];

  private formatter = new OutputFormatter();

  async execute(args: string[], options: CLIOptions): Promise<void> {
    try {
      const processManager = new ProcessManager();
      
      // Check if server is running
      const status = await processManager.getStatus();
      
      if (!status) {
        throw new CLIError('No dev server is running. Use "start" command to start it.', 1);
      }

      console.log('🔄 Restarting dev server...');
      
      // Add wait if specified
      const waitTime = options.wait || 1;
      if (waitTime > 1) {
        console.log(`⏳ Waiting ${waitTime} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      }

      // Restart the server
      const newProcess = await processManager.restartDevServer();
      
      // Wait a moment for potential port detection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get updated status
      const newStatus = await processManager.getStatus();
      const finalProcess = newStatus || newProcess;
      
      const output = this.formatter.formatStartResult(finalProcess, options.json);
      console.log('\n🚀 Dev server restarted successfully!');
      console.log(output);

    } catch (error) {
      throw new CLIError(`Failed to restart dev server: ${error}`, 1);
    }
  }
}