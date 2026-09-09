"""
scraper.py — IntraBot CIPE Sudoeste
Monitora a home da intranet.pm.ba.gov.br e retorna itens novos.
Acessa a intranet diretamente via túnel VPN (openfortivpn — ppp0).
Requer: pip install playwright && playwright install chromium
"""

import json
import logging
import os
import re
import time
import random
import hashlib
import urllib.request
import unicodedata
from pathlib import Path
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
BASE_URL    = "https://intranet.pm.ba.gov.br"
LOGIN_URL   = f"{BASE_URL}/index.php?option=com_users&view=login"
HOME_URL    = f"{BASE_URL}/index.php?option=com_content&view=featured&Itemid=101"

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
ESTADO_FILE = os.path.join(BASE_DIR, "estado.json")
LOG_FILE    = os.path.join(BASE_DIR, "bot.log")
MIRROR_DIR  = Path(BASE_DIR) / "mirror"

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s [SCRAPER] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)
log.addHandler(logging.StreamHandler())


# ---------------------------------------------------------------------------
# Slider captcha
# ---------------------------------------------------------------------------
def resolver_slider(page) -> bool:
    try:
        handle = page.locator("#cdcaptcha a.ui-slider-handle")
        trilho  = page.locator("#cdcaptcha div.slider")
        page.wait_for_selector("#cdcaptcha a.ui-slider-handle", timeout=10000)
        box_t = trilho.bounding_box()
        box_h = handle.bounding_box()
        if not box_t or not box_h:
            log.error("Slider: não foi possível obter dimensões.")
            return False
        start_x = box_h["x"] + box_h["width"] / 2
        start_y = box_h["y"] + box_h["height"] / 2
        end_x   = box_t["x"] + box_t["width"] - 2
        page.mouse.move(start_x, start_y)
        page.mouse.down()
        for i in range(1, 21):
            x = start_x + (end_x - start_x) * i / 20
            page.mouse.move(x, start_y + random.uniform(-1, 1))
            time.sleep(0.05)
        page.mouse.up()
        time.sleep(2)
        for h in page.locator("input[name^='cdcaptcha']").all():
            val = h.get_attribute("value") or ""
            if val and val != "0":
                log.info(f"Slider resolvido. Token: {val}")
                return True
        log.warning("Slider arrastado mas captcha não validado.")
        return False
    except Exception as e:
        log.error(f"Erro no slider: {e}")
        return False


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------
def fazer_login(page, usuario: str, senha: str) -> bool:
    try:
        log.info("Acessando login...")
        page.goto(LOGIN_URL, wait_until="domcontentloaded")
        page.wait_for_selector("#username", timeout=15000)
        page.fill("#username", usuario)
        page.fill("#password", senha)
        log.info("Credenciais preenchidas.")
        if not resolver_slider(page):
            log.error("Captcha falhou.")
            return False
        page.click("button[type='submit']")
        time.sleep(3)
        if "view=login" not in page.url:
            page.goto(HOME_URL, wait_until="domcontentloaded")
            time.sleep(3)
            log.info(f"Login OK. URL: {page.url}")
            return True
        log.warning("Ainda na tela de login após submit.")
        return False
    except Exception as e:
        log.error(f"Erro no login: {e}")
        return False


# ---------------------------------------------------------------------------
# Extração da home
# ---------------------------------------------------------------------------
def extrair_itens(page) -> list[dict]:
    try:
        if "view=login" in page.url:
            log.warning("Sessão expirada.")
            return []
        itens = []
        for el in page.locator("ul.category-module li").all():
            try:
                a      = el.locator("a.mod-articles-category-title").first
                titulo = re.sub(r'\s*\(\d+\)\s*$', '', a.inner_text().strip()).strip()
                link   = a.get_attribute("href") or ""
                if link and not link.startswith("http"):
                    link = BASE_URL + link
                try:
                    categoria = el.locator("span.mod-articles-category-category a").inner_text().strip()
                except Exception:
                    categoria = ""
                try:
                    data = el.locator("span.mod-articles-category-date").inner_text().strip()
                except Exception:
                    data = ""
                itens.append({"titulo": titulo, "link": link, "categoria": categoria, "data": data})
            except Exception as e:
                log.warning(f"Erro no item: {e}")
        log.info(f"{len(itens)} itens extraídos.")
        return itens
    except Exception as e:
        log.error(f"Erro na extração: {e}")
        return []


# ---------------------------------------------------------------------------
# Mirror — helpers
# ---------------------------------------------------------------------------
def slugify(texto: str) -> str:
    texto = unicodedata.normalize("NFD", texto)
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9]+", "-", texto)
    return texto.strip("-")[:40]

def gerar_id(link: str, titulo: str) -> str:
    return hashlib.sha1(f"{titulo}-{link}".encode()).hexdigest()[:8]

def escape_html(s: str) -> str:
    return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;")

def baixar_arquivo(url: str, dest: Path) -> bool:
    """Download direto — VPN já garante acesso à intranet."""
    try:
        opener = urllib.request.build_opener()
        opener.addheaders = [("User-Agent", "IntraBot-Mirror/1.0")]
        with opener.open(url, timeout=30) as resp, open(dest, "wb") as f:
            f.write(resp.read())
        return True
    except Exception as e:
        log.warning(f"[mirror] Falha ao baixar {url}: {e}")
        return False

def gerar_html_mirror(titulo: str, conteudo_html: str, anexos: list[dict],
                      mirror_id: str, data_captura: str,
                      categoria: str = "", data_publicacao: str = "") -> str:
    try:
        dt = datetime.fromisoformat(data_captura)
        data_fmt = dt.strftime("%d/%m/%Y às %H:%M")
    except Exception:
        data_fmt = data_captura

    # Linha de metadados do hero
    meta_partes = []
    if categoria:
        meta_partes.append(f'<span class="cat">{escape_html(categoria)}</span>')
    if data_publicacao:
        meta_partes.append(f'<span class="pub-data">{escape_html(data_publicacao)}</span>')
    hero_meta = f'<div class="hero-meta">{" ".join(meta_partes)}</div>' if meta_partes else ""

    # Anexos
    docs = [a for a in anexos if a["tipo"] == "link"]
    anexos_html = ""
    if docs:
        def icone_ext(nome):
            ext = nome.rsplit(".", 1)[-1].lower() if "." in nome else ""
            mapa = {"pdf": "ti-file-type-pdf", "doc": "ti-file-type-doc",
                    "docx": "ti-file-type-doc", "xls": "ti-file-type-xls",
                    "xlsx": "ti-file-type-xls", "zip": "ti-file-zip"}
            return mapa.get(ext, "ti-file")

        itens_li = "\n".join(
            f'<div class="anx-item">'
            f'<i class="ti {icone_ext(a["nome"])} anx-icon"></i>'
            f'<a href="{a["local"]}" target="_blank" class="anx-nome">{escape_html(a["nome"])}</a>'
            f'<span class="anx-tipo">{escape_html(a["nome"].rsplit(".",1)[-1].upper() if "." in a["nome"] else "ARQ")}</span>'
            f'</div>'
            for a in docs
        )
        anexos_html = f'<div class="anexos"><div class="sec-label">Anexos</div><div class="anx-list">{itens_li}</div></div>'

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escape_html(titulo)} · CIPE Sudoeste</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css">
  <style>
    *,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
    :root{{
      --bg:#f7f6f3;--surface:#ffffff;--border:#e4e2dc;--border-strong:#ccc9c0;
      --text:#1a1917;--text-sec:#6b6860;--text-muted:#9a9890;
      --accent:#1a6fc4;--accent-bg:#e8f0fb;--accent-text:#1a5fa8;
    }}
    @media(prefers-color-scheme:dark){{:root{{
      --bg:#181715;--surface:#242320;--border:#35332e;--border-strong:#4a4843;
      --text:#e8e5df;--text-sec:#9a9890;--text-muted:#6b6860;
      --accent:#4da3f7;--accent-bg:#1a2d42;--accent-text:#7bb8f8;
    }}}}
    body{{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;font-size:15px;line-height:1.75;min-height:100vh}}
    .topbar{{border-bottom:0.5px solid var(--border);padding:10px 24px;display:flex;align-items:center;justify-content:space-between}}
    .topbar-logo{{font-size:12px;font-weight:500;color:var(--text-muted);letter-spacing:.04em;text-transform:uppercase}}
    .topbar-badge{{font-size:11px;color:var(--accent-text);background:var(--accent-bg);padding:2px 10px;border-radius:4px;font-family:monospace;letter-spacing:.03em}}
    .page{{max-width:760px;margin:0 auto;padding:0 24px 64px}}
    .hero{{padding:40px 0 32px;border-bottom:0.5px solid var(--border)}}
    .hero-meta{{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}}
    .cat{{font-size:11px;font-weight:500;color:var(--accent-text);background:var(--accent-bg);padding:3px 10px;border-radius:4px;text-transform:uppercase;letter-spacing:.05em}}
    .pub-data{{font-size:12px;color:var(--text-muted);font-family:monospace}}
    .hero-titulo{{font-size:26px;font-weight:500;line-height:1.2;color:var(--text);max-width:680px}}
    .body-area{{padding:32px 0;border-bottom:0.5px solid var(--border)}}
    .sec-label{{font-size:11px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:16px}}
    .conteudo{{font-size:15px;line-height:1.8;color:var(--text-sec)}}
    .conteudo p{{margin-bottom:14px}}
    .conteudo h1,.conteudo h2,.conteudo h3{{color:var(--text);font-weight:500;margin:24px 0 10px;line-height:1.3}}
    .conteudo h1{{font-size:20px}}.conteudo h2{{font-size:17px}}.conteudo h3{{font-size:15px}}
    .conteudo a{{color:var(--accent);text-decoration:underline}}
    .conteudo img{{max-width:100%;height:auto;border-radius:6px;margin:12px 0;border:0.5px solid var(--border)}}
    .conteudo ul,.conteudo ol{{padding-left:22px;margin-bottom:14px}}
    .conteudo li{{margin-bottom:6px}}
    .conteudo table{{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px}}
    .conteudo th{{background:var(--bg);color:var(--text);font-weight:500;padding:8px 12px;text-align:left;border-bottom:0.5px solid var(--border-strong);font-size:13px}}
    .conteudo td{{padding:8px 12px;border-bottom:0.5px solid var(--border);color:var(--text-sec)}}
    .conteudo tr:last-child td{{border-bottom:none}}
    .anexos{{padding:28px 0;border-bottom:0.5px solid var(--border)}}
    .anx-list{{display:flex;flex-direction:column;gap:8px}}
    .anx-item{{display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface);border:0.5px solid var(--border);border-radius:8px}}
    .anx-icon{{color:var(--accent);font-size:18px;flex-shrink:0}}
    .anx-nome{{font-size:14px;color:var(--accent);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}}
    .anx-nome:hover{{text-decoration:underline}}
    .anx-tipo{{font-size:11px;color:var(--text-muted);font-family:monospace;flex-shrink:0}}
    .footer{{padding:20px 0 0;font-size:12px;color:var(--text-muted);line-height:1.6}}
    .footer a{{color:var(--accent)}}
    @media(max-width:600px){{.hero-titulo{{font-size:20px}}.page{{padding:0 16px 48px}}.hero{{padding:28px 0 24px}}}}
  </style>
</head>
<body>
  <header class="topbar">
    <span class="topbar-logo">CIPE Sudoeste · PM-BA</span>
    <span class="topbar-badge">intranet · espelho</span>
  </header>
  <div class="page">
    <div class="hero">
      {hero_meta}
      <h1 class="hero-titulo">{escape_html(titulo)}</h1>
    </div>
    <div class="body-area">
      <div class="sec-label">Conteúdo</div>
      <div class="conteudo">{conteudo_html}</div>
    </div>
    {anexos_html}
    <div class="footer">
      Cópia estática capturada em {data_fmt} pela intranet PM-BA · <a href="{escape_html(mirror_id)}">#{escape_html(mirror_id)}</a>
    </div>
  </div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Mirror — captura artigo dentro da sessão autenticada
# ---------------------------------------------------------------------------
def espelhar_item(page, item: dict) -> str | None:
    link   = item.get("link", "")
    titulo = item.get("titulo", "Sem título")
    if not link:
        return None

    mirror_id = gerar_id(link, titulo)
    item_dir  = MIRROR_DIR / mirror_id
    files_dir = item_dir / "files"

    if (item_dir / "index.html").exists():
        log.info(f"[mirror] {mirror_id} já existe — pulando.")
        return mirror_id

    item_dir.mkdir(parents=True, exist_ok=True)
    files_dir.mkdir(parents=True, exist_ok=True)

    try:
        log.info(f"[mirror] Abrindo: {link}")
        page.goto(link, wait_until="domcontentloaded", timeout=60000)
        time.sleep(2)

        if "view=login" in page.url:
            log.warning("[mirror] Sessão expirada ao abrir artigo.")
            return None

        resultado = page.evaluate("""() => {
            const c = document.querySelector('div.item-page');
            if (!c) return null;
            const links = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const h = a.href;
                if (h && !h.startsWith('javascript') && !h.startsWith('#'))
                    links.push({href: h, texto: a.textContent.trim()});
            });
            const imgs = [];
            c.querySelectorAll('img[src]').forEach(img => {
                imgs.push({src: img.src, alt: img.alt || ''});
            });
            return {html: c.innerHTML, links, imgs};
        }""")

        if not resultado:
            log.warning(f"[mirror] div.item-page não encontrada em {link}")
            return None

        ext_re = re.compile(r'\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)$', re.I)
        img_re = re.compile(r'\.(jpg|jpeg|png|gif|webp|svg)$', re.I)
        anexos = []

        # PDFs e documentos
        for lnk in resultado["links"]:
            href = lnk["href"]
            if not ext_re.search(href.split("?")[0]):
                continue
            try:
                m    = re.search(r'\.\w+$', href.split("?")[0])
                ext  = m.group(0) if m else ".bin"
                nome = slugify(lnk["texto"] or os.path.basename(href)) + ext
                dest = files_dir / nome
                if not dest.exists():
                    baixar_arquivo(href, dest)
                if dest.exists():
                    anexos.append({"original": href, "local": f"files/{nome}", "nome": nome, "tipo": "link"})
            except Exception as e:
                log.warning(f"[mirror] Erro ao baixar {href}: {e}")

        # Imagens
        html_final = resultado["html"]
        for img in resultado["imgs"]:
            src = img["src"]
            if not src or src.startswith("data:") or not img_re.search(src.split("?")[0]):
                continue
            try:
                m    = re.search(r'\.\w+$', src.split("?")[0])
                ext  = m.group(0) if m else ".jpg"
                nome = slugify(img["alt"] or os.path.basename(src) or "imagem") + ext
                dest = files_dir / nome
                if not dest.exists():
                    baixar_arquivo(src, dest)
                if dest.exists():
                    html_final = html_final.replace(src, f"files/{nome}")
                    anexos.append({"original": src, "local": f"files/{nome}", "nome": nome, "tipo": "imagem"})
            except Exception as e:
                log.warning(f"[mirror] Erro ao baixar imagem {src}: {e}")

        data_captura = datetime.now(timezone.utc).isoformat()
        html = gerar_html_mirror(titulo, html_final, anexos, mirror_id, data_captura,
                                  categoria=item.get("categoria", ""),
                                  data_publicacao=item.get("data", ""))
        (item_dir / "index.html").write_text(html, encoding="utf-8")
        log.info(f"[mirror] Salvo: mirror/{mirror_id}/ ({len(anexos)} anexo(s))")

        # Atualizar índice
        index_path = MIRROR_DIR / "index.json"
        try:
            indice = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
        except Exception:
            indice = []
        indice.insert(0, {"id": mirror_id, "titulo": titulo, "url": link,
                          "dataCaptura": data_captura, "anexos": len(anexos)})
        index_path.write_text(json.dumps(indice, ensure_ascii=False, indent=2), encoding="utf-8")

        return mirror_id

    except Exception as e:
        log.error(f"[mirror] Erro ao espelhar {link}: {e}")
        return None


# ---------------------------------------------------------------------------
# Estado
# ---------------------------------------------------------------------------
def carregar_vistos() -> set[str]:
    if not os.path.exists(ESTADO_FILE):
        return set()
    try:
        with open(ESTADO_FILE, "r", encoding="utf-8") as f:
            return set(json.load(f).get("vistos", []))
    except Exception:
        return set()

def salvar_vistos(vistos: set[str]) -> None:
    try:
        with open(ESTADO_FILE, "w", encoding="utf-8") as f:
            json.dump({"vistos": list(vistos)}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        log.error(f"Erro ao salvar estado: {e}")


# ---------------------------------------------------------------------------
# Ciclo principal
# ---------------------------------------------------------------------------
def executar(usuario: str, senha: str, headless: bool = True) -> list[dict]:
    novos = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page    = browser.new_page()
        try:
            if not fazer_login(page, usuario, senha):
                log.error("Login falhou.")
                return []

            itens = extrair_itens(page)
            if not itens:
                log.warning("Nenhum item extraído.")
                return []

            vistos = carregar_vistos()
            for item in itens:
                if item["link"] not in vistos:
                    mirror_id = espelhar_item(page, item)
                    item["mirrorId"] = mirror_id
                    novos.append(item)
                    vistos.add(item["link"])
                    try:
                        page.goto(HOME_URL, wait_until="domcontentloaded", timeout=30000)
                        time.sleep(1)
                    except Exception:
                        pass

            if novos:
                salvar_vistos(vistos)
                log.info(f"{len(novos)} itens novos.")
            else:
                log.info("Nenhum item novo.")

        except Exception as e:
            log.error(f"Erro inesperado: {e}")
        finally:
            browser.close()

    return novos


# ---------------------------------------------------------------------------
# Modo --json (chamado pelo ciclo.js)
# ---------------------------------------------------------------------------
def main_json(usuario: str, senha: str):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page    = browser.new_page()
        try:
            if not fazer_login(page, usuario, senha):
                print("[]")
                return

            itens  = extrair_itens(page)
            vistos = carregar_vistos()
            novos  = []

            for item in itens:
                if item["link"] not in vistos:
                    mirror_id = espelhar_item(page, item)
                    item["mirrorId"] = mirror_id
                    novos.append(item)
                    vistos.add(item["link"])
                    try:
                        page.goto(HOME_URL, wait_until="domcontentloaded", timeout=30000)
                        time.sleep(1)
                    except Exception:
                        pass

            if novos:
                salvar_vistos(vistos)

            print(json.dumps(itens, ensure_ascii=False))

        except Exception as e:
            log.error(f"Erro no modo --json: {e}")
            print("[]")
        finally:
            browser.close()


# ---------------------------------------------------------------------------
# Execução direta
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    args = sys.argv[1:]

    if args and args[0] == "--json":
        if len(args) < 3:
            print("[]")
            sys.exit(1)
        main_json(args[1], args[2])
        sys.exit(0)

    if len(args) < 2:
        print("Uso: python scraper.py <usuario> <senha> [1=headless]")
        sys.exit(1)

    usuario  = args[0]
    senha    = args[1]
    headless = (args[2] == "1") if len(args) > 2 else False

    print("Executando scraper" + (" (headless)" if headless else " (visivel)") + "...")
    novos = executar(usuario, senha, headless=headless)

    if novos:
        print(f"\n{len(novos)} item(ns) novo(s):")
        for item in novos:
            mid = item.get("mirrorId")
            link_exibir = f"https://cipesudoeste.vercel.app/i/{mid}" if mid else item["link"]
            print(f"  [{item['categoria']}] {item['titulo']}")
            print(f"    {item['data']} — {link_exibir}")
    else:
        print("Nenhum item novo encontrado.")
