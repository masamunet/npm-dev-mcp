# npm run dev MCP サーバー - 設計仕様書

## アーキテクチャ概要

### システム構成
```
MCP Server
├── ProjectScanner (プロジェクト検出)
├── ProcessManager (プロセス管理)
├── LogManager (ログ管理)
├── PortDetector (ポート検出)
└── EnvLoader (.env読み込み)
```

### 技術スタック
- **言語**: TypeScript
- **ランタイム**: Node.js
- **MCPフレームワーク**: @modelcontextprotocol/sdk
- **プロセス管理**: Node.js child_process
- **ファイル操作**: Node.js fs/promises
- **ポート検出**: netstatまたはlsofコマンド

## コンポーネント設計

### 1. ProjectScanner
**責務**: プロジェクト構造の検出とpackage.json解析

```typescript
interface ProjectInfo {
  directory: string;
  packageJson: any;
  hasDevScript: boolean;
  envPath?: string;
  priority: number; // 検出優先度
}

class ProjectScanner {
  async scanForProjects(startDir: string): Promise<ProjectInfo[]>
  async findPackageJsonFiles(dir: string): Promise<string[]>
  async validateDevScript(packagePath: string): Promise<boolean>
  async findEnvFile(dir: string): Promise<string | null>
  async prioritizeProjects(projects: ProjectInfo[]): Promise<ProjectInfo[]>
}
```

**検出ロジック**:
1. 現在のディレクトリから上位へpackage.json検索
2. サブディレクトリを再帰的に検索
3. devスクリプトの存在確認
4. .envファイルの検出
5. 優先度付け（ルート > サブディレクトリ）

### 2. ProcessManager
**責務**: npm run devプロセスの生成・管理・監視

```typescript
interface DevProcess {
  pid: number;
  directory: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  startTime: Date;
  ports: number[];
}

class ProcessManager {
  private currentProcess: DevProcess | null = null;
  
  async startDevServer(directory: string, env?: Record<string, string>): Promise<DevProcess>
  async stopDevServer(): Promise<boolean>
  async restartDevServer(): Promise<DevProcess>
  async getStatus(): Promise<DevProcess | null>
  async isProcessRunning(pid: number): Promise<boolean>
  private async killProcess(pid: number): Promise<void>
}
```

**プロセス管理方式**:
- `child_process.spawn()`でバックグラウンド実行
- detached: trueでプロセス独立
- PIDファイルによる状態管理
- プロセス生存確認機能

### 3. LogManager
**責務**: ログの収集・保存・配信

```typescript
interface LogEntry {
  timestamp: Date;
  level: 'info' | 'error' | 'warn';
  message: string;
  source: 'stdout' | 'stderr';
}

class LogManager {
  private logs: LogEntry[] = [];
  private logStream: NodeJS.ReadableStream | null = null;
  
  async startLogging(process: ChildProcess): Promise<void>
  async stopLogging(): Promise<void>
  async getLogs(lines?: number): Promise<LogEntry[]>
  async clearLogs(): Promise<void>
  private parseLogLevel(message: string): 'info' | 'error' | 'warn'
}
```

**ログ管理方式**:
- stdoutとstderrを監視
- メモリ内リングバッファ（最大1000行）
- タイムスタンプとレベル付き
- リアルタイム監視機能

### 4. PortDetector
**責務**: npm run devが使用するポートの検出

```typescript
interface PortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  pid: number;
  service?: string;
}

class PortDetector {
  async detectPorts(pid: number): Promise<PortInfo[]>
  async parseNetstatOutput(output: string): Promise<PortInfo[]>
  async parseLsofOutput(output: string): Promise<PortInfo[]>
  async getPortsByPid(pid: number): Promise<number[]>
}
```

**ポート検出方式**:
- macOS: `lsof -i -P -n | grep PID`
- Linux: `netstat -tulpn | grep PID`
- ログ解析によるポート番号抽出（補助）

### 5. EnvLoader
**責務**: .envファイルの読み込みと環境変数管理

```typescript
class EnvLoader {
  async loadEnvFile(filePath: string): Promise<Record<string, string>>
  async mergeEnvVars(base: Record<string, string>, additional: Record<string, string>): Promise<Record<string, string>>
  private parseEnvFile(content: string): Record<string, string>
}
```

## MCPツール実装設計

### 1. scan_project_dirs
```typescript
{
  name: "scan_project_dirs",
  description: "プロジェクト内のpackage.jsonとdevスクリプトを検索",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

### 2. start_dev_server
```typescript
{
  name: "start_dev_server",
  description: "指定ディレクトリでnpm run devを開始",
  inputSchema: {
    type: "object",
    properties: {
      directory: {
        type: "string",
        description: "実行ディレクトリ（オプション）"
      }
    }
  }
}
```

### 3. get_dev_status
```typescript
{
  name: "get_dev_status",
  description: "npm run devプロセスの状態確認",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

### 4. get_dev_logs
```typescript
{
  name: "get_dev_logs",
  description: "npm run devのログ取得",
  inputSchema: {
    type: "object",
    properties: {
      lines: {
        type: "number",
        description: "取得行数（デフォルト：50）"
      }
    }
  }
}
```

### 5. stop_dev_server & restart_dev_server
```typescript
// stop_dev_server: パラメータなし
// restart_dev_server: パラメータなし
```

## データフロー

### サーバー起動フロー
1. `scan_project_dirs` → ProjectScanner.scanForProjects()
2. ユーザーがディレクトリ選択 or 自動選択
3. `start_dev_server` → ProcessManager.startDevServer()
4. EnvLoader.loadEnvFile() → 環境変数読み込み
5. child_process.spawn() → プロセス起動
6. LogManager.startLogging() → ログ監視開始
7. PortDetector.detectPorts() → ポート検出

### 状態監視フロー
1. `get_dev_status` → ProcessManager.getStatus()
2. プロセス生存確認
3. ポート情報取得
4. ステータス返却

## エラーハンドリング

### プロセス起動エラー
- package.jsonなし → "devスクリプトが見つかりません"
- ポート使用中 → "ポート{port}は既に使用されています"
- 権限エラー → "実行権限がありません"

### プロセス実行エラー
- プロセス異常終了 → ログ保持、ステータス更新
- 通信エラー → 再接続試行
- メモリ不足 → プロセス強制終了

## セキュリティ考慮事項

### 実行権限
- 指定されたディレクトリ内でのみ実行
- 上位ディレクトリへの移動制限
- 環境変数の安全な読み込み

### プロセス分離
- detachedプロセスでの実行
- 適切なシグナルハンドリング
- リソースリーク防止

## パフォーマンス最適化

### メモリ管理
- ログのリングバッファ化
- 定期的なGC実行
- プロセス監視の効率化

### 応答性
- 非同期処理の活用
- プロセス状態キャッシュ
- ポート検出の最適化