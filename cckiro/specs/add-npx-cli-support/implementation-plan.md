# npx CLI対応 - 実装計画書

## 実装ステップ

### Step 1: プロジェクトコンテキスト管理の実装
**所要時間**: 45分

#### 1.1 ProjectContextManager作成
- [ ] `src/context/ProjectContextManager.ts`を作成
- [ ] プロジェクトルートディレクトリの設定機能
- [ ] package.json自動検出機能
- [ ] .env自動検出機能
- [ ] プロジェクト名の生成機能

#### 1.2 既存コンポーネントのコンテキスト対応
- [ ] `ProjectScanner`のコンテキスト対応
- [ ] `ProcessManager`のコンテキスト対応
- [ ] `EnvLoader`のコンテキスト対応

### Step 2: CLI基盤の実装
**所要時間**: 1時間

#### 2.1 CLI基盤クラス作成
- [ ] `src/cli/CLIHandler.ts`を作成
- [ ] コマンドライン引数解析機能
- [ ] ヘルプ表示機能
- [ ] エラーハンドリング機能

#### 2.2 出力フォーマッター作成
- [ ] `src/cli/OutputFormatter.ts`を作成
- [ ] 人間向け出力フォーマット
- [ ] JSON出力フォーマット
- [ ] カラー出力対応（chalk導入）

#### 2.3 コマンドインターフェース定義
- [ ] `src/cli/types.ts`を作成
- [ ] CLICommand インターフェース
- [ ] CLIOptions 型定義

### Step 3: CLIコマンド実装
**所要時間**: 2時間

#### 3.1 基本コマンド実装
- [ ] `src/cli/commands/ScanCommand.ts`
- [ ] `src/cli/commands/StatusCommand.ts`
- [ ] `src/cli/commands/HelpCommand.ts`
- [ ] `src/cli/commands/VersionCommand.ts`

#### 3.2 プロセス管理コマンド実装
- [ ] `src/cli/commands/StartCommand.ts`
- [ ] `src/cli/commands/StopCommand.ts`
- [ ] `src/cli/commands/RestartCommand.ts`
- [ ] `src/cli/commands/LogsCommand.ts`

#### 3.3 コマンド登録システム
- [ ] `src/cli/CommandRegistry.ts`を作成
- [ ] 全コマンドの登録
- [ ] コマンド実行ルーティング

### Step 4: エントリーポイント改修
**所要時間**: 30分

#### 4.1 index.ts改修
- [ ] 実行モード判定ロジック追加
- [ ] CLIモード実行パス追加
- [ ] MCPサーバーモード保持

#### 4.2 エラーハンドリング統合
- [ ] CLI用エラーハンドラー追加
- [ ] 適切な終了コード設定
- [ ] ユーザーフレンドリーなエラーメッセージ

### Step 5: パッケージング対応
**所要時間**: 30分

#### 5.1 package.json更新
- [ ] bin フィールド追加
- [ ] CLI用依存関係追加（chalk, commander等）
- [ ] scripts更新

#### 5.2 ビルド設定調整
- [ ] shebang保持設定
- [ ] 実行権限設定
- [ ] .npmignore作成

### Step 6: テストと統合
**所要時間**: 1時間

#### 6.1 機能テスト
- [ ] 各CLIコマンドの動作確認
- [ ] MCPサーバーモードの動作確認
- [ ] npx実行テスト

#### 6.2 統合テスト
- [ ] Claude Code連携テスト
- [ ] プロジェクト分離テスト
- [ ] エラーケーステスト

## 実装詳細

### 依存関係追加
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "chalk": "^5.3.0",
    "commander": "^11.1.0",
    "ora": "^7.0.1"
  }
}
```

### ディレクトリ構造
```
src/
├── index.ts                    # エントリーポイント（改修）
├── context/
│   └── ProjectContextManager.ts # プロジェクトコンテキスト管理
├── cli/
│   ├── CLIHandler.ts           # CLI基盤
│   ├── OutputFormatter.ts      # 出力フォーマット
│   ├── CommandRegistry.ts      # コマンド登録
│   ├── types.ts               # CLI型定義
│   └── commands/              # CLIコマンド実装
│       ├── ScanCommand.ts
│       ├── StartCommand.ts
│       ├── StatusCommand.ts
│       ├── LogsCommand.ts
│       ├── StopCommand.ts
│       ├── RestartCommand.ts
│       ├── HelpCommand.ts
│       └── VersionCommand.ts
├── components/                # 既存コンポーネント（拡張）
├── tools/                     # 既存MCPツール（保持）
└── utils/                     # 既存ユーティリティ（保持）
```

### 実装方針

#### デュアルモード実装
```typescript
// src/index.ts
async function main() {
  if (process.argv.length <= 2) {
    // MCPサーバーモード
    await startMCPServer();
  } else {
    // CLIモード
    await runCLI(process.argv.slice(2));
  }
}
```

#### コンテキスト初期化
```typescript
// すべてのモードで共通のコンテキスト初期化
const contextManager = ProjectContextManager.getInstance();
await contextManager.initialize(process.cwd());
```

#### コマンド実装パターン
```typescript
// src/cli/commands/StartCommand.ts
export class StartCommand implements CLICommand {
  name = 'start';
  description = 'Start npm run dev server';
  
  async execute(options: any): Promise<void> {
    // 1. 既存MCPツール機能を呼び出し
    const result = await startDevServer(options);
    
    // 2. CLI向けフォーマットで出力
    const formatter = new OutputFormatter();
    console.log(formatter.formatStartResult(result, options.json));
  }
}
```

## リスク管理

### 技術リスク
1. **既存MCP機能への影響**
   - 軽減策: 既存コードの最小限改修
   - テスト: MCPサーバー機能の回帰テスト

2. **パフォーマンス劣化**
   - 軽減策: 遅延読み込み使用
   - 測定: CLI起動時間監視

3. **依存関係競合**
   - 軽減策: 軽量ライブラリ選択
   - 検証: package.json依存関係確認

### 運用リスク
1. **npmパッケージ公開**
   - 準備: .npmignore設定
   - 検証: パッケージサイズ確認

2. **バージョン管理**
   - 戦略: セマンティックバージョニング
   - 文書: CHANGELOG.md作成

## 完了基準
- [ ] 全CLIコマンドが正常動作
- [ ] MCPサーバー機能が完全保持
- [ ] `npx npm-dev-mcp`で実行可能
- [ ] プロジェクト個別インスタンス機能
- [ ] JSON/人間向け出力両対応
- [ ] エラーハンドリング完備
- [ ] README更新（CLI使用方法）
- [ ] npmパッケージ公開準備完了

## 実装順序の理由

1. **コンテキスト管理先行**: 全機能の基盤となるため
2. **CLI基盤整備**: コマンド実装前の基盤確立
3. **段階的コマンド実装**: 確実な動作確認のため
4. **最後にパッケージング**: 機能完成後の外部連携

この順序により、各段階で動作確認しながら安全に実装を進められます。