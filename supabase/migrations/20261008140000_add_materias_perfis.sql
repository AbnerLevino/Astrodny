-- `perfilRepository.ts` já lê/grava `materias` desde a criação da tabela, mas a
-- migration original (20261005113616) esqueceu a coluna — select/upsert falhavam
-- por completo (coluna inexistente), então curso/nivel nunca eram salvos de
-- verdade e o onboarding reabria sempre. Esta migration só adiciona a coluna
-- que faltava.
alter table public.perfis
  add column if not exists materias text[];
