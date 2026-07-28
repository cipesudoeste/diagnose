-- Execute no SQL Editor do Supabase (mesmo projeto de sempre)

create table if not exists whatsapp_contatos (
  id bigint generated always as identity primary key,
  telefone text unique not null,      -- formato internacional, ex: 5577999999999
  nome text,
  matricula text,
  opt_in boolean default true,        -- false = pediu pra não receber mais mensagens
  ultima_interacao timestamptz,
  criado_em timestamptz default now()
);

create table if not exists whatsapp_mensagens (
  id bigint generated always as identity primary key,
  contato_id bigint references whatsapp_contatos(id) on delete cascade,
  direcao text not null,              -- 'enviada' | 'recebida'
  tipo text default 'texto',          -- 'texto' | 'template' | 'imagem' | 'documento'
  conteudo text,
  wa_message_id text,                 -- id da mensagem na Meta (rastrear status)
  status text default 'pendente',     -- 'pendente' | 'enviada' | 'entregue' | 'lida' | 'erro'
  erro_detalhe text,
  criado_em timestamptz default now()
);

create table if not exists whatsapp_campanhas (
  id bigint generated always as identity primary key,
  nome text not null,
  template_nome text,
  mensagem text,
  filtro_descricao text,              -- texto legível do filtro usado (auditoria)
  total_destinatarios int default 0,
  total_enviados int default 0,
  total_erros int default 0,
  status text default 'rascunho',     -- 'rascunho' | 'enviando' | 'concluida' | 'erro'
  criado_em timestamptz default now()
);

alter table whatsapp_contatos enable row level security;
alter table whatsapp_mensagens enable row level security;
alter table whatsapp_campanhas enable row level security;

create policy "Permitir leitura contatos" on whatsapp_contatos for select using (true);
create policy "Permitir escrita contatos" on whatsapp_contatos for all using (true) with check (true);

create policy "Permitir leitura mensagens" on whatsapp_mensagens for select using (true);
create policy "Permitir escrita mensagens" on whatsapp_mensagens for all using (true) with check (true);

create policy "Permitir leitura campanhas" on whatsapp_campanhas for select using (true);
create policy "Permitir escrita campanhas" on whatsapp_campanhas for all using (true) with check (true);
