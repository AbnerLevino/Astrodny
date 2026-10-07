create table if not exists public.api_rate_limit (
  ip text primary key,
  janela_inicio timestamptz not null default now(),
  contagem int not null default 1
);

alter table public.api_rate_limit enable row level security;
-- ninguém além do service_role mexe aqui (service_role sempre ignora RLS).

create or replace function public.checar_rate_limite(p_ip text, p_limite int, p_janela_segundos int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contagem int;
begin
  insert into public.api_rate_limit (ip, janela_inicio, contagem)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set contagem = case
          when public.api_rate_limit.janela_inicio < now() - make_interval(secs => p_janela_segundos)
            then 1
          else public.api_rate_limit.contagem + 1
        end,
        janela_inicio = case
          when public.api_rate_limit.janela_inicio < now() - make_interval(secs => p_janela_segundos)
            then now()
          else public.api_rate_limit.janela_inicio
        end
  returning contagem into v_contagem;

  return v_contagem <= p_limite;
end;
$$;

revoke all on function public.checar_rate_limite(text, int, int) from public, anon, authenticated;
grant execute on function public.checar_rate_limite(text, int, int) to service_role;
