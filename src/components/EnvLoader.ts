import { promises as fs } from 'fs';
import { Logger } from '../utils/logger.js';

export class EnvLoader {
  private logger = Logger.getInstance();

  async loadEnvFile(filePath: string): Promise<Record<string, string>> {
    try {
      this.logger.debug(`Loading environment file: ${filePath}`);
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseEnvFile(content);
    } catch (error) {
      this.logger.warn(`Failed to load env file ${filePath}`, { error });
      return {};
    }
  }

  async mergeEnvVars(
    base: Record<string, string>, 
    additional: Record<string, string>
  ): Promise<Record<string, string>> {
    return { ...base, ...additional };
  }

  private parseEnvFile(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Find the first = sign
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmedLine.substring(0, equalIndex).trim();
      let value = trimmedLine.substring(equalIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Handle escaped characters
      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'");

      if (key) {
        env[key] = value;
      }
    }

    this.logger.debug(`Parsed ${Object.keys(env).length} environment variables`);
    return env;
  }

  async prepareEnvironment(envPath?: string): Promise<Record<string, string>> {
    // Start with current process environment
    const baseEnv = { ...process.env } as Record<string, string>;
    
    if (!envPath) {
      return baseEnv;
    }

    // Load and merge .env file
    const envFileVars = await this.loadEnvFile(envPath);
    return this.mergeEnvVars(baseEnv, envFileVars);
  }
}