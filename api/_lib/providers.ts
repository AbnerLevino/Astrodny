/*
  SERVIDOR (api/_lib) — os adaptadores REAIS da porta AIProvider, lado servidor.

  São gêmeos dos providers do front (src/infrastructure/ai), com UMA diferença crucial:
  leem a chave de `process.env` (Node/Edge) em vez de `import.meta.env` (Vite). Por quê?
  Porque tudo que começa com VITE_ o Vite injeta no pacote que vai pro NAVEGADOR (=exposto).
  Aqui, no servidor, a chave vive em `process.env.*` SEM VITE_ — nunca chega ao cliente.
  Esta é, na prática, a "fronteira do segredo": a mesma lógica de antes, só que num lugar
  onde o segredo continua secreto.
*/
import type { AIProvider, GenerateOptions } from '../../src/application/ports/AIProvider'

// ----- GROQ (API compatível com a da OpenAI) -----
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'

export const groqConfigurado = GROQ_KEY.length > 0

export const groqProvider: AIProvider = {
  async generate(prompt, opcoes?: GenerateOptions) {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        ...(opcoes?.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!r.ok) throw new Error(`Groq respondeu ${r.status}`)
    const d = await r.json()
    return d.choices?.[0]?.message?.content ?? ''
  },

  async *generateStream(prompt) {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], stream: true }),
    })
    if (!r.ok || !r.body) throw new Error(`Groq respondeu ${r.status}`)
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
          /* linha parcial / keep-alive: ignora */
        }
      }
    }
  },
}

// ----- GEMINI (API :generateContent / :streamGenerateContent) -----
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? ''
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiConfigurado = GEMINI_KEY.length > 0

function geminiCorpo(prompt: string, json?: boolean) {
  return JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
  })
}

export const geminiProvider: AIProvider = {
  async generate(prompt, opcoes?: GenerateOptions) {
    const r = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: geminiCorpo(prompt, opcoes?.json),
    })
    if (!r.ok) throw new Error(`Gemini respondeu ${r.status}`)
    const d = await r.json()
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  },

  async *generateStream(prompt) {
    const r = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: geminiCorpo(prompt),
    })
    if (!r.ok || !r.body) throw new Error(`Gemini respondeu ${r.status}`)
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
          /* linha parcial: ignora */
        }
      }
    }
  },
}
