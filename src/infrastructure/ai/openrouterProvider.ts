/*
  INFRAESTRUTURA (infrastructure/ai) — adaptador da porta AIProvider para o OPENROUTER.

  OpenRouter expõe uma API compatível com a da OpenAI (/chat/completions), igual o
  Groq — mesmo "idioma" (Bearer token + JSON/SSE). Entra na cadeia do CHAT como mais
  um elo GRATUITO (modelos com sufixo ":free"), antes do Gemini (cota baixíssima:
  20 req/dia) e sem disputar cota com o Groq (reservado pro Estudar).

  Sem conta configurada (VITE_OPENROUTER_API_KEY), `openrouterConfigurado` é false e
  a cadeia de fallback simplesmente o ignora.
*/
import type { AIProvider } from '../../application/ports/AIProvider'
import { paraMensagens } from '../../application/ports/AIProvider'
import { IALimiteError, ehStatusDeLimite } from '../../application/ports/aiErrors'

const URL = 'https://openrouter.ai/api/v1/chat/completions'
const KEY = import.meta.env.VITE_OPENROUTER_API_KEY ?? ''
// Modelos ":free" do OpenRouter não cobram créditos — têm limite de taxa próprio
// (bem mais folgado que os 20/dia do Gemini). Configurável via env se o slug mudar.
const MODELO = import.meta.env.VITE_OPENROUTER_MODEL ?? 'deepseek/deepseek-chat-v3.1:free'

export const openrouterConfigurado = KEY.length > 0

function headers() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }
}

export const openrouterProvider: AIProvider = {
  async generate(prompt, opcoes) {
    const r = await fetch(URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model: MODELO,
        messages: paraMensagens(prompt),
        stream: false,
        ...(opcoes?.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!r.ok) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
      throw new Error(`OpenRouter respondeu ${r.status}`)
    }
    const d = await r.json()
    return d.choices?.[0]?.message?.content ?? ''
  },

  // SSE: mesmo formato do Groq — linhas "data: {json}" com choices[0].delta.content.
  async *generateStream(prompt) {
    const r = await fetch(URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model: MODELO, messages: paraMensagens(prompt), stream: true }),
    })
    if (!r.ok || !r.body) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
      throw new Error(`OpenRouter respondeu ${r.status}`)
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
          const pedaco = json.choices?.[0]?.delta?.content
          if (pedaco) yield pedaco
        } catch {
          // linha parcial ou keep-alive: ignora
        }
      }
    }
  },
}
