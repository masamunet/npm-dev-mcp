#!/bin/bash

# デバッグ用MCPサーバー起動スクリプト
# ログレベルをdebugに設定し、詳細ログを出力

set -e

echo "🚀 MCP サーバーをデバッグモードで起動します..."
echo "📁 プロジェクトディレクトリ: $(pwd)"
echo "⏰ 開始時刻: $(date)"
echo ""

# ビルド
echo "🔨 TypeScriptをビルド中..."
npm run build

# ログディレクトリを作成
mkdir -p logs

# 環境変数設定
export LOG_LEVEL=debug
export NODE_ENV=development
export HEALTH_ENDPOINT=true
export HEALTH_PORT=8080
export HEALTH_HOST=127.0.0.1
export HEALTH_PATH=/health

echo "🔧 環境変数:"
echo "  LOG_LEVEL: $LOG_LEVEL"
echo "  NODE_ENV: $NODE_ENV"
echo "  HEALTH_ENDPOINT: $HEALTH_ENDPOINT"
echo "  HEALTH_HOST:PORT: $HEALTH_HOST:$HEALTH_PORT"
echo ""

# ログファイル名にタイムスタンプを追加
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="logs/debug-mcp-${TIMESTAMP}.log"

echo "📝 ログファイル: $LOG_FILE"
echo "💡 ログをリアルタイムで監視するには別ターミナルで:"
echo "   tail -f $LOG_FILE"
echo ""

# MCPサーバーを起動してログをファイルとコンソールに出力
echo "🌟 MCPサーバーを起動中..."
echo "🛑 停止するには Ctrl+C を押してください"
echo ""

node dist/index.js --mcp 2>&1 | tee "$LOG_FILE"