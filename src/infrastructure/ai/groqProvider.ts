/*
  INFRAESTRUTURA (infrastructure/ai) — adaptador da porta AIProvider para o GROQ.

  Groq expõe uma API compatível com a da OpenAI (/chat/completions). Este tradutor
  fala esse "idioma" (Bearer token + JSON/SSE) e entrega o que a porta promete
  (Promise<string> e AsyncIterable<string>). O resto do app não sabe que é Groq.

  É um dos motores de NUVEM do chat. A chave vem do .env.local (VITE_GROQ_API_KEY);
  sem chave, `groqConfigurado` é false e a cadeia de fallback simplesmente o ignora.

  Dois modelos, um só código (fábrica):
  - groqProvider: modelo FORTE (VITE_GROQ_MODEL) — geração estruturada (prova).
  - groqRapidoProvider: modelo PEQUENO/RÁPIDO (VITE_GROQ_MODEL_RAPIDO, padrão 8b-instant)
    — tarefas leves como a narração do estudo: instantâneo e barato (tokens desprezíveis).
*/
import type { AIProvider } from '../../application/ports/AIProvider'
import { IALimiteError, ehStatusDeLimite } from '../../application/ports/aiErrors'

const URL = 'https://api.groq.com/openai/v1/chat/completions'
const KEY = import.meta.env.VITE_GROQ_API_KEY ?? ''

// A cadeia de fallback usa isto pra só incluir o Groq se houver chave configurada.
export const groqConfigurado = KEY.length > 0

function headers() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` }
}

// Fábrica: cria um adaptador Groq amarrado a um MODELO específico. Assim o modelo
// forte e o pequeno compartilham toda a lógica de fetch/SSE sem duplicação.
function criarGroqProvider(modelo: string): AIProvider {
  return {
    // RESPOSTA COMPLETA (stream:false).
    async generate(prompt, opcoes) {
      const r = await fetch(URL, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model: modelo,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          ...(opcoes?.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      })
      if (!r.ok) {
        if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
        throw new Error(`Groq respondeu ${r.status}`)
      }
      const d = await r.json()
      return d.choices?.[0]?.message?.content ?? ''
    },

    // RESPOSTA EM PEDAÇOS (stream:true). Groq manda SSE: linhas "data: {json}".
    // De cada uma lemos choices[0].delta.content; "data: [DONE]" encerra.
    async *generateStream(prompt) {
      const r = await fetch(URL, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model: modelo,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
      })
      if (!r.ok || !r.body) {
        if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
        throw new Error(`Groq respondeu ${r.status}`)
      }

      const decoder = new TextDecoder()
      let buffer = ''
      for await (const bytes of r.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(bytes, { stream: true })
        const linhas = buffer.split('\n')
        buffer = linhas.pop() ?? '' // última pode estar incompleta -> volta pro buffer

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
            // linha parcial ou ruído de keep-alive: ignora
          }
        }
      }
    },
  }
}

// Modelo FORTE (padrão): geração estruturada (ex.: a prova).
export const groqProvider = criarGroqProvider(
  import.meta.env.VITE_GROQ_MODEL ?? 'llama-3.3-70b-versatile',
)

// Modelo PEQUENO/RÁPIDO: tarefas leves (narração) — instantâneo e barato.
export const groqRapidoProvider = criarGroqProvider(
  import.meta.env.VITE_GROQ_MODEL_RAPIDO ?? 'llama-3.1-8b-instant',
)
