import { exec } from 'child_process';
import { promisify } from 'util';
import { PortInfo } from '../types.js';
import { Logger } from '../utils/logger.js';

const execAsync = promisify(exec);

export class PortDetector {
  private logger = Logger.getInstance();

  async detectPorts(pid: number): Promise<PortInfo[]> {
    this.logger.debug(`Detecting ports for PID ${pid}`);
    
    try {
      // Try different methods based on the platform
      if (process.platform === 'darwin') {
        return await this.detectPortsMacOS(pid);
      } else if (process.platform === 'linux') {
        return await this.detectPortsLinux(pid);
      } else {
        this.logger.warn(`Unsupported platform: ${process.platform}`);
        return [];
      }
    } catch (error) {
      this.logger.error(`Failed to detect ports for PID ${pid}`, { error });
      return [];
    }
  }

  private async detectPortsMacOS(pid: number): Promise<PortInfo[]> {
    try {
      const { stdout } = await execAsync(`lsof -i -P -n | grep ${pid}`);
      return this.parseLsofOutput(stdout);
    } catch (error) {
      // Try alternative approach
      try {
        const { stdout } = await execAsync(`netstat -an | grep LISTEN`);
        return this.parseNetstatOutputGeneric(stdout, pid);
      } catch {
        return [];
      }
    }
  }

  private async detectPortsLinux(pid: number): Promise<PortInfo[]> {
    try {
      const { stdout } = await execAsync(`netstat -tulpn | grep ${pid}`);
      return this.parseNetstatOutput(stdout);
    } catch (error) {
      // Fallback to ss command
      try {
        const { stdout } = await execAsync(`ss -tulpn | grep ${pid}`);
        return this.parseSsOutput(stdout);
      } catch {
        return [];
      }
    }
  }

  private parseLsofOutput(output: string): PortInfo[] {
    const ports: PortInfo[] = [];
    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;

      const name = parts[0];
      const pidStr = parts[1];
      const type = parts[4];
      const address = parts[8];

      if (!address.includes(':')) continue;

      const portMatch = address.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1]);
      const protocol = type.toLowerCase().includes('tcp') ? 'tcp' : 'udp';
      const pid = parseInt(pidStr);

      if (!isNaN(port) && !isNaN(pid)) {
        ports.push({
          port,
          protocol: protocol as 'tcp' | 'udp',
          pid,
          service: name
        });
      }
    }

    return ports;
  }

  private parseNetstatOutput(output: string): PortInfo[] {
    const ports: PortInfo[] = [];
    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 7) continue;

      const protocol = parts[0].toLowerCase();
      const address = parts[3];
      const pidProgram = parts[6];

      if (!address.includes(':')) continue;

      const portMatch = address.match(/:(\d+)$/);
      if (!portMatch) continue;

      const pidMatch = pidProgram.match(/(\d+)\//);
      if (!pidMatch) continue;

      const port = parseInt(portMatch[1]);
      const pid = parseInt(pidMatch[1]);

      if (!isNaN(port) && !isNaN(pid)) {
        ports.push({
          port,
          protocol: protocol.includes('tcp') ? 'tcp' : 'udp',
          pid
        });
      }
    }

    return ports;
  }

  private parseSsOutput(output: string): PortInfo[] {
    const ports: PortInfo[] = [];
    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 6) continue;

      const protocol = parts[0].toLowerCase();
      const address = parts[4];
      const process = parts[6] || parts[5];

      if (!address.includes(':')) continue;

      const portMatch = address.match(/:(\d+)$/);
      if (!portMatch) continue;

      const pidMatch = process.match(/pid=(\d+)/);
      if (!pidMatch) continue;

      const port = parseInt(portMatch[1]);
      const pid = parseInt(pidMatch[1]);

      if (!isNaN(port) && !isNaN(pid)) {
        ports.push({
          port,
          protocol: protocol.includes('tcp') ? 'tcp' : 'udp',
          pid
        });
      }
    }

    return ports;
  }

  private parseNetstatOutputGeneric(output: string, targetPid: number): PortInfo[] {
    // This is a fallback that tries to correlate ports with the target PID
    // by checking which ports are in LISTEN state
    const ports: PortInfo[] = [];
    const lines = output.split('\n').filter(line => line.includes('LISTEN'));

    for (const line of lines) {
      const portMatch = line.match(/\.(\d+)\s/);
      if (portMatch) {
        const port = parseInt(portMatch[1]);
        if (!isNaN(port) && port > 1024) { // Common development ports
          ports.push({
            port,
            protocol: 'tcp',
            pid: targetPid
          });
        }
      }
    }

    return ports;
  }

  async getPortsByPid(pid: number): Promise<number[]> {
    const portInfos = await this.detectPorts(pid);
    return portInfos.map(info => info.port);
  }
}