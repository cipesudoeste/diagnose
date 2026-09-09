'use strict';

const { execFile } = require('child_process');
const fs   = require('fs');
const path = require('path');
const http = require('http');
const vpn  = require('./vpn');

const BASE       = __dirname;
const LOG_FILE   = path.join(BASE, 'bot.log');
const CFG_FILE   = path.join(BASE, 'config.json');
const STATE_FILE = path.join(BASE, 'estado.json');
const FLAG_FILE  = path.join(BASE, 'run_now.flag');
const PYTHON     = '/opt/intrabot-venv/bin/python3';
const SCRAPER    = path.join(BASE, 'scraper.py');

function log(msg) {
  const line = JSON.stringify({ time: new Date().toLocaleTimeString('pt-BR'), level: 'ciclo', msg });
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log('[CICLO]', msg);
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8'));
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function saveState(upd) {
  const s = loadState();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...s, ...upd }, null, 2));
}

// Chama endpoint local do whatsapp.js
function callWA(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = http.request(
      { hostname: '127.0.0.1', port: 3002, path: endpoint, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => { let r = ''; res.on('data', c => r += c); res.on('end', () => { try { resolve(JSON.parse(r)); } catch { resolve({}); } }); }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Roda scraper.py e retorna lista de novos itens
function runScraper(user, pass) {
  return new Promise((resolve, reject) => {
    log('Iniciando scraper...');
    execFile(PYTHON, [SCRAPER, user, pass, '1'], { timeout: 180000 }, (err, stdout, stderr) => {
      if (err) { log(`Scraper falhou: ${err.message}`); return reject(err); }
      // scraper.py já atualiza estado.json internamente
      // Parseia saída pra extrair itens novos (formato texto)
      // Usamos estado.json: comparamos antes/depois
      resolve();
    });
  });
}

// Versão que retorna os novos itens comparando estado antes/depois
async function rodarScraper(user, pass) {
  const vistoAntes = new Set(loadState().vistos || []);

  await runScraper(user, pass);

  const vistoDepois = loadState().vistos || [];
  const novosLinks  = vistoDepois.filter(l => !vistoAntes.has(l));

  if (!novosLinks.length) { log('Nenhum item novo.'); return []; }

  // Reconstrói objetos — scraper só salva links; precisamos dos títulos
  // Solução: rodar scraper em modo --json separado só pra obter metadados
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [SCRAPER, '--json', user, pass], { timeout: 180000 }, (err, stdout) => {
      if (err) { log('Falha ao obter JSON do scraper.'); return resolve(novosLinks.map(l => ({ link: l, titulo: l, categoria: '', data: '' }))); }
      try {
        const todos = JSON.parse(stdout.trim());
        const novos = todos.filter(i => novosLinks.includes(i.link));
        log(`${novos.length} item(ns) novo(s).`);
        resolve(novos);
      } catch { resolve(novosLinks.map(l => ({ link: l, titulo: l, categoria: '', data: '' }))); }
    });
  });
}

// Monta e envia prévia ao admin
async function enviarPrevia(novos) {
  const cfg    = loadConfig();
  const admin  = cfg.admin;
  if (!admin) { log('Admin não configurado — pulando envio.'); return; }

  const linhas = novos.map((item, i) =>
    `*[${i + 1}]* ${item.categoria ? `_${item.categoria}_` : ''}\n${item.titulo}\n${item.data || ''}\n${item.link}`
  ).join('\n\n');

  const template = (cfg.approval?.template || '📋 *IntraBot* — {itens}').replace('{itens}', linhas);

  await callWA('/send-approval', { to: admin, msg: template });
  log(`Prévia enviada para ${admin}.`);
  saveState({ pending: novos.length, pending_items: novos, approval_response: null });
}

// Aguarda resposta do admin (timeout configurável)
function aguardarResposta(timeoutMin) {
  return new Promise(resolve => {
    const fim     = Date.now() + timeoutMin * 60 * 1000;
    const poll    = setInterval(() => {
      const s = loadState();
      if (s.approval_response) {
        clearInterval(poll);
        resolve(s.approval_response);
      }
      if (Date.now() > fim) {
        clearInterval(poll);
        log('Timeout de aprovação — ignorando.');
        resolve('ignorar');
      }
    }, 10000); // verifica a cada 10s
  });
}

// Publica itens aprovados nos grupos
async function publicar(novos, resposta) {
  const cfg    = loadConfig();
  const grupos = cfg.groups || [];
  if (!grupos.length) { log('Nenhum grupo configurado.'); return; }

  let itensPublicar = [];
  const r = resposta.trim().toLowerCase();

  if (r === 'todos') {
    itensPublicar = novos;
  } else if (r === 'ignorar') {
    log('Admin ignorou — nada publicado.');
    return;
  } else {
    const nums = r.match(/\d+/g) || [];
    itensPublicar = nums.map(n => novos[parseInt(n) - 1]).filter(Boolean);
  }

  for (const item of itensPublicar) {
    const msg = `📌 *${item.titulo}*\n${item.categoria ? `_${item.categoria}_\n` : ''}${item.data ? `${item.data}\n` : ''}${item.link}`;
    for (const grupo of grupos) {
      try { await callWA('/send', { to: grupo, msg }); } catch (e) { log(`Erro ao enviar p/ ${grupo}: ${e.message}`); }
    }
  }

  const hoje = loadState();
  saveState({
    sent_today:    (hoje.sent_today || 0) + itensPublicar.length,
    pending:       0,
    pending_items: [],
    approval_response: null,
  });
  log(`${itensPublicar.length} item(ns) publicado(s).`);
}

// ── Ciclo completo ────────────────────────────────────────────
let ciclando = false;

async function executar() {
  if (ciclando) { log('Ciclo anterior em andamento — pulando.'); return; }
  ciclando = true;

  const cfg = loadConfig();
  const { user, pass } = cfg.intranet || {};
  if (!user || !pass) { log('Credenciais da intranet não configuradas.'); ciclando = false; return; }

  log('=== Início do ciclo ===');

  // Atualiza contadores
  const hoje = loadState();
  saveState({ checks_today: (hoje.checks_today || 0) + 1 });

  try {
    const vpnAtiva = cfg.vpn?.host;
    if (vpnAtiva) await vpn.connect();

    const novos = await rodarScraper(user, pass);

    if (vpnAtiva) await vpn.disconnect();

    if (!novos.length) { ciclando = false; log('=== Fim do ciclo (sem novidades) ==='); return; }

    saveState({ updates_today: (hoje.updates_today || 0) + novos.length });

    const manual = cfg.approval?.manual !== false;
    if (manual) {
      await enviarPrevia(novos);
      const resposta = await aguardarResposta(cfg.approval?.timeout_min || 30);
      await publicar(novos, resposta);
    } else {
      // Auto-publish
      await publicar(novos, 'todos');
    }

  } catch (err) {
    log(`Erro no ciclo: ${err.message}`);
    try { await vpn.disconnect(); } catch {}
  }

  ciclando = false;
  log('=== Fim do ciclo ===');
}

// ── Agendamento ───────────────────────────────────────────────
function dentroDoHorario() {
  const cfg  = loadConfig();
  const sch  = cfg.schedule || {};
  const now  = new Date();
  const dia  = now.getDay(); // 0=dom, 1=seg...
  const dias = sch.days || [1,2,3,4,5];
  if (!dias.includes(dia)) return false;

  const [hI, mI] = (sch.start || '08:00').split(':').map(Number);
  const [hF, mF] = (sch.end   || '20:00').split(':').map(Number);
  const minAtual = now.getHours() * 60 + now.getMinutes();
  return minAtual >= hI * 60 + mI && minAtual <= hF * 60 + mF;
}

function proximoCheck() {
  const cfg      = loadConfig();
  const interval = (cfg.schedule?.interval || 4) * 60 * 60 * 1000;
  return interval;
}

function agendar() {
  const intervalo = proximoCheck();
  const proxima   = new Date(Date.now() + intervalo);
  saveState({ next_check: proxima.toLocaleTimeString('pt-BR') });
  log(`Próxima verificação: ${proxima.toLocaleTimeString('pt-BR')}`);

  setTimeout(async () => {
    if (dentroDoHorario()) await executar();
    else log('Fora do horário configurado — pulando.');
    agendar();
  }, intervalo);
}

// ── Flag de execução manual (dispara do painel) ───────────────
setInterval(() => {
  if (fs.existsSync(FLAG_FILE)) {
    fs.unlinkSync(FLAG_FILE);
    log('Execução manual disparada pelo painel.');
    executar();
  }
}, 5000);

// ── Inicia ────────────────────────────────────────────────────
log('Ciclo iniciado.');
if (dentroDoHorario()) executar();
agendar();
