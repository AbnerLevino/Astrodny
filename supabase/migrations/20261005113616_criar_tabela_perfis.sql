-- Tabela `perfis`: um registro por conta logada (Google). Quem usa anônimo
-- não entra aqui — fica só no localStorage do aparelho.
create table public.perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  curso text,
  nivel text,
  criado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

-- Cada pessoa só lê, cria e atualiza o PRÓPRIO perfil — nunca o de outra conta.
create policy "ler o próprio perfil"
  on public.perfis for select
  using (auth.uid() = user_id);

create policy "criar o próprio perfil"
  on public.perfis for insert
  with check (auth.uid() = user_id);

create policy "atualizar o próprio perfil"
  on public.perfis for update
  using (auth.uid() = user_id);
