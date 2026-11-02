/*
  SERVIDOR (api/_lib) — CORS explícito pros endpoints de IA. Sem domínio próprio
  ainda, então a lista de origens permitidas é montada a partir das variáveis de
  ambiente que a PRÓPRIA Vercel injeta (não é possível adivinhar/validar por sufixo
  genérico: qualquer pessoa ganha um host `*.vercel.app` ao criar um projeto grátis,
  então aceitar qualquer um deles libera CORS pra internet inteira, não só pro nosso
  deploy). Troque ORIGENS_EXTRAS quando houver domínio final — é só esse array que muda.
*/
const ORIGENS_EXTRAS = ['http://localhost:5173']

// VERCEL_PROJECT_PRODUCTION_URL (domínio estável de produção), VERCEL_BRANCH_URL
// (domínio estável do branch) e VERCEL_URL (deployment específico, muda a cada deploy)
// são preenchidas automaticamente pela Vercel em cada execução — refletem SEMPRE o
// deployment atual do NOSSO projeto, nunca o de outra pessoa.
//
// Se um domínio próprio entrar em uso (ex.: astrodny.com.br), ele NÃO vai aparecer em
// nenhuma dessas variáveis — é preciso adicioná-lo explicitamente em ORIGENS_EXTRAS,
// senão o front nesse domínio passa a ser bloqueado por CORS sem aviso nenhum.
function origensDoDeploymentAtual(): string[] {
  const vars = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]
  return vars.filter((v): v is string => Boolean(v)).map((host) => `https://${host}`)
}

export function origemPermitida(origin: string | null): string | null {
  if (!origin) return null
  const permitidas = [...ORIGENS_EXTRAS, ...origensDoDeploymentAtual()]
  return permitidas.includes(origin) ? origin : null
}

export function headersCors(request: Request): HeadersInit {
  const origin = origemPermitida(request.headers.get('origin'))
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
