/*
  Painel — tela inicial do app ("/"). Convida o aluno a agir: título +
  campo de chat (digitar = cria um chat novo — esse É o "Novo Chat", não
  existe atalho separado pra isso) + os atalhos "O que você precisa?"
  (Estudar, Trabalhos, Provas), abaixo do campo.

  Nesta versão os atalhos mostram nome + explicação FIXOS pra quem não tem
  sugestão personalizada ainda. Provas ainda não tem funcionalidade: clicar
  nele abre um aviso "em breve" com o que está planejado.

  Sidebar: no DESKTOP aparece como coluna fixa, igual às áreas de trabalho
  (Chat/Estudar/Trabalhos). No MOBILE continua escondida por enquanto (sem
  botão pra abrir o drawer a partir do Painel — só ao entrar em Chat/Estudar).
*/
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { ModalPerfil } from './Sidebar'
import PerfilModal from './PerfilModal'
import FotoPerfil from '../components/FotoPerfil'
import { useChats } from '../chats'
import { useAuth } from '../auth'
import { useStudies } from '../studies'
import { gerarInsightsPainel } from '../../application/homeInsights'
import { precisaAtualizar } from '../../application/homeInsightsCache'
import { localStorageHomeInsightsRepository } from '../../infrastructure/storage/localStorageHomeInsightsRepository'
import type { InsightsPainel } from '../../domain/painel'

type ChaveAtalho = 'estudar' | 'trabalhos' | 'provas'

type Atalho = {
  chave: ChaveAtalho
  nome: string
  explicacao: string
  icone: ReactNode
}

const ATALHOS: Atalho[] = [
  {
    chave: 'estudar',
    nome: 'Estudar',
    explicacao: 'Entenda, pratique e revise qualquer matéria no seu ritmo.',
    icone: <IconeEstudarAtalho />,
  },
  {
    chave: 'trabalhos',
    nome: 'Trabalhos',
    explicacao: 'Crie, organize e formate seu trabalho acadêmico em ABNT.',
    icone: <IconeTrabalhosAtalho />,
  },
  {
    chave: 'provas',
    nome: 'Provas',
    explicacao: 'Treine, cronometre e acompanhe sua evolução pra prova.',
    icone: <IconeProvasAtalho />,
  },
]

// Conteúdo do modal "em breve" — o que cada função vai fazer quando pronta
// (lista de verdade o que está planejado, não é só um aviso genérico).
const EM_BREVE: Record<'provas', { titulo: string; descricao: string }> = {
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
  const { usuario, perfil, onboardingPendente, salvarPerfil, entrar, sair } = useAuth()
  const { estudos } = useStudies()
  const { criarChat } = useChats()
  const [menuAberto, setMenuAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [focado, setFocado] = useState(false) // campo em foco? abre pra largura total
  const [emBreve, setEmBreve] = useState<'provas' | null>(null)
  const [insights, setInsights] = useState<InsightsPainel | null>(null)
  // cartão de perfil: foto (logado) abre o modal da conta; sem login, abre o
  // mesmo modal (com "Entrar com Google" no lugar das opções de conta).
  const [modalAberto, setModalAberto] = useState(false)
  const [perfilModalAberto, setPerfilModalAberto] = useState(false)
  // AMOSTRA: mesmo hack da Sidebar, fixo em 'free' até existir plano de verdade.
  const plano: 'free' | 'pro' = 'free'

  // Gera os insights UMA VEZ por visita ao Painel (ao montar) — heurística local
  // (ver application/homeInsights), sem IA. Visitante (sem usuario) fica sempre
  // no texto genérico dos atalhos.
  useEffect(() => {
    if (!usuario) return

    const cache = localStorageHomeInsightsRepository.carregar()
    if (!precisaAtualizar(cache, estudos, Date.now())) {
      setInsights(cache!.insights)
      return
    }

    const novosInsights = gerarInsightsPainel(perfil, estudos, Date.now())
    localStorageHomeInsightsRepository.salvar({ geradoEm: new Date().toISOString(), insights: novosInsights })
    setInsights(novosInsights)
    // perfil/estudos são lidos só na montagem, de propósito — não quero
    // recalcular a cada mensagem nova enquanto a pessoa está no Painel.
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
    if (chave === 'estudar') navigate('/estudar')
    else if (chave === 'trabalhos') navigate('/trabalhos')
    else setEmBreve(chave)
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#1a1a1c] lg:flex">
      <Sidebar aoSelecionar={() => setMenuAberto(false)} />

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
        {/* cartão de perfil — só a foto, sem fundo/cartão preto. Logado: abre o
            modal da conta. Sem login: não aparece aqui (vira o CTA "Descubra
            o Astro!" lá embaixo, depois do atalho de Provas). */}
        {usuario && (
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            aria-label="Abrir conta"
            className="absolute right-5 top-[max(1rem,env(safe-area-inset-top))] z-20 shrink-0"
          >
            <FotoPerfil foto={usuario.foto} className="h-11 w-11 rounded-full border-2 border-white/80" />
          </button>
        )}

        <div
          className={`absolute inset-0 -z-10 bg-[#2e2f36] transition-opacity duration-300 ${
            menuAberto ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <main className="relative z-10 flex min-h-dvh -translate-y-8 flex-col items-center justify-center gap-8 px-6 pt-24 pb-10 text-white lg:px-16">
          {/* título + campo de chat */}
          <div className="flex w-full max-w-xl flex-col">
            {/* marca do Astrodny — só a logo, acima de tudo */}
            <img src="/logo.png" alt="Astrodny" className="mb-8 h-20 w-auto -translate-y-4 self-center lg:translate-y-0" />
            <p className="text-center text-xl text-white/80">{saudacao()}, Universitário!</p>
            <h1
              key={tituloIdx}
              className="animar-subida mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-center text-2xl font-bold leading-tight lg:whitespace-normal lg:text-4xl"
            >
              {titulo}
            </h1>

            <div
              className={`mt-6 flex items-center gap-2 self-center rounded-[26px] border border-white/50 bg-white/5 pl-4 pr-2 py-1.5 backdrop-blur-md transition-all duration-300 ease-out ${
                focado ? 'w-full' : 'w-[85%]'
              }`}
            >
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onFocus={() => setFocado(true)}
                onBlur={() => setFocado(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    enviar()
                  }
                }}
                placeholder="Não sabe por onde começar? Conte o que precisa estudar..."
                className="flex-1 bg-transparent font-sans text-[16px] leading-6 text-white placeholder:text-white/40 placeholder:text-[15px] outline-none py-1.5"
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

          {/* os atalhos — abaixo do campo de chat, com subtítulo, lado a lado em linha */}
          <div className="flex w-full max-w-xl -translate-y-2 flex-col gap-3">
            <p className="text-sm font-semibold text-white/50">Comece por aqui</p>
            <div className="flex flex-col gap-3 lg:flex-row">
              {ATALHOS.map((a) => {
                const sugestao = insights?.sugestoes[a.chave]
                return (
                  <button
                    key={a.chave}
                    type="button"
                    onClick={() => clicarAtalho(a.chave)}
                    className="flex flex-1 items-center gap-3 rounded-xl border border-white/50 bg-white/15 px-3 py-3 text-left text-white shadow-sm backdrop-blur-md transition-all hover:scale-[1.02] hover:border-white/80 hover:bg-white/25 active:bg-white/30 lg:flex-col lg:items-start lg:gap-2 lg:px-4 lg:py-5"
                  >
                    <span className="shrink-0 text-white [&>svg]:h-7 [&>svg]:w-7 lg:[&>svg]:h-5 lg:[&>svg]:w-5">{a.icone}</span>
                    <span>
                      <span className="block text-[14px] font-semibold">{a.nome}</span>
                      <span className="block text-[12px] leading-snug text-white/65">{sugestao ?? a.explicacao}</span>
                    </span>
                  </button>
                )
              })}
            </div>
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

      {/* modal da conta — abre ao tocar na foto, igual à Sidebar */}
      {modalAberto && (
        <ModalPerfil
          plano={plano}
          usuario={usuario}
          aoEntrar={entrar}
          aoSair={sair}
          aoFechar={() => setModalAberto(false)}
          irParaConfig={() => {
            setModalAberto(false)
            navigate('/config')
          }}
          aoAbrirPerfil={() => {
            setModalAberto(false)
            setPerfilModalAberto(true)
          }}
        />
      )}

      {/* formulário grande de perfil (edição manual a partir do modal da conta) */}
      {perfilModalAberto && perfil && (
        <PerfilModal
          perfil={perfil}
          onboarding={onboardingPendente}
          aoSalvar={salvarPerfil}
          aoFechar={() => setPerfilModalAberto(false)}
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
