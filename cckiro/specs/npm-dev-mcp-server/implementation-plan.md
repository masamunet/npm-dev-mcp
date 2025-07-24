# npm run dev MCP サーバー - 実装計画書

## プロジェクト構造

```
npm-dev-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # MCPサーバーエントリーポイント
│   ├── types.ts                 # 型定義
│   ├── components/
│   │   ├── ProjectScanner.ts    # プロジェクト検出
│   │   ├── ProcessManager.ts    # プロセス管理
│   │   ├── LogManager.ts        # ログ管理
│   │   ├── PortDetector.ts      # ポート検出
│   │   └── EnvLoader.ts         # 環境変数読み込み
│   ├── tools/
│   │   ├── scanProjectDirs.ts   # scan_project_dirs ツール
│   │   ├── startDevServer.ts    # start_dev_server ツール
│   │   ├── getDevStatus.ts      # get_dev_status ツール
│   │   ├── getDevLogs.ts        # get_dev_logs ツール
│   │   ├── stopDevServer.ts     # stop_dev_server ツール
│   │   └── restartDevServer.ts  # restart_dev_server ツール
│   └── utils/
│       ├── fileSystem.ts        # ファイルシステム操作
│       ├── processUtils.ts      # プロセス操作ユーティリティ
│       └── logger.ts            # 内部ログ出力
├── dist/                        # ビルド出力
└── README.md
```

## 実装ステップ

### Step 1: プロジェクト初期化と基盤構築
**所要時間**: 30分

#### 1.1 プロジェクト初期化
- [ ] package.jsonの作成
- [ ] TypeScript設定（tsconfig.json）
- [ ] 必要な依存関係のインストール
  - `@modelcontextprotocol/sdk`
  - `@types/node`
  - `typescript`

#### 1.2 基本型定義の作成
- [ ] `src/types.ts`の実装
  - ProjectInfo, DevProcess, LogEntry, PortInfo インターフェース

#### 1.3 ユーティリティ関数の実装
- [ ] `src/utils/fileSystem.ts`
  - ファイル存在確認、ディレクトリ走査
- [ ] `src/utils/processUtils.ts`
  - プロセス生存確認、シグナル送信
- [ ] `src/utils/logger.ts`
  - 内部ログ出力機能

### Step 2: コアコンポーネントの実装
**所要時間**: 2時間

#### 2.1 ProjectScanner実装
- [ ] `src/components/ProjectScanner.ts`
  - scanForProjects()メソッド
  - findPackageJsonFiles()メソッド
  - validateDevScript()メソッド
  - prioritizeProjects()メソッド

#### 2.2 EnvLoader実装
- [ ] `src/components/EnvLoader.ts`
  - loadEnvFile()メソッド
  - parseEnvFile()メソッド
  - mergeEnvVars()メソッド

#### 2.3 PortDetector実装
- [ ] `src/components/PortDetector.ts`
  - detectPorts()メソッド
  - parseNetstatOutput()メソッド（Linux用）
  - parseLsofOutput()メソッド（macOS用）
  - getPortsByPid()メソッド

### Step 3: プロセス管理とログ機能
**所要時間**: 1.5時間

#### 3.1 LogManager実装
- [ ] `src/components/LogManager.ts`
  - startLogging()メソッド
  - stopLogging()メソッド
  - getLogs()メソッド
  - リングバッファロジック
  - ログレベル解析

#### 3.2 ProcessManager実装
- [ ] `src/components/ProcessManager.ts`
  - startDevServer()メソッド
  - stopDevServer()メソッド
  - restartDevServer()メソッド
  - getStatus()メソッド
  - プロセス生存確認
  - PIDファイル管理

### Step 4: MCPツールの実装
**所要時間**: 2時間

#### 4.1 プロジェクト検索ツール
- [ ] `src/tools/scanProjectDirs.ts`
  - MCPツールスキーマ定義
  - ProjectScannerとの連携
  - 結果フォーマット

#### 4.2 サーバー制御ツール
- [ ] `src/tools/startDevServer.ts`
  - ディレクトリ自動選択ロジック
  - ProcessManagerとの連携
  - エラーハンドリング

- [ ] `src/tools/stopDevServer.ts`
  - 安全な停止処理
  - 状態確認

- [ ] `src/tools/restartDevServer.ts`
  - 停止→起動の連続処理
  - 状態管理

#### 4.3 監視・ログツール
- [ ] `src/tools/getDevStatus.ts`
  - 統合状態情報の取得
  - ポート情報の統合

- [ ] `src/tools/getDevLogs.ts`
  - ログ取得とフォーマット
  - 行数制限処理

### Step 5: MCPサーバー統合
**所要時間**: 1時間

#### 5.1 メインサーバー実装
- [ ] `src/index.ts`
  - MCPサーバー初期化
  - 全ツールの登録
  - エラーハンドリング
  - グレースフルシャットダウン

#### 5.2 ビルド設定
- [ ] tsconfig.jsonの最適化
- [ ] package.jsonのscripts設定
  - build, start, dev コマンド

### Step 6: テストと検証
**所要時間**: 1時間

#### 6.1 基本動作テスト
- [ ] プロジェクト検出テスト
- [ ] npm run dev起動テスト
- [ ] ログ取得テスト
- [ ] ポート検出テスト
- [ ] プロセス停止テスト

#### 6.2 エラーケーステスト
- [ ] package.jsonなしプロジェクト
- [ ] devスクリプトなしプロジェクト
- [ ] ポート使用中エラー
- [ ] プロセス異常終了

#### 6.3 モノレポテスト
- [ ] サブディレクトリ検出
- [ ] 複数プロジェクト選択
- [ ] .env読み込み

## 実装詳細

### 依存関係
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### TypeScript設定
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### エラーハンドリング戦略
1. **バリデーション**: 入力パラメータの検証
2. **プロセスエラー**: 子プロセスの異常終了対応
3. **ファイルシステム**: 権限エラー、ファイル不存在対応
4. **ネットワーク**: ポート使用中、権限不足対応
5. **リソース管理**: メモリリーク防止、適切なクリーンアップ

### パフォーマンス考慮事項
1. **非同期処理**: Promise/async-awaitの適切な使用
2. **メモリ管理**: ログバッファサイズ制限（1000行）
3. **キャッシュ**: プロセス状態の適切なキャッシュ
4. **効率化**: 不要なポーリング回避

### セキュリティ実装
1. **パス検証**: ディレクトリトラバーサル防止
2. **権限確認**: 実行可能ファイルの検証
3. **環境変数**: 安全な.env読み込み
4. **プロセス分離**: 適切なdetached実行

## 完了基準
- [ ] 全MCPツールが正常動作
- [ ] モノレポでの正常動作
- [ ] エラーケースの適切な処理
- [ ] メモリリークなし
- [ ] TypeScriptエラーなし
- [ ] ドキュメント完成