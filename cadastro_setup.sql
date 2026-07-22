-- Execute no SQL Editor do Supabase (mesmo projeto do Efetivo/Viaturas)

create table if not exists cadastros_ingresso (
  id bigint generated always as identity primary key,
  matricula text,
  nome text,
  dados jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table cadastros_ingresso enable row level security;

create policy "Permitir leitura cadastros" on cadastros_ingresso
  for select using (true);

create policy "Permitir escrita cadastros" on cadastros_ingresso
  for all using (true) with check (true);

-- Bucket de armazenamento para os anexos (CNH, BGO) — crie pelo painel:
-- Storage -> New bucket -> nome: cadastros-anexos -> Public bucket: SIM
-- Depois rode isto para liberar leitura/upload:

create policy "Leitura publica cadastros-anexos"
on storage.objects for select
using (bucket_id = 'cadastros-anexos');

create policy "Upload cadastros-anexos"
on storage.objects for insert
with check (bucket_id = 'cadastros-anexos');

create policy "Remocao cadastros-anexos"
on storage.objects for delete
using (bucket_id = 'cadastros-anexos');
