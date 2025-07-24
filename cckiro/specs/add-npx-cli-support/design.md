# npx CLI対応 - 設計仕様書

## アーキテクチャ概要

### システム全体設計
```
npm-dev-mcp
├── MCP Server Mode (既存)
│   ├── stdio transport
│   ├── MCP tools (6つ)
│   └── プロジェクト個別インスタンス
└── CLI Mode (新規)
    ├── コマンドライン引数解析
    ├── 既存MCPツール機能の直接呼び出し
    └── 人間向け出力フォーマット
```

### デュアルモード設計
- **MCPサーバーモード**: 引数なし実行時（Claude Code用）
- **CLIモード**: コマンドライン引数あり実行時（直接使用）
- **共通コア**: MCPツールの実装を共有

## コンポーネント設計

### 1. エントリーポイント（src/index.ts）
**責務**: 実行モードの判定とルーティング

```typescript
interface RunMode {
  mode: 'mcp' | 'cli';
  args?: string[];
}

class EntryPoint {
  async main(): Promise<void> {
    const runMode = this.determineRunMode();
    
    if (runMode.mode === 'mcp') {
      await this.startMCPServer();
    } else {
      await this.runCLI(runMode.args);
    }
  }
  
  private determineRunMode(): RunMode {
    // process.argv解析によるモード判定
  }
}
```

### 2. CLI コマンドハンドラー（src/cli/）
**責務**: CLIコマンドの処理と出力フォーマット

```typescript
interface CLICommand {
  name: string;
  description: string;
  options: CLIOption[];
  handler: (args: any) => Promise<void>;
}

class CLIHandler {
  private commands: Map<string, CLICommand> = new Map();
  
  async execute(command: string, args: any): Promise<void> {
    const cmd = this.commands.get(command);
    if (!cmd) {
      throw new CLIError(`Unknown command: ${command}`);
    }
    
    await cmd.handler(args);
  }
  
  async formatOutput(data: any, format: 'human' | 'json'): Promise<string> {
    // 人間向け/JSON出力の切り替え
  }
}
```

### 3. プロジェクトコンテキスト（src/context/）
**責務**: プロジェクトルートの管理と共有

```typescript
interface ProjectContext {
  rootDirectory: string;
  packageJson?: any;
  envPath?: string;
  projectName: string;
}

class ProjectContextManager {
  private static instance: ProjectContextManager;
  private context: ProjectContext;
  
  static getInstance(): ProjectContextManager {
    if (!this.instance) {
      this.instance = new ProjectContextManager();
    }
    return this.instance;
  }
  
  initialize(rootDir: string = process.cwd()): Promise<void> {
    // プロジェクトルートの設定と検証
  }
  
  getContext(): ProjectContext {
    return this.context;
  }
}
```

### 4. 既存コンポーネント拡張
既存のコンポーネントにプロジェクトコンテキスト対応を追加：

```typescript
// ProjectScanner拡張
class ProjectScanner {
  async scanForProjects(startDir?: string): Promise<ProjectInfo[]> {
    const context = ProjectContextManager.getInstance();
    const searchDir = startDir || context.getContext().rootDirectory;
    // 既存実装をコンテキスト対応
  }
}

// ProcessManager拡張  
class ProcessManager {
  private getProjectIdentifier(): string {
    const context = ProjectContextManager.getInstance();
    return context.getContext().projectName;
  }
}
```

## CLI コマンド実装設計

### 1. scan コマンド
```typescript
class ScanCommand implements CLICommand {
  name = 'scan';
  
  async handler(args: { json?: boolean; depth?: number }): Promise<void> {
    const scanner = new ProjectScanner();
    const context = ProjectContextManager.getInstance().getContext();
    
    const projects = await scanner.scanForProjects(context.rootDirectory);
    
    if (args.json) {
      console.log(JSON.stringify({ success: true, projects }, null, 2));
    } else {
      this.displayHumanFormat(projects);
    }
  }
  
  private displayHumanFormat(projects: ProjectInfo[]): void {
    console.log(`Found ${projects.length} project(s):`);
    projects.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.packageJson.name || 'Unnamed'}`);
      console.log(`     Path: ${p.directory}`);
      console.log(`     Dev Script: ${p.packageJson.scripts?.dev}`);
    });
  }
}
```

### 2. start コマンド
```typescript
class StartCommand implements CLICommand {
  name = 'start';
  
  async handler(args: { directory?: string; port?: number; env?: string }): Promise<void> {
    const processManager = new ProcessManager();
    const envLoader = new EnvLoader();
    const context = ProjectContextManager.getInstance().getContext();
    
    const targetDir = args.directory || context.rootDirectory;
    const envPath = args.env || context.envPath;
    const env = await envLoader.prepareEnvironment(envPath);
    
    const devProcess = await processManager.startDevServer(targetDir, env);
    
    console.log(`✓ Dev server started for ${context.projectName}`);
    console.log(`  PID: ${devProcess.pid}`);
    console.log(`  Directory: ${devProcess.directory}`);
    if (devProcess.ports.length > 0) {
      console.log(`  Ports: ${devProcess.ports.join(', ')}`);
    }
  }
}
```

### 3. status/logs/stop/restart コマンド
同様のパターンで既存MCPツール機能を呼び出し、CLI向けにフォーマット

## パッケージング設計

### 1. package.json設定
```json
{
  "name": "npm-dev-mcp",
  "bin": {
    "npm-dev-mcp": "./dist/index.js"
  },
  "files": [
    "dist/",
    "README.md",
    "package.json"
  ],
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

### 2. ビルド設定
- TypeScriptコンパイル後のshebang保持
- 実行権限の確保
- 依存関係の最適化

## エラーハンドリング設計

### CLI専用エラー
```typescript
class CLIError extends Error {
  constructor(message: string, public exitCode: number = 1) {
    super(message);
  }
}

class CLIErrorHandler {
  static handle(error: Error): never {
    if (error instanceof CLIError) {
      console.error(`Error: ${error.message}`);
      process.exit(error.exitCode);
    }
    
    console.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}
```

## 出力フォーマット設計

### 人間向け出力
- カラー出力（chalk使用）
- プログレスバー/スピナー（ora使用）  
- 表形式表示（cli-table3使用）

### JSON出力
- 統一されたレスポンス形式
- エラー情報の構造化
- MCPツールとの互換性

## セキュリティ設計

### プロジェクト分離
- プロセス実行権限の制限
- ディレクトリトラバーサル防止
- 環境変数の適切な処理

### 入力検証
- コマンドライン引数の検証
- ファイルパスの正規化
- ポート番号の範囲チェック

## パフォーマンス設計

### 起動時間最適化
- 遅延読み込み（lazy loading）
- 不要なモジュール読み込み回避
- 軽量な依存関係

### メモリ効率
- ストリーミング処理
- 適切なガベージコレクション
- リソースクリーンアップ

## 互換性設計

### MCPサーバー機能
- 既存のMCPツール完全保持
- Claude Code連携の維持
- stdio transportの継続サポート

### CLI機能
- POSIX準拠のオプション解析
- 標準的な終了コード
- パイプライン対応