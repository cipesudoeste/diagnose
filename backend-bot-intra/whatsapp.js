'use strict';

const fs   = require('fs');
const path = require('path');
const express = require('express');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const P      = require('pino');
const QRCode = require('qrcode');

const app  = express();
const PORT = 3002;
const BASE = __dirname;
const STATE_FILE = path.join(BASE, 'estado.json');
const CFG_FILE   = path.join(BASE, 'config.json');
const AUTH_DIR   = path.join(BASE, 'auth_info_baileys');

app.use(express.json());

let sock            = null;
let waConnected     = false;
let waPhone         = null;
let waName          = null;
let shouldReconnect = true;
let reconnectTimer  = null;

function loadConfig() {
  return fs.existsSync(CFG_FILE) ? JSON.parse(fs.readFileSync(CFG_FILE)) : {};
}
function loadState() {
  return fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE)) : {};
}
function saveState(upd) {
  const s = loadState();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...s, ...upd }, null, 2));
}
function log(level, msg) {
  const line = JSON.stringify({ time: new Date().toLocaleTimeString('pt-BR'), level, msg });
  fs.appendFileSync(path.join(BASE, 'bot.log'), line + '\n');
  console.log(`[${level.toUpperCase()}] ${msg}`);
}
function toJid(num) {
  if (num.includes('@')) return num;
  return `${num.replace(/\D/g,'')}@s.whatsapp.net`;
}

async function destroySocket() {
  if (sock) {
    try { await sock.logout(); } catch {}
    try { sock.end(undefined); } catch {}
    sock = null;
  }
  waConnected = false;
  waPhone     = null;
  waName      = null;
}

function clearAuth() {
  if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
}

async function startBaileys() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false,
    browser: ['IntraBot CIPE', 'Chrome', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        const png = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
        saveState({ wa_qr: png, wa_qr_ts: Date.now(), wa_connected: false, wa_phone: null, wa_name: null });
        log('warn', 'QR gerado — aguardando escaneamento no painel');
      } catch (e) {
        log('err', `Falha ao gerar QR: ${e.message}`);
      }
    }

    if (connection === 'open') {
      waConnected = true;
      try {
        const jid = sock.user?.id || '';
        waPhone   = jid.split(':')[0].split('@')[0];
        waName    = sock.user?.name || sock.user?.notify || '';
      } catch {}
      saveState({ wa_connected: true, wa_qr: null, wa_qr_ts: null, wa_phone: waPhone, wa_name: waName });
      log('ok', `Conectado — ${waPhone} (${waName})`);
    }

    if (connection === 'close') {
      waConnected = false;
      waPhone     = null;
      waName      = null;
      saveState({ wa_connected: false, wa_phone: null, wa_name: null });

      const code      = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      log('warn', `Conexão encerrada (código ${code ?? '?'})`);

      if (loggedOut) {
        log('warn', 'Logout pelo WhatsApp — limpando auth');
        clearAuth();
        saveState({ wa_qr: null });
      }

      if (shouldReconnect) {
        log('ok', 'Reconectando em 6s...');
        reconnectTimer = setTimeout(startBaileys, 6000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const cfg      = loadConfig();
    const adminNum = (cfg.admin || '').replace(/\D/g, '');

    for (const m of messages) {
      if (m.key.fromMe) continue;
      const from    = m.key.remoteJid || '';
      const fromNum = from.replace(/\D/g, '');
      const text    = (
        m.message?.conversation ||
        m.message?.extendedTextMessage?.text || ''
      ).trim().toLowerCase();

      if (!text || !adminNum) continue;
      if (!fromNum.includes(adminNum) && !adminNum.includes(fromNum)) continue;

      if (['todos','ignorar'].includes(text) || /^[\d\s]+$/.test(text)) {
        log('ok', `Resposta admin: "${text}"`);
        saveState({ approval_response: text });
        try { await sock.sendMessage(from, { text: `✅ Recebido: "${text}"` }); } catch {}
      }
    }
  });
}

/* ════════════════════════════════════════
   ENDPOINTS
════════════════════════════════════════ */
app.post('/connect', async (req, res) => {
  shouldReconnect = true;
  if (waConnected) return res.json({ ok: true, already: true });
  await startBaileys().catch(e => log('err', e.message));
  res.json({ ok: true });
});

app.post('/disconnect', async (req, res) => {
  shouldReconnect = false;
  await destroySocket();
  saveState({ wa_connected: false, wa_qr: null, wa_phone: null, wa_name: null });
  log('ok', 'Desconectado pelo painel');
  res.json({ ok: true });
});

app.post('/reset', async (req, res) => {
  shouldReconnect = false;
  await destroySocket();
  clearAuth();
  saveState({ wa_connected: false, wa_qr: null, wa_phone: null, wa_name: null });
  log('ok', 'Sessão resetada — gerando novo QR');
  shouldReconnect = true;
  await startBaileys().catch(e => log('err', e.message));
  res.json({ ok: true });
});

app.post('/send', async (req, res) => {
  const { to, msg } = req.body;
  if (!to || !msg)           return res.status(400).json({ error: 'to e msg obrigatórios' });
  if (!waConnected || !sock) return res.status(503).json({ error: 'WA desconectado' });
  try {
    await sock.sendMessage(toJid(to), { text: msg });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/send-approval', async (req, res) => {
  const { to, msg } = req.body;
  if (!to || !msg)           return res.status(400).json({ error: 'to e msg obrigatórios' });
  if (!waConnected || !sock) return res.status(503).json({ error: 'WA desconectado' });
  try {
    await sock.sendMessage(toJid(to), { text: msg });
    log('ok', `Aprovação enviada para ${to}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/groups', async (req, res) => {
  if (!waConnected || !sock) return res.status(503).json({ error: 'WA desconectado' });
  try {
    const grupos = await sock.groupFetchAllParticipating();
    const lista  = Object.values(grupos).map(g => ({ id: g.id, name: g.subject }));
    lista.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ groups: lista });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/status', (req, res) => {
  res.json({ connected: waConnected, phone: waPhone, name: waName });
});

/* ════════════════════════════════════════
   INICIA
════════════════════════════════════════ */
app.listen(PORT, () => {
  log('ok', `Serviço WhatsApp porta ${PORT}`);
  startBaileys().catch(e => log('err', `Erro ao iniciar: ${e.message}`));
});
