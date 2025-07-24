module.exports = {
  apps: [
    {
      name: 'npm-dev-mcp',
      script: './dist/index.js',
      args: '--mcp',
      interpreter: 'node',
      
      // プロセス管理設定
      instances: 1,
      exec_mode: 'fork',
      
      // 自動再起動設定
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '500M',
      
      // ログ設定
      log_file: './logs/npm-dev-mcp.log',
      out_file: './logs/npm-dev-mcp-out.log',
      error_file: './logs/npm-dev-mcp-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // 環境変数
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      },
      
      // 開発環境
      env_development: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug'
      },
      
      // ヘルスチェック設定
      health_check_grace_period: 3000,
      health_check_fatal_exceptions: true,
      
      // ウォッチ設定（開発時のみ）
      watch: false,
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log'
      ],
      
      // 終了時の設定
      kill_timeout: 5000,
      shutdown_with_message: true,
      
      // 詳細設定
      node_args: '--max-old-space-size=512',
      
      // クラスター設定（必要に応じて）
      instance_var: 'INSTANCE_ID',
      
      // ソース設定
      source_map_support: true,
      
      // タイムアウト設定
      listen_timeout: 8000,
      
      // エラーハンドリング
      exp_backoff_restart_delay: 100,
      
      // その他の設定
      vizion: false,
      automation: false
    }
  ],

  // デプロイメント設定
  deploy: {
    production: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/master',
      repo: 'git@github.com:repo.git',
      path: '/var/www/production',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};