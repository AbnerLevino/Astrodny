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

// `x-forwarded-for` pode vir com vários IPs separados por vírgula — um por proxy que a
// requisição atravessou. Proxies ACRESCENTAM o IP que eles observaram ao FINAL da lista
// (nunca reescrevem o que já tinha); então o PRIMEIRO item é o que o PRÓPRIO CLIENTE
// mandou no header (totalmente forjável — um atacante manda um valor aleatório a cada
// chamada e "reseta" o limite sempre). O ÚLTIMO item é o que a borda da Vercel (o hop
// mais próximo do servidor, que o cliente não controla) efetivamente observou — é esse
// que usamos como chave do rate limit.
//
// `x-real-ip` NÃO é usado: ao contrário do `x-forwarded-for`, a Vercel não garante que
// esse header seja definido pela própria borda (não é um padrão universal — é convenção
// de proxies como nginx, configurados explicitamente). Um cliente pode mandar qualquer
// valor nele, e como não há acúmulo (não é uma lista), um atacante zera o rate limit a
// cada requisição só variando esse header.
//
// Premissa desta função: a Vercel é o ÚNICO proxy na frente do nosso código. Se algum
// dia entrar outro proxy antes da Vercel (CDN, WAF, etc.), o "último item" do
// `x-forwarded-for` passa a ser o IP desse proxy, não o do cliente real — a mesma classe
// de problema que corrigimos aqui, só um hop mais pra fora. Reavaliar se isso mudar.
export function ipDaRequisicao(request: Request): string {
  const encaminhados = request.headers.get('x-forwarded-for')
  if (!encaminhados) return 'desconhecido'
  const partes = encaminhados.split(',').map((p) => p.trim()).filter(Boolean)
  return partes[partes.length - 1] || 'desconhecido'
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
