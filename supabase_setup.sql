-- Execute este script no SQL Editor do Supabase (https://app.supabase.com -> seu projeto -> SQL Editor)

create table if not exists painel_data (
  id int primary key,
  roster jsonb,
  qdl jsonb,
  include_rrc boolean default false,
  updated_at timestamptz default now()
);

alter table painel_data enable row level security;

-- Ferramenta interna sem login: liberamos leitura e escrita para a chave anônima.
create policy "Permitir leitura" on painel_data
  for select using (true);

create policy "Permitir escrita" on painel_data
  for all using (true) with check (true);
