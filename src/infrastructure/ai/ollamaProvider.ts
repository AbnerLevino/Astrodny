/*
  INFRAESTRUTURA (infrastructure/ai) — o adaptador REAL da porta AIProvider.

  Faz o que o mockProvider fingia, mas conversando com o Ollama de verdade por HTTP
  (localhost:11434). É um TRADUTOR: de um lado fala o "idioma" do Ollama
  (JSON/NDJSON via fetch); do outro, entrega o que a porta AIProvider promete
  (Promise<string> e AsyncIterable<string>). O resto do app não sabe que trocou.

  Tem a MESMA interface do mockProvider — por isso plugar é trocar 1 linha:
  `const ia = mockProvider` -> `const ia = ollamaProvider`.
*/
import type { AIProvider, GenerateOptions, PromptInput } from '../../application/ports/AIProvider'
import { paraMensagens } from '../../application/ports/AIProvider'
import { IALimiteError, ehStatusDeLimite } from '../../application/ports/aiErrors'

// Configuração num lugar só. Vem de variável de ambiente (.env.local), com um padrão
// seguro pra não quebrar sem config. Assim trocamos ONDE a IA roda SEM tocar em código:
//   - dev no notebook (mesma máquina):  http://localhost:11434
//   - dev apontando pro PC Gamer (LAN): http://192.168.x.x:11434
//   - produção (via túnel/proxy):       https://sua-url-publica
const URL = import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434'
const MODELO = import.meta.env.VITE_OLLAMA_MODEL ?? 'llama3.2:3b'

// Teto de espera. SEM isto, se a 3060 estiver ocupada/fora do ar, o fetch fica pendurado
// pra sempre e a tela "Analisando" gira sem fim. Com o AbortController, a espera estoura
// e vira um erro AMIGÁVEL (que o Analisando captura e mostra, em vez de travar).
// Generoso de propósito: geração discursiva longa é lenta, mas não eterna.
const TIMEOUT_MS = 180000 // 3 min

// Teto de TOKENS DE SAÍDA. Sem isto, o Ollama gera até esgotar o contexto (32k) —
// um modelo pequeno às vezes "enrola" ou entra em loop e leva MINUTOS. Com o cap, o
// pior caso fica limitado. É um TETO, não um alvo: o modelo ainda para sozinho quando
// termina. Precisa ser FOLGADO pro modo "completa" (blocos de 4-7 parágrafos densos ×
// vários blocos passam de 4k tokens); baixo demais TRUNCA o JSON e o estudo quebra no parse.
const NUM_PREDICT = 6144

// TEMPERATURA do chat. Mais baixa = modelo menos "criativo" e menos propenso a INVENTAR
// fatos/números (alucinação) quando não sabe. O padrão do Ollama (~0.8) favorece invenção;
// 0.3 mantém a resposta fluida mas mais ancorada. Vale pro chat (generateStream).
const TEMPERATURA_CHAT = 0.3

// Formato de cada linha que o Ollama devolve no /api/generate (completo e stream).
// Só listamos os campos que a gente usa; o Ollama manda vários outros (metadados).
type OllamaLinha = {
  response: string
  done: boolean
}

// Formato de cada linha do /api/chat (usado pelo Chat, com roles) — mesma ideia,
// só que o texto vem dentro de "message.content" em vez de "response".
type OllamaLinhaChat = {
  message?: { content: string }
  done: boolean
}

export const ollamaProvider: AIProvider = {
  // RESPOSTA COMPLETA (stream:false). Espera o modelo terminar e devolve o texto.
  // Se opcoes.json for true, liga o format:"json" do Ollama -> JSON válido garantido
  // (é o que o buildStudy usa pra o parse nunca quebrar). Só tarefas de 1 tiro (sem
  // histórico/role) chamam generate() hoje, por isso aqui basta achatar pra string.
  async generate(prompt: PromptInput, opcoes?: GenerateOptions): Promise<string> {
    const textoPrompt =
      typeof prompt === 'string' ? prompt : prompt.map((m) => m.content).join('\n\n')
    // aborta o fetch se passar do teto (evita o "carregando pra sempre")
    const controlador = new AbortController()
    const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS)
    try {
      const resposta = await fetch(`${URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODELO,
          prompt: textoPrompt,
          stream: false,
          options: { num_predict: NUM_PREDICT },
          ...(opcoes?.json ? { format: 'json' } : {}),
        }),
        signal: controlador.signal,
      })
      if (!resposta.ok) {
        if (ehStatusDeLimite(resposta.status)) throw new IALimiteError(undefined, resposta.status)
        throw new Error(`Ollama respondeu ${resposta.status}. O servidor está rodando?`)
      }
      const dados = (await resposta.json()) as OllamaLinha
      return dados.response
    } catch (e) {
      if (controlador.signal.aborted) {
        throw new Error(
          `A IA demorou demais pra responder (acima de ${TIMEOUT_MS / 1000}s). A 3060 pode estar ocupada ou o material muito grande.`,
        )
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  },

  // RESPOSTA EM PEDAÇOS (stream:true). É o que alimenta o Chat — por isso vai pro
  // /api/chat (não /api/generate): esse endpoint entende messages[] com role
  // system/user/assistant de verdade, em vez de um texto único colado. O Ollama
  // devolve NDJSON: uma linha JSON por token, em "message.content".
  async *generateStream(prompt: PromptInput): AsyncIterable<string> {
    const resposta = await fetch(`${URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        messages: paraMensagens(prompt),
        stream: true,
        options: { temperature: TEMPERATURA_CHAT },
      }),
    })
    if (!resposta.ok || !resposta.body) {
      if (ehStatusDeLimite(resposta.status)) throw new IALimiteError(undefined, resposta.status)
      throw new Error(`Ollama respondeu ${resposta.status}. O servidor está rodando?`)
    }

    // O corpo vem em bytes; o decoder junta bytes -> texto. Como um pedaço da rede
    // pode cortar uma linha no meio, guardamos o resto ("buffer") pra próxima volta.
    const decoder = new TextDecoder()
    let buffer = ''

    // for await no stream: é AQUI que o polyfill do iOS antigo importa.
    for await (const bytes of resposta.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(bytes, { stream: true })

      // separa por quebra de linha; a última parte pode estar incompleta -> volta pro buffer
      const linhas = buffer.split('\n')
      buffer = linhas.pop() ?? ''

      for (const linha of linhas) {
        if (!linha.trim()) continue
        const dados = JSON.parse(linha) as OllamaLinhaChat
        if (dados.message?.content) yield dados.message.content
        if (dados.done) return
      }
    }
  },
}
