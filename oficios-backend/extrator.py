"""
Extração de dados de um ofício de requisição:

1) extrair_texto_pdf   -> PDF (nativo ou escaneado) para texto puro
2) extrair_dados_oficio -> texto para JSON estruturado (via Gemini)

Usa só bibliotecas Python (pdfplumber / PyMuPDF) — sem depender de
instalar o Poppler à parte no Windows. Só o OCR (pytesseract) exige
instalar o Tesseract separadamente, e só entra em ação para ofícios
físicos escaneados (a maioria, que vem por e-mail do PJE, nunca chega
a precisar disso).
"""
import pdfplumber
import pymupdf as fitz  # PyMuPDF (nome novo do pacote; "fitz" está sendo descontinuado)
from google import genai
from pydantic import BaseModel
from typing import Optional, List, Literal

from config import GEMINI_API_KEY

_client = genai.Client(api_key=GEMINI_API_KEY)
_MODEL = "gemini-flash-latest"  # sempre a versão Flash estável mais recente


# ------------------------------------------------------------------
# 1) PDF -> texto
# ------------------------------------------------------------------
def extrair_texto_pdf(caminho_pdf: str) -> str:
    """
    Tenta extração de texto nativo primeiro (pdfplumber — rápido e
    confiável para ofícios gerados pelo PJE/SEI, que já nascem
    digitais). Se o resultado vier vazio ou curto demais (sinal de PDF
    escaneado, sem camada de texto — caso dos ofícios físicos
    digitalizados), cai para OCR das páginas rasterizadas.
    """
    texto = _texto_nativo(caminho_pdf)
    if len(texto.strip()) >= 200:
        return texto

    # PDF provavelmente escaneado (ofício físico digitalizado) -> OCR
    return _ocr_pdf(caminho_pdf)


def _texto_nativo(caminho_pdf: str) -> str:
    partes = []
    with pdfplumber.open(caminho_pdf) as pdf:
        for pagina in pdf.pages:
            partes.append(pagina.extract_text() or "")
    return "\n\n".join(partes)


def _ocr_pdf(caminho_pdf: str) -> str:
    """
    Requer o Tesseract instalado no sistema (não é só `pip install`):
    Windows: https://github.com/UB-Mannheim/tesseract/wiki
    Depois de instalar, garanta que o idioma "por" (português) está
    disponível, e que o executável está no PATH (ou aponte
    pytesseract.pytesseract.tesseract_cmd pro .exe manualmente).
    """
    import pytesseract
    from PIL import Image
    import io

    doc = fitz.open(caminho_pdf)
    textos = []
    for pagina in doc:
        pix = pagina.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        textos.append(pytesseract.image_to_string(img, lang="por"))
    doc.close()
    return "\n\n".join(textos)


# ------------------------------------------------------------------
# 2) Texto -> dados estruturados
# ------------------------------------------------------------------
# O schema é definido como classes Pydantic — o Gemini garante que a
# resposta sempre bate com esse formato (não precisa mais torcer pra
# vir um JSON válido nem tirar ```json na unha).
class PolicialRequisitado(BaseModel):
    nome: str                                  # nome completo, como está no ofício
    matricula_bruta: Optional[str] = None      # exatamente como aparece (com pontuação)
    posto_mencionado: Optional[str] = None     # posto/graduação, se o ofício mencionar


class DadosOficio(BaseModel):
    numero_oficio: Optional[str] = None            # ex: "1.237/2026" ou "444/2026"
    data_oficio: Optional[str] = None              # formato YYYY-MM-DD
    comarca: Optional[str] = None                  # ex: "Itapetinga"
    vara: Optional[str] = None
    processo_numero: Optional[str] = None          # número CNJ do processo
    assunto: Optional[str] = None
    data_audiencia: Optional[str] = None           # formato YYYY-MM-DD
    hora_audiencia: Optional[str] = None           # formato HH:MM (24h)
    modalidade: Literal["presencial", "videoconferencia", "hibrida", "nao_informado"]
    link_videoconferencia: Optional[str] = None
    juiz_nome: Optional[str] = None                 # nome do(a) juiz(a), sem título
    juiz_genero: Optional[Literal["masculino", "feminino"]] = None  # inferido de "Dr./Dra.", "Juiz/Juíza"
    endereco_forum: Optional[str] = None            # endereço completo do fórum/vara
    telefone_forum: Optional[str] = None
    email_forum: Optional[str] = None
    observacoes_relevantes: Optional[str] = None   # ex: pedido de aviso prévio sobre férias/reserva
    policiais_requisitados: List[PolicialRequisitado]


PROMPT_BASE = """
Extraia os dados do ofício de requisição de policial(is) para audiência
abaixo, seguindo o schema fornecido.

Regras importantes:
- Datas por extenso (ex: "26 de agosto de 2026") devem virar "2026-08-26".
- Se houver mais de um policial requisitado, liste todos.
- Não invente informação: se um campo não aparece no texto, deixe null.
- "modalidade": use "videoconferencia" se houver link/plataforma online
  mencionada como forma principal; "hibrida" se o texto permitir optar
  entre online e presencial; "presencial" se só menciona comparecimento
  físico; "nao_informado" se não ficar claro.
- "juiz_genero": infira pelo tratamento usado no texto ("Dr./Juiz" =
  masculino, "Dra./Juíza" = feminino). Se não conseguir inferir, null.
- "endereco_forum", "telefone_forum", "email_forum": tirados do
  cabeçalho do ofício (geralmente logo abaixo do nome da comarca/vara).

--- TEXTO DO OFÍCIO ---
"""


def extrair_dados_oficio(texto_oficio: str) -> dict:
    interaction = _client.interactions.create(
        model=_MODEL,
        input=PROMPT_BASE + texto_oficio,
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": DadosOficio.model_json_schema(),
        },
    )
    dados = DadosOficio.model_validate_json(interaction.output_text)
    return dados.model_dump()
