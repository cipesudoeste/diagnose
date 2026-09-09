'use strict';

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const LOG_FILE  = path.join(__dirname, 'bot.log');
const VPN_CONF  = '/etc/openfortivpn/config';

let vpnProcess  = null;

function log(msg) {
  const line = JSON.stringify({ time: new Date().toLocaleTimeString('pt-BR'), level: 'vpn', msg });
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log('[VPN]', msg);
}

function isUp() {
  return vpnProcess !== null && !vpnProcess.killed;
}

function connect() {
  return new Promise((resolve, reject) => {
    if (isUp()) { log('Já conectada — reutilizando.'); return resolve(); }

    log('Conectando...');
    vpnProcess = spawn('sudo', ['openfortivpn', '--config', VPN_CONF], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { log('Timeout ao conectar.'); disconnect().finally(() => reject(new Error('VPN timeout'))); }
    }, 40000);

    function check(data) {
      const txt = data.toString();
      if (txt.includes('Tunnel is up and running')) {
        resolved = true;
        clearTimeout(timeout);
        log('Conectada.');
        resolve();
      }
      if (/error/i.test(txt)) log(`Aviso: ${txt.trim().slice(0, 120)}`);
    }

    vpnProcess.stdout.on('data', check);
    vpnProcess.stderr.on('data', check);
    vpnProcess.on('exit', code => { log(`Processo encerrado (código ${code}).`); vpnProcess = null; });
    vpnProcess.on('error', err  => { log(`Erro ao iniciar processo: ${err.message}`); reject(err); });
  });
}

function disconnect() {
  return new Promise(resolve => {
    if (!isUp()) { log('Já desconectada.'); return resolve(); }
    log('Desconectando...');
    vpnProcess.kill('SIGTERM');
    setTimeout(() => {
      if (isUp()) vpnProcess.kill('SIGKILL');
      vpnProcess = null;
      log('Desconectada.');
      resolve();
    }, 4000);
  });
}

module.exports = { connect, disconnect, isUp };
