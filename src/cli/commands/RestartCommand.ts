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
      const processManager = ProcessManager.getInstance();

      // Check if server is running
      const status = await processManager.getStatus();

      if (status.length === 0) {
        throw new CLIError('No dev server is running. Use "start" command to start it.', 1);
      }

      // Determine target (first one for CLI default behavior?)
      const targetDirectory = status[0].directory; // Simplified for now

      const targetProcess = status.find(p => p.directory === targetDirectory);
      if (targetProcess) {
        console.log(`🔄 Restarting dev server for ${targetProcess.directory}...`);
      } else {
        console.log('🔄 Restarting dev server...');
      }

      // Add wait if specified
      const waitTime = options.wait || 1;
      if (waitTime > 1) {
        console.log(`⏳ Waiting ${waitTime} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      }

      // Restart the server
      const newProcess = await processManager.restartDevServer(targetDirectory);

      // Wait a moment for potential port detection
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get updated status
      const newStatus = await processManager.getStatus();
      const finalProcess = newStatus.find(p => p.directory === newProcess.directory) || newProcess;

      const output = this.formatter.formatStartResult(finalProcess, options.json);
      console.log('\n🚀 Dev server restarted successfully!');
      console.log(output);

    } catch (error) {
      throw new CLIError(`Failed to restart dev server: ${error}`, 1);
    }
  }
}