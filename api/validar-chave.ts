/*
  SERVIDOR — endpoint POST /api/validar-chave: confere se a chave BYOK da pessoa é aceita
  pelo provedor, sem gastar tokens (ver _lib/validarChave.ts). Existe porque, em produção,
  a CSP (vercel.json, connect-src) não deixa o navegador falar direto com Groq/Gemini.

    entrada: { provedor: 'groq' | 'gemini', chave: string }
    saída:   { resultado: 'valida' | 'invalida' | 'erro' }
*/
import { validarChave, type Provedor } from './_lib/validarChave'
import { dentroDoLimite } from './_lib/rateLimit'
import { headersCors } from './_lib/cors'

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const cors = headersCors(request)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, cors)
  if (!(await dentroDoLimite(request))) {
    return json({ error: 'Muitas requisições. Aguarde um instante e tente de novo.' }, 429, cors)
  }

  let corpo: { provedor?: string; chave?: string }
  try {
    corpo = await request.json()
  } catch {
    return json({ error: 'Corpo inválido (esperava JSON).' }, 400, cors)
  }
  const provedor = corpo.provedor
  const chave = corpo.chave?.trim()
  if (provedor !== 'groq' && provedor !== 'gemini') return json({ error: 'Provedor desconhecido.' }, 400, cors)
  if (!chave) return json({ error: 'Faltou a chave.' }, 400, cors)

  const resultado = await validarChave(provedor as Provedor, chave)
  return json({ resultado }, 200, cors)
}

function json(obj: unknown, status: number, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } })
}
