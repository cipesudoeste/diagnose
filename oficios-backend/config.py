"""
Configuração central — lê tudo de variáveis de ambiente.

Antes de rodar qualquer script, crie um arquivo `.env` (copie de
`.env.example`) com os valores reais. NUNCA commite o `.env` de
verdade no Git — ele fica no .gitignore.
"""
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://eelvzwremmzrpilkgmqg.supabase.co")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]          # anon key (mesma do site) ou service_role
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]       # console: aistudio.google.com/apikey

# Pasta onde ficam os PDFs recebidos (físicos digitalizados ou
# anexos baixados de e-mail) enquanto ainda não foram processados.
PASTA_ENTRADA = os.environ.get("PASTA_ENTRADA", "./oficios_entrada")

# Pasta onde ficam os ofícios de resposta gerados (antes de subir no SEI).
PASTA_SAIDA = os.environ.get("PASTA_SAIDA", "./oficios_saida")

# --------------------------------------------------------------
# Dados fixos da unidade, usados no gerador do ofício de resposta.
# Ajuste aqui se o comandante ou a cidade mudarem — não precisa
# tocar no gerador.py.
# --------------------------------------------------------------
UNIDADE_SIGLA = "SRHS - PMBA/CIPE-SUDOESTE"
UNIDADE_CIDADE = "Vitória da Conquista"
COMANDANTE_NOME = "GILBERTO JOSÉ DA SILVA FILHO"
COMANDANTE_POSTO = "MAJ PM"
