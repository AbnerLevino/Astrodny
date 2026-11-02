/*
  Estado compartilhado dos chats (o histórico) — Context do React.

  RESPONSABILIDADE ÚNICA: guardar estado de tela (lista de chats, qual está ativo,
  mensagens). Ele NÃO sabe o que a IA responde nem como — isso é papel do caso de
  uso `application/chat` + da porta `AIProvider`. Aqui a gente só: pega a mensagem,
  chama `chat(historico, ia)` e vai desenhando na tela os pedaços que chegam.

  Fase 0: vive em memória (some ao recarregar). Depois migra pra
  infrastructure/storage (localStorage) sem mudar quem usa este hook.
*/
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Mensagem, Chat, Anexo } from '../domain/chat'
import { chat } from '../application/chat'
import { groqProvider, groqConfigurado } from '../infrastructure/ai/groqProvider'
import { geminiProvider, geminiConfigurado } from '../infrastructure/ai/geminiProvider'
import { cloudflareProvider, cloudflareConfigurado } from '../infrastructure/ai/cloudflareProvider'
import { openrouterProvider, openrouterConfigurado } from '../infrastructure/ai/openrouterProvider'
import { fallbackProvider } from '../infrastructure/ai/fallbackProvider'
import { proxyProvider } from '../infrastructure/ai/proxyProvider'
import { retryProvider } from '../infrastructure/ai/retryProvider'
import { ehLimite, ehSemChave } from '../application/ports/aiErrors'
import { localStorageChatRepository } from '../infrastructure/storage/localStorageChatRepository'
import { useSettings } from './settings'
import { useAuth } from './auth'

export type { Mensagem, Chat, Anexo } // reexporta pra quem já importava daqui não quebrar

// CADEIA DE IA DO CHAT.
// EM PRODUÇÃO: tudo pelo proxy (/api/*) — as chaves ficam no servidor, a cadeia roteia lá
// (ver api/_lib/chain.ts: cadeiaChat() — hoje Gemini primeiro, por qualidade).
// EM DEV: Gemini primeiro (contexto grande, boa qualidade), Groq em seguida (rápido,
// free tier), OpenRouter como rede de segurança (modelo ":free", sem disputar cota com
// o Groq), Cloudflare por último (só emergência — pior qualidade, modelo quantizado).
// SEM retryProvider por fora aqui: tanto o proxy (prod) quanto a cadeia (dev) JÁ SÃO
// fallbackProvider por dentro (vários provedores em sequência) — envolver com retry
// faz a cadeia INTEIRA rodar de novo quando TODOS já falharam, martelando de novo os
// mesmos provedores exauridos (foi a causa da enxurrada de 429/503 vista no Network).
const ia = import.meta.env.PROD
  ? proxyProvider
  : fallbackProvider([
      ...(geminiConfigurado ? [geminiProvider] : []),
      ...(groqConfigurado ? [groqProvider] : []),
      ...(openrouterConfigurado ? [openrouterProvider] : []),
      ...(cloudflareConfigurado ? [cloudflareProvider] : []),
    ])
// Onde os chats são guardados. Trocar localStorage -> nuvem é mudar SÓ esta linha.
const repo = localStorageChatRepository

// Gera um id único SEM depender de crypto.randomUUID (que só existe em contexto
// seguro: https ou localhost). No celular via IP da Wi-Fi (HTTP) aquele quebrava.
function novoId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

type ChatsContexto = {
  chats: Chat[]
  chatAtivoId: string | null // qual chat está aberto na Home (null = saudação)
  pensandoId: string | null // qual chat está gerando resposta AGORA (null = nenhum)
  setChatAtivo: (id: string | null) => void
  criarChat: (primeiraMensagem: string, anexos?: Anexo[]) => string // cria, marca como ativo e devolve o id
  enviarMensagem: (id: string, texto: string, anexos?: Anexo[]) => void
  // edita uma mensagem SUA já enviada (no índice dado) e refaz a conversa dali pra
  // frente: troca o texto, descarta a resposta antiga e o que veio depois, e a IA
  // responde de novo. É o comportamento do ChatGPT ao editar uma mensagem.
  editarMensagem: (id: string, index: number, novoTexto: string) => void
  pararResposta: (id: string) => void // cancela a resposta pendente daquele chat
  obterChat: (id: string) => Chat | undefined
  renomearChat: (id: string, novoTitulo: string) => void // troca o título do chat
  alternarFixar: (id: string) => void // liga/desliga o "fixado no topo"
  excluirChat: (id: string) => void // remove o chat do histórico
}

const Contexto = createContext<ChatsContexto | null>(null)

export function ChatsProvider({ children }: { children: ReactNode }) {
  // carrega o histórico salvo UMA vez, na montagem (initializer preguiçoso do useState)
  const [chats, setChats] = useState<Chat[]>(() => repo.carregar())
  const [chatAtivoId, setChatAtivo] = useState<string | null>(null)
  // personalidade escolhida nas Configurações — define o tom das respostas da IA
  const { personalidade } = useSettings()
  // perfil de quem está logado (Google) — undefined pra quem usa anônimo
  const { perfil } = useAuth()

  // salva sempre que a lista de chats muda (nova mensagem, novo chat, etc.)
  // Obs: durante o "digitar" da IA isso salva a cada palavra — aceitável na Fase 0;
  // se pesar, dá pra adiar (debounce) depois.
  useEffect(() => {
    repo.salvar(chats)
  }, [chats])
  // pensandoId = chat gerando resposta AGORA (cobre "pensando" e "escrevendo").
  // Enquanto está setado, o botão de enviar vira "parar".
  const [pensandoId, setPensandoId] = useState<string | null>(null)
  // AbortController da geração em curso. É o jeito "de verdade" de cancelar um
  // trabalho assíncrono: em vez de matar um setInterval, a gente sinaliza "aborta"
  // e o consumidor do stream (o for await) para no próximo pedaço. Cada geração tem
  // o SEU controller, então uma não cancela a outra por engano.
  const abortRef = useRef<AbortController | null>(null)

  function criarChat(primeiraMensagem: string, anexos?: Anexo[]): string {
    const id = novoId()
    const titulo = primeiraMensagem.trim().slice(0, 40) || anexos?.[0]?.nome || 'Novo chat'
    const mensagens: Mensagem[] = [{ autor: 'user', texto: primeiraMensagem, anexos }]
    setChats((prev) => [{ id, titulo, mensagens, criadoEm: Date.now() }, ...prev]) // mais novo no topo
    setChatAtivo(id) // já abre esse chat na Home
    responderIA(id, mensagens) // dispara a resposta da IA
    return id
  }

  function enviarMensagem(id: string, texto: string, anexos?: Anexo[]) {
    const chatAtual = chats.find((c) => c.id === id)
    const historico: Mensagem[] = [...(chatAtual?.mensagens ?? []), { autor: 'user', texto, anexos }]
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, mensagens: historico } : c)),
    )
    responderIA(id, historico)
  }

  // Edita uma mensagem do usuário JÁ enviada e refaz a conversa dali pra frente.
  // Corta tudo a partir daquele índice (a resposta antiga da IA e o que veio depois),
  // coloca a mensagem editada no lugar e dispara a IA de novo com esse histórico.
  function editarMensagem(id: string, index: number, novoTexto: string) {
    const limpo = novoTexto.trim()
    if (!limpo) return
    const chatAtual = chats.find((c) => c.id === id)
    if (!chatAtual) return
    // se houver uma geração rolando, aborta antes de recomeçar (evita duas IAs escrevendo)
    abortRef.current?.abort()
    const historico: Mensagem[] = [
      ...chatAtual.mensagens.slice(0, index),
      { autor: 'user', texto: limpo },
    ]
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, mensagens: historico } : c)))
    responderIA(id, historico)
  }

  // Consome o stream do caso de uso e vai anexando os pedaços na tela.
  // O "pensando" (pontinhos) aparece enquanto o primeiro pedaço não chega; assim
  // que ele chega, criamos a mensagem da IA e o texto começa a crescer.
  async function responderIA(id: string, historico: Mensagem[]) {
    const controller = new AbortController()
    abortRef.current = controller
    setPensandoId(id)

    // Mini-aula via PDF (Spec C): o prompt embute o PDF inteiro, então pula a
    // cadeia normal (que tenta Cloudflare primeiro — sem proxy, em dev, ele
    // falha por CORS e só cai pro próximo depois de um tempo) e vai DIRETO pro
    // Gemini, que tem contexto grande o suficiente pra isso. Sem chave de Gemini,
    // cai de volta na cadeia normal (degradação, não quebra).
    const ultima = historico[historico.length - 1]
    const temAnexo = ultima?.autor === 'user' && !!ultima.anexos?.length
    const provedor = temAnexo && geminiConfigurado ? retryProvider(geminiProvider) : ia

    let iaCriada = false
    try {
      for await (const pedaco of chat(historico, provedor, personalidade, perfil ?? undefined)) {
        if (controller.signal.aborted) break
        if (!iaCriada) {
          adicionarMensagemIA(id, pedaco) // 1º pedaço: nasce a mensagem da IA
          iaCriada = true
        } else {
          anexarNaUltima(id, pedaco) // demais pedaços: crescem no final
        }
      }
    } catch (e) {
      // já tentou re-tentar (retryProvider) e ainda falhou → mostra um aviso no lugar do silêncio.
      // Limite = sobrecarga (temporário); qualquer outro = falha genérica. (Aborto manual não cai aqui.)
      if (controller.signal.aborted) {
        // nada: o aluno mandou parar
      } else {
        const aviso = ehSemChave(e)
          ? e.message
          : ehLimite(e)
            ? '⚠️ A IA está sobrecarregada agora. Tente de novo em alguns instantes.'
            : '⚠️ Não consegui responder agora. Tente de novo.'
        if (!iaCriada) adicionarMensagemIA(id, aviso)
        else anexarNaUltima(id, '\n\n' + aviso)
      }
    } finally {
      // só desliga o "gerando" se ninguém iniciou outra geração no meio do caminho
      if (abortRef.current === controller) {
        abortRef.current = null
        setPensandoId(null)
      }
    }
  }

  function adicionarMensagemIA(id: string, texto: string) {
    setChats((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, mensagens: [...c.mensagens, { autor: 'ia', texto }] } : c,
      ),
    )
  }

  function anexarNaUltima(id: string, pedaco: string) {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        const msgs = c.mensagens.slice()
        const ultima = msgs[msgs.length - 1]
        msgs[msgs.length - 1] = { autor: 'ia', texto: ultima.texto + pedaco }
        return { ...c, mensagens: msgs }
      }),
    )
  }

  // Cancela a geração (pensando OU escrevendo): sinaliza o abort e desliga o
  // "gerando". A mensagem do usuário e o que já foi escrito permanecem no chat.
  function pararResposta(id: string) {
    abortRef.current?.abort()
    setPensandoId((cur) => (cur === id ? null : cur))
  }

  function obterChat(id: string) {
    return chats.find((c) => c.id === id)
  }

  // Renomeia o chat. Ignora nome vazio e corta em 60 chars (cabe na sidebar).
  function renomearChat(id: string, novoTitulo: string) {
    const limpo = novoTitulo.trim()
    if (!limpo) return
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, titulo: limpo.slice(0, 60) } : c)))
  }

  // Liga/desliga o "fixado". A ORDENAÇÃO (fixados no topo) é feita na tela, não aqui:
  // o estado só guarda o fato; quem desenha decide como mostrar.
  function alternarFixar(id: string) {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, fixado: !c.fixado } : c)))
  }

  // Remove o chat. Se era o que estava aberto na Home, volta pra saudação (null).
  function excluirChat(id: string) {
    setChats((prev) => prev.filter((c) => c.id !== id))
    setChatAtivo((atual) => (atual === id ? null : atual))
  }

  return (
    <Contexto.Provider
      value={{ chats, chatAtivoId, pensandoId, setChatAtivo, criarChat, enviarMensagem, editarMensagem, pararResposta, obterChat, renomearChat, alternarFixar, excluirChat }}
    >
      {children}
    </Contexto.Provider>
  )
}

// hook pra usar o histórico em qualquer tela
export function useChats() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useChats precisa estar dentro de <ChatsProvider>')
  return ctx
}
