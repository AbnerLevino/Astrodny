/*
  SERVIDOR (api/_lib) — os adaptadores REAIS da porta AIProvider, lado servidor.

  São gêmeos dos providers do front (src/infrastructure/ai), com UMA diferença crucial:
  leem a chave de `process.env` (Node/Edge) em vez de `import.meta.env` (Vite). Por quê?
  Porque tudo que começa com VITE_ o Vite injeta no pacote que vai pro NAVEGADOR (=exposto).
  Aqui, no servidor, a chave vive em `process.env.*` SEM VITE_ — nunca chega ao cliente.
  Esta é, na prática, a "fronteira do segredo": a mesma lógica de antes, só que num lugar
  onde o segredo continua secreto.
*/
import type { AIProvider, GenerateOptions, PromptInput } from '../../src/application/ports/AIProvider'
import { paraMensagens } from '../../src/application/ports/AIProvider'
import { IALimiteError, ehStatusDeLimite } from '../../src/application/ports/aiErrors'

// ----- GROQ (API compatível com a da OpenAI) -----
// Cada MODELO no Groq tem cota própria (RPM/RPD/TPM), separada das outras — por isso
// criamos um provider por modelo em vez de um só: assim o Estudar (120b) e o chat
// (8b-instant) nunca competem pela mesma cota.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_KEY = process.env.GROQ_API_KEY ?? ''
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'
const GROQ_MODEL_RAPIDO = process.env.GROQ_MODEL_RAPIDO ?? 'llama-3.1-8b-instant'

export const groqConfigurado = GROQ_KEY.length > 0

function criarGroqProvider(modelo: string): AIProvider {
  return {
    async generate(prompt, opcoes?: GenerateOptions) {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: modelo,
          messages: paraMensagens(prompt),
          stream: false,
          ...(opcoes?.json ? { response_format: { type: 'json_object' } } : {}),
          ...(opcoes?.reasoningEffort ? { reasoning_effort: opcoes.reasoningEffort } : {}),
          ...(opcoes?.maxCompletionTokens ? { max_completion_tokens: opcoes.maxCompletionTokens } : {}),
        }),
      })
      if (!r.ok) {
        if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
        throw new Error(`Groq respondeu ${r.status}`)
      }
      const d = await r.json()
      return d.choices?.[0]?.message?.content ?? ''
    },

    async *generateStream(prompt) {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({ model: modelo, messages: paraMensagens(prompt), stream: true }),
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
}

// Groq "forte" (120b) — reservado pro Estudar (montar aula/prova/corrigir).
export const groqProvider: AIProvider = criarGroqProvider(GROQ_MODEL)

// Groq "rápido" (8b-instant) — pool de cota PRÓPRIO, dedicado ao chat.
export const groqRapidoProvider: AIProvider = criarGroqProvider(GROQ_MODEL_RAPIDO)

// ----- CLOUDFLARE WORKERS AI (free tier, entra na FRENTE na cadeia do CHAT) -----
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? ''
const CF_KEY = process.env.CF_API_TOKEN ?? ''
const CF_MODEL = process.env.CF_MODEL ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const CF_BASE = 'https://api.cloudflare.com/client/v4/accounts'

export const cloudflareConfigurado = CF_ACCOUNT_ID.length > 0 && CF_KEY.length > 0

export const cloudflareProvider: AIProvider = {
  async generate(prompt) {
    const r = await fetch(`${CF_BASE}/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CF_KEY}` },
      body: JSON.stringify({ messages: paraMensagens(prompt) }),
    })
    if (!r.ok) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
      throw new Error(`Cloudflare respondeu ${r.status}`)
    }
    const d = await r.json()
    return d.result?.response ?? ''
  },

  async *generateStream(prompt) {
    const r = await fetch(`${CF_BASE}/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CF_KEY}` },
      body: JSON.stringify({ messages: paraMensagens(prompt), stream: true }),
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
          /* linha parcial: ignora */
        }
      }
    }
  },
}

// ----- OPENROUTER (API compatível com a da OpenAI, modelos ":free" sem custo) -----
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat-v3.1:free'

export const openrouterConfigurado = OPENROUTER_KEY.length > 0

export const openrouterProvider: AIProvider = {
  async generate(prompt, opcoes?: GenerateOptions) {
    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_KEY}` },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
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

  async *generateStream(prompt) {
    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_KEY}` },
      body: JSON.stringify({ model: OPENROUTER_MODEL, messages: paraMensagens(prompt), stream: true }),
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
          /* linha parcial / keep-alive: ignora */
        }
      }
    }
  },
}

// ----- GEMINI (API :generateContent / :streamGenerateContent) -----
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? ''
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiConfigurado = GEMINI_KEY.length > 0

// Gemini não tem role 'system' em contents[] — a instrução fixa vai à parte, em
// systemInstruction. 'assistant' também não existe pra ele: o papel chama 'model'.
function geminiCorpo(prompt: PromptInput, json?: boolean) {
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
  async generate(prompt, opcoes?: GenerateOptions) {
    const r = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: geminiCorpo(prompt, opcoes?.json),
    })
    if (!r.ok) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
      throw new Error(`Gemini respondeu ${r.status}`)
    }
    const d = await r.json()
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  },

  async *generateStream(prompt) {
    const r = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: geminiCorpo(prompt),
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
          /* linha parcial: ignora */
        }
      }
    }
  },
}
