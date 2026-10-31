-- Tabela `astrocore_dataset`: coleta anônima de pares (entrada → saída) usada
-- pelo proxy (`api/_lib/log.ts`) — matéria-prima do futuro fine-tuning do Astro
-- Core (ver docs/Infraestrutura.md, seção 4). Sem PII: só o tipo de evento, a
-- matéria, o par input/output e um device_anon (uuid aleatório por aparelho).
create table public.astrocore_dataset (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('study_session', 'correction', 'chat')),
  subject text,
  input text,
  output text,
  device_anon uuid not null
);

create index idx_astrocore_dataset_device_anon on public.astrocore_dataset (device_anon);
create index idx_astrocore_dataset_subject on public.astrocore_dataset (subject);
create index idx_astrocore_dataset_created_at on public.astrocore_dataset (created_at);
