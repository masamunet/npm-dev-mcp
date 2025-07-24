import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function readJsonFile(filePath: string): Promise<any> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    // 空ファイルチェック
    if (!content.trim()) {
      throw new Error(`JSON file is empty: ${filePath}`);
    }
    
    try {
      return JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Invalid JSON in file ${filePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('JSON')) {
      throw error; // JSON関連エラーはそのまま再throw
    }
    throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function findFilesRecursively(
  dir: string,
  fileName: string,
  maxDepth: number = 3
): Promise<string[]> {
  const results: string[] = [];
  
  async function search(currentDir: string, depth: number) {
    if (depth > maxDepth) return;
    
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        
        if (entry.isFile() && entry.name === fileName) {
          results.push(fullPath);
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await search(fullPath, depth + 1);
        }
      }
    } catch {
      // Ignore permission errors or invalid directories
    }
  }
  
  await search(dir, 0);
  return results;
}

export async function findUpwards(startDir: string, fileName: string): Promise<string | null> {
  let currentDir = startDir;
  
  while (currentDir !== dirname(currentDir)) {
    const filePath = join(currentDir, fileName);
    if (await fileExists(filePath)) {
      return filePath;
    }
    currentDir = dirname(currentDir);
  }
  
  return null;
}