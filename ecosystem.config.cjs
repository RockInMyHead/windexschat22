module.exports = {
  apps: [
    {
      name: 'windexs-ai-backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      cwd: '/home/user1/windexs-ai',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      
      // Логи
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Автоматический перезапуск
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Автозапуск после краша
      autorestart: true,
      
      // Watch (отключено для production)
      watch: false,
      
      // Игнорируемые файлы при watch (на всякий случай)
      ignore_watch: [
        'node_modules',
        'logs',
        'dist',
        '*.db',
        '*.db-wal',
        '*.db-shm'
      ]
    }
  ]
};
