# CIPE Sudoeste — Mapas Operacionais e Sistemas Internos

Site estático (HTML + CSS + JavaScript puro — sem build, sem framework),
hospedado no Vercel com deploy automático a partir do GitHub. Usa o
[Supabase](https://supabase.com) como banco de dados/armazenamento onde
alguma página precisa salvar informação.

## Páginas

| Página | O que é | Arquivos |
|---|---|---|
| `index.html` | Página inicial — cards de acesso às demais seções | `styles.css` |
| `area-responsabilidade.html` | Mapa da área de responsabilidade (Leaflet) | `data_bahia.js`, `data_regioes.js` |
| `eixos-atuacao.html` | Mapa dos eixos de atuação (Leaflet) | `data_bahia.js`, `data_eixos.js` |
| `efetivo.html` | Painel de Efetivo — diagnose x QO, base de dados, exportação em PDF | `efetivo.css`, `efetivo.js`, `efetivo-config.js`, `data_efetivo.js` |
| `viaturas.html` | Controle de Viaturas — frota, ocorrências, documentos, indisponibilidade | `viaturas.css`, `viaturas.js`, `viaturas-config.js`, `data_viaturas.js` |
| `cadastro.html` | Gerenciamento de Cadastros (uso interno/admin) — consulta os cadastros recebidos | `cadastro.css`, `cadastro.js`, `cadastro-config.js` |
| `formulario.html` | Formulário público de Atualização Cadastral — link enviado aos policiais que ingressam | `cadastro.css`, `formulario.js`, `cadastro-config.js` |

`styles.css` é compartilhado por **todas** as páginas (tema visual,
tipografia, camuflagem em CSS puro, componentes de cabeçalho/cards).

## Pastas

- **`img/`** — logos (CIPE Sudoeste, PMBA) usados no cabeçalho de todas as páginas
- **`sql/`** — scripts de configuração do banco (Supabase), rodados uma única vez — ver `sql/README.md`
- **`docs/`** — anotações específicas de alguma funcionalidade

## Favicons

`favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`,
`icon-192.png`, `icon-512.png` e `site.webmanifest` — gerados a partir do
brasão da CIPE Sudoeste, referenciados no `<head>` de cada página.

## Banco de dados (Supabase)

Três tabelas, uma por funcionalidade que precisa persistir dados — ver
detalhes e ordem de criação em [`sql/README.md`](sql/README.md):

- `painel_data` (Efetivo)
- `viaturas_data` (Viaturas)
- `cadastros_ingresso` (Cadastro de Ingressantes)

Cada `*-config.js` da raiz guarda a URL e a chave pública (`anon`) do projeto
Supabase — a mesma em todos, pode copiar de um arquivo pro outro.

O formulário público (`formulario.html`) também usa o **Supabase Auth (Email
OTP)** para confirmar a identidade de quem está atualizando um cadastro já
existente, antes de liberar o preenchimento.

## Publicar alterações

```powershell
git add .
git commit -m "descrição da mudança"
git push
```

O Vercel republica automaticamente a cada `push` — não precisa mexer em nada
no painel do Vercel.
