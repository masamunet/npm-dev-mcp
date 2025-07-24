import { CLICommand, CLIOptions, CLIError } from './types.js';
import { OutputFormatter } from './OutputFormatter.js';
import { Logger } from '../utils/logger.js';

export class CLIHandler {
  private commands = new Map<string, CLICommand>();
  private formatter = new OutputFormatter();
  private logger = Logger.getInstance();

  registerCommand(command: CLICommand): void {
    this.commands.set(command.name, command);
  }

  async execute(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        this.showHelp();
        return;
      }

      // Handle global options first
      if (args.includes('--help') || args.includes('-h')) {
        if (args.length === 1) {
          this.showHelp();
        } else {
          const commandName = args.find(arg => !arg.startsWith('-'));
          if (commandName) {
            this.showCommandHelp(commandName);
          } else {
            this.showHelp();
          }
        }
        return;
      }

      if (args.includes('--version') || args.includes('-v')) {
        this.showVersion();
        return;
      }

      const [commandName, ...commandArgs] = args;
      const options = this.parseOptions(commandArgs);

      // Find and execute command
      const command = this.commands.get(commandName);
      if (!command) {
        throw new CLIError(`Unknown command: ${commandName}. Use --help for available commands.`);
      }

      await command.execute(commandArgs, options);

    } catch (error) {
      this.handleError(error);
    }
  }

  private parseOptions(args: string[]): CLIOptions {
    const options: CLIOptions = {};
    const remainingArgs: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        if (value !== undefined) {
          options[key] = this.parseValue(value);
        } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          options[key] = this.parseValue(args[++i]);
        } else {
          options[key] = true;
        }
      } else if (arg.startsWith('-') && arg.length > 1) {
        // Handle short options
        const flags = arg.slice(1);
        for (const flag of flags) {
          options[flag] = true;
        }
      } else {
        remainingArgs.push(arg);
      }
    }

    // Add remaining args as positional arguments
    if (remainingArgs.length > 0) {
      options._args = remainingArgs;
    }

    return options;
  }

  private parseValue(value: string): any {
    // Try to parse as number
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    
    // Try to parse as boolean
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Return as string
    return value;
  }

  private showHelp(): void {
    const packageJson = this.getPackageInfo();
    
    console.log(`${packageJson.name} v${packageJson.version}`);
    console.log(`${packageJson.description}\n`);
    
    console.log('Usage:');
    console.log('  npx npm-dev-mcp [command] [options]\n');
    
    console.log('Available Commands:');
    this.commands.forEach(command => {
      console.log(`  ${command.name.padEnd(12)} ${command.description}`);
    });
    
    console.log('\nGlobal Options:');
    console.log('  --help, -h     Show help information');
    console.log('  --version, -v  Show version information');
    console.log('  --json         Output in JSON format');
    
    console.log('\nExamples:');
    console.log('  npx npm-dev-mcp scan                 # Scan for projects');
    console.log('  npx npm-dev-mcp start                # Start dev server');
    console.log('  npx npm-dev-mcp status --json        # Get status in JSON');
    console.log('  npx npm-dev-mcp logs 100 --follow    # Follow last 100 logs');
  }

  private showCommandHelp(commandName: string): void {
    const command = this.commands.get(commandName);
    if (!command) {
      console.log(`Unknown command: ${commandName}`);
      this.showHelp();
      return;
    }

    console.log(`${commandName} - ${command.description}\n`);
    console.log(`Usage: ${command.usage}\n`);
    
    if (command.options.length > 0) {
      console.log('Options:');
      command.options.forEach(option => {
        const shortFlag = option.short ? `-${option.short}, ` : '    ';
        const longFlag = `--${option.long}`;
        const defaultValue = option.default ? ` (default: ${option.default})` : '';
        console.log(`  ${shortFlag}${longFlag.padEnd(20)} ${option.description}${defaultValue}`);
      });
    }
  }

  private showVersion(): void {
    const packageJson = this.getPackageInfo();
    console.log(packageJson.version);
  }

  private getPackageInfo(): any {
    // This would typically read from package.json
    // For now, return hardcoded values
    return {
      name: 'npm-dev-mcp',
      version: '1.0.0',
      description: 'MCP server for managing npm run dev processes'
    };
  }

  private handleError(error: any): void {
    if (error instanceof CLIError) {
      console.error(`❌ ${error.message}`);
      process.exit(error.exitCode);
    }

    this.logger.error('Unexpected CLI error', { error });
    console.error(`💥 Unexpected error: ${error.message}`);
    process.exit(1);
  }

  getAvailableCommands(): string[] {
    return Array.from(this.commands.keys());
  }
}