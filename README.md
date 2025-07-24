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

### 1. ビルド
```bash
npm install
npm run build
```

### 2. MCPサーバーとして起動
```bash
npm start
```

### 3. Claude Codeでの設定
設定ファイルにMCPサーバーを追加：

```json
{
  "mcpServers": {
    "npm-dev-mcp": {
      "command": "node",
      "args": ["/path/to/npm-dev-mcp/dist/index.js"]
    }
  }
}
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