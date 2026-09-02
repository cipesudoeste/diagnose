"""
Grava o resultado do processamento de um ofício no Supabase, pra
alimentar as telas de Histórico, Agenda e Pendências no site.
"""
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

_sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def salvar_oficio(caminho_pdf: str, dados_oficio: dict, cruzamento: list[dict], texto_resposta: str | None) -> int:
    """
    Cria o registro em `oficios` + uma linha por policial em
    `oficios_policiais`. Retorna o id do ofício criado.
    """
    tem_pendencia = any(r["status"] in ("nao_encontrado", "ambiguo") for r in cruzamento)
    status = "pendente" if tem_pendencia else ("pronto" if texto_resposta else "pendente")

    linha_oficio = {
        "arquivo_origem": caminho_pdf,
        "numero_oficio": dados_oficio.get("numero_oficio"),
        "data_oficio": dados_oficio.get("data_oficio"),
        "comarca": dados_oficio.get("comarca"),
        "vara": dados_oficio.get("vara"),
        "processo_numero": dados_oficio.get("processo_numero"),
        "assunto": dados_oficio.get("assunto"),
        "data_audiencia": dados_oficio.get("data_audiencia"),
        "hora_audiencia": dados_oficio.get("hora_audiencia"),
        "modalidade": dados_oficio.get("modalidade"),
        "link_videoconferencia": dados_oficio.get("link_videoconferencia"),
        "juiz_nome": dados_oficio.get("juiz_nome"),
        "juiz_genero": dados_oficio.get("juiz_genero"),
        "endereco_forum": dados_oficio.get("endereco_forum"),
        "telefone_forum": dados_oficio.get("telefone_forum"),
        "email_forum": dados_oficio.get("email_forum"),
        "observacoes_relevantes": dados_oficio.get("observacoes_relevantes"),
        "status": status,
        "texto_resposta": texto_resposta,
    }
    resp = _sb.table("oficios").insert(linha_oficio).select().execute()
    oficio_id = resp.data[0]["id"]

    linhas_policiais = []
    for r in cruzamento:
        linha = {
            "oficio_id": oficio_id,
            "nome_oficio": r.get("nome_oficio"),
            "matricula_oficio": r.get("matricula_oficio"),
            "posto_mencionado": r.get("posto_mencionado"),
            "status": r["status"],
            "matricula": r.get("policial", {}).get("matricula") if r.get("policial") else None,
        }
        linhas_policiais.append(linha)

    if linhas_policiais:
        _sb.table("oficios_policiais").insert(linhas_policiais).execute()

    return oficio_id
