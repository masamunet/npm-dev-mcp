export interface HealthEndpointConfig {
  port: number;
  host: string;
  enabled: boolean;
  path: string;
}

export interface ServerConfig {
  healthEndpoint: HealthEndpointConfig;
  healthCheckInterval: number;
  dependencyTimeout: number;
  pollingInterval: number;
}

export class ConfigValidator {
  private static validatePort(port: number): number {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port number: ${port}. Must be between 1 and 65535`);
    }
    return port;
  }

  private static validateHost(host: string): string {
    if (!host || typeof host !== 'string' || host.trim().length === 0) {
      throw new Error(`Invalid host: ${host}. Must be a non-empty string`);
    }
    return host.trim();
  }

  private static validatePath(path: string): string {
    if (!path || typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error(`Invalid path: ${path}. Must start with '/'`);
    }
    return path;
  }

  private static validateInterval(interval: number, name: string): number {
    if (!Number.isInteger(interval) || interval < 100) {
      throw new Error(`Invalid ${name}: ${interval}. Must be at least 100ms`);
    }
    return interval;
  }

  public static validateHealthEndpointConfig(env: NodeJS.ProcessEnv): HealthEndpointConfig {
    const rawPort = env.HEALTH_PORT || '8080';
    const port = parseInt(rawPort, 10);
    
    if (isNaN(port)) {
      throw new Error(`Invalid HEALTH_PORT value: ${rawPort}. Must be a valid number`);
    }

    return {
      port: this.validatePort(port),
      host: this.validateHost(env.HEALTH_HOST || '127.0.0.1'),
      enabled: env.HEALTH_ENDPOINT === 'true',
      path: this.validatePath(env.HEALTH_PATH || '/health')
    };
  }

  public static validateServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
    const healthCheckInterval = parseInt(env.HEALTH_CHECK_INTERVAL || '30000', 10);
    const dependencyTimeout = parseInt(env.DEPENDENCY_TIMEOUT || '5000', 10);
    const pollingInterval = parseInt(env.POLLING_INTERVAL || '100', 10);

    if (isNaN(healthCheckInterval)) {
      throw new Error(`Invalid HEALTH_CHECK_INTERVAL: ${env.HEALTH_CHECK_INTERVAL}`);
    }
    if (isNaN(dependencyTimeout)) {
      throw new Error(`Invalid DEPENDENCY_TIMEOUT: ${env.DEPENDENCY_TIMEOUT}`);
    }
    if (isNaN(pollingInterval)) {
      throw new Error(`Invalid POLLING_INTERVAL: ${env.POLLING_INTERVAL}`);
    }

    return {
      healthEndpoint: this.validateHealthEndpointConfig(env),
      healthCheckInterval: this.validateInterval(healthCheckInterval, 'healthCheckInterval'),
      dependencyTimeout: this.validateInterval(dependencyTimeout, 'dependencyTimeout'),
      pollingInterval: this.validateInterval(pollingInterval, 'pollingInterval')
    };
  }
}