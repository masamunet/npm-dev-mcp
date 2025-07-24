import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    // On Unix systems, sending signal 0 checks if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  try {
    process.kill(pid, signal);
  } catch (error) {
    throw new Error(`Failed to kill process ${pid}: ${error}`);
  }
}

export async function getProcessesByName(name: string): Promise<number[]> {
  try {
    const { stdout } = await execAsync(`pgrep -f "${name}"`);
    return stdout.trim().split('\n').map(pid => parseInt(pid)).filter(pid => !isNaN(pid));
  } catch {
    return [];
  }
}

export async function getProcessInfo(pid: number): Promise<{ command?: string; startTime?: Date } | null> {
  try {
    const { stdout } = await execAsync(`ps -p ${pid} -o command,lstart --no-headers`);
    const parts = stdout.trim().split(/\s{2,}/);
    
    if (parts.length >= 2) {
      return {
        command: parts[0],
        startTime: new Date(parts[1])
      };
    }
  } catch {
    // Process doesn't exist or permission denied
  }
  
  return null;
}

export function parsePort(output: string): number[] {
  const portRegex = /(?:localhost:|127\.0\.0\.1:|0\.0\.0\.0:)(\d+)/g;
  const ports: number[] = [];
  let match;
  
  while ((match = portRegex.exec(output)) !== null) {
    const port = parseInt(match[1]);
    if (!ports.includes(port)) {
      ports.push(port);
    }
  }
  
  return ports;
}