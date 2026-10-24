-- Tabela `estudos`: um registro por sessão de estudo (StudySalvo) de uma conta
-- logada. Quem usa anônimo não entra aqui — fica só no localStorage do
-- aparelho (mesmo padrão de `perfis`, ver 20261005113616).
--
-- `estudo`, `resultado` e `progresso` ficam em jsonb: a estrutura do Study
-- (blocos/perguntas) já é variável e muda com o produto — normalizar isso em
-- colunas custaria migrations constantes pra pouco ganho. `resultado` e
-- `progresso` são mutuamente complementares: uma sessão em andamento tem
-- progresso e resultado nulo; ao concluir a prova, progresso vira nulo e
-- resultado é preenchido.
create table public.estudos (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  materia text not null,
  data timestamptz not null default now(),
  origem text,
  estudo jsonb not null,
  resultado jsonb,
  progresso jsonb
);

create index estudos_user_id_idx on public.estudos (user_id, data desc);

alter table public.estudos enable row level security;

create policy "ler os próprios estudos"
  on public.estudos for select
  using (auth.uid() = user_id);

create policy "criar os próprios estudos"
  on public.estudos for insert
  with check (auth.uid() = user_id);

create policy "atualizar os próprios estudos"
  on public.estudos for update
  using (auth.uid() = user_id);

create policy "excluir os próprios estudos"
  on public.estudos for delete
  using (auth.uid() = user_id);
