import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useChats } from '../chats'
import { useStudies } from '../studies'

/*
  Menu lateral (drawer) no modelo "empurrar":
  fica FIXO atras, colado a esquerda. Quem desliza e o conteudo da Home,
  revelando este painel. Por isso aqui nao ha overlay nem animacao -
  isso e responsabilidade da Home.

  A largura (LARGURA_MENU) deve bater com o quanto a Home e empurrada.
*/

export const LARGURA_MENU = '78%'

function Sidebar({ aoSelecionar }: { aoSelecionar: () => void }) {
  const { chats, setChatAtivo } = useChats()
  const { estudos } = useStudies()
  const navigate = useNavigate()

  // abre um chat do histórico (ou volta pra saudação) e fecha o menu
  function abrir(id: string | null) {
    setChatAtivo(id)
    aoSelecionar()
  }

  // vai pra outra rota e fecha o menu
  function irPara(rota: string) {
    navigate(rota)
    aoSelecionar()
  }

  return (
    <aside
      className="absolute inset-y-0 left-0 flex flex-col bg-[#1a1a1c] text-white"
      style={{ width: LARGURA_MENU }}
    >
      {/* topo: logo (brightness-0 + invert => branco no fundo escuro) */}
      <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4">
        <img src="/logo.png" alt="Astrodny" className="h-8 w-auto brightness-0 invert" />
      </div>
      <div className="mx-5 border-t border-white/15" />

      {/* itens do menu */}
      <nav className="flex flex-col gap-1 p-4">
        <ItemMenu label="Novo Chat" icone={<IconeChat />} onClick={() => abrir(null)} />
        <ItemMenu label="Novo Pensamento" icone={<IconeIdeia />} />
        <ItemMenu label="Projetos" icone={<IconeLivro />} />
        <ItemMenu label="Cronograma" icone={<IconeCalendario />} />
        <ItemMenu label="Configurações" icone={<IconeEngrenagem />} onClick={() => irPara('/config')} />
      </nav>

      {/* histórico de estudos e de chats (rola quando tiver muitos) */}
      <div className="flex-1 overflow-y-auto px-4">
        {/* Estudos feitos: nome + nota + data (só leitura por enquanto) */}
        {estudos.length > 0 && (
          <>
            <p className="px-1 pb-2 pt-1 text-xs uppercase tracking-wide text-white/40">Estudos</p>
            <div className="mb-4 flex flex-col gap-1">
              {estudos.map((e) => (
                <div key={e.id} className="rounded-lg px-3 py-2">
                  <p className="truncate text-sm text-white/90">{e.estudo.nome}</p>
                  <p className="text-xs text-white/50">
                    {e.resultado.acertos}/{e.resultado.total} acertos ·{' '}
                    {new Date(e.data).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {chats.length > 0 && (
          <p className="px-1 pb-2 pt-1 text-xs uppercase tracking-wide text-white/40">Histórico</p>
        )}
        <div className="flex flex-col gap-1">
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => abrir(c.id)}
              className="truncate rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5"
            >
              {c.titulo}
            </button>
          ))}
        </div>
      </div>

      {/* rodape: cartao do usuario */}
      <div className="mt-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 rounded-full border border-white/25 p-2 pr-4">
          <img src="/perfil.png" alt="" className="h-11 w-11 rounded-full object-cover" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Abner Levino • TADS</p>
            <p className="text-sm text-white/50">Pro</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

// Um item do menu: pilula com borda, icone + texto.
function ItemMenu({ label, icone, onClick }: { label: string; icone: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full rounded-full px-4 py-2.5 text-left text-[15px] text-white/90 transition-colors hover:bg-white/5 active:bg-white/5"
    >
      {icone}
      {label}
    </button>
  )
}

/* ===== icones (SVG simples, herdam a cor do texto) ===== */

function IconeChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 8v6M9 11h6" />
    </svg>
  )
}

function IconeIdeia() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
    </svg>
  )
}

function IconeLivro() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 7v14" />
      <path d="M12 7c-1.5-1.3-3.5-2-6-2H3v13h3c2.5 0 4.5.7 6 2 1.5-1.3 3.5-2 6-2h3V5h-3c-2.5 0-4.5.7-6 2z" />
    </svg>
  )
}

function IconeCalendario() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  )
}

function IconeEngrenagem() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export default Sidebar
