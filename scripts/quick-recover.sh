#!/bin/bash
# 即座に制御を返すMCP復旧スクリプト
{
    pkill -f npm-dev-mcp 2>/dev/null
    sleep 1
    cd ~/work_local/2025/npm-dev-mcp
    nohup node dist/index.js --mcp </dev/null >/dev/null 2>&1 &
    disown
} &
echo "🔄 MCP復旧を開始しました（バックグラウンド実行中）"
echo "📋 5秒後にClaude Codeセッションを再起動してください"