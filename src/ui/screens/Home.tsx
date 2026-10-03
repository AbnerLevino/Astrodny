/*
  Tela principal (Home) — é TAMBÉM onde a conversa acontece, na MESMA tela.
  - Sem conversa ativa: mostra a saudação (+ chips + campo).
  - Ao enviar: vira um chat novo (entra no histórico) e as mensagens aparecem
    AQUI MESMO, no lugar da saudação. Nada de tela separada.
  Tocar na foto de perfil abre o menu lateral (Sidebar).
*/
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar, { LARGURA_MENU } from './Sidebar'
import { useChats } from '../chats'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const ALTURA_MAX = 160 // teto do campo (px): passou disso, rola em vez de crescer
// status "pensando" (fake por enquanto; depois refletem as fases reais da IA)
const STATUS = ['Pensando sobre isso…', 'Organizando a resposta…', 'Escrevendo…']

// Saudacao muda conforme a hora (Bom dia / Boa tarde / Boa noite).
function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function Home() {
  const [menuAberto, setMenuAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [focado, setFocado] = useState(false) // campo em foco? controla a expansão/descida do composer
  const [statusIdx, setStatusIdx] = useState(0)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fimRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { criarChat, enviarMensagem, editarMensagem, pararResposta, obterChat, chatAtivoId, pensandoId } = useChats()

  const chatAtivo = chatAtivoId ? obterChat(chatAtivoId) : undefined

  // status do "pensando" trocando em sequência
  useEffect(() => {
    const t = setInterval(() => setStatusIdx((i) => (i + 1) % STATUS.length), 1500)
    return () => clearInterval(t)
  }, [])

  const qtd = chatAtivo?.mensagens.length ?? 0

  // Rola pro fim SÓ quando entra mensagem nova (você envia / a IA começa a responder).
  // Durante a escrita NÃO rolamos: o texto cresce embaixo e você lê no seu ritmo,
  // sem a tela te arrastando pra baixo.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [qtd])

  // campo que cresce por linha (auto-resize) até um teto, depois rola
  function ajustarAltura() {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, ALTURA_MAX) + 'px'
  }

  function enviar() {
    const limpo = texto.trim()
    if (!limpo) return
    if (chatAtivoId) enviarMensagem(chatAtivoId, limpo) // continua o chat aberto
    else criarChat(limpo) // primeira mensagem: cria chat novo (já vira o ativo)
    setTexto('')
    // no celular, some o teclado ao enviar (a mensagem entra e a tela volta ao normal)
    if (window.matchMedia('(pointer: coarse)').matches) areaRef.current?.blur()
    requestAnimationFrame(() => {
      if (areaRef.current) areaRef.current.style.height = 'auto'
    })
  }

  // A IA está "gerando" (pensando OU escrevendo) se o chat aberto é o que aguarda.
  // Estado explícito no Context — não dá pra deduzir pela última mensagem.
  const ultima = chatAtivo?.mensagens[chatAtivo.mensagens.length - 1]
  const gerando = !!chatAtivoId && pensandoId === chatAtivoId
  const mostrarPensando = gerando && ultima?.autor !== 'ia' // ainda não começou a escrever (pontinhos)
  const escrevendo = gerando && ultima?.autor === 'ia' // já está digitando o texto (cursor)

  return (
    // frame: o Sidebar fica FIXO atras (esquerda); o conteudo desliza pra
    // direita e desfoca quando o menu abre. overflow-hidden corta o excesso.
    <div className="relative overflow-hidden min-h-dvh bg-[#1a1a1c]">
      <Sidebar aoSelecionar={() => setMenuAberto(false)} />

      <div
        className={`relative z-10 min-h-dvh transition-all duration-300 ${menuAberto ? 'blur-[2px]' : ''}`}
        style={{ transform: menuAberto ? `translateX(${LARGURA_MENU})` : 'translateX(0)' }}
      >
        {/* camada de fundo AURORA: manchas de azul que orbitam e se misturam */}
        <div className="fundo-aurora absolute inset-0 -z-30">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <span className="blob blob-3" />
        </div>
        {/* camada escura que surge quando há conversa ativa (troca animada).
            NÃO cobre 100%: fica semitransparente pra a aurora continuar aparecendo
            por baixo, só que bem mais fraca. Na home (sem chat) ela some e a aurora
            volta no talo. */}
        <div
          className={`absolute inset-0 -z-20 bg-[#1e1f24] transition-opacity duration-500 ${chatAtivo ? 'opacity-[0.82]' : 'opacity-0'}`}
        />
        {/* camada CINZA que surge com fade ao abrir o menu */}
        <div
          className={`absolute inset-0 -z-10 bg-[#2e2f36] transition-opacity duration-300 ${menuAberto ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* conteudo real, acima das duas camadas de fundo */}
        <div className="relative h-dvh flex flex-col text-white">
          {/* ===== ZONA 1: topo (avatar + logo) — SOBREPOSTO; as mensagens rolam por trás ===== */}
          <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
            <button type="button" aria-label="Abrir menu" onClick={() => setMenuAberto(true)} className="shrink-0">
              <img src="/perfil.png" alt="Foto de perfil" className="h-12 w-12 rounded-full object-cover border-2 border-white" />
            </button>
            <img src="/logo.png" alt="Astrodny" className="h-9 w-auto" />
          </header>

          {/* fade no topo: o texto se dissolve suavemente ao passar por trás do header
              (só na conversa, onde o fundo é o cinza escuro #1e1f24) */}
          {chatAtivo && (
            <div className="pointer-events-none absolute top-0 inset-x-0 z-10 h-[calc(env(safe-area-inset-top)+4.5rem)] bg-gradient-to-b from-[#1e1f24] to-transparent" />
          )}

          {/* ===== ZONA 2: saudação OU conversa (mesma tela) ===== */}
          {chatAtivo ? (
            <main className="flex-1 overflow-y-auto sem-scrollbar px-4 pb-[calc(11rem+var(--kb,0px))] pt-[calc(env(safe-area-inset-top)+5rem)] flex flex-col gap-4">
              {chatAtivo.mensagens.map((m, i) =>
                m.autor === 'user' ? (
                  // mensagem do usuário: balão à direita, com copiar + editar/reenviar
                  <MensagemUsuario
                    key={i}
                    texto={m.texto}
                    aoSalvar={(novo) => editarMensagem(chatAtivoId!, i, novo)}
                  />
                ) : (
                  // resposta da IA: textão corrido (sem balão), com **negrito** e
                  // cursor piscando enquanto ainda está sendo escrita.
                  <div
                    key={i}
                    className="animar-subida break-words font-sans text-[15px] leading-relaxed text-white/90"
                  >
                    <TextoIA texto={m.texto} />
                    {escrevendo && i === chatAtivo.mensagens.length - 1 ? (
                      <span className="cursor-piscando ml-0.5 inline-block">▍</span>
                    ) : (
                      // copiar a resposta inteira — só quando já terminou de escrever
                      <div className="mt-1">
                        <BotaoCopiar texto={m.texto} titulo="Copiar resposta" />
                      </div>
                    )}
                  </div>
                ),
              )}

              {/* "pensando": o "A" da marca dando pulinhos na frente do status.
                  invert = o PNG é preto sobre fundo transparente; invertido fica
                  branco, visível no escuro (mesma imagem, só a cor trocada). */}
              {mostrarPensando && (
                <div className="animar-subida flex items-center gap-2.5 text-white/60">
                  <img src="/logo-a.png" alt="" className="h-5 w-5 shrink-0 animate-bounce invert" />
                  <span className="text-sm">{STATUS[statusIdx]}</span>
                </div>
              )}
              <div ref={fimRef} />
            </main>
          ) : (
            <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-2xl text-white/85">{saudacao()}, Universitário!</p>
              <h1 className="text-2xl font-bold">O que temos para fazer hoje?</h1>
            </main>
          )}

          {/* fade embaixo: as mensagens se dissolvem ao passar por trás do input
              (espelho do fade do topo; só na conversa) */}
          {chatAtivo && (
            <div className="pointer-events-none absolute bottom-0 inset-x-0 z-10 h-36 bg-gradient-to-t from-[#1e1f24] to-transparent" />
          )}

          {/* ===== ZONA 3: pílulas flutuantes + input pill reativo =====
              SOBREPOSTO (absolute): as mensagens rolam por trás, como no topo.
              O bloco inteiro REAGE ao foco: em repouso fica mais estreito e um
              tiquinho elevado (leveza); ao focar, expande pra largura total e
              desce — transition-all 300ms ease. */}
          <footer className="absolute bottom-0 inset-x-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 translate-y-[calc(-1*var(--kb,0px))] transition-transform duration-200 ease-out">
            <div
              className={`mx-auto flex flex-col gap-3.5 transition-all duration-300 ease-out ${
                focado ? 'w-full translate-y-0' : 'w-[88%] -translate-y-1.5'
              }`}
            >
              {/* PÍLULAS FLUTUANTES — soltas, acima do input (totalmente arredondadas) */}
              <div className="flex gap-2 overflow-x-auto sem-scrollbar px-0.5">
                <Fluxo label="Estudar" icone="/estudar.png" onClick={() => navigate('/estudar')} />
                <Fluxo label="Trabalhos" icone="/trabalhos.png" />
                <Fluxo label="Provas" icone="/provas.png" />
              </div>

              {/* INPUT PILL — cartão próprio, totalmente arredondado (rounded-full).
                  items-center = texto de 1 linha fica no meio; botões vão pro fim
                  (self-end) quando o campo cresce. */}
              <div
                className={`flex items-center gap-2 rounded-[26px] border backdrop-blur-md pl-4 pr-2 py-1.5 transition-colors duration-200 ${
                  focado ? 'border-white/80 bg-white/20' : 'border-white/50 bg-white/10'
                }`}
              >
                <textarea
                  ref={areaRef}
                  value={texto}
                  onFocus={() => setFocado(true)}
                  onBlur={() => setFocado(false)}
                  onChange={(e) => {
                    setTexto(e.target.value)
                    ajustarAltura()
                  }}
                  onKeyDown={(e) => {
                    // Enter envia; Shift+Enter quebra linha.
                    // e.nativeEvent.isComposing = está digitando acento/IME -> não envia.
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      enviar()
                    }
                  }}
                  rows={1}
                  placeholder="Quero estudar para a prova de Java..."
                  className="flex-1 resize-none bg-transparent font-sans text-[17px] leading-6 text-white placeholder:text-white/40 outline-none py-1"
                  style={{ maxHeight: ALTURA_MAX }}
                />
                {/* mesmo botão troca de função: pensando -> PARAR (quadrado),
                    senão -> ENVIAR (seta). Círculo azul-marinho em CSS. */}
                <button
                  type="button"
                  onClick={gerando ? () => pararResposta(chatAtivoId!) : enviar}
                  onMouseDown={(e) => e.preventDefault()} // não tira o foco do campo (teclado não fecha, layout não pula no celular)
                  disabled={!gerando && !texto.trim()} // gerando: sempre clicável (pra parar)
                  aria-label={gerando ? 'Parar' : 'Enviar'}
                  className="shrink-0 self-end mb-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#0a1560] transition-opacity active:opacity-70 disabled:opacity-40"
                >
                  {gerando ? (
                    // quadradinho branco = parar
                    <span className="h-3 w-3 rounded-[3px] bg-white pointer-events-none" />
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none">
                      <path d="M12 19V6M6 12l6-6 6 6" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </footer>

          {/* toque no conteudo empurrado fecha o menu */}
          {menuAberto && <div className="absolute inset-0 z-20" onClick={() => setMenuAberto(false)} />}
        </div>
      </div>
    </div>
  )
}

// Renderiza o texto da IA como MARKDOWN: negrito, títulos, listas, código e tabelas
// (os modelos grandes usam tudo isso). react-markdown reparse a cada token do streaming,
// então markdown ainda "aberto" no meio da digitação não quebra a tela. O `components`
// mapeia cada elemento pro visual do tema escuro, já que não usamos plugin de tipografia.
const componentesMarkdown: Components = {
  h1: ({ children }) => <h2 className="mt-3 mb-1 text-lg font-bold text-white">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-3 mb-1 text-base font-bold text-white">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2 mb-1 font-semibold text-white">{children}</h3>,
  p: ({ children }) => <p className="mb-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-300 underline">{children}</a>
  ),
  code: ({ className, children }) => {
    // bloco = tem linguagem (```js) OU é multilinha; senão é código inline (pílula).
    const bloco = /language-/.test(className ?? '') || String(children).includes('\n')
    return bloco ? (
      <code className={`${className ?? ''} font-mono text-[13px]`}>{children}</code>
    ) : (
      <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[13px]">{children}</code>
    )
  },
  // bloco de código: embrulho relativo pra encaixar o botão de copiar no canto.
  // O texto puro vem de extrairTexto (os filhos são elementos React, não string).
  pre: ({ children }) => (
    <div className="relative mb-2">
      <BotaoCopiar
        texto={extrairTexto(children)}
        titulo="Copiar código"
        className="absolute right-2 top-2 bg-black/40 backdrop-blur-sm"
      />
      <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 pt-9 text-[13px]">{children}</pre>
    </div>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-white/20 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-white/15 px-2 py-1">{children}</td>,
  // citação (>): é onde a IA entrega um "prompt/texto pronto pra colar". Mesmo
  // tratamento do código — botão de copiar no canto, com espaço à direita pra ele.
  blockquote: ({ children }) => (
    <div className="relative mb-2">
      <BotaoCopiar
        texto={extrairTexto(children)}
        titulo="Copiar texto"
        className="absolute right-1 top-1"
      />
      <blockquote className="border-l-2 border-white/30 pl-3 pr-10 italic text-white/75">{children}</blockquote>
    </div>
  ),
}

// Extrai o texto PURO de uma árvore de elementos React (o que o react-markdown
// monta pra um bloco). Precisamos disso porque o conteúdo de um <pre>/<blockquote>
// chega como elementos (ex.: <code>…</code>), não como string — e o botão de copiar
// precisa do texto cru. Percorre recursivamente strings, arrays e props.children.
function extrairTexto(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extrairTexto).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extrairTexto((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

// Copia um texto pro clipboard de forma CONFIÁVEL em qualquer contexto.
// navigator.clipboard só existe em contexto seguro (https/localhost); no celular
// via IP da LAN (http) ele não está disponível — por isso o fallback com um
// <textarea> escondido + execCommand('copy'), que funciona no HTTP também.
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // cai no fallback abaixo
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.setAttribute('readonly', '')
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Botãozinho de copiar: mostra um ícone de "copiar" e, por ~1,5s após o clique,
// troca pro "check" como confirmação visual. Usado nas mensagens, blocos de código
// e citações. `className` deixa cada chamador posicionar/estilizar como precisar.
function BotaoCopiar({
  texto,
  titulo = 'Copiar',
  className = '',
}: {
  texto: string
  titulo?: string
  className?: string
}) {
  const [copiado, setCopiado] = useState(false)
  async function clicar() {
    if (await copiarTexto(texto)) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    }
  }
  return (
    <button
      type="button"
      onClick={clicar}
      aria-label={titulo}
      title={titulo}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-white/50 transition-colors active:text-white ${className}`}
    >
      {copiado ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

// Mensagem do USUÁRIO (balão à direita). Dois estados:
//  - normal: o balão + uma linha de ações embaixo (copiar, editar).
//  - editando: o balão vira um campo de texto com Cancelar / Enviar.
// Ao enviar a edição, chama aoSalvar(novoTexto) → o Context refaz a conversa dali.
// Numa PWA de celular não há "hover", então as ações ficam sempre visíveis (discretas).
function MensagemUsuario({ texto, aoSalvar }: { texto: string; aoSalvar: (novo: string) => void }) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(texto)
  const campoRef = useRef<HTMLTextAreaElement>(null)

  function abrirEdicao() {
    setRascunho(texto)
    setEditando(true)
    // foca e ajusta a altura no próximo frame (quando o campo já existe)
    requestAnimationFrame(() => {
      const el = campoRef.current
      if (!el) return
      el.focus()
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
      // cursor no fim do texto
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  function salvar() {
    const limpo = rascunho.trim()
    if (!limpo) return
    setEditando(false)
    aoSalvar(limpo)
  }

  if (editando) {
    return (
      <div className="animar-subida self-end w-full max-w-[90%] rounded-3xl border border-white/35 bg-black px-3 py-2">
        <textarea
          ref={campoRef}
          value={rascunho}
          onChange={(e) => {
            setRascunho(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              salvar()
            }
            if (e.key === 'Escape') setEditando(false)
          }}
          rows={1}
          className="w-full resize-none bg-transparent font-sans text-[15px] leading-relaxed outline-none"
        />
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="rounded-full px-3 py-1 text-xs font-medium text-white/70 active:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={!rascunho.trim()}
            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#142073] active:opacity-70 disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animar-subida self-end flex max-w-[80%] flex-col items-end">
      <div className="whitespace-pre-wrap break-words rounded-3xl bg-[#142073] px-4 py-2 font-sans text-[15px]">
        {texto}
      </div>
      <div className="mt-0.5 flex gap-1">
        <BotaoCopiar texto={texto} titulo="Copiar mensagem" />
        <button
          type="button"
          onClick={abrirEdicao}
          aria-label="Editar mensagem"
          title="Editar mensagem"
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 transition-colors active:text-white"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function TextoIA({ texto }: { texto: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentesMarkdown}>
      {texto}
    </ReactMarkdown>
  )
}

// Botão de FLUXO (Estudar/Trabalhos/Provas): compacto, borda fina, ícone + nome.
// Vive na barra do composer unificado, sempre visível.
function Fluxo({ label, icone, onClick }: { label: string; icone: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/85 transition-colors active:bg-white/10"
    >
      <img src={icone} alt="" className="h-4 w-4 object-contain" />
      {label}
    </button>
  )
}

export default Home
