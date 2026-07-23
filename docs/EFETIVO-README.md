# Painel de Efetivo — integrado ao site Mapas Operacionais

Nova página `efetivo.html`, construída na mesma stack do site (HTML/CSS/JS puro,
sem build, sem framework) e com a mesma identidade visual (`styles.css`).

## Arquivos adicionados

```
efetivo.html          -> a página em si (Diagnose / Efetivo / Metas)
efetivo.css           -> estilos específicos desta página (usa as variáveis de styles.css)
efetivo.js            -> toda a lógica (cálculo de diagnose, tabela editável, PDF, Supabase)
data_efetivo.js        -> efetivo inicial (semente) e metas padrão do QO
efetivo-config.js       -> onde você cola a URL e a chave do Supabase
supabase_setup.sql      -> script para criar a tabela no Supabase
```

O `index.html` já foi atualizado com um novo card "Painel de Efetivo" (nº 03),
e o card "Unidades Apoiadas" passou a ser o nº 04.

## 1. Criar o banco de dados (Supabase — gratuito)

1. Acesse https://supabase.com, crie uma conta e um novo projeto.
2. No menu lateral, abra **SQL Editor → New query**, cole o conteúdo de
   `supabase_setup.sql` e clique em **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.
4. Abra `efetivo-config.js` e cole os dois valores:

```js
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "sua-chave-anon-public";
```

Sem isso, a página ainda funciona (mostra o efetivo inicial e permite editar),
mas as alterações não são salvas entre sessões — ela roda "offline" com os
dados de exemplo.

## 2. Testar localmente

Como é um site estático, basta abrir com um servidor simples (não dá para abrir
o `.html` direto no navegador por causa do `fetch`/módulos do Supabase):

```bash
npx serve .
# ou
python3 -m http.server 8000
```

Acesse `http://localhost:3000` (ou 8000) e clique no card "Painel de Efetivo".

## 3. Publicar

Como o projeto já está no GitHub e conectado ao Vercel, basta:

```bash
git add .
git commit -m "Adiciona Painel de Efetivo"
git push
```

O Vercel republica automaticamente — nenhuma configuração nova é necessária
no painel do Vercel (não há variáveis de ambiente aqui, pois é um site
estático: a chave do Supabase já vai embutida em `efetivo-config.js`).

> A chave "anon public" do Supabase é feita para ser pública — a segurança
> fica por conta das *policies* do banco (arquivo `supabase_setup.sql`). Se
> quiser exigir login para editar, é possível adicionar Supabase Auth depois.

## Como funciona a página

- **Diagnose**: cards de resumo, gráfico (SVG puro) e tabela comparando o QO
  com o efetivo real, calculados automaticamente a partir da lista de nomes.
- **Efetivo**: tabela editável (adicionar linha, editar posto/nome/matrícula,
  remover, ou colar em lote no formato `POSTO [tab] NOME [tab] MATRÍCULA`).
- **Metas (QO)**: os números previstos por posto/graduação, editáveis.
- **Exportar PDF**: usa a impressão do navegador (`window.print()`) com uma
  versão clara e formatada da Diagnose, independente da aba que estiver aberta.

Todas as alterações são salvas automaticamente no Supabase (~0,5s de debounce).
