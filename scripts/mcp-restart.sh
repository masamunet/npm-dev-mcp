#!/bin/bash
# ワンライナーMCP復旧
(pkill -f npm-dev-mcp; sleep 1; cd ~/work_local/2025/npm-dev-mcp && nohup node dist/index.js --mcp </dev/null >/dev/null 2>&1 & disown) & echo "MCP復旧中...Claude Codeを再起動してください"