import { CLICommand, CLIOptions, CLIError } from '../types.js';
import { OutputFormatter } from '../OutputFormatter.js';
import { ProcessManager } from '../../components/ProcessManager.js';
import { EnvLoader } from '../../components/EnvLoader.js';
import { ProjectContextManager } from '../../context/ProjectContextManager.js';
import { ProjectScanner } from '../../components/ProjectScanner.js';

export class StartCommand implements CLICommand {
  name = 'start';
  description = 'Start npm run dev server for current project';
  usage = 'npx npm-dev-mcp start [directory] [options]';
  options = [
    {
      long: 'json',
      description: 'Output in JSON format',
      type: 'boolean' as const
    },
    {
      long: 'port',
      description: 'Specify port number',
      type: 'number' as const
    },
    {
      long: 'env',
      description: 'Path to environment file',
      type: 'string' as const
    }
  ];

  private formatter = new OutputFormatter();

  async execute(args: string[], options: CLIOptions): Promise<void> {
    try {
      const processManager = ProcessManager.getInstance();
      const envLoader = new EnvLoader();
      const contextManager = ProjectContextManager.getInstance();

      // Determine target directory
      let targetDirectory: string | undefined;
      if (options._args && options._args.length > 0) {
        targetDirectory = options._args[0];
      }

      // If no directory specified, use context or auto-detect
      if (!targetDirectory) {
        if (contextManager.isInitialized()) {
          const context = contextManager.getContext();
          targetDirectory = context.rootDirectory;

          // Verify the project has a dev script
          if (!context.packageJson?.scripts?.dev) {
            // Try to find a suitable project
            const scanner = new ProjectScanner();
            const projects = await scanner.scanForProjects(context.rootDirectory);

            if (projects.length === 0) {
              throw new CLIError('No projects with dev scripts found in current directory. Use "scan" command to see available projects.');
            }

            // Use the highest priority project
            targetDirectory = projects[0].directory;
          }
        }
      }

      // Prepare environment
      let envPath: string | undefined = options.env;
      if (!envPath && contextManager.isInitialized()) {
        envPath = contextManager.getContext().envPath;
      }

      const env = await envLoader.prepareEnvironment(envPath);

      // Add port to environment if specified
      if (options.port) {
        env.PORT = options.port.toString();
      }

      // Start dev server
      const devProcess = await processManager.startDevServer(targetDirectory, env);

      // Wait a moment for potential port detection
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get updated status
      const allProcesses = await processManager.getStatus();
      const finalProcess = allProcesses.find(p => p.directory === devProcess.directory) || devProcess;

      const output = this.formatter.formatStartResult(finalProcess, options.json);
      console.log(output);

    } catch (error) {
      throw new CLIError(`Failed to start dev server: ${error}`, 1);
    }
  }
}