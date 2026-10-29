module.exports = {
  apps: [
    {
      name: 'a-share-analyst',
      script: 'dist/server/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8787',
        ADMIN_HOST: '0.0.0.0',
        ADMIN_PORT: '8788'
      }
    }
  ]
};
