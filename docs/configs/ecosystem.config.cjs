module.exports = {
  apps: [
    {
      name: 'y3dhub-nextjs-8081', // Application name in PM2 with port in name
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 8081', // Specify port 8081
      instances: 1, // Run a single instance
      autorestart: true, // Automatically restart if it crashes
      watch: false, // Set to true to restart on file changes (use with caution in production)
      max_memory_restart: '1G', // Restart if it exceeds 1GB memory
      env: {
        NODE_ENV: 'production', // Set environment to production
        PORT: '8081', // Ensure the PORT env var is also set if your app uses it
        // Load all sensitive credentials from environment variables
        // DO NOT hardcode credentials in this file
      },
      env_file: '.env', // Load environment variables from .env file
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/pm2-error-8081.log',
      out_file: 'logs/pm2-out-8081.log',
      merge_logs: true,
    },
  ],
};
