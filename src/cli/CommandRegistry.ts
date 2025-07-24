import { CLIHandler } from './CLIHandler.js';
import { ScanCommand } from './commands/ScanCommand.js';
import { StartCommand } from './commands/StartCommand.js';
import { StatusCommand } from './commands/StatusCommand.js';
import { LogsCommand } from './commands/LogsCommand.js';
import { StopCommand } from './commands/StopCommand.js';
import { RestartCommand } from './commands/RestartCommand.js';

export class CommandRegistry {
  private handler: CLIHandler;

  constructor() {
    this.handler = new CLIHandler();
    this.registerAllCommands();
  }

  private registerAllCommands(): void {
    // Register all CLI commands
    this.handler.registerCommand(new ScanCommand());
    this.handler.registerCommand(new StartCommand());
    this.handler.registerCommand(new StatusCommand());
    this.handler.registerCommand(new LogsCommand());
    this.handler.registerCommand(new StopCommand());
    this.handler.registerCommand(new RestartCommand());
  }

  getHandler(): CLIHandler {
    return this.handler;
  }

  async executeCommand(args: string[]): Promise<void> {
    // Filter out the --mcp flag if present (handled at higher level)
    const filteredArgs = args.filter(arg => arg !== '--mcp');
    await this.handler.execute(filteredArgs);
  }
}