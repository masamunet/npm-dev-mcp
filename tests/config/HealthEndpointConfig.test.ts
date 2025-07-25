import { describe, it, expect } from '@jest/globals';
import { ConfigValidator } from '../../src/config/HealthEndpointConfig.js';

describe('ConfigValidator', () => {
  describe('validateHealthEndpointConfig', () => {
    it('should validate valid configuration', () => {
      const env = {
        HEALTH_PORT: '8080',
        HEALTH_HOST: '127.0.0.1',
        HEALTH_ENDPOINT: 'true',
        HEALTH_PATH: '/health'
      };

      const config = ConfigValidator.validateHealthEndpointConfig(env);

      expect(config).toEqual({
        port: 8080,
        host: '127.0.0.1',
        enabled: true,
        path: '/health'
      });
    });

    it('should use default values when env vars are not set', () => {
      const env = {};

      const config = ConfigValidator.validateHealthEndpointConfig(env);

      expect(config).toEqual({
        port: 8080,
        host: '127.0.0.1',
        enabled: false,
        path: '/health'
      });
    });

    it('should throw error for invalid port number', () => {
      const env = { HEALTH_PORT: 'invalid' };

      expect(() => ConfigValidator.validateHealthEndpointConfig(env))
        .toThrow('Invalid HEALTH_PORT value: invalid. Must be a valid number');
    });

    it('should throw error for port out of range', () => {
      const env = { HEALTH_PORT: '70000' };

      expect(() => ConfigValidator.validateHealthEndpointConfig(env))
        .toThrow('Invalid port number: 70000. Must be between 1 and 65535');
    });

    it('should throw error for invalid host', () => {
      const env = { HEALTH_HOST: '   ' }; // 空白のみの文字列

      expect(() => ConfigValidator.validateHealthEndpointConfig(env))
        .toThrow('Invalid host:    . Must be a non-empty string');
    });

    it('should throw error for invalid path', () => {
      const env = { HEALTH_PATH: 'invalid-path' };

      expect(() => ConfigValidator.validateHealthEndpointConfig(env))
        .toThrow('Invalid path: invalid-path. Must start with \'/\'');
    });

    it('should handle HEALTH_ENDPOINT false value', () => {
      const env = { HEALTH_ENDPOINT: 'false' };

      const config = ConfigValidator.validateHealthEndpointConfig(env);

      expect(config.enabled).toBe(false);
    });
  });

  describe('validateServerConfig', () => {
    it('should validate complete server configuration', () => {
      const env = {
        HEALTH_PORT: '3000',
        HEALTH_HOST: 'localhost',
        HEALTH_ENDPOINT: 'true',
        HEALTH_PATH: '/api/health',
        HEALTH_CHECK_INTERVAL: '60000',
        DEPENDENCY_TIMEOUT: '10000',
        POLLING_INTERVAL: '200'
      };

      const config = ConfigValidator.validateServerConfig(env);

      expect(config).toEqual({
        healthEndpoint: {
          port: 3000,
          host: 'localhost',
          enabled: true,
          path: '/api/health'
        },
        healthCheckInterval: 60000,
        dependencyTimeout: 10000,
        pollingInterval: 200
      });
    });

    it('should use default values for timing configurations', () => {
      const env = {};

      const config = ConfigValidator.validateServerConfig(env);

      expect(config.healthCheckInterval).toBe(30000);
      expect(config.dependencyTimeout).toBe(5000);
      expect(config.pollingInterval).toBe(100);
    });

    it('should throw error for invalid health check interval', () => {
      const env = { HEALTH_CHECK_INTERVAL: 'invalid' };

      expect(() => ConfigValidator.validateServerConfig(env))
        .toThrow('Invalid HEALTH_CHECK_INTERVAL: invalid');
    });

    it('should throw error for too small interval values', () => {
      const env = { POLLING_INTERVAL: '50' };

      expect(() => ConfigValidator.validateServerConfig(env))
        .toThrow('Invalid pollingInterval: 50. Must be at least 100ms');
    });

    it('should throw error for invalid dependency timeout', () => {
      const env = { DEPENDENCY_TIMEOUT: 'not-a-number' };

      expect(() => ConfigValidator.validateServerConfig(env))
        .toThrow('Invalid DEPENDENCY_TIMEOUT: not-a-number');
    });

    it('should validate minimum interval constraints', () => {
      const env = {
        HEALTH_CHECK_INTERVAL: '50',
        DEPENDENCY_TIMEOUT: '99',
        POLLING_INTERVAL: '10'
      };

      expect(() => ConfigValidator.validateServerConfig(env))
        .toThrow('Invalid healthCheckInterval: 50. Must be at least 100ms');
    });
  });
});