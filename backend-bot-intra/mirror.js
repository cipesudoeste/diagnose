'use strict';

/**
 * mirror.js — Captura e espelha páginas da intranet PM-BA
 *
 * Uso:
 *   node mirror.js --url <url> --titulo <titulo> [--id <id>]
 *
 * Saída:
 *   mirror/<id>/index.html   — página espelhada com identidade CIPE
 *   mirror/<id>/files/       — PDFs e imagens baixados
 *   mirror/index.json        — índice de todos os itens espelhados (atualizado)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ── Configuração ──────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, 'config.json');
const MIRROR_DIR = path.join(__dirname, 'mirror');
const INDEX_PATH = path.join(MIRROR_DIR, 'index.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gerarId(url, titulo) {
  const base = `${titulo}-${url}-${Date.now()}`;
  return crypto.createHash('sha1').update(base).digest('hex').slice(0, 8);
}

function slugify(str) {
  return str
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function log(msg) {
  const ts = new Date().toISOString();
  const linha = `[${ts}] [mirror] ${msg}`;
  console.log(linha);
  try {
    fs.appendFileSync(path.join(__dirname, 'bot.log'), linha + '\n');
  } catch {}
}

function lerIndice() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function salvarIndice(indice) {
  fs.mkdirSync(MIRROR_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(indice, null, 2), 'utf8');
}

// ── Download de arquivo (PDF / imagem) ────────────────────────────────────────

function downloadArquivo(url, destPath, proxyConfig) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const useHttps = parsed.protocol === 'https:';
    const transport = useHttps ? https : http;

    // Suporte a proxy simples (HTTP CONNECT não implementado aqui —
    // para isso o Playwright já cuida; este download direto funciona
    // quando a VPS tem acesso direto ou via proxy transparente)
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (useHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': 'IntraBot-Mirror/1.0' },
      timeout: 30000,
    };

    const req = transport.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadArquivo(res.headers.location, destPath, proxyConfig)
          .then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} para ${url}`));
      }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(destPath); });
      out.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout ao baixar ' + url)); });
    req.end();
  });
}

// ── Captura via Playwright ────────────────────────────────────────────────────

async function capturarPagina(itemUrl, id, filesDir, config) {
  const proxyServer = config.proxy?.host
    ? `http://${config.proxy.host}:${config.proxy.port || 8081}`
    : 'http://proxy.servicos.pm.ba.gov.br:8081';

  const browser = await chromium.launch({
    headless: true,
    proxy: { server: proxyServer },
  });

  const context = await browser.newContext({
    proxy: { server: proxyServer },
  });

  // Reutiliza sessão de login se houver cookies salvos
  const cookiePath = path.join(__dirname, 'intranet_cookies.json');
  if (fs.existsSync(cookiePath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      await context.addCookies(cookies);
      log('Cookies de sessão carregados.');
    } catch {
      log('Aviso: falha ao carregar cookies de sessão — pode precisar de novo login.');
    }
  }

  const page = await context.newPage();

  try {
    log(`Abrindo: ${itemUrl}`);
    await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Verificar se caiu na tela de login
    const isLogin = await page.$('input[name="username"], input[type="password"]');
    if (isLogin) {
      log('Sessão expirada — fazendo login novamente...');
      await fazerLogin(page, config);
      // Salvar cookies novos
      const cookies = await context.cookies();
      fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
      // Recarregar a página-alvo
      await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    // Extrair conteúdo útil
    const resultado = await page.evaluate(() => {
      const container = document.querySelector('div.item-page');
      if (!container) return null;

      // Coletar todos os links da página (PDFs e imagens)
      const links = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        if (href && !href.startsWith('javascript') && !href.startsWith('#')) {
          links.push({ href, texto: a.textContent.trim() });
        }
      });

      const imagens = [];
      container.querySelectorAll('img[src]').forEach(img => {
        imagens.push({ src: img.src, alt: img.alt || '' });
      });

      return {
        html: container.innerHTML,
        titulo: document.title || '',
        links,
        imagens,
      };
    });

    if (!resultado) {
      throw new Error('div.item-page não encontrada — página pode ter estrutura diferente.');
    }

    return resultado;

  } finally {
    await browser.close();
  }
}

async function fazerLogin(page, config) {
  const usuario = config.intranet?.usuario || '';
  const senha = config.intranet?.senha || '';

  await page.fill('input[name="username"]', usuario);
  await page.fill('input[name="password"]', senha);

  // Slider captcha — mesma lógica do scraper.py (implementação básica;
  // se o scraper.py já resolve o captcha, preferir reutilizá-lo)
  try {
    const slider = await page.$('.slider-btn, [class*="slider"]');
    if (slider) {
      const box = await slider.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 280, box.y + box.height / 2, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(800);
      }
    }
  } catch (e) {
    log(`Aviso slider: ${e.message}`);
  }

  await Promise.all([
    page.waitForNavigation({ timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"], input[type="submit"]'),
  ]);
}

// ── Baixar arquivos referenciados ─────────────────────────────────────────────

async function baixarArquivos(links, imagens, filesDir, baseUrl, config) {
  fs.mkdirSync(filesDir, { recursive: true });

  const arquivosBaixados = []; // { original, local, nome, tipo }
  const extensoesMidia = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|webp|svg|zip|rar)$/i;

  // Links (PDFs, docs, etc.)
  for (const { href, texto } of links) {
    if (!extensoesMidia.test(href)) continue;

    try {
      const url = new URL(href, baseUrl).toString();
      const ext = path.extname(new URL(url).pathname) || '.bin';
      const nome = slugify(texto || path.basename(new URL(url).pathname)) + ext;
      const destPath = path.join(filesDir, nome);

      if (fs.existsSync(destPath)) {
        arquivosBaixados.push({ original: url, local: `files/${nome}`, nome, tipo: 'link' });
        continue;
      }

      log(`Baixando: ${url}`);
      await downloadArquivo(url, destPath, config.proxy);
      arquivosBaixados.push({ original: url, local: `files/${nome}`, nome, tipo: 'link' });
    } catch (e) {
      log(`Falha ao baixar link ${href}: ${e.message}`);
    }
  }

  // Imagens dentro do conteúdo
  for (const { src, alt } of imagens) {
    if (!src || src.startsWith('data:')) continue;

    try {
      const url = new URL(src, baseUrl).toString();
      const ext = path.extname(new URL(url).pathname) || '.jpg';
      const nome = slugify(alt || path.basename(new URL(url).pathname) || 'imagem') + ext;
      const destPath = path.join(filesDir, nome);

      if (fs.existsSync(destPath)) {
        arquivosBaixados.push({ original: url, local: `files/${nome}`, nome, tipo: 'imagem' });
        continue;
      }

      log(`Baixando imagem: ${url}`);
      await downloadArquivo(url, destPath, config.proxy);
      arquivosBaixados.push({ original: url, local: `files/${nome}`, nome, tipo: 'imagem' });
    } catch (e) {
      log(`Falha ao baixar imagem ${src}: ${e.message}`);
    }
  }

  return arquivosBaixados;
}

// ── Gerar HTML espelhado com identidade CIPE ──────────────────────────────────

function gerarHtml(titulo, conteudoHtml, arquivos, id, dataCaptura) {
  const pdfs = arquivos.filter(a => a.local.endsWith('.pdf') || a.tipo === 'link');
  const imagens = arquivos.filter(a => a.tipo === 'imagem');

  // Substituir src de imagens no conteúdo pelo caminho local
  let htmlFinal = conteudoHtml;
  for (const img of imagens) {
    const escapado = img.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    htmlFinal = htmlFinal.replace(new RegExp(escapado, 'g'), img.local);
  }

  const dataFmt = new Date(dataCaptura).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const anexosHtml = pdfs.length > 0 ? `
    <section class="anexos">
      <h2 class="anexos-titulo">Anexos</h2>
      <ul class="anexos-lista">
        ${pdfs.map(a => `
          <li class="anexo-item">
            <span class="anexo-icone">${a.local.endsWith('.pdf') ? '📄' : '📎'}</span>
            <a href="${a.local}" target="_blank" class="anexo-link">${a.nome}</a>
          </li>`).join('')}
      </ul>
    </section>` : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titulo)} · CIPE Sudoeste</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg:            #211f1c;
      --bg-panel:      #2f3326;
      --bg-panel-2:    #3a4030;
      --cipe-brown:    #8a5a35;
      --cipe-brown-l:  #c08a55;
      --accent:        #bfae8c;
      --t-velhochico:  #4a93a8;
      --text:          #d4cfc7;
      --text-dim:      #8a8578;
      --border:        #4a4e40;
      --danger:        #c0392b;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      font-size: 15px;
      line-height: 1.7;
      min-height: 100vh;
    }

    /* ── Cabeçalho ── */
    .cabecalho {
      background: var(--bg-panel);
      border-bottom: 2px solid var(--cipe-brown);
      padding: 14px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .cabecalho-logo {
      font-family: 'Oswald', sans-serif;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: .04em;
      color: var(--accent);
      text-transform: uppercase;
      line-height: 1.2;
    }
    .cabecalho-logo span {
      display: block;
      font-size: 10px;
      color: var(--text-dim);
      font-weight: 400;
      letter-spacing: .06em;
    }
    .cabecalho-sep { flex: 1; }
    .badge-mirror {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--t-velhochico);
      border: 1px solid var(--t-velhochico);
      padding: 2px 8px;
      border-radius: 2px;
      letter-spacing: .06em;
    }

    /* ── Layout principal ── */
    .wrapper {
      max-width: 820px;
      margin: 0 auto;
      padding: 28px 20px 60px;
    }

    /* ── Metadados do artigo ── */
    .meta {
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    .meta-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-dim);
      margin-bottom: 10px;
      letter-spacing: .04em;
    }
    .meta-titulo {
      font-family: 'Oswald', sans-serif;
      font-size: 26px;
      font-weight: 600;
      color: var(--accent);
      line-height: 1.25;
      margin-bottom: 10px;
    }
    .meta-data {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-dim);
    }

    /* ── Conteúdo espelhado ── */
    .conteudo {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 24px;
      margin-bottom: 28px;
    }
    .conteudo h1, .conteudo h2, .conteudo h3 {
      font-family: 'Oswald', sans-serif;
      color: var(--accent);
      margin: 20px 0 8px;
      line-height: 1.25;
    }
    .conteudo h1 { font-size: 22px; }
    .conteudo h2 { font-size: 18px; }
    .conteudo h3 { font-size: 15px; }
    .conteudo p { margin-bottom: 14px; }
    .conteudo a { color: var(--t-velhochico); text-decoration: underline; }
    .conteudo a:hover { color: var(--accent); }
    .conteudo img {
      max-width: 100%;
      height: auto;
      border-radius: 3px;
      margin: 12px 0;
      border: 1px solid var(--border);
    }
    .conteudo ul, .conteudo ol {
      padding-left: 22px;
      margin-bottom: 14px;
    }
    .conteudo li { margin-bottom: 6px; }
    .conteudo table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .conteudo th {
      background: var(--bg-panel-2);
      color: var(--accent);
      font-family: 'Oswald', sans-serif;
      font-weight: 600;
      padding: 8px 10px;
      text-align: left;
      border-bottom: 2px solid var(--border);
    }
    .conteudo td {
      padding: 7px 10px;
      border-bottom: 1px solid var(--border);
    }
    .conteudo tr:hover td { background: var(--bg-panel-2); }

    /* ── Anexos ── */
    .anexos {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-top: 2px solid var(--cipe-brown);
      border-radius: 4px;
      padding: 20px 24px;
    }
    .anexos-titulo {
      font-family: 'Oswald', sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: var(--cipe-brown-l);
      text-transform: uppercase;
      letter-spacing: .06em;
      margin-bottom: 14px;
    }
    .anexos-lista {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .anexo-item {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .anexo-icone { font-size: 16px; flex-shrink: 0; }
    .anexo-link {
      color: var(--t-velhochico);
      text-decoration: none;
      font-size: 14px;
      word-break: break-all;
    }
    .anexo-link:hover {
      text-decoration: underline;
      color: var(--accent);
    }

    /* ── Aviso de origem ── */
    .aviso {
      margin-top: 32px;
      padding: 12px 16px;
      background: var(--bg-panel-2);
      border-left: 3px solid var(--text-dim);
      border-radius: 2px;
      font-size: 12px;
      color: var(--text-dim);
    }

    @media (max-width: 600px) {
      .meta-titulo { font-size: 20px; }
      .conteudo { padding: 16px; }
      .anexos { padding: 16px; }
    }
  </style>
</head>
<body>

  <header class="cabecalho">
    <div class="cabecalho-logo">
      CIPE Sudoeste
      <span>Polícia Militar da Bahia</span>
    </div>
    <div class="cabecalho-sep"></div>
    <div class="badge-mirror">INTRANET · ESPELHO</div>
  </header>

  <main class="wrapper">
    <div class="meta">
      <div class="meta-id"># ${escapeHtml(id)}</div>
      <h1 class="meta-titulo">${escapeHtml(titulo)}</h1>
      <div class="meta-data">Capturado em ${dataFmt}</div>
    </div>

    <article class="conteudo">
      ${htmlFinal}
    </article>

    ${anexosHtml}

    <div class="aviso">
      Conteúdo capturado automaticamente da intranet PM-BA pelo IntraBot.
      Esta é uma cópia estática — acesse a intranet para a versão original.
    </div>
  </main>

</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Entrada principal ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  const itemUrl = getArg('--url');
  const titulo  = getArg('--titulo') || 'Sem título';
  const idForce = getArg('--id');  // se ciclo.js já tiver um ID, usa esse

  if (!itemUrl) {
    console.error('Uso: node mirror.js --url <url> --titulo <titulo> [--id <id>]');
    process.exit(1);
  }

  const config = loadConfig();
  const id = idForce || gerarId(itemUrl, titulo);
  const itemDir  = path.join(MIRROR_DIR, id);
  const filesDir = path.join(itemDir, 'files');

  // Se já espelhado, pular (idempotente)
  if (fs.existsSync(path.join(itemDir, 'index.html'))) {
    log(`Item ${id} já espelhado — pulando.`);
    console.log(JSON.stringify({ id, jaExistia: true }));
    return;
  }

  fs.mkdirSync(itemDir, { recursive: true });

  log(`Iniciando captura: id=${id} url=${itemUrl}`);
  const dataCaptura = new Date().toISOString();

  let resultado;
  try {
    resultado = await capturarPagina(itemUrl, id, filesDir, config);
  } catch (e) {
    log(`ERRO ao capturar página: ${e.message}`);
    process.exit(1);
  }

  log(`Página capturada. Links encontrados: ${resultado.links.length}, Imagens: ${resultado.imagens.length}`);

  let arquivos = [];
  try {
    arquivos = await baixarArquivos(resultado.links, resultado.imagens, filesDir, itemUrl, config);
    log(`Arquivos baixados: ${arquivos.length}`);
  } catch (e) {
    log(`Aviso: erro ao baixar arquivos — ${e.message}`);
  }

  // Título final: prioriza o arg --titulo (vem do ciclo.js), fallback para o da página
  const tituloFinal = titulo !== 'Sem título' ? titulo : (resultado.titulo || 'Sem título');

  const html = gerarHtml(tituloFinal, resultado.html, arquivos, id, dataCaptura);
  fs.writeFileSync(path.join(itemDir, 'index.html'), html, 'utf8');
  log(`index.html salvo em mirror/${id}/`);

  // Atualizar índice
  const indice = lerIndice();
  indice.unshift({ id, titulo: tituloFinal, url: itemUrl, dataCaptura, arquivos: arquivos.length });
  salvarIndice(indice);
  log(`Índice atualizado (${indice.length} itens)`);

  // Retornar resultado pro chamador (ciclo.js)
  console.log(JSON.stringify({ id, titulo: tituloFinal, dataCaptura, arquivos: arquivos.length }));
}

main().catch(e => {
  console.error('Erro fatal mirror.js:', e);
  process.exit(1);
});
