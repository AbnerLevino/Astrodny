/*
  SERVIDOR — endpoint POST /api/generate (resposta COMPLETA de uma vez).

  É o backend do caso de uso `buildStudy`/`buildExam`/correção: recebe um prompt, chama a
  cadeia de IA (Gemini→Groq) com as CHAVES que só existem aqui, devolve o texto e registra
  o evento anônimo. Roda no Edge do Vercel (rápido, barato, streaming nativo).

  Protocolo (o contrato entre o front e este proxy — simples de propósito):
    entrada:  { prompt: string, json?: boolean, reasoningEffort?, maxCompletionTokens?, type?, subject?, device? }
    saída:    { text: string }   (ou { error } com status != 200)
*/
import { cadeiaServidor } from './_lib/chain'
import { registrarEvento, type TipoEvento } from './_lib/log'
import { dentroDoLimite } from './_lib/rateLimit'
import { MAX_PROMPT_CHARS } from './_lib/limites'
import { headersCors } from './_lib/cors'
import { ehLimite } from '../src/application/ports/aiErrors'

export const config = { runtime: 'edge' }

const NIL_UUID = '00000000-0000-0000-0000-000000000000' // "sem device" (device_anon é NOT NULL)

export default async function handler(request: Request): Promise<Response> {
  const cors = headersCors(request)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405, cors)
  }

  if (!(await dentroDoLimite(request))) {
    return json({ error: 'Muitas requisições. Aguarde um instante e tente de novo.' }, 429, cors)
  }

  let corpo: {
    prompt?: string
    json?: boolean
    reasoningEffort?: 'low' | 'medium' | 'high'
    maxCompletionTokens?: number
    type?: TipoEvento
    subject?: string
    device?: string
    groqApiKey?: string
  }
  try {
    corpo = await request.json()
  } catch {
    return json({ error: 'Corpo inválido (esperava JSON).' }, 400, cors)
  }

  const groqApiKey = corpo.groqApiKey?.trim()
  if (!groqApiKey) {
    return json({ error: 'Configure sua chave Groq em Configurações pra usar a IA.' }, 400, cors)
  }

  const prompt = corpo.prompt
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return json({ error: 'Faltou o campo "prompt".' }, 400, cors)
  }

  if (prompt.length > MAX_PROMPT_CHARS) {
    return json({ error: `Prompt muito grande (máx. ${MAX_PROMPT_CHARS} caracteres).` }, 413, cors)
  }

  try {
    const text = await cadeiaServidor(groqApiKey).generate(prompt, {
      json: corpo.json,
      reasoningEffort: corpo.reasoningEffort,
      maxCompletionTokens: corpo.maxCompletionTokens,
    })
    // coleta anônima (best-effort; não bloqueia a resposta se falhar)
    await registrarEvento({
      type: corpo.type ?? 'study_session',
      subject: corpo.subject,
      input: prompt,
      output: text,
      device_anon: corpo.device || NIL_UUID,
    })
    return json({ text }, 200, cors)
  } catch (e) {
    // sobrecarga (429/503 na cadeia) → responde 429, pra o cliente mostrar a mensagem amigável
    if (ehLimite(e)) {
      return json({ error: 'A IA está sobrecarregada no momento. Tente de novo em instantes.' }, 429, cors)
    }
    return json({ error: e instanceof Error ? e.message : 'Falha na geração.' }, 502, cors)
  }
}

function json(obj: unknown, status: number, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}
