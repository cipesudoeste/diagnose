'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const http   = require('http');
const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');

const app  = express();
const PORT = process.env.PORT || 3001;

const CONFIG_FILE = path.join(__dirname, 'config.json');
const LOG_FILE    = path.join(__dirname, 'bot.log');

const DEFAULT_CONFIG = {
  auth: {
    user: 'operador',
    pass_hash: crypto.createHash('sha256').update('cipe2024').digest('hex')
  },
  jwt_secret: crypto.randomBytes(32).toString('hex'),
  vpn: { host: '', port: '443', user: '', pass: '', intranet_url: '' },
  intranet: { user: '', pass: '' },
  pages: [],
  schedule: {
    start: '08:00', end: '20:00', interval: 4,
    days: [1,2,3,4,5], force_send: false, notify_period: true
  },
  approval: {
    manual: true, auto_publish: false, timeout_min: 30,
    template: '📋 *IntraBot · CIPE Sudoeste* — nova atualização detectada\n\n{itens}\n\nResponda com os números para publicar (ex: "1 2"), "todos" ou "ignorar".'
  },
  admin: null,
  groups: [],
  keywords_include: ['portaria','aviso','escala','boletim'],
  keywords_exclude: ['teste','draft'],
  dedup: true
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log('[intrabot] config.json criado com valores padrão');
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
function appendLog(level, msg) {
  const line = JSON.stringify({ time: new Date().toLocaleTimeString('pt-BR'), level, msg });
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(`[${level.toUpperCase()}] ${msg}`);
}

function callWA(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port: 3002,
      path: endpoint, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

app.use(cors({
  origin: [
    'https://cipesudoeste.vercel.app',
    /^https:\/\/.*\.vercel\.app$/,
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ],
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());

function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  const cfg = loadConfig();
  try { req.user = jwt.verify(token, cfg.jwt_secret); next(); }
  catch { res.status(401).json({ error: 'Token inválido ou expirado' }); }
}

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */
app.post('/api/auth', (req, res) => {
  const { user, pass } = req.body || {};
  if (!user || !pass) return res.status(400).json({ error: 'user e pass obrigatórios' });
  const cfg      = loadConfig();
  const passHash = crypto.createHash('sha256').update(pass).digest('hex');
  if (user !== cfg.auth.user || passHash !== cfg.auth.pass_hash) {
    appendLog('warn', `Login inválido: "${user}"`);
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  const token = jwt.sign({ user }, cfg.jwt_secret, { expiresIn: '24h' });
  appendLog('ok', `Login: ${user}`);
  res.json({ token });
});

/* ════════════════════════════════════════
   STATUS
════════════════════════════════════════ */
app.get('/api/status', authRequired, (req, res) => {
  const stateFile = path.join(__dirname, 'estado.json');
  const s = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {};
  res.json({
    vpn_connected: s.vpn_connected  ?? false,
    vpn_ip:        s.vpn_ip         ?? '—',
    wa_connected:  s.wa_connected   ?? false,
    wa_phone:      s.wa_phone       ?? null,
    wa_name:       s.wa_name        ?? null,
    wa_qr:         s.wa_qr          ?? null,
    wa_qr_ts:      s.wa_qr_ts       ?? null,
    checks_today:  s.checks_today   ?? 0,
    updates_today: s.updates_today  ?? 0,
    pending:       s.pending        ?? 0,
    sent_today:    s.sent_today     ?? 0,
    next_check:    s.next_check     ?? '—',
  });
});

/* ════════════════════════════════════════
   CONFIG
════════════════════════════════════════ */
app.get('/api/config', authRequired, (req, res) => {
  const cfg  = loadConfig();
  const safe = { ...cfg };
  delete safe.auth;
  delete safe.jwt_secret;
  if (safe.vpn)      safe.vpn      = { ...safe.vpn, pass: '' };
  if (safe.intranet) safe.intranet = { ...safe.intranet, pass: '' };
  res.json(safe);
});

app.post('/api/config/vpn', authRequired, (req, res) => {
  const cfg = loadConfig();
  const { host, port, user, pass, intranet_url, pages } = req.body;
  cfg.vpn = { host, port, user, intranet_url, pass: pass || cfg.vpn.pass };
  if (Array.isArray(pages)) cfg.pages = pages;
  saveConfig(cfg);
  appendLog('ok', 'Config VPN salva');
  res.json({ ok: true });
});

app.post('/api/config/intranet', authRequired, (req, res) => {
  const cfg = loadConfig();
  const { user, pass } = req.body;
  cfg.intranet = {
    user: user || cfg.intranet?.user || '',
    pass: pass || cfg.intranet?.pass || ''
  };
  saveConfig(cfg);
  appendLog('ok', 'Credenciais da intranet salvas');
  res.json({ ok: true });
});

app.post('/api/config/schedule', authRequired, (req, res) => {
  const cfg = loadConfig();
  cfg.schedule = req.body;
  saveConfig(cfg);
  appendLog('ok', 'Agendamento salvo');
  res.json({ ok: true });
});

app.post('/api/config/approval', authRequired, (req, res) => {
  const cfg = loadConfig();
  const { manual, auto_publish, timeout_min, template, admin, groups } = req.body;
  cfg.approval = { manual, auto_publish, timeout_min, template };
  if (admin !== undefined) cfg.admin = admin;
  if (Array.isArray(groups)) cfg.groups = groups;
  saveConfig(cfg);
  appendLog('ok', 'Config aprovação salva');
  res.json({ ok: true });
});

app.post('/api/config/filters', authRequired, (req, res) => {
  const cfg = loadConfig();
  const { keywords_include, keywords_exclude, dedup } = req.body;
  if (Array.isArray(keywords_include)) cfg.keywords_include = keywords_include;
  if (Array.isArray(keywords_exclude)) cfg.keywords_exclude = keywords_exclude;
  cfg.dedup = !!dedup;
  saveConfig(cfg);
  appendLog('ok', 'Filtros salvos');
  res.json({ ok: true });
});

/* ════════════════════════════════════════
   WHATSAPP
════════════════════════════════════════ */
app.post('/api/whatsapp/connect', authRequired, async (req, res) => {
  try {
    const r = await callWA('POST', '/connect');
    appendLog('ok', 'Conexão WA solicitada');
    res.json(r);
  } catch (e) {
    appendLog('err', `Erro ao conectar WA: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/whatsapp/disconnect', authRequired, async (req, res) => {
  try {
    const r = await callWA('POST', '/disconnect');
    appendLog('ok', 'WA desconectado pelo painel');
    res.json(r);
  } catch (e) {
    appendLog('err', `Erro ao desconectar WA: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/whatsapp/reset', authRequired, async (req, res) => {
  try {
    const r = await callWA('POST', '/reset');
    appendLog('warn', 'Sessão WA resetada — novo QR gerado');
    res.json(r);
  } catch (e) {
    appendLog('err', `Erro ao resetar WA: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/whatsapp/groups', authRequired, async (req, res) => {
  try {
    const r = await callWA('GET', '/groups');
    res.json(r);
  } catch (e) {
    appendLog('err', `Erro ao listar grupos: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════
   SCRAPER
════════════════════════════════════════ */
app.post('/api/scraper/run-now', authRequired, (req, res) => {
  fs.writeFileSync(path.join(__dirname, 'run_now.flag'), '1');
  appendLog('ok', 'Verificação manual disparada');
  res.json({ ok: true });
});

/* ════════════════════════════════════════
   LOGS
════════════════════════════════════════ */
app.get('/api/logs', authRequired, (req, res) => {
  const limit = parseInt(req.query.limit) || 40;
  if (!fs.existsSync(LOG_FILE)) return res.json({ logs: [] });
  const lines = fs.readFileSync(LOG_FILE, 'utf8')
    .trim().split('\n').filter(Boolean)
    .slice(-limit).reverse()
    .map(l => { try { return JSON.parse(l); } catch { return { time:'—', level:'ok', msg: l }; } });
  res.json({ logs: lines });
});

/* ════════════════════════════════════════
   INICIA
════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`[intrabot-api] rodando em http://localhost:${PORT}`);
  appendLog('ok', `API iniciada na porta ${PORT}`);
  loadConfig();
});
