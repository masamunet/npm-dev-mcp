import { ChildProcess } from 'child_process';
import { LogEntry } from '../types.js';
import { Logger } from '../utils/logger.js';

export class LogManager {
  private logger = Logger.getInstance();
  private logs: LogEntry[] = [];
  private logStream: NodeJS.ReadableStream | null = null;
  private readonly maxLogs = 1000;

  async startLogging(process: ChildProcess): Promise<void> {
    this.logger.info('Starting log monitoring');
    
    if (process.stdout) {
      process.stdout.on('data', (data: Buffer) => {
        this.addLog('info', data.toString(), 'stdout');
      });
    }

    if (process.stderr) {
      process.stderr.on('data', (data: Buffer) => {
        this.addLog('error', data.toString(), 'stderr');
      });
    }

    process.on('error', (error) => {
      this.addLog('error', `Process error: ${error.message}`, 'stderr');
    });

    process.on('exit', (code, signal) => {
      const message = signal 
        ? `Process exited with signal ${signal}` 
        : `Process exited with code ${code}`;
      this.addLog('info', message, 'stdout');
    });
  }

  async stopLogging(): Promise<void> {
    this.logger.info('Stopping log monitoring');
    this.logStream = null;
  }

  async getLogs(lines?: number): Promise<LogEntry[]> {
    const requestedLines = lines || 50;
    const totalLogs = this.logs.length;
    
    if (requestedLines >= totalLogs) {
      return [...this.logs];
    }
    
    return this.logs.slice(totalLogs - requestedLines);
  }

  async clearLogs(): Promise<void> {
    this.logs = [];
    this.logger.debug('Logs cleared');
  }

  private addLog(level: 'info' | 'error' | 'warn', message: string, source: 'stdout' | 'stderr'): void {
    // Parse the actual log level from the message content
    const parsedLevel = this.parseLogLevel(message);
    
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: parsedLevel || level,
      message: message.trim(),
      source
    };

    this.logs.push(logEntry);

    // Maintain ring buffer by removing old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(this.logs.length - this.maxLogs);
    }

    // Also output to internal logger for debugging
    this.logger.debug(`[${source}] ${logEntry.message}`);
  }

  private parseLogLevel(message: string): 'info' | 'error' | 'warn' | null {
    const lowerMessage = message.toLowerCase();
    
    // Common error patterns
    if (lowerMessage.includes('error') || 
        lowerMessage.includes('failed') || 
        lowerMessage.includes('cannot') ||
        lowerMessage.includes('unable') ||
        lowerMessage.includes('exception')) {
      return 'error';
    }
    
    // Common warning patterns
    if (lowerMessage.includes('warn') || 
        lowerMessage.includes('warning') || 
        lowerMessage.includes('deprecated') ||
        lowerMessage.includes('notice')) {
      return 'warn';
    }
    
    // Check for log level prefixes
    const logLevelRegex = /\[(error|warn|warning|info|debug)\]/i;
    const match = message.match(logLevelRegex);
    if (match) {
      const level = match[1].toLowerCase();
      if (level === 'warning') return 'warn';
      if (['error', 'warn', 'info'].includes(level)) {
        return level as 'error' | 'warn' | 'info';
      }
    }
    
    return null;
  }

  getLogStats(): { total: number; errors: number; warnings: number; info: number } {
    const stats = {
      total: this.logs.length,
      errors: 0,
      warnings: 0,
      info: 0
    };

    for (const log of this.logs) {
      if (log.level === 'error') stats.errors++;
      else if (log.level === 'warn') stats.warnings++;
      else stats.info++;
    }

    return stats;
  }

  hasRecentErrors(minutes: number = 5): boolean {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.logs.some(log => 
      log.level === 'error' && log.timestamp > cutoff
    );
  }
}