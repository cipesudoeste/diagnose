-- Execute no SQL Editor do Supabase (pode ser o MESMO projeto do Painel de Efetivo)

create table if not exists viaturas_data (
  id int primary key,
  viaturas jsonb,
  updated_at timestamptz default now()
);

alter table viaturas_data enable row level security;

create policy "Permitir leitura viaturas" on viaturas_data
  for select using (true);

create policy "Permitir escrita viaturas" on viaturas_data
  for all using (true) with check (true);
