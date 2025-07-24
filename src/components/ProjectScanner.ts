import { join, dirname } from 'path';
import { ProjectInfo } from '../types.js';
import { findFilesRecursively, findUpwards, readJsonFile, fileExists } from '../utils/fileSystem.js';
import { Logger } from '../utils/logger.js';
import { ProjectContextManager } from '../context/ProjectContextManager.js';

export class ProjectScanner {
  private logger = Logger.getInstance();

  async scanForProjects(startDir?: string): Promise<ProjectInfo[]> {
    // Use project context if available and no startDir specified
    let searchDir = startDir;
    if (!searchDir) {
      const contextManager = ProjectContextManager.getInstance();
      if (contextManager.isInitialized()) {
        searchDir = contextManager.getContext().rootDirectory;
      } else {
        searchDir = process.cwd();
      }
    }
    
    this.logger.info(`Scanning for projects starting from ${searchDir}`);
    
    const projects: ProjectInfo[] = [];
    
    // First, look for package.json in current and parent directories
    const upwardsPackageJson = await findUpwards(searchDir, 'package.json');
    if (upwardsPackageJson) {
      const projectInfo = await this.createProjectInfo(upwardsPackageJson);
      if (projectInfo) {
        projects.push(projectInfo);
      }
    }
    
    // Then search recursively in subdirectories
    const packageJsonFiles = await findFilesRecursively(searchDir, 'package.json', 3);
    
    for (const packageJsonPath of packageJsonFiles) {
      // Skip if we already found this one
      if (upwardsPackageJson && packageJsonPath === upwardsPackageJson) {
        continue;
      }
      
      const projectInfo = await this.createProjectInfo(packageJsonPath);
      if (projectInfo) {
        projects.push(projectInfo);
      }
    }
    
    return this.prioritizeProjects(projects);
  }

  private async createProjectInfo(packageJsonPath: string): Promise<ProjectInfo | null> {
    try {
      const packageJson = await readJsonFile(packageJsonPath);
      const directory = dirname(packageJsonPath);
      const hasDevScript = await this.validateDevScript(packageJson);
      
      if (!hasDevScript) {
        return null;
      }
      
      const envPath = await this.findEnvFile(directory);
      
      return {
        directory,
        packageJson,
        hasDevScript,
        envPath: envPath || undefined,
        priority: this.calculatePriority(directory, packageJson)
      };
    } catch (error) {
      this.logger.warn(`Failed to process package.json at ${packageJsonPath}`, { error });
      return null;
    }
  }

  private async validateDevScript(packageJson: any): Promise<boolean> {
    return packageJson.scripts && 
           typeof packageJson.scripts.dev === 'string' && 
           packageJson.scripts.dev.trim().length > 0;
  }

  private async findEnvFile(directory: string): Promise<string | null> {
    const envFiles = ['.env', '.env.local', '.env.development'];
    
    for (const envFile of envFiles) {
      const envPath = join(directory, envFile);
      if (await fileExists(envPath)) {
        return envPath;
      }
    }
    
    return null;
  }

  private calculatePriority(directory: string, packageJson: any): number {
    let priority = 0;
    
    // Higher priority for root projects (fewer path segments)
    const depth = directory.split('/').length;
    priority += Math.max(0, 10 - depth);
    
    // Higher priority for common framework names
    const name = packageJson.name || '';
    if (name.includes('app') || name.includes('web') || name.includes('frontend')) {
      priority += 5;
    }
    
    // Higher priority if it has common dev dependencies
    const devDeps = packageJson.devDependencies || {};
    const deps = packageJson.dependencies || {};
    const allDeps = { ...devDeps, ...deps };
    
    const frameworks = ['vite', 'webpack', 'next', 'nuxt', 'react', 'vue', 'svelte'];
    for (const framework of frameworks) {
      if (allDeps[framework] || Object.keys(allDeps).some(dep => dep.includes(framework))) {
        priority += 3;
        break;
      }
    }
    
    return priority;
  }

  private prioritizeProjects(projects: ProjectInfo[]): ProjectInfo[] {
    return projects.sort((a, b) => b.priority - a.priority);
  }

  async findBestProject(startDir?: string): Promise<ProjectInfo | null> {
    const projects = await this.scanForProjects(startDir);
    return projects.length > 0 ? projects[0] : null;
  }
}