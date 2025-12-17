import { beforeEach, describe, it, expect, jest } from '@jest/globals';

// Logger のモック
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }))
  }
}));

// 設定バリデーターのモック
jest.unstable_mockModule('../../src/config/HealthEndpointConfig.js', () => ({
  ConfigValidator: {
    validateServerConfig: jest.fn(() => ({
      healthEndpoint: {
        port: 8080,
        host: '127.0.0.1',
        enabled: false,
        path: '/health'
      },
      healthCheckInterval: 30000,
      dependencyTimeout: 100, // Short timeout for testing
      pollingInterval: 100
    }))
  }
}));

describe('MCPServerInitializer', () => {
  let MCPServerInitializer: any;
  let SERVICE_DEPENDENCIES: any;
  let initializer: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await import('../../src/initialization/MCPServerInitializer.js');
    MCPServerInitializer = module.MCPServerInitializer;
    SERVICE_DEPENDENCIES = module.SERVICE_DEPENDENCIES;
    initializer = new MCPServerInitializer();
  });

  describe('constructor', () => {
    it('should initialize with pending status for all services', () => {
      const status = initializer.getInitializationStatus();

      expect(status.stateManager).toBe('pending');
      expect(status.healthChecker).toBe('pending');
      expect(status.healthEndpoint).toBe('pending');
      expect(status.projectContext).toBe('pending');
    });

    it('should throw error when configuration validation fails', async () => {
      const { ConfigValidator } = await import('../../src/config/HealthEndpointConfig.js');
      (ConfigValidator.validateServerConfig as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Invalid configuration');
      });

      // Need to re-import or create new instance to trigger constructor again with mocked config
      expect(() => new MCPServerInitializer()).toThrow('Invalid configuration');
    });
  });

  describe('initializeService', () => {
    it('should initialize service successfully', async () => {
      const mockInitFn = jest.fn().mockResolvedValue(undefined);

      await initializer.initializeService('stateManager', mockInitFn);

      expect(mockInitFn).toHaveBeenCalledTimes(1);
      expect(initializer.isServiceReady('stateManager')).toBe(true);
    });

    it('should not reinitialize already ready service', async () => {
      const mockInitFn = jest.fn().mockResolvedValue(undefined);

      // 最初の初期化
      await initializer.initializeService('stateManager', mockInitFn);
      expect(mockInitFn).toHaveBeenCalledTimes(1);

      // 2回目の初期化試行
      await initializer.initializeService('stateManager', mockInitFn);
      expect(mockInitFn).toHaveBeenCalledTimes(1); // 呼び出し回数は変わらない
    });

    it('should handle initialization failure', async () => {
      const mockInitFn = jest.fn().mockRejectedValue(new Error('Init failed'));

      await expect(initializer.initializeService('stateManager', mockInitFn))
        .rejects.toThrow('Init failed');

      expect(initializer.isServiceReady('stateManager')).toBe(false);
      const status = initializer.getInitializationStatus();
      expect(status.stateManager).toBe('failed');
    });

    it('should return existing promise when service is already initializing', async () => {
      let resolveInit: () => void;
      const initPromise = new Promise<void>((resolve) => {
        resolveInit = resolve;
      });
      const mockInitFn = jest.fn().mockReturnValue(initPromise);

      // 2つの並行初期化を開始
      const promise1 = initializer.initializeService('stateManager', mockInitFn);
      const promise2 = initializer.initializeService('stateManager', mockInitFn);

      expect(mockInitFn).toHaveBeenCalledTimes(1); // 1回のみ呼び出される

      // 初期化を完了
      resolveInit!();
      await Promise.all([promise1, promise2]);

      expect(initializer.isServiceReady('stateManager')).toBe(true);
    });
  });

  describe('waitForService', () => {
    it('should return immediately if service is already ready', async () => {
      const mockInitFn = jest.fn().mockResolvedValue(undefined);
      await initializer.initializeService('stateManager', mockInitFn);

      const startTime = Date.now();
      await initializer.waitForService('stateManager', 1000);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(50); // 即座に完了
    });

    it('should wait for service to become ready', async () => {
      let resolveInit: () => void;
      const initPromise = new Promise<void>((resolve) => {
        resolveInit = resolve;
      });
      const mockInitFn = jest.fn().mockReturnValue(initPromise);

      // 初期化を開始（完了はさせない）
      const initServicePromise = initializer.initializeService('stateManager', mockInitFn);

      // サービス待機を並行で開始
      const waitPromise = initializer.waitForService('stateManager', 1000);

      // 少し待ってから初期化を完了
      setTimeout(() => resolveInit!(), 50);

      await Promise.all([initServicePromise, waitPromise]);
      expect(initializer.isServiceReady('stateManager')).toBe(true);
    });

    it('should timeout when service initialization takes too long', async () => {
      const mockInitFn = jest.fn().mockImplementation(() =>
        new Promise(() => { }) // 永続に完了しないPromise
      );

      initializer.initializeService('stateManager', mockInitFn);

      await expect(initializer.waitForService('stateManager', 100))
        .rejects.toThrow('Service initialization timeout: stateManager');
    });

    it('should throw error when service initialization failed', async () => {
      const mockInitFn = jest.fn().mockRejectedValue(new Error('Init failed'));

      await expect(initializer.initializeService('stateManager', mockInitFn))
        .rejects.toThrow('Init failed');

      await expect(initializer.waitForService('stateManager', 1000))
        .rejects.toThrow('Service failed: stateManager');
    });
  });

  describe('ensureToolDependencies', () => {
    it('should ensure all dependencies for a tool', async () => {
      // stateManagerとhealthCheckerを初期化
      await initializer.initializeService('stateManager', jest.fn().mockResolvedValue(undefined));
      await initializer.initializeService('healthChecker', jest.fn().mockResolvedValue(undefined));

      // auto_recoverツールは両方のサービスに依存
      await expect(initializer.ensureToolDependencies('auto_recover'))
        .resolves.not.toThrow();
    });

    it('should throw error when dependency is not ready', async () => {
      // stateManagerのみ初期化、healthCheckerは初期化しない
      await initializer.initializeService('stateManager', jest.fn().mockResolvedValue(undefined));

      // Should timeout quickly due to mock config
      await expect(initializer.ensureToolDependencies('auto_recover'))
        .rejects.toThrow(/requires healthChecker service|initialization timeout/);
    });

    it('should handle concurrent dependency checks for same tool', async () => {
      // 依存サービスを初期化
      await initializer.initializeService('stateManager', jest.fn().mockResolvedValue(undefined));
      await initializer.initializeService('healthChecker', jest.fn().mockResolvedValue(undefined));

      // 並行で同じツールの依存関係チェック
      const promises = [
        initializer.ensureToolDependencies('auto_recover'),
        initializer.ensureToolDependencies('auto_recover'),
        initializer.ensureToolDependencies('auto_recover')
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should handle tools with no dependencies', async () => {
      // SERVICE_DEPENDENCIESに存在しないツール名での呼び出し
      // TypeScript型チェックを回避するためany型でキャスト
      await expect(initializer.ensureToolDependencies('non_existent_tool' as any))
        .resolves.not.toThrow();
    });
  });

  describe('isServiceReady', () => {
    it('should return false for pending service', () => {
      expect(initializer.isServiceReady('stateManager')).toBe(false);
    });

    it('should return true for ready service', async () => {
      await initializer.initializeService('stateManager', jest.fn().mockResolvedValue(undefined));
      expect(initializer.isServiceReady('stateManager')).toBe(true);
    });

    it('should return false for failed service', async () => {
      await expect(
        initializer.initializeService('stateManager', jest.fn().mockRejectedValue(new Error('Failed')))
      ).rejects.toThrow();

      expect(initializer.isServiceReady('stateManager')).toBe(false);
    });
  });

  describe('getInitializationStatus', () => {
    it('should return current status of all services', async () => {
      await initializer.initializeService('stateManager', jest.fn().mockResolvedValue(undefined));

      try {
        await initializer.initializeService('healthChecker', jest.fn().mockRejectedValue(new Error('Failed')));
      } catch {
        // エラーを無視
      }

      const status = initializer.getInitializationStatus();

      expect(status.stateManager).toBe('ready');
      expect(status.healthChecker).toBe('failed');
      expect(status.healthEndpoint).toBe('pending');
      expect(status.projectContext).toBe('pending');
    });
  });

  describe('SERVICE_DEPENDENCIES', () => {
    it('should have correct dependency mappings', () => {
      expect(SERVICE_DEPENDENCIES.scan_project_dirs).toEqual(['projectContext']);
      expect(SERVICE_DEPENDENCIES.start_dev_server).toEqual(['stateManager']);
      expect(SERVICE_DEPENDENCIES.get_health_status).toEqual(['healthChecker']);
      expect(SERVICE_DEPENDENCIES.auto_recover).toEqual(['stateManager', 'healthChecker']);
    });
  });

  describe('Performance Tests', () => {
    it('should respond to JSON-RPC initialization within 2 seconds', async () => {
      const startTime = Date.now();

      // JSON-RPC 初期化のシミュレーション - 即座に応答すべき
      await initializer.initializeService('stateManager', jest.fn().mockResolvedValue(undefined));

      const initializationTime = Date.now() - startTime;

      // 2秒以内での初期化完了を検証
      expect(initializationTime).toBeLessThan(2000);
    }, 3000); // 3秒のタイムアウト設定

    it('should handle concurrent tool dependency checks efficiently', async () => {
      await initializer.initializeService('stateManager', jest.fn().mockResolvedValue(undefined));

      const startTime = Date.now();

      // 複数のツールの依存関係チェックを並行実行
      const toolChecks = [
        'start_dev_server',
        'get_dev_status',
        'get_dev_logs',
        'stop_dev_server'
      ].map(tool =>
        initializer.ensureToolDependencies(tool as keyof typeof SERVICE_DEPENDENCIES)
          .catch(() => { }) // エラーは無視（依存関係が満たされていない場合）
      );

      await Promise.all(toolChecks);

      const checkTime = Date.now() - startTime;

      // 並行依存関係チェックが1秒以内で完了することを検証
      expect(checkTime).toBeLessThan(1000);
    }, 2000);
  });
});