"""
Cruza cada policial extraído do ofício com a tabela `policiais`
(efetivo da unidade) e, se encontrado, verifica `ferias` na data da
audiência.
"""
import re
import unicodedata
from datetime import date
from difflib import SequenceMatcher

from supabase import create_client
from config import SUPABASE_URL, SUPABASE_KEY

_sb = create_client(SUPABASE_URL, SUPABASE_KEY)

LIMIAR_SIMILARIDADE_NOME = 0.90  # 0-1; abaixo disso não considera "achado" por nome


def normalizar_matricula(m: str | None) -> str:
    """Mantém só dígitos. '30.338.424-4' -> '303384244'."""
    return re.sub(r"\D", "", m or "")


def normalizar_nome(n: str | None) -> str:
    n = (n or "").upper().strip()
    n = unicodedata.normalize("NFD", n)
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")  # remove acentos
    return re.sub(r"\s+", " ", n)


def _carregar_efetivo() -> list[dict]:
    """Carrega todo o efetivo uma vez (é pequeno, ~100-300 linhas)."""
    resp = _sb.table("policiais").select("matricula, nome, posto, telefone1, ativo").execute()
    return resp.data or []


def buscar_policial(nome_oficio: str, matricula_bruta: str | None, efetivo: list[dict]) -> dict:
    """
    Tenta casar um policial citado no ofício com um registro em
    `policiais`. Estratégia, em ordem:
      1) matrícula normalizada, igual exata
      2) matrícula normalizada, ignorando o último dígito (verificador,
         já que os ofícios do TJ costumam incluir um dígito que não
         está salvo na nossa base)
      3) nome normalizado, similaridade alta (>= LIMIAR_SIMILARIDADE_NOME)

    Retorna:
      {"status": "encontrado", "policial": {...}, "metodo": "matricula"|"nome"}
      {"status": "nao_encontrado"}
      {"status": "ambiguo", "candidatos": [...]}   # nome bateu em mais de um
    """
    mat_oficio = normalizar_matricula(matricula_bruta)
    nome_oficio_norm = normalizar_nome(nome_oficio)

    if mat_oficio:
        for p in efetivo:
            if normalizar_matricula(p["matricula"]) == mat_oficio:
                return {"status": "encontrado", "policial": p, "metodo": "matricula"}

        if len(mat_oficio) > 8:
            mat_sem_verificador = mat_oficio[:-1]
            for p in efetivo:
                if normalizar_matricula(p["matricula"]) == mat_sem_verificador:
                    return {"status": "encontrado", "policial": p, "metodo": "matricula (sem dígito verificador)"}

    candidatos = []
    for p in efetivo:
        score = SequenceMatcher(None, nome_oficio_norm, normalizar_nome(p["nome"])).ratio()
        if score >= LIMIAR_SIMILARIDADE_NOME:
            candidatos.append((score, p))

    if len(candidatos) == 1:
        return {"status": "encontrado", "policial": candidatos[0][1], "metodo": "nome"}
    if len(candidatos) > 1:
        candidatos.sort(key=lambda x: -x[0])
        return {"status": "ambiguo", "candidatos": [c[1] for c in candidatos]}

    return {"status": "nao_encontrado"}


def verificar_ferias(matricula: str, data_audiencia: str | None) -> dict | None:
    """
    Retorna o período de férias que cobre `data_audiencia`, se existir.
    `data_audiencia` no formato 'YYYY-MM-DD'. Se não informada, não dá
    pra checar — retorna None (trata como "sem informação").
    """
    if not data_audiencia:
        return None

    resp = (
        _sb.table("ferias")
        .select("*")
        .eq("matricula", matricula)
        .lte("data_inicio", data_audiencia)
        .gte("data_fim", data_audiencia)
        .execute()
    )
    return resp.data[0] if resp.data else None


def cruzar_policiais(policiais_extraidos: list[dict], data_audiencia: str | None) -> list[dict]:
    """
    Recebe a lista `policiais_requisitados` que veio do extrator e
    devolve, pra cada um, o resultado do cruzamento + status final:

      - "apresentar"     -> é da unidade, sem férias na data
      - "ferias"          -> é da unidade, mas está de férias na data
      - "nao_encontrado"  -> não está no efetivo -> pendência humana
      - "ambiguo"         -> nome bateu em mais de um -> pendência humana
    """
    efetivo = _carregar_efetivo()
    resultados = []

    for item in policiais_extraidos:
        achado = buscar_policial(item.get("nome"), item.get("matricula_bruta"), efetivo)

        if achado["status"] == "encontrado":
            policial = achado["policial"]
            ferias = verificar_ferias(policial["matricula"], data_audiencia)
            status_final = "ferias" if ferias else "apresentar"
            resultados.append({
                "nome_oficio": item.get("nome"),
                "matricula_oficio": item.get("matricula_bruta"),
                "posto_mencionado": item.get("posto_mencionado"),
                "status": status_final,
                "policial": policial,
                "metodo_match": achado["metodo"],
                "ferias": ferias,
            })
        else:
            resultados.append({
                "nome_oficio": item.get("nome"),
                "matricula_oficio": item.get("matricula_bruta"),
                "posto_mencionado": item.get("posto_mencionado"),
                "status": achado["status"],  # "nao_encontrado" ou "ambiguo"
                "candidatos": achado.get("candidatos"),
            })

    return resultados
