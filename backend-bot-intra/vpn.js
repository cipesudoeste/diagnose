'use strict';

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

const LOG_FILE    = path.join(__dirname, 'bot.log');
const STATE_FILE  = path.join(__dirname, 'estado.json');
const VPN_CONF    = '/etc/openfortivpn/config';

const MAX_RETRIES   = 5;
const RETRY_DELAY   = 30 * 1000; // 30s entre tentativas
const WATCHDOG_INT  = 20 * 1000; // verifica processo a cada 20s

let vpnProcess   = null;
let _retries     = 0;
let _watchdogTmr = null;
let _autoReconn  = true; // reconexão automática ativa por padrão

function log(msg) {
  const line = JSON.stringify({ time: new Date().toLocaleTimeString('pt-BR'), level: 'vpn', msg });
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log('[VPN]', msg);
}

/* ── Estado persistido ───────────────────────────────────────── */
function lerEstado() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function salvarEstadoVpn(connected, ip) {
  const s = lerEstado();
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    ...s,
    vpn_connected: connected,
    vpn_ip: ip || '—',
  }, null, 2));
}

/* ── Detecção de IP do túnel ─────────────────────────────────── */
function detectarIp(txt) {
  // openfortivpn imprime algo como "Tunnel is up and running on VPN interface ppp0."
  // ou "Set '/proc/sys/net/ipv4/conf/ppp0/..." — usamos ip route para pegar o IP real
  const m = txt.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  return m ? m[1] : null;
}

/* ── isUp ────────────────────────────────────────────────────── */
function isUp() {
  return vpnProcess !== null && !vpnProcess.killed;
}

/* ── connect ─────────────────────────────────────────────────── */
function connect() {
  return new Promise((resolve, reject) => {
    if (isUp()) { log('Já conectada — reutilizando.'); return resolve(); }

    log('Conectando...');
    vpnProcess = spawn('sudo', ['openfortivpn', '--config', VPN_CONF], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    let tunnelIp = null;

    const timeout = setTimeout(() => {
      if (!resolved) {
        log('Timeout ao conectar.');
        disconnect().finally(() => reject(new Error('VPN timeout')));
      }
    }, 40000);

    function check(data) {
      const txt = data.toString();
      if (txt.includes('Tunnel is up and running')) {
        resolved = true;
        clearTimeout(timeout);
        tunnelIp = detectarIp(txt);
        log(`Conectada.${tunnelIp ? ' IP: ' + tunnelIp : ''}`);
        salvarEstadoVpn(true, tunnelIp);
        _retries = 0;
        iniciarWatchdog();
        resolve();
      }
      if (/error/i.test(txt)) log(`Aviso: ${txt.trim().slice(0, 120)}`);
    }

    vpnProcess.stdout.on('data', check);
    vpnProcess.stderr.on('data', check);

    vpnProcess.on('exit', code => {
      log(`Processo encerrado (código ${code}).`);
      vpnProcess = null;
      salvarEstadoVpn(false, null);
      pararWatchdog();
      if (_autoReconn && _retries < MAX_RETRIES) {
        _retries++;
        log(`Reconexão automática em ${RETRY_DELAY / 1000}s (tentativa ${_retries}/${MAX_RETRIES})...`);
        setTimeout(() => {
          connect().catch(e => log(`Falha na reconexão automática: ${e.message}`));
        }, RETRY_DELAY);
      } else if (_retries >= MAX_RETRIES) {
        log('Máximo de tentativas de reconexão atingido — aguardando intervenção manual.');
        _retries = 0; // reseta para permitir nova tentativa manual
      }
    });

    vpnProcess.on('error', err => {
      log(`Erro ao iniciar processo: ${err.message}`);
      salvarEstadoVpn(false, null);
      reject(err);
    });
  });
}

/* ── disconnect ──────────────────────────────────────────────── */
function disconnect() {
  return new Promise(resolve => {
    _autoReconn = false; // suspende reconexão automática durante desconexão manual
    if (!isUp()) {
      log('Já desconectada.');
      salvarEstadoVpn(false, null);
      pararWatchdog();
      _autoReconn = true;
      return resolve();
    }
    log('Desconectando...');
    vpnProcess.kill('SIGTERM');
    setTimeout(() => {
      if (isUp()) vpnProcess.kill('SIGKILL');
      vpnProcess = null;
      salvarEstadoVpn(false, null);
      pararWatchdog();
      log('Desconectada.');
      _autoReconn = true;
      resolve();
    }, 4000);
  });
}

/* ── Watchdog ────────────────────────────────────────────────── */
function iniciarWatchdog() {
  pararWatchdog();
  _watchdogTmr = setInterval(() => {
    if (!isUp()) {
      log('[watchdog] Processo não está ativo — disparando reconexão automática.');
      salvarEstadoVpn(false, null);
      pararWatchdog();
      if (_autoReconn && _retries < MAX_RETRIES) {
        _retries++;
        log(`[watchdog] Reconectando (tentativa ${_retries}/${MAX_RETRIES})...`);
        connect().catch(e => log(`[watchdog] Falha: ${e.message}`));
      }
    }
  }, WATCHDOG_INT);
}

function pararWatchdog() {
  if (_watchdogTmr) { clearInterval(_watchdogTmr); _watchdogTmr = null; }
}

module.exports = { connect, disconnect, isUp };
