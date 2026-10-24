import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChats } from '../chats'
import type { Chat } from '../../domain/chat'
import { useAuth, type Usuario } from '../auth'
import PerfilModal from './PerfilModal'
import FotoPerfil from '../components/FotoPerfil'

/*
  Menu lateral. DOIS comportamentos, por tamanho de tela:
  - MOBILE (<lg): drawer no modelo "empurrar" — fica FIXO atras, colado a
    esquerda (absolute, 78% de largura). Quem desliza e o conteudo da Home,
    revelando este painel; overlay/animacao sao responsabilidade da Home.
    O 78% daqui bate com o translate-x-[78%] que a Home aplica ao empurrar.
  - DESKTOP (lg+): vira uma COLUNA FIXA (relative, 280px), sempre visivel ao
    lado do conteudo. Sem deslizar, sem overlay — faz parte do layout.

  apenasDesktop: quando true, a sidebar NAO existe no mobile (hidden) e so
  aparece como coluna no lg+. Usado em telas que no celular sao tela cheia
  (ex.: modo Estudar), mas que no PC devem exibir a sidebar fixa do lado.
*/

function Sidebar({
  aoSelecionar,
  apenasDesktop = false,
  escondidoNoDesktop = false,
}: {
  aoSelecionar: () => void
  apenasDesktop?: boolean
  // true no Painel: a Sidebar vira SÓ o drawer do mobile — no desktop (lg+)
  // não aparece como coluna (o Painel não tem Sidebar fixa; ela volta nas
  // áreas de trabalho, como Chat e Estudar).
  escondidoNoDesktop?: boolean
}) {
  const { chats, chatAtivoId, renomearChat, alternarFixar, excluirChat } = useChats()
  const { usuario, perfil, onboardingPendente, salvarPerfil, entrar, sair } = useAuth()
  const navigate = useNavigate()

  // controla o modal da conta (abre ao tocar no cartão de perfil)
  const [modalAberto, setModalAberto] = useState(false)
  // controla o FORMULÁRIO de perfil (nome/curso/matérias/nível) — maior, tela própria
  const [perfilModalAberto, setPerfilModalAberto] = useState(false)
  // Provas e Cronograma ainda não têm tela própria — mesmo aviso "em breve" do Painel
  const [emBreve, setEmBreve] = useState<'provas' | 'cronograma' | null>(null)

  // Onboarding automático: loga e falta o curso → abre o formulário sozinho,
  // uma vez (o aluno pode fechar com "Agora não"; reaparece no próximo login
  // se ainda estiver incompleto).
  useEffect(() => {
    if (onboardingPendente) setPerfilModalAberto(true)
  }, [onboardingPendente])

  // estado do histórico:
  // - menuChatId: qual chat está com o menuzinho (⋯ / long-press) aberto
  // - editandoId: qual chat está com o nome em edição inline
  // - excluindoId: qual chat está aguardando confirmação de exclusão
  const [menuChatId, setMenuChatId] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  // Fixados sempre no topo. sort() é ESTÁVEL em JS moderno, então dentro de cada
  // grupo (fixados / não-fixados) a ordem de recência original é preservada.
  const chatsOrdenados = [...chats].sort(
    (a, b) => Number(b.fixado ?? false) - Number(a.fixado ?? false),
  )
  const chatExcluindo = chats.find((c) => c.id === excluindoId)

  // AMOSTRA: fixo em 'free' pra visualizarmos o cartão "Evolua seu nível".
  // Depois virá do contexto de usuário; troque pra 'pro' pra ver o outro estado.
  const plano: 'free' | 'pro' = 'free'

  // abre um chat do histórico (ou um chat em branco) e fecha o menu. Navega
  // em vez de só trocar o estado — a URL (/chat ou /chat/:id) é quem manda;
  // quem está na tela (Conversa) sincroniza o chat ativo a partir dela.
  function abrir(id: string | null) {
    navigate(id ? `/chat/${id}` : '/chat')
    aoSelecionar()
  }

  // vai pra outra rota e fecha o menu
  function irPara(rota: string) {
    navigate(rota)
    aoSelecionar()
  }

  return (
    <aside
      className={`${apenasDesktop ? 'hidden lg:flex' : 'absolute inset-y-0 left-0 w-[78%] flex'} flex-col bg-black text-white ${
        escondidoNoDesktop
          ? 'lg:hidden'
          : 'lg:relative lg:inset-auto lg:flex lg:w-[240px] lg:shrink-0 lg:border-r lg:border-white/10'
      }`}
    >
      {/* itens do menu (sem logo: as opções sobem pro topo, respeitando o notch) */}
      <nav className="flex flex-col gap-1 p-4 pt-[max(1.5rem,env(safe-area-inset-top))] lg:gap-0 lg:p-3 lg:pt-[max(1.25rem,env(safe-area-inset-top))]">
        <ItemMenu label="Home" icone={<IconeHome />} onClick={() => irPara('/')} />
        <ItemMenu label="Novo Chat" icone={<IconeChat />} onClick={() => abrir(null)} />
        <ItemMenu label="Sessões de Estudos" icone={<IconeLivro />} onClick={() => irPara('/sessoes')} />
        <ItemMenu label="Provas" icone={<IconeLua />} onClick={() => setEmBreve('provas')} />
        <ItemMenu label="Trabalhos" icone={<IconeEstrelaCadente />} onClick={() => irPara('/trabalhos')} />
        <ItemMenu label="Cronograma" icone={<IconeCalendario />} onClick={() => setEmBreve('cronograma')} />
      </nav>

      {/* separação em linha antes do histórico */}
      <div className="mx-4 border-t border-white/10 lg:mx-3" aria-hidden="true" />

      {/* histórico de chats (rola quando tiver muitos) */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-3">
        {chats.length > 0 && (
          <p className="px-1 pb-2 pt-1 text-xs uppercase tracking-wide text-white/40">Histórico</p>
        )}
        <div className="flex flex-col gap-1">
          {chatsOrdenados.map((c) => (
            <ItemHistorico
              key={c.id}
              chat={c}
              ativo={chatAtivoId === c.id}
              editando={editandoId === c.id}
              menuAberto={menuChatId === c.id}
              aoAbrir={() => abrir(c.id)}
              aoAbrirMenu={() => setMenuChatId(c.id)}
              aoFecharMenu={() => setMenuChatId(null)}
              aoIniciarEdicao={() => {
                setMenuChatId(null)
                setEditandoId(c.id)
              }}
              aoSalvarNome={(novo) => {
                renomearChat(c.id, novo)
                setEditandoId(null)
              }}
              aoCancelarEdicao={() => setEditandoId(null)}
              aoAlternarFixar={() => {
                alternarFixar(c.id)
                setMenuChatId(null)
              }}
              aoPedirExcluir={() => {
                setMenuChatId(null)
                setExcluindoId(c.id)
              }}
            />
          ))}
        </div>
      </div>

      {/* rodape: cartao do usuario.
          O container NÃO é um button: dentro dele há botões (avatar/nome e o CTA),
          e button-dentro-de-button é HTML inválido. Cada área tem seu próprio botão. */}
      <div className="mt-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Cartão: SEM borda por padrão; no hover ganha borda branca + fundo cinza e
            avança sutilmente (scale+lift) com transição suave — recua ao sair.
            É um <div> (não button): dentro há botões irmãos (avatar/nome e o CTA). */}
        <div className="flex w-full items-center gap-3.5 rounded-3xl border border-transparent p-3 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:border-white/25 hover:bg-white/5 lg:gap-3">
          <button type="button" onClick={() => setModalAberto(true)} aria-label="Abrir conta" className="shrink-0">
            <FotoPerfil foto={usuario?.foto} className="h-16 w-16 rounded-full lg:h-14 lg:w-14" />
          </button>
          <div className="min-w-0 flex-1 font-sans leading-tight">
            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className="block max-w-full truncate text-left text-[17px] font-semibold text-white lg:text-[15px]"
            >
              {usuario ? usuario.nome : 'Visitante'}
            </button>
            <p className="truncate text-sm text-white/50 lg:text-xs">
              {usuario ? (usuario.email ?? 'Conta Google') : 'Toque para entrar'}
            </p>
            {usuario &&
              (plano === 'free' ? (
                // CTA de upgrade (pill) — aparece SÓ no plano Free, pra quem já está logado.
                // TODO: abrir direto na aba Planos quando ela existir.
                <button
                  type="button"
                  onClick={() => setModalAberto(true)}
                  className="aurora-btn mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium text-white/90 [&_svg]:h-4 [&_svg]:w-4 lg:mt-1.5 lg:px-2.5 lg:py-1 lg:text-xs lg:[&_svg]:h-[15px] lg:[&_svg]:w-[15px]"
                >
                  <span className="aurora-brilho" aria-hidden="true" />
                  <span className="relative z-10 inline-flex items-center gap-1">
                    <IconeEstrelas />
                    Evolua seu nível
                  </span>
                </button>
              ) : (
                <p className="mt-0.5 text-sm text-white/50 lg:text-xs">Pro</p>
              ))}
          </div>
        </div>
      </div>

      {/* modal da conta */}
      {modalAberto && (
        <ModalPerfil
          plano={plano}
          usuario={usuario}
          aoEntrar={entrar}
          aoSair={sair}
          aoFechar={() => setModalAberto(false)}
          irParaConfig={() => {
            setModalAberto(false)
            irPara('/config')
          }}
          aoAbrirPerfil={() => {
            setModalAberto(false)
            setPerfilModalAberto(true)
          }}
        />
      )}

      {/* formulário grande de perfil (onboarding automático OU edição manual) */}
      {perfilModalAberto && perfil && (
        <PerfilModal
          perfil={perfil}
          onboarding={onboardingPendente}
          aoSalvar={salvarPerfil}
          aoFechar={() => setPerfilModalAberto(false)}
        />
      )}

      {/* "em breve": Provas e Tarefas ainda não têm tela própria */}
      {emBreve && (
        <ModalAviso
          titulo={EM_BREVE_SIDEBAR[emBreve].titulo}
          descricao={EM_BREVE_SIDEBAR[emBreve].descricao}
          aoFechar={() => setEmBreve(null)}
        />
      )}

      {/* confirmação de exclusão de chat */}
      {chatExcluindo && (
        <ModalConfirmar
          titulo="Excluir este chat?"
          descricao={`“${chatExcluindo.titulo}” será removido do histórico. Essa ação não pode ser desfeita.`}
          rotuloConfirmar="Excluir"
          aoConfirmar={() => {
            excluirChat(chatExcluindo.id)
            setExcluindoId(null)
          }}
          aoFechar={() => setExcluindoId(null)}
        />
      )}
    </aside>
  )
}

/* ===== um item do histórico (com menu de opções) =====
   No DESKTOP: botão ⋯ aparece no hover e abre o menu.
   No MOBILE: não há ⋯ — segurar o item (long-press ~0.5s) abre o mesmo menu.
   Opções: editar nome (inline), fixar/desafixar e excluir. */
function ItemHistorico({
  chat,
  ativo,
  editando,
  menuAberto,
  aoAbrir,
  aoAbrirMenu,
  aoFecharMenu,
  aoIniciarEdicao,
  aoSalvarNome,
  aoCancelarEdicao,
  aoAlternarFixar,
  aoPedirExcluir,
}: {
  chat: Chat
  ativo: boolean
  editando: boolean
  menuAberto: boolean
  aoAbrir: () => void
  aoAbrirMenu: () => void
  aoFecharMenu: () => void
  aoIniciarEdicao: () => void
  aoSalvarNome: (novo: string) => void
  aoCancelarEdicao: () => void
  aoAlternarFixar: () => void
  aoPedirExcluir: () => void
}) {
  // timer do long-press no mobile
  const timerRef = useRef<number | null>(null)
  // marca que a abertura veio de um long-press, pra o clique seguinte NÃO abrir o chat
  const longPressRef = useRef(false)

  function iniciarPressao() {
    longPressRef.current = false
    timerRef.current = window.setTimeout(() => {
      longPressRef.current = true
      aoAbrirMenu()
    }, 500)
  }
  function cancelarPressao() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // MODO EDIÇÃO: o nome vira um input ali mesmo (componente à parte, montado só agora).
  if (editando) {
    return <InputNome valorInicial={chat.titulo} aoSalvar={aoSalvarNome} aoCancelar={aoCancelarEdicao} />
  }

  return (
    <div className="group/item relative">
      <button
        type="button"
        onClick={() => {
          // se acabou de abrir por long-press, engole este clique (não abre o chat)
          if (longPressRef.current) {
            longPressRef.current = false
            return
          }
          aoAbrir()
        }}
        onTouchStart={iniciarPressao}
        onTouchEnd={cancelarPressao}
        onTouchMove={cancelarPressao}
        onContextMenu={(e) => e.preventDefault()}
        className={`flex w-full select-none items-center gap-2 rounded-lg py-2.5 pl-3 pr-9 text-left text-[15px] transition-colors hover:bg-white/5 lg:py-2 lg:text-sm ${
          ativo ? 'bg-white/10 text-white' : 'text-white/80'
        }`}
      >
        {chat.fixado && (
          <span className="shrink-0 text-white/45" aria-label="Fixado">
            <IconePino />
          </span>
        )}
        <span className="truncate">{chat.titulo}</span>
      </button>

      {/* ⋯ só no desktop (lg+): no mobile o menu abre por long-press */}
      <button
        type="button"
        onClick={aoAbrirMenu}
        aria-label="Opções do chat"
        className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-md p-1.5 text-white/60 opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover/item:opacity-100 lg:block"
      >
        <IconeTresPontos />
      </button>

      {menuAberto && (
        <>
          {/* capta o clique fora pra fechar */}
          <div className="fixed inset-0 z-40" onClick={aoFecharMenu} />
          <div className="animar-subida absolute right-1 top-full z-50 mt-1 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#141416] py-1 shadow-xl shadow-black/40 lg:w-44">
            <BotaoMenuChat icone={<IconeLapis />} label="Editar nome" onClick={aoIniciarEdicao} />
            <BotaoMenuChat
              icone={<IconePino />}
              label={chat.fixado ? 'Desafixar' : 'Fixar no topo'}
              onClick={aoAlternarFixar}
            />
            <div className="my-1 border-t border-white/10" />
            <BotaoMenuChat icone={<IconeLixeira />} label="Excluir" perigo onClick={aoPedirExcluir} />
          </div>
        </>
      )}
    </div>
  )
}

// Input de edição do nome do chat. Fica num componente PRÓPRIO porque só é montado
// quando a edição começa — assim o guard `finalizado` nasce zerado a cada edição,
// sem precisar de efeito nem de ref lido no render.
// Não-controlado (defaultValue): o texto vive no DOM e só é lido ao salvar.
// Enter salva · Esc cancela · blur salva. O guard evita Esc+blur salvarem em dobro.
function InputNome({
  valorInicial,
  aoSalvar,
  aoCancelar,
}: {
  valorInicial: string
  aoSalvar: (novo: string) => void
  aoCancelar: () => void
}) {
  const finalizadoRef = useRef(false)
  function salvar(valor: string) {
    if (finalizadoRef.current) return
    finalizadoRef.current = true
    aoSalvar(valor)
  }
  function cancelar() {
    if (finalizadoRef.current) return
    finalizadoRef.current = true
    aoCancelar()
  }
  return (
    <input
      autoFocus
      defaultValue={valorInicial}
      onKeyDown={(e) => {
        if (e.key === 'Enter') salvar(e.currentTarget.value)
        if (e.key === 'Escape') cancelar()
      }}
      onBlur={(e) => salvar(e.currentTarget.value)}
      className="w-full rounded-lg border border-white/25 bg-white/10 px-3 py-2.5 text-[15px] text-white outline-none focus:border-white/40 lg:py-2 lg:text-sm"
    />
  )
}

// Item do menuzinho do chat (⋯). `perigo` pinta de vermelho (usado no Excluir).
function BotaoMenuChat({
  label,
  icone,
  onClick,
  perigo = false,
}: {
  label: string
  icone: ReactNode
  onClick?: () => void
  perigo?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-white/5 [&>svg]:h-[18px] [&>svg]:w-[18px] lg:py-2 lg:text-sm lg:[&>svg]:h-4 lg:[&>svg]:w-4 ${
        perigo ? 'text-red-400' : 'text-white/90'
      }`}
    >
      {icone}
      {label}
    </button>
  )
}

// conteúdo do aviso "em breve" dos itens novos do menu que ainda não têm tela
const EM_BREVE_SIDEBAR: Record<'provas' | 'cronograma', { titulo: string; descricao: string }> = {
  provas: {
    titulo: 'Provas — em breve',
    descricao:
      'Um modo de treino separado do Estudar: perguntas cronometradas, acertos e erros ' +
      'registrados, várias tentativas e explicação de cada resposta — pra treinar pra prova ' +
      'ou concurso igual quem já sabe o conteúdo, só precisa de ritmo e repertório.',
  },
  cronograma: {
    titulo: 'Cronograma — em breve',
    descricao:
      'Suas aulas, provas e entregas organizadas num calendário único — pra não depender de ' +
      'lembrar de cabeça o que vem a seguir.',
  },
}

/* ===== modal de aviso genérico (só informa, um botão "Entendi") ===== */
function ModalAviso({ titulo, descricao, aoFechar }: { titulo: string; descricao: string; aoFechar: () => void }) {
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center" role="dialog" aria-modal="true">
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

/* ===== modal de confirmação genérico (usado no Excluir chat) ===== */
function ModalConfirmar({
  titulo,
  descricao,
  rotuloConfirmar,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string
  descricao: string
  rotuloConfirmar: string
  aoConfirmar: () => void
  aoFechar: () => void
}) {
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={aoFechar} />
      <div className="animar-subida relative z-10 w-full border border-white/10 bg-[#141416] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white rounded-t-3xl lg:w-[22rem] lg:rounded-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 lg:hidden" />
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="mt-1.5 text-sm text-white/60">{descricao}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={aoFechar}
            className="flex-1 rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aoConfirmar}
            className="flex-1 rounded-full bg-red-500/90 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            {rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}

// Um item do menu: pilula com borda, icone + texto.
function ItemMenu({ label, icone, onClick }: { label: string; icone: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full rounded-full px-4 py-3 text-left text-[17px] text-white/90 transition-colors hover:bg-white/5 active:bg-white/5 [&>svg]:h-[30px] [&>svg]:w-[30px] lg:px-3 lg:py-1.5 lg:text-[14px] lg:[&>svg]:h-[22px] lg:[&>svg]:w-[22px]"
    >
      {icone}
      {label}
    </button>
  )
}

/* ===== icones (SVG simples, herdam a cor do texto) ===== */

// Casinha — leva de volta ao Painel ("/")
function IconeHome() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9.5a1 1 0 0 0 1 1h3.5v-6h3v6H17a1 1 0 0 0 1-1V10" />
    </svg>
  )
}

function IconeChat() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-12.1 7.6L3 21l1.9-5.9A8.4 8.4 0 1 1 21 11.5z" />
      <circle cx="8.5" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconeLivro() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6.5 11.5 12 16.5 5.5M11.5 12 14 18.5M16.5 5.5 19.5 13" />
      <circle cx="5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="14" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="13" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconeCalendario() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-28 12 12)" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="7.5" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Trabalhos: estrela cadente — algo sendo "escrito/produzido", deixando um rastro
function IconeEstrelaCadente() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 3.5l1.3 3 3 1.3-3 1.3-1.3 3-1.3-3-3-1.3 3-1.3z" fill="currentColor" stroke="none" />
      <path d="M4.5 20c3.2-.3 5.9-1.6 7.6-4.3" />
      <path d="M4.5 20l2.6-.4M4.5 20l.4-2.6" />
    </svg>
  )
}

// Provas: lua crescente — a noite de revisão antes da prova
function IconeLua() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function IconeSliders() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2.3" fill="black" />
      <circle cx="15" cy="12" r="2.3" fill="black" />
      <circle cx="8" cy="17" r="2.3" fill="black" />
    </svg>
  )
}

/* ===== modal da conta ===== */

// Abre ao tocar no cartão de perfil. No mobile é um bottom sheet (sobe de baixo);
// no desktop, um cartão centralizado. Opções com ícones de tema orbital.
export function ModalPerfil({
  plano,
  usuario,
  aoEntrar,
  aoSair,
  aoFechar,
  irParaConfig,
  aoAbrirPerfil,
}: {
  plano: 'free' | 'pro'
  usuario: Usuario | null
  aoEntrar: () => Promise<void>
  aoSair: () => Promise<void>
  aoFechar: () => void
  irParaConfig: () => void
  aoAbrirPerfil: () => void
}) {
  // Esc fecha (acessibilidade no desktop)
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  return (
    // MOBILE: bottom-sheet centralizado, com véu escuro atrás (fecha ao tocar fora).
    // DESKTOP (lg+): vira um POPOVER ancorado em cima do cartão de perfil da Sidebar
    // (que fica no canto inferior esquerdo) — por isso troca o `flex items-center`
    // (modal no meio da tela) por posicionamento absoluto perto do cartão, sem véu
    // escurecendo o resto da tela (só um fundo clicável, pra fechar ao tocar fora).
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:block" role="dialog" aria-modal="true">
      {/* fundo — no mobile escurece/borra; no desktop é só a área clicável de fechar */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none" onClick={aoFechar} />

      {/* painel */}
      <div className="animar-subida relative z-10 w-full border border-white/10 bg-[#141416] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white rounded-t-3xl lg:absolute lg:bottom-28 lg:left-4 lg:w-[239px] lg:rounded-3xl lg:shadow-2xl lg:shadow-black/50">
        {/* puxador (só no mobile) */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 lg:hidden" />

        {/* cabeçalho: quem está logado (ou "visitante", pra quem usa anônimo) */}
        <div className="flex items-center gap-3 px-1 pb-3">
          <FotoPerfil foto={usuario?.foto} className="h-12 w-12 shrink-0 rounded-full" />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold">{usuario ? usuario.nome : 'Visitante'}</p>
            <p className={`text-sm ${plano === 'free' ? 'text-[#f0c75e]' : 'text-white/50'}`}>
              {usuario ? (plano === 'free' ? 'Plano Free' : 'Plano Pro') : 'Modo anônimo'}
            </p>
          </div>
        </div>

        <div className="mb-1.5 border-t border-white/10" />

        {/* opções — Configurações em penúltimo, Entrar/Sair por último.
            TODO: Perfil/Personalização/Planos ainda não têm destino;
            por ora só fecham o modal. */}
        <nav className="flex flex-col">
          {usuario && <ItemModal icone={<IconePerfil />} label="Perfil" onClick={aoAbrirPerfil} />}
          <ItemModal icone={<IconePersonalizacao />} label="Personalização" onClick={aoFechar} />
          <ItemModal icone={<IconePlanos />} label="Planos" onClick={aoFechar} />
          <ItemModal icone={<IconeSliders />} label="Configurações" onClick={irParaConfig} />
          <div className="my-1.5 border-t border-white/10" />
          {usuario ? (
            <ItemModal
              icone={<IconeSair />}
              label="Sair"
              perigo
              onClick={() => {
                aoSair()
                aoFechar()
              }}
            />
          ) : (
            <ItemModal
              icone={<IconeGoogle />}
              label="Entrar com Google"
              onClick={() => {
                // aoEntrar() redireciona pro Google — a tela só muda DEPOIS do
                // redirecionamento. Mas se o Supabase não estiver configurado
                // (ou o provedor falhar antes de redirecionar), o erro não pode
                // sumir em silêncio — por isso o catch + aviso aqui.
                aoEntrar()
                  .then(() => aoFechar())
                  .catch((e: unknown) => {
                    window.alert(e instanceof Error ? e.message : 'Não foi possível entrar com o Google.')
                  })
              }}
            />
          )}
        </nav>
      </div>
    </div>
  )
}

// "G" do Google (quatro arcos coloridos) — usado no botão "Entrar com Google"
function IconeGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.55c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.55-2.77c-.98.66-2.23 1.06-3.73 1.06-2.87 0-5.3-1.94-6.17-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.83 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.65-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.65 2.84c.87-2.6 3.3-4.53 6.17-4.53z"
      />
    </svg>
  )
}

// Item do modal: ícone + texto. `perigo` pinta de vermelho (usado no Sair).
function ItemModal({
  label,
  icone,
  onClick,
  perigo = false,
}: {
  label: string
  icone: ReactNode
  onClick?: () => void
  perigo?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-white/5 active:bg-white/5 ${
        perigo ? 'text-red-400' : 'text-white/90'
      }`}
    >
      {icone}
      {label}
    </button>
  )
}

/* ===== icones do modal (tema orbital, traço 1.6 pra legibilidade no menor tamanho) ===== */

// Perfil: a pessoa dentro de um anel (a "órbita" da conta)
function IconePerfil() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.3" />
      <circle cx="12" cy="10" r="2.7" />
      <path d="M6.8 18a5.3 5.3 0 0 1 10.4 0" />
    </svg>
  )
}

// Personalização: planeta com anel (Saturno) + uma faísca de "estilo"
function IconePersonalizacao() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="12.5" r="4.4" />
      <ellipse cx="11" cy="12.5" rx="9.3" ry="2.9" transform="rotate(-20 11 12.5)" />
      <path d="M19 3.5l.55 1.75L21.3 5.8l-1.75.55L19 8.1l-.55-1.75L16.7 5.8l1.75-.55z" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Planos: órbitas concêntricas = níveis/tiers, com um satélite na órbita externa
function IconePlanos() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="21" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Sair: seta deixando a órbita (arco aberto à direita)
function IconeSair() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 5.2a7.5 7.5 0 1 0 0 13.6" />
      <path d="M11 12h10M18 9l3 3-3 3" />
    </svg>
  )
}

// Estrelas: chamariz "Evolua seu nível" no cartão Free (preenchidas, herdam a cor dourada)
function IconeEstrelas() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M11 2.5l1.7 4 4 1.7-4 1.7L11 13.9l-1.7-4L5.3 8.2l4-1.7z" />
      <path d="M18.5 13l.85 2 2 .85-2 .85-.85 2-.85-2-2-.85 2-.85z" />
    </svg>
  )
}

/* ===== ícones do menu do histórico ===== */

// Três pontinhos verticais (abre o menu de opções do chat)
function IconeTresPontos() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  )
}

// Pino (fixar no topo)
function IconePino() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6l-1 5 3 3H7l3-3-1-5z" />
      <path d="M12 14v7" />
    </svg>
  )
}

// Lápis (editar nome)
function IconeLapis() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

// Lixeira (excluir)
function IconeLixeira() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" />
    </svg>
  )
}

export default Sidebar
