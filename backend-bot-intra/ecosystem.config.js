module.exports = {
  apps: [
    {
      name: 'intrabot-server',
      script: 'server.js',
      cwd: '/opt/diagnose/backend-bot-intra',
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'intrabot-whatsapp',
      script: 'whatsapp.js',
      cwd: '/opt/diagnose/backend-bot-intra',
      restart_delay: 5000,
      max_restarts: 10,
    },
    {
      name: 'intrabot-ciclo',
      script: 'ciclo.js',
      cwd: '/opt/diagnose/backend-bot-intra',
      restart_delay: 10000,
      max_restarts: 10,
    },
  ],
};
