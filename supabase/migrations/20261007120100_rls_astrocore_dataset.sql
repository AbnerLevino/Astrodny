alter table public.astrocore_dataset enable row level security;

-- Nenhuma policy criada de propósito: sem policy, RLS = NEGA tudo por padrão pra
-- anon/authenticated. Só o service_role (que o log.ts usa) grava, porque o
-- service_role ignora RLS inteiramente — não precisa de policy pra ele.
revoke all on public.astrocore_dataset from anon, authenticated;
