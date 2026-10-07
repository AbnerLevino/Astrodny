/*
  SERVIDOR (api/_lib) — rate limit por IP usando o PRÓPRIO Supabase (sem contratar
  serviço novo): chama a função `checar_rate_limite` via RPC com a SERVICE KEY (a
  mesma que o log.ts já usa). A função no Postgres é ATÔMICA (um único UPDATE), então
  não há corrida entre requisições concorrentes como haveria num "ler, somar, gravar"
  feito aqui no código.

  best-effort: se o Supabase não estiver configurado ou a chamada falhar, NÃO bloqueia
  ninguém — é melhor abrir mão do rate limit por um instante do que derrubar o app.
*/
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

const LIMITE_REQUISICOES = 20
const JANELA_SEGUNDOS = 60

export function ipDaRequisicao(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
}

export async function dentroDoLimite(request: Request): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true
  const ip = ipDaRequisicao(request)
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/checar_rate_limite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ p_ip: ip, p_limite: LIMITE_REQUISICOES, p_janela_segundos: JANELA_SEGUNDOS }),
    })
    if (!r.ok) return true
    return (await r.json()) === true
  } catch {
    return true
  }
}
