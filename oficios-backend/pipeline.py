"""
Ponto de entrada do "cérebro" — recebe um PDF de ofício de requisição,
extrai os dados, cruza com o efetivo, gera o texto de resposta quando
possível, e grava tudo no Supabase (tabelas `oficios` e
`oficios_policiais`) — é de lá que o site (Histórico/Agenda/
Pendências) lê. Ainda NÃO mexe no SEI nem manda e-mail.
"""
import sys

from extrator import extrair_texto_pdf, extrair_dados_oficio
from cruzamento import cruzar_policiais
from gerador import gerar_oficio_resposta
from persistencia import salvar_oficio


def processar_oficio(caminho_pdf: str) -> int:
    """Retorna o id do ofício salvo em `oficios`."""
    print(f"[1/4] Extraindo texto de: {caminho_pdf}")
    texto = extrair_texto_pdf(caminho_pdf)

    print("[2/4] Extraindo dados estruturados (LLM)...")
    dados = extrair_dados_oficio(texto)

    print("[3/4] Cruzando policiais com o efetivo...")
    cruzamento = cruzar_policiais(
        dados.get("policiais_requisitados", []),
        dados.get("data_audiencia"),
    )

    tem_pendencia = any(r["status"] in ("nao_encontrado", "ambiguo") for r in cruzamento)
    texto_resposta = None
    if tem_pendencia:
        print("[4/4] Há pendência humana — salvando sem gerar o texto ainda. Resolva no site (aba Pendências).")
    else:
        print("[4/4] Gerando ofício de resposta...")
        texto_resposta = gerar_oficio_resposta(dados, cruzamento)

    oficio_id = salvar_oficio(caminho_pdf, dados, cruzamento, texto_resposta)
    print(f"\nSalvo no Supabase: ofício #{oficio_id}. Confira em oficios.html no site.")
    return oficio_id


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python pipeline.py caminho/para/oficio.pdf")
        sys.exit(1)

    processar_oficio(sys.argv[1])
