export interface ProjectInfo {
  directory: string;
  packageJson: any;
  hasDevScript: boolean;
  envPath?: string;
  priority: number;
}

export interface DevProcess {
  pid: number;
  directory: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  startTime: Date;
  ports: number[];
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'error' | 'warn';
  message: string;
  source: 'stdout' | 'stderr';
}

export interface PortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  pid: number;
  service?: string;
}

export interface ServerStatus {
  isRunning: boolean;
  process?: DevProcess;
  directory?: string;
  ports: number[];
  error?: string;
}