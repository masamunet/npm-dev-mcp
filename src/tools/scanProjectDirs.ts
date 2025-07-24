import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ProjectScanner } from '../components/ProjectScanner.js';
import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

export const scanProjectDirsSchema: Tool = {
  name: 'scan_project_dirs',
  description: 'プロジェクト内のpackage.jsonとdevスクリプトを検索',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
};

export async function scanProjectDirs(): Promise<string> {
  try {
    logger.info('Scanning for project directories');
    
    const scanner = new ProjectScanner();
    const projects = await scanner.scanForProjects();
    
    if (projects.length === 0) {
      return JSON.stringify({
        success: false,
        message: 'devスクリプトが定義されたpackage.jsonが見つかりませんでした',
        projects: []
      });
    }
    
    const result = {
      success: true,
      message: `${projects.length}個のプロジェクトが見つかりました`,
      projects: projects.map(project => ({
        directory: project.directory,
        name: project.packageJson.name || 'Unnamed Project',
        devScript: project.packageJson.scripts?.dev,
        hasEnvFile: !!project.envPath,
        envPath: project.envPath,
        priority: project.priority,
        dependencies: Object.keys({
          ...project.packageJson.dependencies,
          ...project.packageJson.devDependencies
        }).slice(0, 5) // Show first 5 dependencies
      }))
    };
    
    logger.info(`Found ${projects.length} projects with dev scripts`);
    return JSON.stringify(result, null, 2);
    
  } catch (error) {
    logger.error('Failed to scan project directories', { error });
    return JSON.stringify({
      success: false,
      message: `スキャンエラー: ${error}`,
      projects: []
    });
  }
}