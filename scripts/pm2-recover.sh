#!/bin/bash
# PM2による確実なMCP復旧
if command -v pm2 &> /dev/null; then
    pm2 restart npm-dev-mcp 2>/dev/null || pm2 start ~/work_local/2025/npm-dev-mcp/ecosystem.config.js 2>/dev/null
    echo "✅ PM2でMCP復旧完了"
else
    echo "❌ PM2が見つかりません。まず 'npm install -g pm2' を実行してください"
fi