# npx CLI対応 - 要件仕様書

## 概要
既存のnpm-dev-mcp MCPサーバーにCLI機能を追加し、`npx npm-dev-mcp`で直接実行できるようにする。
各プロジェクトディレクトリで独立したインスタンスとして動作し、起動ディレクトリをプロジェクトルートとして認識する。
MCPサーバー機能は完全に保持し、CLIモードとのデュアル対応を実現する。

## 機能要件

### 1. デュアルモード対応
- **F1.1** 引数なしで実行時は従来通りMCPサーバーモードで動作すること
- **F1.2** コマンドライン引数が指定された場合はCLIモードで動作すること
- **F1.3** MCPサーバー機能は既存のまま完全に保持すること

### 2. プロジェクト個別インスタンス要件
- **F2.1** 各プロジェクトディレクトリで独立したインスタンスとして動作すること
- **F2.2** 起動時のカレントディレクトリをプロジェクトルートとして認識すること
- **F2.3** プロジェクト間でのデータ共有や干渉はないこと
- **F2.4** 各インスタンスは独自のプロセス空間とログを持つこと

### 3. CLI機能要件
- **F3.1** `npx npm-dev-mcp scan` - 現在のプロジェクト内の検索機能
- **F3.2** `npx npm-dev-mcp start [directory]` - 現在のプロジェクトでdev server開始
- **F3.3** `npx npm-dev-mcp status` - 現在のプロジェクトの状態確認
- **F3.4** `npx npm-dev-mcp logs [lines]` - 現在のプロジェクトのログ表示
- **F3.5** `npx npm-dev-mcp stop` - 現在のプロジェクトのサーバー停止
- **F3.6** `npx npm-dev-mcp restart` - 現在のプロジェクトのサーバー再起動

### 4. ヘルプ・情報表示機能
- **F4.1** `npx npm-dev-mcp --help` - 使用方法の表示
- **F4.2** `npx npm-dev-mcp --version` - バージョン情報の表示
- **F4.3** 不正なコマンドが入力された場合のエラーメッセージ表示

### 5. パッケージング要件
- **F5.1** npm packageとして公開可能な構成にすること
- **F5.2** `npx`で直接実行できるよう`package.json`の`bin`フィールドを設定すること
- **F5.3** 既存のビルドプロセス（TypeScript）との互換性を保つこと

### 6. CLI出力仕様
- **F6.1** 成功時は人間が読みやすい形式で結果を表示すること
- **F6.2** エラー時は適切なエラーメッセージと終了コードを返すこと
- **F6.3** JSON形式での出力オプション（`--json`）を提供すること
- **F6.4** 進捗表示やスピナーでユーザー体験を向上させること

## 非機能要件

### 1. 互換性
- **NF1.1** 既存のMCPサーバー機能に影響を与えないこと
- **NF1.2** 既存のClaude Code連携機能は完全に保持すること
- **NF1.3** Node.js 18以上での動作を保証すること

### 2. パフォーマンス
- **NF2.1** CLI起動時間は3秒以内であること
- **NF2.2** 大量のログ表示時もメモリ効率的であること

### 3. ユーザビリティ
- **NF3.1** 直感的なコマンド体系であること
- **NF3.2** エラーメッセージは問題解決に役立つ情報を含むこと
- **NF3.3** カラー出力でユーザー体験を向上させること

## 制約事項

### 1. 技術制約
- **C1.1** 既存のTypeScript + Node.js構成を維持すること  
- **C1.2** 既存の依存関係を可能な限り維持すること
- **C1.3** MCPサーバーとCLIで共通のコアロジックを使用すること

### 2. 設計制約
- **C2.1** 既存のコンポーネント構造を破壊しないこと
- **C2.2** 設定ファイルの変更は最小限に留めること

## CLI コマンド詳細仕様

### scan コマンド
```bash
npx npm-dev-mcp scan [--json] [--depth=N]
```
- 現在のプロジェクト内のpackage.jsonとdevスクリプトを検索
- 起動ディレクトリを基準にサブディレクトリを検索
- `--json`: JSON形式で出力
- `--depth=N`: 検索深度を指定（デフォルト: 3）

### start コマンド
```bash
npx npm-dev-mcp start [directory] [--port=PORT] [--env=FILE]
```
- 現在のプロジェクトでnpm run devを開始
- `directory`: 実行ディレクトリ（省略時は起動ディレクトリから自動検出）
- `--port=PORT`: 使用ポートを指定
- `--env=FILE`: 環境ファイルを指定

### status コマンド
```bash
npx npm-dev-mcp status [--json] [--watch]
```
- 現在のプロジェクトのdev serverの状態を確認
- `--json`: JSON形式で出力
- `--watch`: 状態を継続監視

### logs コマンド
```bash
npx npm-dev-mcp logs [lines] [--follow] [--level=LEVEL]
```
- 現在のプロジェクトのdev serverのログを表示
- `lines`: 取得行数（デフォルト: 50）
- `--follow`: リアルタイム監視
- `--level=LEVEL`: ログレベルフィルター

### stop/restart コマンド
```bash
npx npm-dev-mcp stop [--force]
npx npm-dev-mcp restart [--wait=SECONDS]
```
- 現在のプロジェクトのdev serverを停止/再起動
- `--force`: 強制終了
- `--wait=SECONDS`: 再起動時の待機時間

## プロジェクト個別インスタンスの動作例

### シナリオ1: Claude Codeでの使用
```bash
# プロジェクトAのディレクトリでClaude Code起動
cd /path/to/project-a
# Claude CodeがMCPサーバーとして npm-dev-mcp を起動
# → project-aをプロジェクトルートとして認識

# プロジェクトBのディレクトリで別のClaude Code起動
cd /path/to/project-b  
# → project-bをプロジェクトルートとする独立したインスタンス
```

### シナリオ2: CLI直接使用
```bash
# プロジェクトAで操作
cd /path/to/project-a
npx npm-dev-mcp start    # project-Aのdev server開始
npx npm-dev-mcp status   # project-Aの状態確認

# プロジェクトBで操作（独立したインスタンス）
cd /path/to/project-b
npx npm-dev-mcp start    # project-Bのdev server開始
npx npm-dev-mcp logs     # project-Bのログ表示
```

### シナリオ3: プロジェクト分離確認
```bash
# プロジェクトAでの操作がプロジェクトBに影響しない
cd /path/to/project-a
npx npm-dev-mcp start
npx npm-dev-mcp stop     # project-Aのみ停止

cd /path/to/project-b    
npx npm-dev-mcp status   # project-Bは独立して動作中
```

## 成功基準
- [ ] 既存のMCPサーバー機能が完全に動作すること
- [ ] 全てのCLIコマンドが正常に動作すること
- [ ] `npx npm-dev-mcp`でパッケージが実行できること
- [ ] ヘルプとエラーメッセージが適切に表示されること
- [ ] 既存のテストが全て通過すること