/*
  Painel — tela inicial do app ("/"). Convida o aluno a agir: título +
  campo de chat (digitar = cria um chat novo, igual ao atalho "Novo Chat") +
  4 atalhos pras áreas do app (Novo Chat, Estudar, Trabalhos, Provas).

  Nesta primeira versão os 4 atalhos mostram nome + explicação FIXOS (sem
  personalização ainda — isso entra na task seguinte, que liga o motor de
  insight). Trabalhos e Provas ainda não têm funcionalidade: clicar neles
  abre um aviso "em breve" com o que está planejado.

  Sidebar: no DESKTOP fica escondida aqui (tela cheia, sem coluna lateral) —
  só reaparece ao entrar numa área de trabalho (Chat/Estudar). No MOBILE
  continua sendo o drawer de sempre (avatar no topo abre).
*/
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useChats } from '../chats'
import { useAuth } from '../auth'
import { useStudies } from '../studies'
import { gerarInsightsPainel } from '../../application/homeInsights'
import { precisaAtualizar } from '../../application/homeInsightsCache'
import { amostrarMensagensDeAbertura } from '../../application/amostraChats'
import { localStorageHomeInsightsRepository } from '../../infrastructure/storage/localStorageHomeInsightsRepository'
import type { InsightsPainel } from '../../domain/painel'
import { retryProvider } from '../../infrastructure/ai/retryProvider'
import { proxyProvider } from '../../infrastructure/ai/proxyProvider'
import { fallbackProvider } from '../../infrastructure/ai/fallbackProvider'
import { ollamaProvider } from '../../infrastructure/ai/ollamaProvider'
import { groqProvider, groqConfigurado } from '../../infrastructure/ai/groqProvider'
import { geminiProvider, geminiConfigurado } from '../../infrastructure/ai/geminiProvider'
import { cloudflareProvider, cloudflareConfigurado } from '../../infrastructure/ai/cloudflareProvider'

// Mesma cadeia do chat (ver ui/chats.tsx): em PROD tudo pelo proxy (chaves
// escondidas no servidor); em DEV, Cloudflare/Gemini/Groq de reserva, Ollama
// local por último. retryProvider dá 1 retentativa silenciosa num 429.
const ia = retryProvider(
  import.meta.env.PROD
    ? proxyProvider
    : fallbackProvider([
        ...(cloudflareConfigurado ? [cloudflareProvider] : []),
        ...(geminiConfigurado ? [geminiProvider] : []),
        ...(groqConfigurado ? [groqProvider] : []),
        ollamaProvider,
      ]),
)

type ChaveAtalho = 'novoChat' | 'estudar' | 'trabalhos' | 'provas'

type Atalho = {
  chave: ChaveAtalho
  nome: string
  explicacao: string
  icone: ReactNode
}

const ATALHOS: Atalho[] = [
  {
    chave: 'novoChat',
    nome: 'Novo Chat',
    explicacao: 'Converse com o Astrodny sobre qualquer matéria, dúvida ou ideia.',
    icone: <IconeChatAtalho />,
  },
  {
    chave: 'estudar',
    nome: 'Estudar',
    explicacao: 'Jogue um PDF ou digite um tema e aprenda em porções, no seu ritmo.',
    icone: <IconeEstudarAtalho />,
  },
  {
    chave: 'trabalhos',
    nome: 'Trabalhos',
    explicacao: 'Monte um trabalho formatado em ABNT, do sumário à entrega.',
    icone: <IconeTrabalhosAtalho />,
  },
  {
    chave: 'provas',
    nome: 'Provas',
    explicacao: 'Treine pra uma prova ou concurso com cronômetro, acertos e erros.',
    icone: <IconeProvasAtalho />,
  },
]

// Conteúdo do modal "em breve" — o que cada função vai fazer quando pronta
// (lista de verdade o que está planejado, não é só um aviso genérico).
const EM_BREVE: Record<'trabalhos' | 'provas', { titulo: string; descricao: string }> = {
  trabalhos: {
    titulo: 'Trabalhos com ABNT — em breve',
    descricao:
      'Você vai poder contar o tema e os requisitos, o Astrodny propõe o sumário, escreve ' +
      'seção por seção com você aprovando ou ajustando cada uma, e entrega o trabalho pronto, ' +
      'formatado em ABNT (.docx/.pdf) — sem perder nota por causa de margem ou citação errada.',
  },
  provas: {
    titulo: 'Provas — em breve',
    descricao:
      'Um modo de treino separado do Estudar: perguntas cronometradas, acertos e erros ' +
      'registrados, várias tentativas e explicação de cada resposta — pra treinar pra prova ' +
      'ou concurso igual quem já sabe o conteúdo, só precisa de ritmo e repertório.',
  },
}

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function Painel() {
  const navigate = useNavigate()
  const { usuario, perfil } = useAuth()
  const { estudos } = useStudies()
  const { chats, criarChat } = useChats()
  const [menuAberto, setMenuAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [emBreve, setEmBreve] = useState<'trabalhos' | 'provas' | null>(null)
  const [insights, setInsights] = useState<InsightsPainel | null>(null)
  const [carregandoInsights, setCarregandoInsights] = useState(false)

  // Busca/gera os insights UMA VEZ por visita ao Painel (ao montar). Visitante
  // (sem usuario) nunca chama a IA — fica sempre no texto genérico dos atalhos.
  useEffect(() => {
    if (!usuario) return

    const cache = localStorageHomeInsightsRepository.carregar()
    if (!precisaAtualizar(cache, estudos, Date.now())) {
      setInsights(cache!.insights)
      return
    }

    let cancelado = false
    setCarregandoInsights(true)
    const amostra = amostrarMensagensDeAbertura(chats, Date.now())
    gerarInsightsPainel(perfil, estudos, amostra, ia)
      .then((novosInsights) => {
        if (cancelado) return
        localStorageHomeInsightsRepository.salvar({ geradoEm: new Date().toISOString(), insights: novosInsights })
        setInsights(novosInsights)
      })
      .catch((e) => {
        // cai pro texto genérico (insights continua null) — nunca trava a tela
        console.warn('Painel: não consegui gerar os insights agora, caindo pro texto genérico', e)
      })
      .finally(() => {
        if (!cancelado) setCarregandoInsights(false)
      })

    return () => {
      cancelado = true
    }
    // perfil/estudos/chats são lidos só na montagem, de propósito — não quero
    // re-chamar a IA a cada mensagem nova enquanto a pessoa está no Painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id])

  const [tituloIdx, setTituloIdx] = useState(0)

  // ao chegar um novo lote de títulos (entrou na tela / terminou de gerar),
  // começa por um sorteado — não sempre o primeiro, pra não repetir toda vez
  // a mesma abertura.
  useEffect(() => {
    if (insights && insights.titulos.length > 0) {
      setTituloIdx(Math.floor(Math.random() * insights.titulos.length))
    }
  }, [insights])

  // parado no Painel, troca de título devagar — não é um carrossel rápido,
  // isso competiria com a leitura.
  useEffect(() => {
    if (!insights || insights.titulos.length < 2) return
    const t = setInterval(() => {
      setTituloIdx((i) => (i + 1) % insights.titulos.length)
    }, 50_000)
    return () => clearInterval(t)
  }, [insights])

  const titulo = insights?.titulos[tituloIdx] ?? 'O que temos para fazer hoje?'

  function enviar() {
    const limpo = texto.trim()
    if (!limpo) return
    navigate(`/chat/${criarChat(limpo)}`)
  }

  function clicarAtalho(chave: ChaveAtalho) {
    if (chave === 'novoChat') navigate('/chat')
    else if (chave === 'estudar') navigate('/estudar')
    else setEmBreve(chave)
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#1a1a1c] lg:flex">
      <Sidebar aoSelecionar={() => setMenuAberto(false)} escondidoNoDesktop />

      <div
        className={`relative z-10 min-h-dvh transition-all duration-300 lg:flex-1 lg:translate-x-0 lg:blur-none ${
          menuAberto ? 'translate-x-[78%] blur-[2px]' : 'translate-x-0'
        }`}
      >
        <div className="fundo-aurora absolute inset-0 -z-20">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <span className="blob blob-3" />
        </div>
        <div
          className={`absolute inset-0 -z-10 bg-[#2e2f36] transition-opacity duration-300 ${
            menuAberto ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* header mobile: avatar abre o drawer da Sidebar (no desktop ela já
            some de vez — sem header, ver Sidebar escondidoNoDesktop) */}
        <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 lg:hidden">
          <button type="button" aria-label="Abrir menu" onClick={() => setMenuAberto(true)} className="shrink-0">
            <img src="/perfil.png" alt="Foto de perfil" className="h-12 w-12 rounded-full object-cover border-2 border-white" />
          </button>
          <img src="/logo.png" alt="Astrodny" className="h-9 w-auto" />
        </header>

        <main className="relative z-10 flex min-h-dvh flex-col justify-center gap-8 px-6 pt-24 pb-10 text-white lg:flex-row lg:items-center lg:gap-16 lg:px-16">
          {/* título + campo de chat */}
          <div className="flex flex-col lg:flex-1 lg:max-w-xl">
            {/* marca do Astrodny — "A" da logo + o nome por extenso, acima de tudo */}
            <div className="mb-4 flex items-center gap-3">
              <img src="/logo.png" alt="" className="h-12 w-auto" />
              <span className="text-2xl font-bold tracking-tight">Astrodny</span>
            </div>
            <p className="text-xl text-white/80">{saudacao()}, Universitário!</p>
            <h1 key={tituloIdx} className="animar-subida mt-1 text-[28px] font-bold leading-tight lg:text-4xl">
              {titulo}
            </h1>
            {carregandoInsights && (
              <span className="mt-3 inline-flex items-center gap-2 text-sm text-white/50">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/70" />
                Personalizando sugestões…
              </span>
            )}

            <div className="mt-6 flex items-center gap-2 rounded-[26px] border border-white/50 bg-white/5 pl-4 pr-2 py-1.5 backdrop-blur-md">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    enviar()
                  }
                }}
                placeholder="Quer fazer um trabalho rápido em ABNT?"
                className="flex-1 bg-transparent font-sans text-[16px] leading-6 text-white placeholder:text-white/40 outline-none py-1.5"
              />
              <button
                type="button"
                onClick={enviar}
                onMouseDown={(e) => e.preventDefault()}
                disabled={!texto.trim()}
                aria-label="Enviar"
                className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#0a1560] transition-opacity active:opacity-70 disabled:opacity-40"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V6M6 12l6-6 6 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* os 4 atalhos */}
          <div className="flex flex-col gap-3 lg:w-[22rem] lg:shrink-0">
            {ATALHOS.map((a) => {
              const sugestao = insights?.sugestoes[a.chave]
              return (
                <button
                  key={a.chave}
                  type="button"
                  onClick={() => clicarAtalho(a.chave)}
                  className="flex items-start gap-3 rounded-xl border border-black/15 bg-white px-4 py-3.5 text-left text-black shadow-sm transition-transform hover:scale-[1.01]"
                >
                  <span className="mt-0.5 shrink-0 text-[#0a1560] [&>svg]:h-5 [&>svg]:w-5">{a.icone}</span>
                  <span>
                    <span className="block text-[15px] font-semibold">{a.nome}</span>
                    <span className="block text-[13px] leading-snug text-black/60">{sugestao ?? a.explicacao}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </main>

        {menuAberto && <div className="absolute inset-0 z-20" onClick={() => setMenuAberto(false)} />}
      </div>

      {emBreve && (
        <ModalEmBreve
          titulo={EM_BREVE[emBreve].titulo}
          descricao={EM_BREVE[emBreve].descricao}
          aoFechar={() => setEmBreve(null)}
        />
      )}
    </div>
  )
}

function ModalEmBreve({ titulo, descricao, aoFechar }: { titulo: string; descricao: string; aoFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center lg:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={aoFechar} />
      <div className="animar-subida relative z-10 w-full border border-white/10 bg-[#141416] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white rounded-t-3xl lg:w-[26rem] lg:rounded-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 lg:hidden" />
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">{descricao}</p>
        <button
          type="button"
          onClick={aoFechar}
          className="mt-5 w-full rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/5"
        >
          Entendi
        </button>
      </div>
    </div>
  )
}

function IconeChatAtalho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-12.1 7.6L3 21l1.9-5.9A8.4 8.4 0 1 1 21 11.5z" />
    </svg>
  )
}

function IconeEstudarAtalho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 22Z" />
      <path d="M4 5.5v14A2.5 2.5 0 0 0 6.5 22" />
    </svg>
  )
}

function IconeTrabalhosAtalho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </svg>
  )
}

function IconeProvasAtalho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </svg>
  )
}

export default Painel
