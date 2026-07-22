-- ===========================================================
-- PASSO 1 — DIAGNÓSTICO
-- Rode isto primeiro no SQL Editor do Supabase e me diga o resultado
-- ===========================================================

-- Isso deve retornar "t" (true) se a segurança por linha está ativa
select relrowsecurity from pg_class where relname = 'cadastros_ingresso';

-- Isso deve retornar 2 linhas (uma de leitura, uma de escrita).
-- Se vier VAZIO, é exatamente o problema: a tabela está travada
-- para a chave pública (anon) do site.
select policyname, cmd, qual from pg_policies where tablename = 'cadastros_ingresso';


-- ===========================================================
-- PASSO 2 — CORREÇÃO
-- Rode isto (é seguro rodar mesmo que as políticas já existam)
-- ===========================================================

drop policy if exists "Permitir leitura cadastros" on cadastros_ingresso;
create policy "Permitir leitura cadastros" on cadastros_ingresso
  for select using (true);

drop policy if exists "Permitir escrita cadastros" on cadastros_ingresso;
create policy "Permitir escrita cadastros" on cadastros_ingresso
  for all using (true) with check (true);

alter table cadastros_ingresso enable row level security;

-- Depois de rodar, repita a consulta do Passo 1 (a segunda) —
-- agora deve trazer as 2 políticas.
