"""
Gera o texto do ofício de resposta (apresentação de policial /
impossibilidade por férias / não pertence à unidade / reserva
remunerada), no formato real usado pela CIPE Sudoeste.

Este módulo só produz TEXTO — a criação do documento dentro do SEI
propriamente dita (upload/preenchimento) é a próxima peça, ainda não
construída.
"""
from datetime import datetime

from config import UNIDADE_SIGLA, UNIDADE_CIDADE, COMANDANTE_NOME, COMANDANTE_POSTO

MESES = [
    "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def _data_por_extenso(data_iso: str | None) -> str:
    if not data_iso:
        return "____"
    d = datetime.strptime(data_iso, "%Y-%m-%d")
    return f"{d.day:02d} de {MESES[d.month]} de {d.year}"


def _nome_mes(data_iso: str | None) -> str:
    if not data_iso:
        return "____"
    d = datetime.strptime(data_iso, "%Y-%m-%d")
    return MESES[d.month]


def _formatar_matricula(matricula: str) -> str:
    """'30389620' -> '30.389.620' (padrão usado nos ofícios reais)."""
    m = matricula
    if len(m) >= 8:
        return f"{m[:2]}.{m[2:5]}.{m[5:8]}" + (m[8:] and f"-{m[8:]}" or "")
    return m


def _saudacao(genero: str | None) -> tuple[str, str]:
    """Retorna (vocativo, 'Juiz'/'Juíza') de acordo com o gênero informado."""
    if genero == "feminino":
        return "Excelentíssima Senhora Juíza", "Juíza"
    if genero == "masculino":
        return "Excelentíssimo Senhor Juiz", "Juiz"
    return "Excelentíssimo(a) Senhor(a) Juiz(a)", "Juiz(a)"


def _assunto(dados_oficio: dict) -> str:
    assunto_original = (dados_oficio.get("assunto") or "").lower()
    if "julgamento" in assunto_original:
        return "Apresentação de Policial Militar para Audiência de Instrução e Julgamento."
    return "Apresentação de Policial Militar para Audiência de Instrução."


def _bloco_apresentar(apresentar: list[dict], dados_oficio: dict) -> str:
    """Monta o parágrafo de abertura + tabela dos policiais a apresentar."""
    linhas_tabela = "\n".join(
        f"| {r['policial']['posto']} | {r['policial']['nome']} | "
        f"{_formatar_matricula(r['policial']['matricula'])} | "
        f"{r['policial'].get('telefone1') or '(a preencher)'} |"
        for r in apresentar
    )

    modalidade = dados_oficio.get("modalidade")
    if modalidade == "videoconferencia":
        forma_participacao = (
            "para fins de participação remota na audiência designada, mediante "
            "acesso à sala de audiência virtual, por meio do link disponibilizado "
            "pelo TJBA (AUDINPlay):"
        )
    else:
        forma_participacao = "para fins de participação na audiência designada:"

    abertura = (
        f"Em atenção ao Processo nº {dados_oficio.get('processo_numero', '____')}, "
        f"oriundo dessa {dados_oficio.get('vara', '____')} da Comarca de "
        f"{dados_oficio.get('comarca', '____')}, apresento a V. Ex.ª o(s) Policial(is) "
        f"Militar(es) abaixo relacionado(s), pertencente(s) a esta UOE, {forma_participacao}"
    )

    tabela = (
        "\n| GH | NOME | MATRÍCULA | WHATSAPP |\n"
        "|---|---|---|---|\n"
        f"{linhas_tabela}\n"
        "\n"
        f"| Data: | {_data_por_extenso(dados_oficio.get('data_audiencia'))} |\n"
        f"| Horário: | {dados_oficio.get('hora_audiencia', '____')} |\n"
        f"| Modalidade: | {'Virtual' if modalidade == 'videoconferencia' else 'Presencial'} |"
    )
    if modalidade == "videoconferencia":
        tabela += f"\n| Link: | {dados_oficio.get('link_videoconferencia', '(link a inserir)')} |"

    return abertura + "\n" + tabela


def _paragrafo_ferias(item: dict, data_audiencia: str) -> str:
    p = item["policial"]
    conectivo = "Outrossim, informo"
    return (
        f"{conectivo} a impossibilidade de apresentação do(a) {p['posto']} "
        f"{p['nome']}, matrícula nº {_formatar_matricula(p['matricula'])}, em razão de "
        f"encontrar-se em gozo de férias regulamentares no mês de "
        f"{_nome_mes(data_audiencia)}."
    )


def _paragrafo_nao_pertence(item: dict, unidade_destino: dict) -> str:
    """
    `unidade_destino` é preenchido MANUALMENTE (pendência humana) com:
    {"nome": "...", "endereco": "...", "email": "...", "telefone": "..."}
    """
    nome_oficio = item["nome_oficio"]
    matricula = item.get("matricula_oficio", "____")
    posto = item.get("posto_mencionado")
    identificacao = f"{posto + ' ' if posto else ''}{nome_oficio}"
    partes = [
        f"Outrossim, informo a impossibilidade de apresentação de {identificacao}, "
        f"matrícula nº {matricula}, por não mais pertencer ao efetivo desta UOE, "
        f"encontrando-se atualmente lotado na {unidade_destino['nome']}"
        + (f", situado na {unidade_destino['endereco']}." if unidade_destino.get("endereco") else "."),
    ]
    if unidade_destino.get("email") or unidade_destino.get("telefone"):
        contatos = "Para eventuais providências, seguem os contatos da referida Unidade:\n"
        if unidade_destino.get("email"):
            contatos += f"E-mail: {unidade_destino['email']}\n"
        if unidade_destino.get("telefone"):
            contatos += f"Telefone: {unidade_destino['telefone']}"
        partes.append(contatos)
    return "\n\n".join(partes)


def _paragrafo_reserva(item: dict) -> str:
    p = item["policial"]
    return (
        f"Outrossim, informo a impossibilidade de apresentação do(a) {p['posto']} "
        f"RR {p['nome']}, matrícula nº {_formatar_matricula(p['matricula'])}, tendo em "
        f"vista que o mesmo encontra-se atualmente na RESERVA REMUNERADA, tendo como "
        f"Órgão responsável o DP – DEPARTAMENTO DE PESSOAL - Setor de Inativos "
        f"(dp.diretor@pm.ba.gov.br)."
    )


def gerar_oficio_resposta(
    dados_oficio: dict,
    cruzamento: list[dict],
    unidades_destino: dict[str, dict] | None = None,
) -> str:
    """
    `cruzamento` é a saída de cruzamento.cruzar_policiais().
    `unidades_destino` mapeia nome_oficio -> {"nome","endereco","email","telefone"}
    para os casos "nao_encontrado" já resolvidos manualmente (pendência).
    Um "nao_encontrado" SEM entrada em `unidades_destino` é pulado (ainda
    pendente) — chame de novo depois que a pendência for resolvida.
    """
    unidades_destino = unidades_destino or {}

    apresentar = [r for r in cruzamento if r["status"] == "apresentar"]
    de_ferias = [r for r in cruzamento if r["status"] == "ferias"]
    nao_encontrados = [r for r in cruzamento if r["status"] == "nao_encontrado"]
    ambiguos = [r for r in cruzamento if r["status"] == "ambiguo"]

    pendentes = [r["nome_oficio"] for r in nao_encontrados if r["nome_oficio"] not in unidades_destino]
    pendentes += [r["nome_oficio"] for r in ambiguos]
    if pendentes:
        raise ValueError(
            "Ainda há pendência humana não resolvida para: " + ", ".join(pendentes) +
            ". Resolva antes de gerar o ofício final (veja `unidades_destino`)."
        )

    genero = dados_oficio.get("juiz_genero")
    vocativo, titulo_juiz = _saudacao(genero)

    partes = [
        f"GOVERNO DO ESTADO DA BAHIA\nPOLÍCIA MILITAR DA BAHIA - PMBA\n"
        f"COMPANHIA INDEPENDENTE DE POLICIAMENTO ESPECIALIZADO SUDOESTE - PMBA/CIPE-SUDOESTE",
        f"Oficio nº [preenchido automaticamente pelo SEI]/{UNIDADE_SIGLA}",
        f"{UNIDADE_CIDADE}/BA, {_data_por_extenso(datetime.now().strftime('%Y-%m-%d'))}.",
        f"Assunto: {_assunto(dados_oficio)}",
        f"{vocativo},",
    ]

    if apresentar:
        partes.append(_bloco_apresentar(apresentar, dados_oficio))

    for r in de_ferias:
        partes.append(_paragrafo_ferias(r, dados_oficio.get("data_audiencia")))

    for r in nao_encontrados:
        partes.append(_paragrafo_nao_pertence(r, unidades_destino[r["nome_oficio"]]))

    partes.append("Respeitosamente,")
    partes.append(f"{COMANDANTE_NOME} - {COMANDANTE_POSTO}\nComandante")

    if genero == "feminino":
        cabecalho_destinatario = "À Excelentíssima Senhora"
    elif genero == "masculino":
        cabecalho_destinatario = "Ao Excelentíssimo Senhor"
    else:
        cabecalho_destinatario = "A Sua Excelência o(a) Senhor(a)"

    endereco_bloco = [
        cabecalho_destinatario,
        f"{titulo_juiz} de Direito {dados_oficio.get('juiz_nome', '____')}",
        f"{dados_oficio.get('vara', '____')} da Comarca de {dados_oficio.get('comarca', '____')}",
    ]
    if dados_oficio.get("endereco_forum"):
        endereco_bloco.append(dados_oficio["endereco_forum"])
    if dados_oficio.get("telefone_forum"):
        endereco_bloco.append(f"Fone: {dados_oficio['telefone_forum']}")
    endereco_bloco.append(f"{dados_oficio.get('comarca', '____')}/BA")
    partes.append("\n".join(endereco_bloco))

    return "\n\n".join(partes)
