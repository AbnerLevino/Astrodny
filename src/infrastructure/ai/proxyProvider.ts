/*
  INFRAESTRUTURA (infrastructure/ai) — o adaptador-CLIENTE da porta AIProvider que fala
  com o NOSSO proxy (/api/*), em vez de falar direto com Groq/Gemini.

  É o par de produção dos providers diretos: a lógica do app (buildStudy, chat…) continua
  falando com "uma IA" pela porta AIProvider; só que, em produção, essa IA é o nosso backend
  — que guarda as chaves em segredo, roteia com fallback e coleta os dados. O front nunca vê
  chave nenhuma.

  Protocolo (combinado com api/generate.ts e api/stream.ts):
    generate      → POST /api/generate {prompt, json, device} → {text}
    generateStream→ POST /api/stream   {prompt, device}       → corpo de TEXTO puro (pedaços)
*/
import type { AIProvider, GenerateOptions } from '../../application/ports/AIProvider'
import { deviceAnon } from './deviceAnon'

export const proxyProvider: AIProvider = {
  async generate(prompt: string, opcoes?: GenerateOptions): Promise<string> {
    const r = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, json: opcoes?.json, device: deviceAnon() }),
    })
    const d = await r.json().catch(() => ({}) as { text?: string; error?: string })
    if (!r.ok) throw new Error(d.error ?? `O servidor respondeu ${r.status}.`)
    return d.text ?? ''
  },

  async *generateStream(prompt: string): AsyncIterable<string> {
    const r = await fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, device: deviceAnon() }),
    })
    if (!r.ok || !r.body) throw new Error(`O servidor respondeu ${r.status}.`)
    // o corpo é texto puro em pedaços — lê conforme chega e repassa (mesmo padrão dos outros providers)
    const decoder = new TextDecoder()
    for await (const bytes of r.body as unknown as AsyncIterable<Uint8Array>) {
      const texto = decoder.decode(bytes, { stream: true })
      if (texto) yield texto
    }
  },
}
