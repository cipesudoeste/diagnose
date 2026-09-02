"""
Fica de olho na tabela `oficios_fila` — toda vez que alguém sobe um
PDF pelo site (Central de Ofícios), esse script pega, processa (extrai,
cruza, gera o texto se não houver pendência) e atualiza o status.

Uso: deixe rodando num terminal (ou configure pra rodar em segundo
plano — veja nota no fim do arquivo):

    python watcher.py
"""
import os
import tempfile
import time

from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from extrator import extrair_texto_pdf, extrair_dados_oficio
from cruzamento import cruzar_policiais
from gerador import gerar_oficio_resposta
from persistencia import salvar_oficio

_sb = create_client(SUPABASE_URL, SUPABASE_KEY)

BUCKET = "oficios-anexos"
INTERVALO_SEGUNDOS = 15


def processar_item_da_fila(item: dict):
    item_id = item["id"]
    print(f"Processando: {item['nome_arquivo']}...")
    _sb.table("oficios_fila").update({
        "status": "processando",
        "atualizado_em": "now()",
    }).eq("id", item_id).execute()

    caminho_tmp = None
    try:
        conteudo = _sb.storage.from_(BUCKET).download(item["storage_path"])
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(conteudo)
            caminho_tmp = tmp.name

        texto = extrair_texto_pdf(caminho_tmp)
        dados = extrair_dados_oficio(texto)
        cruzamento = cruzar_policiais(
            dados.get("policiais_requisitados", []),
            dados.get("data_audiencia"),
        )

        tem_pendencia = any(r["status"] in ("nao_encontrado", "ambiguo") for r in cruzamento)
        texto_resposta = None if tem_pendencia else gerar_oficio_resposta(dados, cruzamento)

        oficio_id = salvar_oficio(item["nome_arquivo"], dados, cruzamento, texto_resposta)

        _sb.table("oficios_fila").update({
            "status": "concluido",
            "oficio_id": oficio_id,
            "atualizado_em": "now()",
        }).eq("id", item_id).execute()

        print(f"  -> OK, virou o ofício #{oficio_id}" + (" (com pendência)" if tem_pendencia else " (pronto)"))

    except Exception as e:
        print(f"  -> ERRO: {e}")
        _sb.table("oficios_fila").update({
            "status": "erro",
            "mensagem_erro": str(e)[:2000],
            "atualizado_em": "now()",
        }).eq("id", item_id).execute()

    finally:
        if caminho_tmp and os.path.exists(caminho_tmp):
            os.unlink(caminho_tmp)


def rodar():
    print(f"Observando a fila de ofícios a cada {INTERVALO_SEGUNDOS}s... (Ctrl+C para parar)")
    while True:
        resp = _sb.table("oficios_fila").select("*").eq("status", "aguardando").execute()
        for item in (resp.data or []):
            processar_item_da_fila(item)
        time.sleep(INTERVALO_SEGUNDOS)


if __name__ == "__main__":
    try:
        rodar()
    except KeyboardInterrupt:
        print("\nParado.")

# ------------------------------------------------------------------
# Pra deixar isso rodando sempre, sem precisar de terminal aberto:
# no Windows, use o Agendador de Tarefas (Task Scheduler) criando uma
# tarefa que executa "pythonw.exe watcher.py" ao iniciar o sistema
# (pythonw, não python, roda sem abrir janela de console).
# ------------------------------------------------------------------
