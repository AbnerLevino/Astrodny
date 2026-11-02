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
import type { AIProvider, GenerateOptions, PromptInput, ChatMeta } from '../../application/ports/AIProvider'
import { paraMensagens } from '../../application/ports/AIProvider'
import { IALimiteError, IASemChaveError, ehStatusDeLimite } from '../../application/ports/aiErrors'
import { deviceAnon } from './deviceAnon'
import { CHAVE_STORAGE } from '../../domain/settings'

// BYOK: lê a chave direto do localStorage (mesmo padrão de deviceAnon.ts, sem acoplar
// a React) — o proxyProvider roda fora de componente, não pode usar useSettings().
function lerChave(campo: 'groqApiKey' | 'geminiApiKey'): string {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (!bruto) return ''
    return (JSON.parse(bruto) as Record<string, string>)[campo]?.trim() || ''
  } catch {
    return ''
  }
}

export const proxyProvider: AIProvider = {
  // Só tarefas de 1 tiro (buildStudy/buildExam/correção) chamam generate() hoje —
  // sempre com string. Mantém a rota /api/generate como está (prompt solto).
  async generate(prompt: PromptInput, opcoes?: GenerateOptions): Promise<string> {
    const groqApiKey = lerChave('groqApiKey')
    if (!groqApiKey) throw new IASemChaveError('Configure sua chave Groq em Configurações pra montar o estudo/trabalho.')
    const textoPrompt = typeof prompt === 'string' ? prompt : prompt.map((m) => m.content).join('\n\n')
    const r = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: textoPrompt,
        json: opcoes?.json,
        reasoningEffort: opcoes?.reasoningEffort,
        maxCompletionTokens: opcoes?.maxCompletionTokens,
        device: deviceAnon(),
        groqApiKey,
      }),
      signal: opcoes?.signal,
    })
    const d = await r.json().catch(() => ({}) as { text?: string; error?: string })
    if (!r.ok) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(d.error || undefined, r.status)
      throw new Error(d.error ?? `O servidor respondeu ${r.status}.`)
    }
    return d.text ?? ''
  },

  // `meta` traz os INGREDIENTES do system prompt (modo/personalidade/perfil/contexto) —
  // NUNCA o texto pronto. O servidor (api/stream.ts) é quem monta o `system` de verdade;
  // por isso aqui a gente FILTRA qualquer `role: "system"` antes de mandar — mesmo que
  // algum caller monte um por engano, ele nunca sai daqui pro proxy.
  async *generateStream(prompt: PromptInput, meta?: ChatMeta): AsyncIterable<string> {
    const geminiApiKey = lerChave('geminiApiKey')
    if (!geminiApiKey) throw new IASemChaveError('Configure sua chave Gemini em Configurações pra usar o chat.')
    const mensagens = paraMensagens(prompt).filter((m) => m.role !== 'system')
    const r = await fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: mensagens,
        modo: meta?.modo ?? 'tutor',
        personalidade: meta?.personalidade ?? 'formal',
        perfil: meta?.perfil,
        contextoEstudo: meta?.contextoEstudo,
        device: deviceAnon(),
        geminiApiKey,
      }),
    })
    if (!r.ok || !r.body) {
      if (ehStatusDeLimite(r.status)) throw new IALimiteError(undefined, r.status)
      throw new Error(`O servidor respondeu ${r.status}.`)
    }
    // o corpo é texto puro em pedaços — lê conforme chega e repassa (mesmo padrão dos outros providers).
    // O /api/stream responde sempre 200 e, se a cadeia falhar ANTES de escrever, injeta um
    // sentinel no PRIMEIRO pedaço: "[erro:limite] ..." (sobrecarga) ou "[erro] ..." (falha geral).
    // A gente detecta isso no 1º pedaço e converte no erro tipado — pra não exibir "[erro]" como texto.
    const decoder = new TextDecoder()
    let primeiro = true
    for await (const bytes of r.body as unknown as AsyncIterable<Uint8Array>) {
      const texto = decoder.decode(bytes, { stream: true })
      if (!texto) continue
      if (primeiro) {
        primeiro = false
        if (texto.startsWith('[erro:limite]')) {
          throw new IALimiteError(texto.replace('[erro:limite]', '').trim() || undefined)
        }
        if (texto.startsWith('[erro]')) {
          throw new Error(texto.replace('[erro]', '').trim() || 'Falha no stream.')
        }
      }
      yield texto
    }
  },
}
