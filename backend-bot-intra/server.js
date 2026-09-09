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
  dedup: true,
  supabase_url: process.env.SUPABASE_URL || '',
  supabase_key: process.env.SUPABASE_KEY || ''
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

app.post('/api/config/supabase', authRequired, (req, res) => {
  const cfg = loadConfig();
  const { supabase_url, supabase_key } = req.body;
  if (supabase_url !== undefined) cfg.supabase_url = supabase_url;
  if (supabase_key !== undefined) cfg.supabase_key = supabase_key;
  saveConfig(cfg);
  appendLog('ok', 'Config Supabase salva');
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
   MIRROR
════════════════════════════════════════ */
const MIRROR_DIR = path.join(__dirname, 'mirror');

// Índice de itens espelhados — consumido pelo painel
app.get('/i/index.json', (req, res) => {
  const indexPath = path.join(MIRROR_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) return res.json([]);
  try {
    res.json(JSON.parse(fs.readFileSync(indexPath, 'utf8')));
  } catch {
    res.status(500).json({ erro: 'Falha ao ler índice.' });
  }
});

// Serve páginas e arquivos espelhados — /i/<id>[/files/arquivo.pdf]
app.use('/i', (req, res) => {
  const reqPath  = decodeURIComponent(req.path);
  const resolved = path.resolve(MIRROR_DIR, '.' + reqPath);

  // Guard path traversal
  if (!resolved.startsWith(path.resolve(MIRROR_DIR))) {
    return res.status(403).send('Acesso negado.');
  }

  let filePath = resolved;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Item não encontrado no espelho.');
  }

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.pdf':  'application/pdf',
    '.jpg':  'image/jpeg', '.jpeg': 'image/jpeg',
    '.png':  'image/png',  '.gif':  'image/gif',
    '.svg':  'image/svg+xml', '.webp': 'image/webp',
    '.doc':  'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls':  'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip':  'application/zip',
  };
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(filePath).pipe(res);
});

/* ════════════════════════════════════════
   KEYWORDS POR POLICIAL
════════════════════════════════════════ */

// Supabase REST simples (evita adicionar dependência de SDK)
function supabaseReq(method, table, params, body) {
  const cfg = loadConfig();
  const supaUrl = cfg.supabase_url || process.env.SUPABASE_URL || '';
  const supaKey = cfg.supabase_key || process.env.SUPABASE_KEY || '';
  if (!supaUrl || !supaKey) return Promise.reject(new Error('Supabase não configurado'));

  let url = `${supaUrl}/rest/v1/${table}`;
  if (params) url += `?${params}`;

  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname,
      port:     u.port || 443,
      path:     u.pathname + u.search,
      method,
      headers: {
        'apikey':         supaKey,
        'Authorization':  `Bearer ${supaKey}`,
        'Content-Type':   'application/json',
        'Prefer':         'return=representation',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const lib = require(u.protocol === 'https:' ? 'https' : 'http');
    const req = lib.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw || '[]')); } catch { resolve([]); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// GET /api/contatos — lista contatos com keywords
app.get('/api/contatos', authRequired, async (req, res) => {
  const q = req.query.q ? `&or=(nome.ilike.*${req.query.q}*,matricula.ilike.*${req.query.q}*)` : '';
  try {
    const data = await supabaseReq('GET', 'whatsapp_contatos',
      `select=matricula,nome,telefone,keywords&order=nome${q}`);
    res.json({ ok: true, contatos: Array.isArray(data) ? data : [] });
  } catch (e) {
    appendLog('err', `Erro ao listar contatos: ${e.message}`);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// POST /api/contatos/:matricula/keywords — salva keywords (substitui)
app.post('/api/contatos/:matricula/keywords', authRequired, async (req, res) => {
  const { matricula } = req.params;
  const { keywords }  = req.body;
  if (!Array.isArray(keywords)) {
    return res.status(400).json({ ok: false, erro: 'keywords deve ser array' });
  }
  const kws = keywords.map(k => k.trim().toLowerCase()).filter(Boolean);
  try {
    await supabaseReq('PATCH', 'whatsapp_contatos',
      `matricula=eq.${encodeURIComponent(matricula)}`,
      { keywords: kws });
    appendLog('ok', `Keywords atualizadas: ${matricula} → [${kws.join(', ')}]`);
    res.json({ ok: true });
  } catch (e) {
    appendLog('err', `Erro ao salvar keywords (${matricula}): ${e.message}`);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

/* ════════════════════════════════════════
   APROVAÇÃO DUPLA (painel web)
════════════════════════════════════════ */

const STATE_FILE_PATH = path.join(__dirname, 'estado.json');

function lerEstado() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8')); } catch { return {}; }
}
function gravarEstado(obj) {
  const s = lerEstado();
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify({ ...s, ...obj }, null, 2));
}

// GET /api/pendentes — itens aguardando aprovação
app.get('/api/pendentes', authRequired, (req, res) => {
  const s = lerEstado();
  res.json({ ok: true, pendentes: s.pending_items || [] });
});

// POST /api/aprovar
// body: { ids: [...], destino: "grupos" | "matriculas", matriculas?: [...] }
app.post('/api/aprovar', authRequired, async (req, res) => {
  const { ids, destino, matriculas } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || !destino) {
    return res.status(400).json({ ok: false, erro: 'ids e destino são obrigatórios' });
  }

  const estado  = lerEstado();
  const pending = estado.pending_items || [];
  const itens   = pending.filter(i => ids.includes(String(i.id || i.link)));

  if (!itens.length) return res.status(404).json({ ok: false, erro: 'Nenhum item encontrado' });

  // resultados por item: { item, ok: bool, erros: [] }
  const resultados = [];

  for (const item of itens) {
    const linkExibir = item.mirrorId
      ? `https://diagnose-kvrl.vercel.app/i/${item.mirrorId}`
      : item.link;
    const msg = `📌 *${item.titulo}*\n${item.categoria ? `_${item.categoria}_\n` : ''}${item.data ? `${item.data}\n` : ''}${linkExibir}`;

    const errosItem = [];

    if (destino === 'grupos') {
      const cfg    = loadConfig();
      const grupos = cfg.groups || [];
      for (const gid of grupos) {
        try { await callWA('POST', '/send', { to: gid, msg }); }
        catch (e) { errosItem.push(`grupo ${gid}: ${e.message}`); }
      }
    } else if (destino === 'matriculas' && Array.isArray(matriculas) && matriculas.length) {
      try {
        const mats     = matriculas.map(m => `"${m}"`).join(',');
        const contatos = await supabaseReq('GET', 'whatsapp_contatos',
          `select=matricula,telefone&matricula=in.(${mats})`);
        for (const c of (Array.isArray(contatos) ? contatos : [])) {
          try { await callWA('POST', '/send', { to: c.telefone, msg }); }
          catch (e) { errosItem.push(`${c.matricula}: ${e.message}`); }
        }
      } catch (e) { errosItem.push(`Supabase: ${e.message}`); }
    }

    resultados.push({ item, erros: errosItem });
  }

  // Remove do pending APENAS os itens sem nenhum erro
  const idsOk      = resultados.filter(r => r.erros.length === 0).map(r => String(r.item.id || r.item.link));
  const idsComErro = resultados.filter(r => r.erros.length  > 0).map(r => String(r.item.id || r.item.link));
  const novoPending = pending.filter(i => !idsOk.includes(String(i.id || i.link)));
  gravarEstado({ pending_items: novoPending, pending: novoPending.length });

  // Salva histórico de publicações bem-sucedidas
  if (idsOk.length) {
    const PUB_FILE  = path.join(__dirname, 'publicacoes.json');
    let historico   = [];
    try { historico = JSON.parse(fs.readFileSync(PUB_FILE, 'utf8')); } catch {}
    const novas = resultados
      .filter(r => r.erros.length === 0)
      .map(r => ({
        ts:        new Date().toISOString(),
        id:        String(r.item.id || r.item.link),
        titulo:    r.item.titulo    || '',
        categoria: r.item.categoria || '',
        data:      r.item.data      || '',
        mirrorId:  r.item.mirrorId  || null,
        link:      r.item.link      || '',
        destino,
        matriculas: matriculas || [],
        reenvios:  [],
      }));
    historico = [...novas, ...historico].slice(0, 200);
    fs.writeFileSync(PUB_FILE, JSON.stringify(historico, null, 2));
  }

  const todosErros = resultados.flatMap(r => r.erros);
  appendLog('ok', `Aprovação: ${idsOk.length} ok, ${idsComErro.length} com erro`);
  res.json({ ok: true, publicados: idsOk.length, erros: todosErros, ids_com_erro: idsComErro });
});

// GET /api/publicacoes — histórico das últimas publicações
app.get('/api/publicacoes', authRequired, (req, res) => {
  const PUB_FILE = path.join(__dirname, 'publicacoes.json');
  try {
    const historico = fs.existsSync(PUB_FILE)
      ? JSON.parse(fs.readFileSync(PUB_FILE, 'utf8'))
      : [];
    res.json({ ok: true, publicacoes: historico });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// POST /api/reenviar — reenvia uma publicação do histórico
// body: { id: string, destino: "grupos"|"matriculas", matriculas?: [...] }
app.post('/api/reenviar', authRequired, async (req, res) => {
  const { id, destino, matriculas } = req.body || {};
  if (!id || !destino) return res.status(400).json({ ok: false, erro: 'id e destino obrigatórios' });

  const PUB_FILE = path.join(__dirname, 'publicacoes.json');
  let historico  = [];
  try { historico = JSON.parse(fs.readFileSync(PUB_FILE, 'utf8')); } catch {}

  const entrada = historico.find(p => p.id === id);
  if (!entrada) return res.status(404).json({ ok: false, erro: 'Publicação não encontrada no histórico' });

  const linkExibir = entrada.mirrorId
    ? `https://diagnose-kvrl.vercel.app/i/${entrada.mirrorId}`
    : entrada.link;
  const msg = `📌 *${entrada.titulo}*\n${entrada.categoria ? `_${entrada.categoria}_\n` : ''}${entrada.data ? `${entrada.data}\n` : ''}${linkExibir}`;

  const erros = [];

  if (destino === 'grupos') {
    const cfg    = loadConfig();
    const grupos = cfg.groups || [];
    for (const gid of grupos) {
      try { await callWA('POST', '/send', { to: gid, msg }); }
      catch (e) { erros.push(`${gid}: ${e.message}`); }
    }
  } else if (destino === 'matriculas' && Array.isArray(matriculas) && matriculas.length) {
    try {
      const mats     = matriculas.map(m => `"${m}"`).join(',');
      const contatos = await supabaseReq('GET', 'whatsapp_contatos',
        `select=matricula,telefone&matricula=in.(${mats})`);
      for (const c of (Array.isArray(contatos) ? contatos : [])) {
        try { await callWA('POST', '/send', { to: c.telefone, msg }); }
        catch (e) { erros.push(`${c.matricula}: ${e.message}`); }
      }
    } catch (e) { erros.push(`Supabase: ${e.message}`); }
  }

  // Registra reenvio no histórico
  const idx = historico.findIndex(p => p.id === id);
  if (idx !== -1) {
    historico[idx].reenvios = historico[idx].reenvios || [];
    historico[idx].reenvios.push({
      ts: new Date().toISOString(), destino,
      matriculas: matriculas || [], erros
    });
    fs.writeFileSync(PUB_FILE, JSON.stringify(historico, null, 2));
  }

  appendLog('ok', `Reenvio: "${entrada.titulo?.slice(0,40)}" — ${erros.length ? erros.length + ' erro(s)' : 'ok'}`);
  res.json({ ok: true, erros });
});

// POST /api/rejeitar
// body: { ids: [...] }
app.post('/api/rejeitar', authRequired, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ ok: false, erro: 'ids é obrigatório' });
  }
  const estado     = lerEstado();
  const pending    = estado.pending_items || [];
  const novoPending = pending.filter(i => !ids.includes(String(i.id || i.link)));
  gravarEstado({ pending_items: novoPending, pending: novoPending.length });
  appendLog('ok', `Painel rejeitou ${ids.length} item(ns)`);
  res.json({ ok: true });
});

/* ════════════════════════════════════════
   INICIA
════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`[intrabot-api] rodando em http://localhost:${PORT}`);
  appendLog('ok', `API iniciada na porta ${PORT}`);
  loadConfig();
});
