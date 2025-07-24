# npm-dev-mcp

npm run devプロセスを管理するMCPサーバーです。プロジェクトの自動検出、バックグラウンド実行、ログ監視、ポート管理機能を提供します。

## 機能

- **プロジェクト自動検出**: package.jsonとdevスクリプトを持つディレクトリを自動で検索
- **モノレポ対応**: サブディレクトリのプロジェクトも検出・管理
- **環境変数読み込み**: .envファイルの自動検出・適用
- **ポート管理**: 開発サーバーが使用するポートの自動検出
- **ログ監視**: リアルタイムログ監視と履歴管理
- **プロセス管理**: 安全な開始・停止・再起動

## 利用可能なツール

### scan_project_dirs
プロジェクト内のpackage.jsonとdevスクリプトを検索します。

```json
{
  "success": true,
  "message": "2個のプロジェクトが見つかりました",
  "projects": [
    {
      "directory": "/path/to/project",
      "name": "my-app",
      "devScript": "vite",
      "hasEnvFile": true,
      "envPath": "/path/to/project/.env",
      "priority": 15
    }
  ]
}
```

### start_dev_server
指定ディレクトリでnpm run devをバックグラウンドで開始します。

**パラメータ:**
- `directory` (オプション): 実行ディレクトリ（未指定時は自動検出）

```json
{
  "success": true,
  "message": "Dev serverが開始されました",
  "process": {
    "pid": 12345,
    "directory": "/path/to/project",
    "status": "running",
    "startTime": "2024-01-01T00:00:00.000Z",
    "ports": [3000]
  }
}
```

### get_dev_status
npm run devプロセスの状態を確認します。

```json
{
  "success": true,
  "message": "Dev serverはrunning状態です",
  "isRunning": true,
  "process": {
    "pid": 12345,
    "directory": "/path/to/project",
    "status": "running",
    "ports": [3000],
    "uptime": 120000
  },
  "logs": {
    "total": 50,
    "errors": 0,
    "warnings": 2,
    "hasRecentErrors": false
  }
}
```

### get_dev_logs
npm run devのログを取得します。

**パラメータ:**
- `lines` (オプション): 取得行数（デフォルト：50、最大：1000）

```json
{
  "success": true,
  "message": "50行のログを取得しました",
  "logs": [
    {
      "timestamp": "2024-01-01T00:00:00.000Z",
      "level": "info",
      "source": "stdout",
      "message": "Server running on http://localhost:3000"
    }
  ]
}
```

### stop_dev_server
npm run devプロセスを停止します。

```json
{
  "success": true,
  "message": "Dev serverを正常に停止しました",
  "wasRunning": true,
  "stoppedProcess": {
    "pid": 12345,
    "uptime": 300000,
    "ports": [3000]
  }
}
```

### restart_dev_server
npm run devプロセスを再起動します。

```json
{
  "success": true,
  "message": "Dev serverを正常に再起動しました",
  "restarted": true,
  "newProcess": {
    "pid": 12346,
    "status": "running",
    "ports": [3000]
  }
}
```

## インストールと使用

### 1. npx経由での直接使用（推奨）
```bash
# プロジェクトをスキャン
npx npm-dev-mcp scan

# dev serverを開始
npx npm-dev-mcp start

# 状態確認
npx npm-dev-mcp status

# ログを表示
npx npm-dev-mcp logs 50

# サーバー停止
npx npm-dev-mcp stop

# ヘルプ表示
npx npm-dev-mcp --help
```

### 2. ローカル開発用ビルド
```bash
npm install
npm run build
```

### 3. MCPサーバーとして起動
```bash
npm start
```

### 4. Claude Codeでの設定

#### 4.1 コマンドラインから追加（推奨）
Claude Codeのmcpコマンドを使用して簡単に追加できます：

```bash
claude mcp add npm-dev-mcp -- npx npm-dev-mcp --mcp
```

このコマンド実行後、Claude Codeを再起動するとnpm-dev-mcpが利用可能になります。

#### 4.2 手動での設定ファイル編集
手動で設定する場合は、設定ファイルを直接編集します：

**設定ファイルの場所:**

**macOS:**
```bash
~/.claude/claude_desktop_config.json
```

**Windows:**
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

**設定内容:**

**方法1: 直接パス指定**
```json
{
  "mcpServers": {
    "npm-dev-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/npm-dev-mcp/dist/index.js"]
    }
  }
}
```

**方法2: npx経由（--mcpフラグ使用）**
```json
{
  "mcpServers": {
    "npm-dev-mcp": {
      "command": "npx",
      "args": ["npm-dev-mcp", "--mcp"]
    }
  }
}
```

**注意事項:**
- 方法1の`args`の配列内のパスは**絶対パス**で指定してください
- 例: `"/Users/username/projects/npm-dev-mcp/dist/index.js"`
- 相対パスや`~`は使用できません
- 方法2では`--mcp`フラグが必要です（MCPサーバーモードを強制）

#### 4.3 Claude Codeの再起動
設定を追加した後、Claude Codeを再起動すると、npm-dev-mcpサーバーが利用可能になります。

#### 3.4 動作確認
Claude Code内で以下のように使用できます：

```
プロジェクトを検索してください
→ scan_project_dirs ツールが実行される

npm run devを開始してください  
→ start_dev_server ツールが実行される

開発サーバーの状態を確認してください
→ get_dev_status ツールが実行される
```

## 開発

### スクリプト
- `npm run build`: TypeScriptをコンパイル
- `npm run dev`: 開発モード（ウォッチモード）
- `npm start`: MCPサーバーを起動

### プロジェクト構造
```
src/
├── index.ts              # MCPサーバーエントリーポイント
├── types.ts              # 型定義
├── components/           # コアコンポーネント
│   ├── ProjectScanner.ts # プロジェクト検出
│   ├── ProcessManager.ts # プロセス管理
│   ├── LogManager.ts     # ログ管理
│   ├── PortDetector.ts   # ポート検出
│   └── EnvLoader.ts      # 環境変数読み込み
├── tools/                # MCPツール実装
└── utils/                # ユーティリティ関数
```

## 対応プラットフォーム

- macOS (lsofコマンド使用)
- Linux (netstatコマンド使用)
- Node.js 18以上

## ライセンス

MIT