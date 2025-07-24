import { CLICommand, CLIOptions, CLIError } from '../types.js';
import { OutputFormatter } from '../OutputFormatter.js';
import { ProjectScanner } from '../../components/ProjectScanner.js';
import { ProjectContextManager } from '../../context/ProjectContextManager.js';

export class ScanCommand implements CLICommand {
  name = 'scan';
  description = 'Scan for projects with dev scripts in current directory';
  usage = 'npx npm-dev-mcp scan [options]';
  options = [
    {
      long: 'json',
      description: 'Output in JSON format',
      type: 'boolean' as const
    },
    {
      long: 'depth',
      description: 'Search depth for subdirectories',
      type: 'number' as const,
      default: 3
    }
  ];

  private formatter = new OutputFormatter();

  async execute(args: string[], options: CLIOptions): Promise<void> {
    try {
      const scanner = new ProjectScanner();
      const contextManager = ProjectContextManager.getInstance();
      
      // Use context root directory as starting point
      const startDir = contextManager.isInitialized() 
        ? contextManager.getContext().rootDirectory 
        : process.cwd();

      const projects = await scanner.scanForProjects(startDir);
      
      const output = this.formatter.formatProjects(projects, options.json);
      console.log(output);

    } catch (error) {
      throw new CLIError(`Failed to scan projects: ${error}`, 1);
    }
  }
}