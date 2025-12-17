# Repository Guidelines

## プロジェクト構成と配置
- エントリーポイントは `src/index.ts`、ビルド成果物は `dist/` に生成されます（`npm run build`）。  
- コア機能は `src/components/`（プロセス・ポート・ログ管理）、`src/tools/`（MCPツール定義）、`src/cli/`（コマンド登録と出力整形）に分割。  
- 実行時設定・健康チェックは `src/config/` と `src/components/HealthEndpoint.ts`、状態復旧は `src/components/StateManager.ts`。  
- テストは `tests/` 配下と `src/**/__tests__/` を対象に Jest が走ります。  
- ログと PM2 用設定は `logs/` と `ecosystem.config.js` を参照してください。  

## ビルド・テスト・開発コマンド
- `npm run dev` : TypeScript をウォッチコンパイル（開発用）。  
- `npm run build` : `tsc` で `dist/` を生成（公開前フロー）。  
- `npm start` : ビルド済み `dist/index.js` を実行。  
- `npm test` / `npm run test:watch` / `npm run test:coverage` : Jest 実行。Coverage は `coverage/` に出力。  
- 運用プロセス管理: `npm run pm2:start|stop|restart|delete|logs|monit|status`（`ecosystem.config.js` を基に pm2 で常駐）。  

## コーディングスタイル・命名
- 言語: TypeScript (ES2022, `module`=`NodeNext`, ESM import は拡張子 `.js` を付与)。  
- インデント2スペース、セミコロン必須、シングルクォート推奨。  
- 型安全を優先（`strict: true`）。パブリック API は明示的な型・インターフェースを付与。  
- ロガーは `utils/logger.ts` のシングルトンを利用し、標準出力汚染を避ける。  
- ファイル/クラス名は役割ベース（例: `*Manager`, `*Handler`, `*Schema`）。  

## テスト指針
- フレームワーク: Jest + ts-jest (ESM)。対象パターン: `**/__tests__/**/*.test.ts` および `**/*.(spec|test).ts`。  
- 可能ならユースケース単位でモジュールを分離し、プロセス管理系はモックで外部副作用を隔離。  
- 新機能は少なくとも正常系と主要なエラー系を追加し、`npm run test:coverage` で回帰確認。  

## コミットと Pull Request
- 既存ログは短い命令形/バージョンタグ例 (`Fix ...`, `1.1.4`)。同様のトーンで簡潔に。  
- PR には目的、変更点、テスト結果（実行コマンド名と要約）、関連 Issue/チケットを記載。  
- 機能やCLI挙動が変わる場合は README/ヘルプ出力の更新を忘れずに。スクリーンショットよりは実行ログや例を添付するとレビューしやすい。  

## セキュリティ・運用メモ
- Node.js 18+ を前提。`.env` は自動検出されるため、秘密情報はコミットしないこと（`.gitignore` を尊重）。  
- デーモン化時は pm2 のログローテーション設定を確認し、`logs/` の肥大化を定期確認。  
- MCP 経由でツールを公開する場合、外部入力は `SafeErrorHandler` を通し、例外は JSON で整形して返却する。  
