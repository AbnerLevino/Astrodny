/*
  INFRAESTRUTURA (infrastructure/ai) — adaptador da porta AIProvider para o GOOGLE GEMINI.

  Pronto, mas INATIVO até você configurar a chave (VITE_GEMINI_API_KEY) no outro PC.
  Enquanto não houver chave, `geminiConfigurado` é false e a cadeia de fallback o pula.

  A API do Gemini NÃO é igual à da OpenAI: usa :generateContent / :streamGenerateContent
  e empacota o texto em contents[].parts[].text. Este tradutor esconde essa diferença —
  pro resto do app, é só mais um AIProvider.
*/
import type { AIProvider, PromptInput } from '../../application/ports/AIProvider'
import { paraMensagens } from '../../application/ports/AIProvider'
import { IALimiteError, ehStatusDeLimite } from '../../application/ports/aiErrors'

const KEY = import.meta.env.VITE_GEMINI_API_KEY ?? ''
const MODELO = import.meta.env.VITE_GEMINI_MODEL ?? 'gemini-2.0-flash'
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiConfigurado = KEY.length > 0

// Gemini não tem role 'system' em contents[] — a instrução fixa vai à parte, em
// systemInstruction. 'assistant' também não existe pra ele: o papel chama 'model'.
function corpo(prompt: PromptInput, json?: boolean) {
  const mensagens = paraMensagens(prompt)
  const sistema = mensagens
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const contents = mensagens
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
  return JSON.stringify({
    contents,
    ...(sistema ? { systemInstruction: { parts: [{ text: sistema }] } } : {}),
    ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
  })
}

export const geminiProvider: AIProvider = {
  async generate(prompt, opcoes) {
    const r = await fetch(`${BASE}/${MODELO}:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corpo(prompt, opcoes?.json),
    })
    if (!r.ok) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
      throw new Error(`Gemini respondeu ${r.status}`)
    }
    const d = await r.json()
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  },

  // SSE do Gemini: linhas "data: {json}" com candidates[].content.parts[].text.
  async *generateStream(prompt) {
    const r = await fetch(`${BASE}/${MODELO}:streamGenerateContent?alt=sse&key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corpo(prompt),
    })
    if (!r.ok || !r.body) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
      throw new Error(`Gemini respondeu ${r.status}`)
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
        try {
          const json = JSON.parse(t.slice(5).trim())
          const pedaco = json.candidates?.[0]?.content?.parts?.[0]?.text
          if (pedaco) yield pedaco
        } catch {
          // linha parcial: ignora
        }
      }
    }
  },
}
