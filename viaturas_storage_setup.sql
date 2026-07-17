-- ===========================================================
-- ANEXOS DE OCORRÊNCIAS (PDFs) — configuração do Supabase Storage
-- ===========================================================
--
-- PASSO 1 (feito pelo painel, não por SQL):
--   No Supabase, vá em Storage -> "New bucket"
--   Nome do bucket: viaturas-anexos
--   Marque "Public bucket": SIM
--   Clique em "Create bucket"
--
-- PASSO 2: cole e rode este SQL no SQL Editor para liberar
-- leitura, upload e remoção de arquivos nesse bucket
-- (mesmo padrão de acesso aberto já usado nas tabelas do app):

create policy "Leitura publica viaturas-anexos"
on storage.objects for select
using (bucket_id = 'viaturas-anexos');

create policy "Upload viaturas-anexos"
on storage.objects for insert
with check (bucket_id = 'viaturas-anexos');

create policy "Remocao viaturas-anexos"
on storage.objects for delete
using (bucket_id = 'viaturas-anexos');
