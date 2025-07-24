import { CLIResult } from './types.js';
import { ProjectInfo, DevProcess, LogEntry } from '../types.js';

export class OutputFormatter {
  formatResult(result: CLIResult, asJson: boolean = false): string {
    if (asJson) {
      return JSON.stringify(result, null, 2);
    }

    if (!result.success) {
      return `❌ Error: ${result.error || result.message}`;
    }

    return result.message || '✅ Success';
  }

  formatProjects(projects: ProjectInfo[], asJson: boolean = false): string {
    if (asJson) {
      return JSON.stringify({ 
        success: true, 
        count: projects.length,
        projects: projects.map(p => ({
          name: p.packageJson?.name || 'Unnamed',
          directory: p.directory,
          devScript: p.packageJson?.scripts?.dev,
          hasEnvFile: !!p.envPath,
          envPath: p.envPath,
          priority: p.priority
        }))
      }, null, 2);
    }

    if (projects.length === 0) {
      return '📦 No projects with dev scripts found';
    }

    let output = `📦 Found ${projects.length} project(s) with dev scripts:\n`;
    projects.forEach((project, index) => {
      const name = project.packageJson?.name || 'Unnamed';
      const devScript = project.packageJson?.scripts?.dev || 'Unknown';
      const envStatus = project.envPath ? '🌍 .env' : '';
      
      output += `\n  ${index + 1}. ${name}\n`;
      output += `     📁 ${project.directory}\n`;
      output += `     🚀 ${devScript}\n`;
      if (envStatus) {
        output += `     ${envStatus}\n`;
      }
    });

    return output;
  }

  formatProcess(process: DevProcess, asJson: boolean = false): string {
    if (asJson) {
      return JSON.stringify({
        success: true,
        process: {
          pid: process.pid,
          directory: process.directory,
          status: process.status,
          startTime: process.startTime,
          ports: process.ports,
          uptime: Date.now() - process.startTime.getTime()
        }
      }, null, 2);
    }

    const uptime = this.formatUptime(Date.now() - process.startTime.getTime());
    const portsStr = process.ports.length > 0 ? process.ports.join(', ') : 'None detected';
    const statusIcon = this.getStatusIcon(process.status);

    return `${statusIcon} Dev server status:
  📊 Status: ${process.status}
  🆔 PID: ${process.pid}
  📁 Directory: ${process.directory}
  🕐 Uptime: ${uptime}
  🌐 Ports: ${portsStr}`;
  }

  formatLogs(logs: LogEntry[], asJson: boolean = false): string {
    if (asJson) {
      return JSON.stringify({
        success: true,
        count: logs.length,
        logs: logs.map(log => ({
          timestamp: log.timestamp.toISOString(),
          level: log.level,
          source: log.source,
          message: log.message
        }))
      }, null, 2);
    }

    if (logs.length === 0) {
      return '📝 No logs available';
    }

    let output = `📝 Showing ${logs.length} log entries:\n`;
    logs.forEach(log => {
      const timestamp = log.timestamp.toLocaleTimeString();
      const levelIcon = this.getLogLevelIcon(log.level);
      const sourceIcon = log.source === 'stderr' ? '🔴' : '🔵';
      
      output += `\n${timestamp} ${levelIcon}${sourceIcon} ${log.message}`;
    });

    return output;
  }

  formatStartResult(process: DevProcess, asJson: boolean = false): string {
    if (asJson) {
      return this.formatProcess(process, true);
    }

    const portsStr = process.ports.length > 0 
      ? `\n  🌐 Available on: ${process.ports.map(p => `http://localhost:${p}`).join(', ')}`
      : '';

    return `🚀 Dev server started successfully!
  🆔 PID: ${process.pid}
  📁 Directory: ${process.directory}${portsStr}`;
  }

  formatStopResult(wasRunning: boolean, asJson: boolean = false): string {
    if (asJson) {
      return JSON.stringify({
        success: true,
        wasRunning,
        message: wasRunning ? 'Dev server stopped' : 'No dev server was running'
      }, null, 2);
    }

    if (wasRunning) {
      return '⏹️  Dev server stopped successfully';
    } else {
      return '💤 No dev server was running';
    }
  }

  private formatUptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'running': return '🟢';
      case 'starting': return '🟡';
      case 'stopped': return '🔴';
      case 'error': return '💥';
      default: return '❓';
    }
  }

  private getLogLevelIcon(level: string): string {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️ ';
      case 'info': return 'ℹ️ ';
      default: return '📄';
    }
  }
}