# Claude Code での MCP復旧設定

## 1. bashエイリアス設定

以下を `~/.bashrc` または `~/.zshrc` に追加：

```bash
# MCP復旧用エイリアス
alias mcp-recover='~/work_local/2025/npm-dev-mcp/scripts/claude-recover.sh'
alias mcp-status='pm2 list | grep npm-dev-mcp || echo "MCPサーバーが見つかりません"'
alias mcp-logs='tail -f ~/work_local/2025/npm-dev-mcp/logs/mcp-server.log'
```

## 2. Claude Code セッション内での使用方法

MCPサーバーが落ちた場合：

1. **Bashツールで復旧実行**:
   ```bash
   mcp-recover
   ```

2. **ステータス確認**:
   ```bash
   mcp-status
   ```

3. **ログ確認**:
   ```bash
   mcp-logs
   ```

4. **Claude Codeセッション再起動**:
   - `Ctrl+C` でセッション終了
   - 新しいClaude Codeセッションを開始

## 3. 自動復旧の仕組み

復旧スクリプトは以下の順序で実行：

1. **既存プロセス停止**: 古いMCPプロセスを安全に終了
2. **PM2復旧試行**: PM2で管理されている場合は再起動
3. **手動起動**: PM2が利用できない場合は直接起動
4. **ヘルス確認**: プロセスの正常起動を確認

## 4. トラブルシューティング

### MCPサーバーが起動しない場合:
```bash
# ビルド確認
cd ~/work_local/2025/npm-dev-mcp
npm run build

# ポート競合確認
lsof -i :8080  # またはMCPが使用するポート

# 手動起動テスト
node dist/index.js --mcp
```

### Claude Code接続エラーの場合:
1. Claude Codeを完全に終了
2. `mcp-recover` 実行
3. 新しいClaude Codeセッション開始
4. MCP設定の再確認

## 5. 予防措置

### PM2での安定管理:
```bash
# PM2でMCPサーバーを起動
pm2 start ecosystem.config.js

# 自動起動設定
pm2 startup
pm2 save
```

### 定期ヘルスチェック:
```bash
# cronで5分おきにヘルスチェック
*/5 * * * * /usr/bin/curl -f http://localhost:8080/health >/dev/null 2>&1 || /path/to/mcp-recover
```