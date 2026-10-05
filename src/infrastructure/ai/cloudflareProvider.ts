/*
  INFRAESTRUTURA (infrastructure/ai) — adaptador da porta AIProvider para o
  CLOUDFLARE WORKERS AI.

  Entra na cadeia do CHAT (não do Estudar) como free tier MAIS RÁPIDO que o
  Gemini em prompts médios/complexos (medido: TTFT < 0,4s contra 4-11s do
  Gemini — ver docs/Infraestrutura.md). O Groq fica reservado pro Estudar.

  A API da Cloudflare fala (quase) o dialeto da OpenAI: /ai/run/{modelo}, com
  messages[] e um "choices[].delta.content" no streaming — só que também
  devolve um campo "response" mais direto, que usamos aqui.

  Sem conta configurada (VITE_CF_ACCOUNT_ID / VITE_CF_API_TOKEN), `cloudflareConfigurado`
  é false e a cadeia de fallback simplesmente o ignora.
*/
import type { AIProvider } from '../../application/ports/AIProvider'
import { IALimiteError, ehStatusDeLimite } from '../../application/ports/aiErrors'

const ACCOUNT_ID = import.meta.env.VITE_CF_ACCOUNT_ID ?? ''
const KEY = import.meta.env.VITE_CF_API_TOKEN ?? ''
const MODELO = import.meta.env.VITE_CF_MODEL ?? '@cf/meta/llama-3.1-8b-instruct-fast'
const BASE = 'https://api.cloudflare.com/client/v4/accounts'

export const cloudflareConfigurado = ACCOUNT_ID.length > 0 && KEY.length > 0

function headers() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }
}

export const cloudflareProvider: AIProvider = {
  async generate(prompt) {
    const r = await fetch(`${BASE}/${ACCOUNT_ID}/ai/run/${MODELO}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    })
    if (!r.ok) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
      throw new Error(`Cloudflare respondeu ${r.status}`)
    }
    const d = await r.json()
    return d.result?.response ?? ''
  },

  // SSE: linhas "data: {json}" com um campo "response" já com só o pedaço novo.
  async *generateStream(prompt) {
    const r = await fetch(`${BASE}/${ACCOUNT_ID}/ai/run/${MODELO}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], stream: true }),
    })
    if (!r.ok || !r.body) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
      throw new Error(`Cloudflare respondeu ${r.status}`)
    }

    const decoder = new TextDecoder()
    let buffer = ''
    for await (const bytes of r.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(bytes, { stream: true })
      const linhas = buffer.split('\n')
      buffer = linhas.pop() ?? ''

      for (const linha of linhas) {
        const t = linha.trim()
        if (!t.startsWith('data:')) continue
        const dados = t.slice(5).trim()
        if (dados === '[DONE]') return
        try {
          const json = JSON.parse(dados)
          const pedaco = json.response
          if (pedaco) yield pedaco
        } catch {
          // linha parcial: ignora
        }
      }
    }
  },
}
