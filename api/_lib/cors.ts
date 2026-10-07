/*
  SERVIDOR (api/_lib) — CORS explícito pros endpoints de IA. Sem domínio próprio
  ainda, então liberamos qualquer preview/produção do PRÓPRIO projeto na Vercel
  (*.vercel.app) + o Vite local. Troque SUFIXOS_PERMITIDOS/ORIGENS_EXTRAS quando
  houver domínio final — é só esse array que muda.
*/
const SUFIXOS_PERMITIDOS = ['.vercel.app']
const ORIGENS_EXTRAS = ['http://localhost:5173']

export function origemPermitida(origin: string | null): string | null {
  if (!origin) return null
  if (ORIGENS_EXTRAS.includes(origin)) return origin
  try {
    const host = new URL(origin).hostname
    if (SUFIXOS_PERMITIDOS.some((s) => host.endsWith(s))) return origin
  } catch {
    return null
  }
  return null
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
