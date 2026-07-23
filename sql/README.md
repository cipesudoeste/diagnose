# Scripts SQL — configuração do Supabase

Esses arquivos **não são carregados pelo site** (nenhuma página faz
`<script src="sql/...">`) — são só os comandos que você roda **uma vez**,
direto no **SQL Editor** do Supabase, pra criar as tabelas e permissões que
cada funcionalidade precisa. Depois de rodado, o script já cumpriu seu papel;
fica aqui só como referência/histórico.

| Arquivo | Cria | Usado por |
|---|---|---|
| `supabase_setup.sql` | tabela `painel_data` (roster do Efetivo + metas QO) | `efetivo.html` |
| `viaturas_setup.sql` | tabela `viaturas_data` (frota, ocorrências, documentos) | `viaturas.html` |
| `viaturas_storage_setup.sql` | bucket de Storage `viaturas-anexos` + políticas | `viaturas.html` (upload de PDFs/imagens) |
| `cadastro_setup.sql` | tabela `cadastros_ingresso` + bucket `cadastros-anexos` | `cadastro.html` / `formulario.html` |
| `fix_rls_cadastros.sql` | corrige políticas de leitura de `cadastros_ingresso` (usado uma vez, em caso de manutenção) | — |
| `importar_cadastros.sql` | importação pontual dos 98 cadastros históricos do JotForm | já executado — histórico |

## Se for montar o projeto do zero (ex: outro ambiente/projeto Supabase)

Rode nessa ordem:

1. `supabase_setup.sql`
2. `viaturas_setup.sql`
3. `viaturas_storage_setup.sql` (+ criar o bucket `viaturas-anexos` manualmente no painel, como "Public")
4. `cadastro_setup.sql` (+ criar o bucket `cadastros-anexos` manualmente, como "Public")

Depois, cole a URL e a chave "anon public" do projeto em cada um dos arquivos
`*-config.js` da raiz (`efetivo-config.js`, `viaturas-config.js`,
`cadastro-config.js` — esse último é compartilhado entre `cadastro.html` e
`formulario.html`).
