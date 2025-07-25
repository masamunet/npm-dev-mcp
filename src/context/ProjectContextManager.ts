import path from 'path';
import { fileExists, readJsonFile, findUpwards } from '../utils/fileSystem.js';
import { Logger } from '../utils/logger.js';

export interface ProjectContext {
  rootDirectory: string;
  packageJson?: any;
  envPath?: string;
  projectName: string;
}

export class ProjectContextManager {
  private static instance: ProjectContextManager;
  private context: ProjectContext | null = null;
  private logger = Logger.getInstance();

  static getInstance(): ProjectContextManager {
    if (!ProjectContextManager.instance) {
      ProjectContextManager.instance = new ProjectContextManager();
    }
    return ProjectContextManager.instance;
  }

  async initialize(rootDir: string = process.cwd()): Promise<void> {
    this.logger.info(`Initializing project context from ${rootDir}`);
    
    try {
      // package.jsonを探す
      const packageJsonPath = await findUpwards(rootDir, 'package.json');
      let packageJson: any = null;
      let actualRootDir = rootDir;

      if (packageJsonPath) {
        packageJson = await readJsonFile(packageJsonPath);
        actualRootDir = path.dirname(packageJsonPath);
        this.logger.debug(`Found package.json at ${packageJsonPath}`);
      }

      // .envファイルを探す
      const envPath = await this.findEnvFile(actualRootDir);
      
      // プロジェクト名を生成
      const projectName = this.generateProjectName(actualRootDir, packageJson);

      this.context = {
        rootDirectory: actualRootDir,
        packageJson,
        envPath,
        projectName
      };

      this.logger.info(`Project context initialized: ${projectName} at ${actualRootDir}`);
    } catch (error) {
      this.logger.error('Failed to initialize project context', { error });
      // エラーでもデフォルトコンテキストを作成
      this.context = {
        rootDirectory: rootDir,
        projectName: this.generateProjectName(rootDir, null)
      };
    }
  }

  getContext(): ProjectContext {
    if (!this.context) {
      throw new Error('ProjectContextManager not initialized. Call initialize() first.');
    }
    return this.context;
  }

  isInitialized(): boolean {
    return this.context !== null;
  }

  private async findEnvFile(directory: string): Promise<string | undefined> {
    const envFiles = ['.env', '.env.local', '.env.development'];
    
    for (const envFile of envFiles) {
      const envPath = path.join(directory, envFile);
      if (await fileExists(envPath)) {
        this.logger.debug(`Found env file: ${envPath}`);
        return envPath;
      }
    }
    
    return undefined;
  }

  private generateProjectName(directory: string, packageJson: any): string {
    // package.jsonからプロジェクト名を取得
    if (packageJson && packageJson.name) {
      return packageJson.name;
    }

    // ディレクトリ名をプロジェクト名として使用
    const dirName = path.basename(directory);
    return dirName || 'unnamed-project';
  }

  // デバッグ用：コンテキスト情報を出力
  debugInfo(): void {
    if (!this.context) {
      this.logger.debug('ProjectContext: Not initialized');
      return;
    }

    this.logger.debug('ProjectContext:', {
      name: this.context.projectName,
      root: this.context.rootDirectory,
      hasPackageJson: !!this.context.packageJson,
      envPath: this.context.envPath || 'Not found'
    });
  }
}