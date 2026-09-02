"""
Roda periodicamente (ou sob demanda) pra verificar se alguma
pendência foi resolvida no site (campo `unidade_destino_nome`
preenchido em `oficios_policiais`) e, se sim, gera o texto de
resposta e marca o ofício como "pronto".

Uso: python reprocessar_pendencias.py
"""
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY
from gerador import gerar_oficio_resposta

_sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def _dados_oficio_de(linha_oficio: dict) -> dict:
    campos = [
        "numero_oficio", "data_oficio", "comarca", "vara", "processo_numero",
        "assunto", "data_audiencia", "hora_audiencia", "modalidade",
        "link_videoconferencia", "juiz_nome", "juiz_genero",
        "endereco_forum", "telefone_forum", "email_forum", "observacoes_relevantes",
    ]
    return {c: linha_oficio.get(c) for c in campos}


def _reconstroi_cruzamento(oficio_id: int) -> tuple[list[dict], dict]:
    """Recria a estrutura que gerar_oficio_resposta espera, a partir do banco."""
    resp = _sb.table("oficios_policiais").select("*").eq("oficio_id", oficio_id).execute()
    linhas = resp.data or []

    cruzamento = []
    unidades_destino = {}

    for linha in linhas:
        item = {
            "nome_oficio": linha["nome_oficio"],
            "matricula_oficio": linha["matricula_oficio"],
            "posto_mencionado": linha["posto_mencionado"],
            "status": linha["status"],
        }
        if linha["status"] in ("apresentar", "ferias") and linha.get("matricula"):
            pol = _sb.table("policiais").select("matricula, nome, posto, telefone1").eq(
                "matricula", linha["matricula"]
            ).single().execute()
            item["policial"] = pol.data
        cruzamento.append(item)

        if linha["status"] == "nao_encontrado" and linha.get("unidade_destino_nome"):
            unidades_destino[linha["nome_oficio"]] = {
                "nome": linha["unidade_destino_nome"],
                "endereco": linha.get("unidade_destino_endereco"),
                "email": linha.get("unidade_destino_email"),
                "telefone": linha.get("unidade_destino_telefone"),
            }

    return cruzamento, unidades_destino


def reprocessar_pendentes():
    resp = _sb.table("oficios").select("*").eq("status", "pendente").execute()
    oficios_pendentes = resp.data or []

    if not oficios_pendentes:
        print("Nenhum ofício pendente.")
        return

    for linha_oficio in oficios_pendentes:
        oficio_id = linha_oficio["id"]
        cruzamento, unidades_destino = _reconstroi_cruzamento(oficio_id)

        ainda_pendente = any(
            r["status"] in ("nao_encontrado", "ambiguo") and r["nome_oficio"] not in unidades_destino
            for r in cruzamento
        )
        if ainda_pendente:
            print(f"Ofício #{oficio_id} ({linha_oficio.get('numero_oficio')}): ainda tem pendência sem resolver.")
            continue

        dados_oficio = _dados_oficio_de(linha_oficio)
        texto = gerar_oficio_resposta(dados_oficio, cruzamento, unidades_destino)

        _sb.table("oficios").update({
            "status": "pronto",
            "texto_resposta": texto,
        }).eq("id", oficio_id).execute()

        for nome, _ in unidades_destino.items():
            _sb.table("oficios_policiais").update({
                "resolvido_em": "now()",
            }).eq("oficio_id", oficio_id).eq("nome_oficio", nome).execute()

        print(f"Ofício #{oficio_id} ({linha_oficio.get('numero_oficio')}): texto gerado, status -> pronto.")


if __name__ == "__main__":
    reprocessar_pendentes()
