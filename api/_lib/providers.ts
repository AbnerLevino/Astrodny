/*
  SERVIDOR (api/_lib) — os adaptadores REAIS da porta AIProvider, lado servidor.

  BYOK: a chave não vive mais em `process.env` — cada chamada recebe a chave da
  PRÓPRIA pessoa (validada em api/generate.ts/api/stream.ts antes de chegar aqui).
  "Configurado no servidor" deixou de existir; por isso não há mais `*Configurado`.
*/
import type { AIProvider, GenerateOptions, PromptInput } from '../../src/application/ports/AIProvider'
import { paraMensagens } from '../../src/application/ports/AIProvider'
import { IALimiteError, IAChaveInvalidaError, ehStatusDeLimite, ehStatusDeChaveInvalida } from '../../src/application/ports/aiErrors'

// Mensagens pra chave recusada — texto amigável que vai direto pra tela. NUNCA inclui a chave.
const MSG_GROQ_RECUSADA = 'O Groq recusou sua chave (inválida ou revogada). Confira a chave em Configurações.'
const MSG_GEMINI_RECUSADA = 'O Gemini recusou sua chave (inválida ou revogada). Confira a chave em Configurações.'

// Lê o tempo de espera sugerido pelo provedor (Groq manda 'retry-after', em segundos,
// e/ou 'x-ratelimit-reset-tokens', tipo "1.2s"/"592ms") e normaliza pra ms — usado pelo
// retry de buildStudy/buildTrabalho pra esperar o tempo CERTO em vez de um fixo cego.
function esperaSugeridaMs(r: Response): number | undefined {
  const retryAfter = r.headers.get('retry-after')
  if (retryAfter) return Number(retryAfter) * 1000
  const resetTokens = r.headers.get('x-ratelimit-reset-tokens')
  if (resetTokens) {
    const m = /^([\d.]+)(ms|s)$/.exec(resetTokens.trim())
    if (m) return Number(m[1]) * (m[2] === 's' ? 1000 : 1)
  }
  return undefined
}

// ----- GROQ (API compatível com a da OpenAI) -----
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'

export function groqProvider(chave: string): AIProvider {
  return {
    async generate(prompt: PromptInput, opcoes?: GenerateOptions) {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: paraMensagens(prompt),
          stream: false,
          ...(opcoes?.json ? { response_format: { type: 'json_object' } } : {}),
          ...(opcoes?.reasoningEffort ? { reasoning_effort: opcoes.reasoningEffort } : {}),
          ...(opcoes?.maxCompletionTokens ? { max_completion_tokens: opcoes.maxCompletionTokens } : {}),
        }),
      })
      if (!r.ok) {
        // NUNCA interpolar `chave` na mensagem de erro.
        if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status, esperaSugeridaMs(r))
        if (ehStatusDeChaveInvalida(r.status)) throw new IAChaveInvalidaError(MSG_GROQ_RECUSADA)
        throw new Error(`Groq respondeu ${r.status}`)
      }
      const d = await r.json()
      return d.choices?.[0]?.message?.content ?? ''
    },

    async *generateStream(prompt) {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
        body: JSON.stringify({ model: GROQ_MODEL, messages: paraMensagens(prompt), stream: true }),
      })
      if (!r.ok || !r.body) {
        if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status, esperaSugeridaMs(r))
        if (ehStatusDeChaveInvalida(r.status)) throw new IAChaveInvalidaError(MSG_GROQ_RECUSADA)
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

// ----- GEMINI (API :generateContent / :streamGenerateContent) -----
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

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

// O Gemini NÃO usa 401 pra chave inválida: chave malformada/inexistente volta como
// 400 INVALID_ARGUMENT com reason "API_KEY_INVALID" no corpo; chave revogada/sem
// permissão volta como 403. Por isso, além do status, olha o corpo do 400.
// (Consome o corpo da resposta — só chamar quando já se sabe que vai lançar.)
async function geminiRecusouChave(r: Response): Promise<boolean> {
  if (ehStatusDeChaveInvalida(r.status)) return true
  if (r.status !== 400) return false
  try {
    const texto = await r.text()
    return texto.includes('API_KEY_INVALID') || texto.includes('API key not valid')
  } catch {
    return false
  }
}

export function geminiProvider(chave: string): AIProvider {
  return {
    async generate(prompt, opcoes?: GenerateOptions) {
      // chave no header `x-goog-api-key` (não na query string): URL com ?key= acaba em log
      // de proxy/CDN e em mensagens de erro de fetch; header não.
      const r = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body: geminiCorpo(prompt, opcoes?.json),
      })
      if (!r.ok) {
        if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status, esperaSugeridaMs(r))
        if (await geminiRecusouChave(r)) throw new IAChaveInvalidaError(MSG_GEMINI_RECUSADA)
        throw new Error(`Gemini respondeu ${r.status}`)
      }
      const d = await r.json()
      return d.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    },

    async *generateStream(prompt) {
      const r = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body: geminiCorpo(prompt),
      })
      if (!r.ok || !r.body) {
        if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status, esperaSugeridaMs(r))
        if (await geminiRecusouChave(r)) throw new IAChaveInvalidaError(MSG_GEMINI_RECUSADA)
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
}
