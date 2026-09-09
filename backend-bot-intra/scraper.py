"""
scraper.py — IntraBot CIPE Sudoeste
Monitora a home da intranet.pm.ba.gov.br e retorna itens novos.
Requer: pip install playwright && playwright install chromium
"""

import json
import logging
import os
import time
import random
import re

from playwright.sync_api import sync_playwright

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
BASE_URL  = "https://intranet.pm.ba.gov.br"
LOGIN_URL = f"{BASE_URL}/index.php?option=com_users&view=login"
HOME_URL  = f"{BASE_URL}/index.php?option=com_content&view=featured&Itemid=101"

ESTADO_FILE = os.path.join(os.path.dirname(__file__), "estado.json")
LOG_FILE    = os.path.join(os.path.dirname(__file__), "bot.log")

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s [SCRAPER] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)
log.addHandler(logging.StreamHandler())


# ---------------------------------------------------------------------------
# Slider captcha — baseado no teste_slider.py que funcionou
# ---------------------------------------------------------------------------
def resolver_slider(page) -> bool:
    try:
        handle = page.locator("#cdcaptcha a.ui-slider-handle")
        trilho  = page.locator("#cdcaptcha div.slider")

        # Espera o slider aparecer
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

        # Captcha gera token aleatório quando resolvido
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

        # Se saiu da tela de login, navega pra home
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
# Extração
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

                link = a.get_attribute("href") or ""
                if link and not link.startswith("http"):
                    link = BASE_URL + link

                try:
                    categoria = el.locator(
                        "span.mod-articles-category-category a"
                    ).inner_text().strip()
                except Exception:
                    categoria = ""

                try:
                    data = el.locator(
                        "span.mod-articles-category-date"
                    ).inner_text().strip()
                except Exception:
                    data = ""

                itens.append({
                    "titulo": titulo,
                    "link": link,
                    "categoria": categoria,
                    "data": data,
                })
            except Exception as e:
                log.warning(f"Erro no item: {e}")

        log.info(f"{len(itens)} itens extraídos.")
        return itens

    except Exception as e:
        log.error(f"Erro na extração: {e}")
        return []


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
        browser = p.chromium.launch(headless=headless, proxy={"server": "http://proxy.servicos.pm.ba.gov.br:8081"})
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
                    novos.append(item)
                    vistos.add(item["link"])

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
# Execução direta
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Modo --json (chamado pelo ciclo.js)
# ---------------------------------------------------------------------------
def main_json(usuario: str, senha: str):
    """Roda o scraper completo e imprime JSON no stdout com TODOS os itens da página."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, proxy={"server": "http://proxy.servicos.pm.ba.gov.br:8081"})
        page    = browser.new_page()
        try:
            if not fazer_login(page, usuario, senha):
                print("[]")
                return
            itens = extrair_itens(page)
            print(json.dumps(itens, ensure_ascii=False))
        except Exception as e:
            log.error(f"Erro no modo --json: {e}")
            print("[]")
        finally:
            browser.close()


if __name__ == "__main__":
    import sys

    args = sys.argv[1:]

    # Modo --json: chamado pelo ciclo.js para obter metadados completos
    if args and args[0] == "--json":
        if len(args) < 3:
            print("[]")
            sys.exit(1)
        main_json(args[1], args[2])
        sys.exit(0)

    # Modo normal
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
            print(f"  [{item['categoria']}] {item['titulo']}")
            print(f"    {item['data']} — {item['link']}")
    else:
        print("Nenhum item novo encontrado.")

