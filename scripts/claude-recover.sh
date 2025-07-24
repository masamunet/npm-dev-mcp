#!/bin/bash

# Claude Code用 MCP復旧スクリプト
# 使用方法: ./scripts/claude-recover.sh

set -e

echo "🔄 MCPサーバー復旧を開始します..."

# 1. 既存のMCPプロセスを確認・停止
echo "📊 既存プロセスを確認中..."
if pgrep -f "npm-dev-mcp" > /dev/null; then
    echo "⚠️  既存のMCPプロセスを停止中..."
    pkill -f "npm-dev-mcp" || true
    sleep 2
fi

# 2. PM2での管理確認
if command -v pm2 &> /dev/null; then
    echo "🔍 PM2プロセスを確認中..."
    if pm2 list | grep -q "npm-dev-mcp"; then
        echo "🔄 PM2でMCPサーバーを再起動中..."
        pm2 restart npm-dev-mcp || pm2 start ecosystem.config.js
        sleep 3
        
        # PM2ステータス確認
        if pm2 list | grep -q "online.*npm-dev-mcp"; then
            echo "✅ PM2による復旧が完了しました"
            exit 0
        else
            echo "❌ PM2復旧に失敗しました。手動起動を試行します。"
        fi
    fi
fi

# 3. 手動でMCPサーバーを起動
echo "🚀 MCPサーバーを手動起動中..."
cd "$(dirname "$0")/.."

# ビルドが必要かチェック
if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
    echo "🔨 TypeScriptビルドを実行中..."
    npm run build
fi

# バックグラウンドでMCPサーバー起動
echo "🌟 MCPサーバーをバックグラウンドで起動中..."
nohup node dist/index.js --mcp > logs/mcp-server.log 2>&1 &
MCP_PID=$!

# 起動確認
sleep 3
if kill -0 $MCP_PID 2>/dev/null; then
    echo "✅ MCPサーバーが正常に起動しました (PID: $MCP_PID)"
    echo "📋 Claude Codeを再起動してMCP接続を再確立してください"
    
    # PIDをファイルに保存
    echo $MCP_PID > ~/.npm-dev-mcp/mcp-server.pid
    
    # ログファイルの場所を表示
    echo "📝 ログファイル: $(pwd)/logs/mcp-server.log"
    
else
    echo "❌ MCPサーバーの起動に失敗しました"
    echo "📝 ログを確認してください: $(pwd)/logs/mcp-server.log"
    exit 1
fi

echo "🎉 復旧処理が完了しました"