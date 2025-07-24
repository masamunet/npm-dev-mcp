# @masamunet/npm-dev-mcp

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

### get_health_status
MCPサーバー自身のヘルス状態を取得します。

**パラメータ:**
- `detailed` (オプション): 詳細なヘルスレポートを取得するかどうか（デフォルト: false）

```json
{
  "success": true,
  "message": "MCPサーバーは正常状態です",
  "health": {
    "isHealthy": true,
    "uptime": 300,
    "devServerStatus": "running",
    "memoryUsage": {
      "heapUsed": 45,
      "rss": 78
    },
    "checks": {
      "memory": true,
      "processManager": true,
      "devServer": true
    },
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### recover_from_state
保存された状態からの復旧を試行します。

**パラメータ:**
- `force` (オプション): 強制的に復旧を実行するかどうか（デフォルト: false）

```json
{
  "success": true,
  "message": "状態の復旧が完了しました",
  "recovery": {
    "devProcessRecovered": true,
    "projectContextRecovered": true,
    "warnings": [],
    "previousProcess": {
      "pid": 12345,
      "directory": "/path/to/project",
      "status": "running",
      "ports": [3000]
    },
    "recoveryTimestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## インストールと使用

### 0. 公開情報

パッケージはnpmレジストリに公開されています：
- **パッケージ名**: `@masamunet/npm-dev-mcp`
- **バージョン**: 1.1.0
- **レジストリ**: https://www.npmjs.com/package/@masamunet/npm-dev-mcp

### 1. npx経由での直接使用（推奨）
```bash
# プロジェクトをスキャン
npx @masamunet/npm-dev-mcp scan

# dev serverを開始
npx @masamunet/npm-dev-mcp start

# 状態確認
npx @masamunet/npm-dev-mcp status

# ログを表示
npx @masamunet/npm-dev-mcp logs 50

# サーバー停止
npx @masamunet/npm-dev-mcp stop

# ヘルプ表示
npx @masamunet/npm-dev-mcp --help
```

### 2. グローバルインストール
```bash
# グローバルインストール
npm install -g @masamunet/npm-dev-mcp

# 使用例
npm-dev-mcp scan
npm-dev-mcp start
npm-dev-mcp status
```

### 3. ローカル開発用ビルド
```bash
git clone https://github.com/masamunet/npm-dev-mcp.git
cd npm-dev-mcp
npm install
npm run build
```

### 4. MCPサーバーとして起動
```bash
npm start
```

### 5. Claude Codeでの設定

#### 5.1 コマンドラインから追加（推奨）
Claude Codeのmcpコマンドを使用して簡単に追加できます：

```bash
claude mcp add @masamunet/npm-dev-mcp -- npx @masamunet/npm-dev-mcp --mcp
```

このコマンド実行後、Claude Codeを再起動すると@masamunet/npm-dev-mcpが利用可能になります。

#### 5.2 手動での設定ファイル編集
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
    "@masamunet/npm-dev-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/@masamunet/npm-dev-mcp/dist/index.js"]
    }
  }
}
```

**方法2: npx経由（--mcpフラグ使用）**
```json
{
  "mcpServers": {
    "@masamunet/npm-dev-mcp": {
      "command": "npx",
      "args": ["@masamunet/npm-dev-mcp", "--mcp"]
    }
  }
}
```

**注意事項:**
- 方法1の`args`の配列内のパスは**絶対パス**で指定してください
- 例: `"/Users/username/projects/@masamunet/npm-dev-mcp/dist/index.js"`
- 相対パスや`~`は使用できません
- 方法2では`--mcp`フラグが必要です（MCPサーバーモードを強制）

#### 5.3 Claude Codeの再起動
設定を追加した後、Claude Codeを再起動すると、@masamunet/npm-dev-mcpサーバーが利用可能になります。

#### 5.4 動作確認
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

## トラブルシューティング

### MCPサーバーが応答しない場合

MCPサーバーがクラッシュしたり応答しなくなった場合の復旧方法：

#### 1. 開発サーバーのみ復旧する場合

**Claude Code内での復旧:**
```
開発サーバーを再起動してください
```
→ `restart_dev_server` ツールが自動実行されます

**コマンドラインからの復旧:**
```bash
# 開発サーバーの状態確認
npx @masamunet/npm-dev-mcp status

# 開発サーバー再起動
npx @masamunet/npm-dev-mcp restart

# ログ確認
npx @masamunet/npm-dev-mcp logs 50
```

#### 2. MCPサーバー全体を復旧する場合

**Claude Codeの再起動:**
1. Claude Codeアプリケーションを完全に終了
2. アプリケーションを再起動
3. MCPサーバーが自動的に再接続されます

**手動でのMCPサーバー確認:**
```bash
# プロセス確認
ps aux | grep @masamunet/npm-dev-mcp

# 必要に応じてプロセス終了
pkill -f @masamunet/npm-dev-mcp
```

#### 3. 設定の確認

MCPサーバーが起動しない場合、設定ファイルを確認：

**macOS:**
```bash
cat ~/.claude/claude_desktop_config.json
```

**Windows:**
```cmd
type %APPDATA%\Claude\claude_desktop_config.json
```

正しい設定例：
```json
{
  "mcpServers": {
    "@masamunet/npm-dev-mcp": {
      "command": "npx",
      "args": ["@masamunet/npm-dev-mcp", "--mcp"]
    }
  }
}
```

#### 4. PM2を使用したプロセス管理（上級者向け）

より堅牢な運用を行いたい場合、PM2プロセスマネージャーを使用できます：

**PM2のインストール:**
```bash
npm install -g pm2
```

**PM2でのMCPサーバー管理:**
```bash
# MCPサーバーをPM2で開始
npm run pm2:start

# 状態確認
npm run pm2:status

# ログ確認
npm run pm2:logs

# 再起動
npm run pm2:restart

# 停止
npm run pm2:stop

# 完全削除
npm run pm2:delete
```

**PM2の利点:**
- 自動再起動（クラッシュ時）
- メモリ監視と制限
- ログローテーション
- クラスター機能（必要に応じて）

#### 5. 外部監視用ヘルスチェックエンドポイント

外部の監視システム（Prometheus、Nagios等）と連携するためのHTTPエンドポイントを提供できます：

**ヘルスエンドポイントの有効化:**
```bash
# 環境変数を設定
export HEALTH_ENDPOINT=true
export HEALTH_PORT=8080
export HEALTH_HOST=127.0.0.1

# MCPサーバーを開始
npm start
```

**利用可能なエンドポイント:**
```bash
# 基本ヘルスチェック
curl http://127.0.0.1:8080/health

# 詳細ヘルスレポート
curl http://127.0.0.1:8080/health/detailed

# Prometheusメトリクス
curl http://127.0.0.1:8080/metrics
```

**環境変数:**
- `HEALTH_ENDPOINT`: エンドポイントを有効化（true/false）
- `HEALTH_PORT`: ポート番号（デフォルト: 8080）
- `HEALTH_HOST`: ホスト（デフォルト: 127.0.0.1）
- `HEALTH_PATH`: ヘルスチェックパス（デフォルト: /health）

#### 6. よくある問題と解決方法

**問題: "spawn ENOENT" エラー**
- 原因: Node.jsまたはnpxが見つからない
- 解決: PATHの確認とNode.jsの再インストール

**問題: 開発サーバーが起動しない**
- 原因: ポートが使用中、package.jsonの設定不備
- 解決: `npx @masamunet/npm-dev-mcp scan` でプロジェクト検出を確認

**問題: ログが表示されない**
- 原因: プロセスが正常に開始されていない
- 解決: `npx @masamunet/npm-dev-mcp status` で状態確認

## ライセンス

MIT