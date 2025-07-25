#!/bin/bash

# MCPサーバー監視用スクリプト
# サーバーの起動、停止、ログ監視を行う

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/logs/mcp-server.pid"
LOG_DIR="$PROJECT_DIR/logs"

# ログディレクトリを作成
mkdir -p "$LOG_DIR"

show_usage() {
    echo "使用方法: $0 {start|stop|restart|status|logs|health}"
    echo ""
    echo "コマンド:"
    echo "  start   - MCPサーバーを起動"
    echo "  stop    - MCPサーバーを停止"
    echo "  restart - MCPサーバーを再起動"
    echo "  status  - サーバーの状態を確認"
    echo "  logs    - ログをリアルタイム表示"
    echo "  health  - ヘルスチェック"
    exit 1
}

start_server() {
    cd "$PROJECT_DIR"
    
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "⚠️  MCPサーバーは既に実行中です (PID: $(cat "$PID_FILE"))"
        return 1
    fi
    
    echo "🚀 MCPサーバーを起動中..."
    
    # ビルド
    npm run build
    
    # 環境変数設定
    export LOG_LEVEL=debug
    export NODE_ENV=development
    export HEALTH_ENDPOINT=true
    export HEALTH_PORT=8080
    export HEALTH_HOST=127.0.0.1
    
    # ログファイル名
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    LOG_FILE="$LOG_DIR/mcp-server-${TIMESTAMP}.log"
    
    # バックグラウンドで起動
    nohup node dist/index.js --mcp > "$LOG_FILE" 2>&1 &
    SERVER_PID=$!
    
    # PIDファイルに保存
    echo "$SERVER_PID" > "$PID_FILE"
    
    echo "✅ MCPサーバーが起動しました"
    echo "   PID: $SERVER_PID"
    echo "   ログファイル: $LOG_FILE"
    echo "   ヘルスチェック: http://127.0.0.1:8080/health"
    
    # 起動確認
    sleep 2
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "🌟 サーバーは正常に動作しています"
    else
        echo "❌ サーバーの起動に失敗しました"
        rm -f "$PID_FILE"
        return 1
    fi
}

stop_server() {
    if [ ! -f "$PID_FILE" ]; then
        echo "⚠️  PIDファイルが見つかりません。サーバーは停止済みです。"
        return 0
    fi
    
    PID=$(cat "$PID_FILE")
    
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "⚠️  PID $PID のプロセスは存在しません。PIDファイルを削除します。"
        rm -f "$PID_FILE"
        return 0
    fi
    
    echo "🛑 MCPサーバーを停止中... (PID: $PID)"
    
    # SIGTERM送信
    kill -TERM "$PID" 2>/dev/null || true
    
    # 最大10秒待機
    for i in {1..10}; do
        if ! kill -0 "$PID" 2>/dev/null; then
            echo "✅ サーバーが正常に停止しました"
            rm -f "$PID_FILE"
            return 0
        fi
        sleep 1
    done
    
    # 強制終了
    echo "⚠️  正常停止に失敗したため、強制終了します"
    kill -KILL "$PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "✅ サーバーを強制終了しました"
}

show_status() {
    if [ ! -f "$PID_FILE" ]; then
        echo "❌ MCPサーバーは停止中です"
        return 1
    fi
    
    PID=$(cat "$PID_FILE")
    
    if kill -0 "$PID" 2>/dev/null; then
        echo "✅ MCPサーバーは動作中です"
        echo "   PID: $PID"
        echo "   メモリ使用量: $(ps -o rss= -p "$PID" | awk '{print int($1/1024)"MB"}' 2>/dev/null || echo "不明")"
        echo "   CPU使用率: $(ps -o %cpu= -p "$PID" 2>/dev/null || echo "不明")%"
        
        # ヘルスチェック
        if command -v curl >/dev/null 2>&1; then
            if curl -s -f "http://127.0.0.1:8080/health" >/dev/null 2>&1; then
                echo "   ヘルスチェック: ✅ 正常"
            else
                echo "   ヘルスチェック: ❌ 応答なし"
            fi
        fi
    else
        echo "❌ MCPサーバーは停止中です (無効なPID: $PID)"
        rm -f "$PID_FILE"
        return 1
    fi
}

show_logs() {
    LATEST_LOG=$(ls -t "$LOG_DIR"/mcp-server-*.log 2>/dev/null | head -1)
    
    if [ -z "$LATEST_LOG" ]; then
        echo "❌ ログファイルが見つかりません"
        return 1
    fi
    
    echo "📝 最新のログファイル: $LATEST_LOG"
    echo "🔄 リアルタイムでログを表示中... (Ctrl+C で停止)"
    echo ""
    
    tail -f "$LATEST_LOG"
}

health_check() {
    if command -v curl >/dev/null 2>&1; then
        echo "🏥 ヘルスチェックを実行中..."
        
        if response=$(curl -s -w "HTTP/%{http_code}" "http://127.0.0.1:8080/health" 2>/dev/null); then
            echo "✅ サーバーは正常に応答しています"
            echo "$response"
        else
            echo "❌ ヘルスチェックに失敗しました"
            echo "   サーバーが起動していない可能性があります"
            return 1
        fi
    else
        echo "⚠️  curl コマンドが見つかりません。手動で確認してください:"
        echo "   http://127.0.0.1:8080/health"
    fi
}

# メイン処理
case "${1:-}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        sleep 1
        start_server
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    health)
        health_check
        ;;
    *)
        show_usage
        ;;
esac