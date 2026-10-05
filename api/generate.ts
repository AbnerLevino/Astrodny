/*
  SERVIDOR — endpoint POST /api/generate (resposta COMPLETA de uma vez).

  É o backend do caso de uso `buildStudy`/`buildExam`/correção: recebe um prompt, chama a
  cadeia de IA (Gemini→Groq) com as CHAVES que só existem aqui, devolve o texto e registra
  o evento anônimo. Roda no Edge do Vercel (rápido, barato, streaming nativo).

  Protocolo (o contrato entre o front e este proxy — simples de propósito):
    entrada:  { prompt: string, json?: boolean, type?, subject?, device? }
    saída:    { text: string }   (ou { error } com status != 200)
*/
import { cadeiaServidor } from './_lib/chain'
import { registrarEvento, type TipoEvento } from './_lib/log'
import { ehLimite } from '../src/application/ports/aiErrors'

export const config = { runtime: 'edge' }

const NIL_UUID = '00000000-0000-0000-0000-000000000000' // "sem device" (device_anon é NOT NULL)

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405)
  }

  let corpo: { prompt?: string; json?: boolean; type?: TipoEvento; subject?: string; device?: string }
  try {
    corpo = await request.json()
  } catch {
    return json({ error: 'Corpo inválido (esperava JSON).' }, 400)
  }

  const prompt = corpo.prompt
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return json({ error: 'Faltou o campo "prompt".' }, 400)
  }

  try {
    const text = await cadeiaServidor().generate(prompt, { json: corpo.json })
    // coleta anônima (best-effort; não bloqueia a resposta se falhar)
    await registrarEvento({
      type: corpo.type ?? 'study_session',
      subject: corpo.subject,
      input: prompt,
      output: text,
      device_anon: corpo.device || NIL_UUID,
    })
    return json({ text }, 200)
  } catch (e) {
    // sobrecarga (429/503 na cadeia) → responde 429, pra o cliente mostrar a mensagem amigável
    if (ehLimite(e)) {
      return json({ error: 'A IA está sobrecarregada no momento. Tente de novo em instantes.' }, 429)
    }
    return json({ error: e instanceof Error ? e.message : 'Falha na geração.' }, 502)
  }
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
