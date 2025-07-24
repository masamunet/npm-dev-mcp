export interface CLIOptions {
  json?: boolean;
  help?: boolean;
  version?: boolean;
  [key: string]: any;
}

export interface CLICommand {
  name: string;
  description: string;
  usage: string;
  options: CLIOptionDefinition[];
  execute(args: string[], options: CLIOptions): Promise<void>;
}

export interface CLIOptionDefinition {
  short?: string;
  long: string;
  description: string;
  type: 'boolean' | 'string' | 'number';
  default?: any;
}

export class CLIError extends Error {
  constructor(message: string, public exitCode: number = 1) {
    super(message);
    this.name = 'CLIError';
  }
}

export interface CLIResult {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}