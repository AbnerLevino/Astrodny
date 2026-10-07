/*
  Conversa — onde o chat acontece (rotas /chat e /chat/:id). Já foi a tela
  inicial do app ("Home"); agora quem recebe primeiro é o Painel ("/"), que
  leva pra cá ao clicar em "Novo Chat"/um atalho ou digitar na caixa de lá.
  - Sem conversa ativa (/chat, sem id): mostra a saudação (+ chips + campo).
  - Ao enviar: vira um chat novo (entra no histórico) e as mensagens aparecem
    AQUI MESMO, no lugar da saudação. Nada de tela separada.
  Tocar na foto de perfil abre o menu lateral (Sidebar).
*/
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Sidebar from './Sidebar'
import { AbasFluxo } from '../abas'
import { useChats, type Anexo } from '../chats'
import { extrairAcao } from '../../application/chatAction'
import { extractContent } from '../../application/extractContent'
import { pdfExtractor } from '../../infrastructure/documents/pdfExtractor'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

const ALTURA_MAX = 160 // teto do campo (px): passou disso, rola em vez de crescer
// status "pensando" (fake por enquanto; depois refletem as fases reais da IA)
const STATUS = ['Pensando sobre isso…', 'Organizando a resposta…', 'Escrevendo…']

// Um anexo ainda na fileira de quadradinhos, ANTES de enviar (enquanto extrai o
// PDF ou já pronto, esperando o aluno apertar enviar). `id` é só pra React/remover
// um item específico da lista — não existe fora desta tela.
type AnexoPendente = { id: string; file: File; conteudo: string; extraindo: boolean }

// Saudacao muda conforme a hora (Bom dia / Boa tarde / Boa noite).
function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function Conversa() {
  const navigate = useNavigate()
  // :id da rota /chat/:id — ausente em /chat (chat em branco, mostra a saudação)
  const { id } = useParams<{ id: string }>()
  const [menuAberto, setMenuAberto] = useState(false)
  // true enquanto o mouse está sobre o CTA "Descubra o Astro!" (visitante, sem
  // login) na Sidebar — revela a aurora de fundo por baixo do véu escuro.
  const [auroraAtiva, setAuroraAtiva] = useState(false)
  const [texto, setTexto] = useState('')
  const [focado, setFocado] = useState(false) // campo em foco? controla a expansão/descida do composer
  const [statusIdx, setStatusIdx] = useState(0)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  // ===== Anexos (Spec C: mini-aula via PDF no chat) =====
  // modalAberto = o "+" ao lado do enviar, com (por ora) só "Adicionar arquivos".
  // arrastando = feedback visual enquanto um arquivo é arrastado sobre a tela (desktop).
  // anexos é LISTA: dá pra anexar mais de um, cada um vira um quadradinho numa
  // fileira (rolável) acima do input — sem ocupar a largura toda do placeholder.
  const [modalAberto, setModalAberto] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [anexos, setAnexos] = useState<AnexoPendente[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // extrai o texto do PDF (reaproveita o mesmo extractor do Estudar), um por vez
  // mas em paralelo entre si (cada anexo tem seu próprio id, não trava os outros).
  // Se falhar, some da fileira — não dá pra mandar uma mini-aula sem conteúdo.
  async function processarArquivo(file: File) {
    const idAnexo = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    setAnexos((prev) => [...prev, { id: idAnexo, file, conteudo: '', extraindo: true }])
    try {
      const texto = await extractContent([file], pdfExtractor)
      setAnexos((prev) => prev.map((a) => (a.id === idAnexo ? { ...a, conteudo: texto, extraindo: false } : a)))
    } catch {
      setAnexos((prev) => prev.filter((a) => a.id !== idAnexo))
    }
  }

  function processarArquivos(files: FileList | File[]) {
    Array.from(files).forEach(processarArquivo)
  }

  function removerAnexo(idAnexo: string) {
    setAnexos((prev) => prev.filter((a) => a.id !== idAnexo))
  }

  function abrirSeletorArquivo() {
    setModalAberto(false)
    fileInputRef.current?.click()
  }

  // drag-and-drop (desktop): arrasta um ou mais PDFs pra qualquer lugar da tela.
  function aoArrastarSobre(e: DragEvent) {
    e.preventDefault()
    setArrastando(true)
  }
  function aoSairArraste() {
    setArrastando(false)
  }
  function aoSoltarArquivo(e: DragEvent) {
    e.preventDefault()
    setArrastando(false)
    if (e.dataTransfer.files.length) processarArquivos(e.dataTransfer.files)
  }
  const { criarChat, enviarMensagem, editarMensagem, pararResposta, obterChat, chatAtivoId, setChatAtivo, pensandoId } =
    useChats()

  // sincroniza o chat ativo com a URL: /chat/:id abre aquele chat, /chat (sem
  // id) volta pra saudação. A URL é quem manda — a Sidebar só navega (Task 7).
  useEffect(() => {
    setChatAtivo(id ?? null)
  }, [id, setChatAtivo])

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
    if (anexos.some((a) => a.extraindo)) return // espera os PDFs terminarem de extrair
    const anexosProntos: Anexo[] = anexos.filter((a) => a.conteudo).map((a) => ({ nome: a.file.name, conteudo: a.conteudo }))
    if (!limpo && anexosProntos.length === 0) return
    // sem texto digitado mas com anexo: manda uma mensagem-placeholder (a bolha mostra os arquivos)
    const mensagem =
      limpo ||
      `Anexei ${anexosProntos.length > 1 ? 'os arquivos' : 'o arquivo'} ${anexosProntos.map((a) => `"${a.nome}"`).join(', ')}.`
    const anexosParaEnviar = anexosProntos.length ? anexosProntos : undefined
    if (chatAtivoId) {
      enviarMensagem(chatAtivoId, mensagem, anexosParaEnviar) // continua o chat aberto
    } else {
      navigate(`/chat/${criarChat(mensagem, anexosParaEnviar)}`) // 1ª mensagem: cria o chat e reflete o id na URL
    }
    setTexto('')
    setAnexos([])
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
    // frame: no MOBILE a Sidebar fica FIXA atras (esquerda) e o conteudo desliza
    // pra direita + desfoca ao abrir o menu (overflow-hidden corta o excesso).
    // No DESKTOP (lg+) vira flex: a Sidebar é coluna fixa e o conteudo ocupa o resto
    // (lg:flex-1), sem deslizar nem desfocar (lg:translate-x-0 lg:blur-none).
    <div
      className="relative overflow-hidden min-h-dvh bg-[#1a1a1c] lg:flex"
      onDragOver={aoArrastarSobre}
      onDragLeave={aoSairArraste}
      onDrop={aoSoltarArquivo}
    >
      {/* overlay enquanto arrasta um arquivo sobre a tela (só aparece durante o drag) */}
      {arrastando && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-4 border-dashed border-white/60 bg-black/60">
          <p className="text-lg font-semibold text-white">Solte o arquivo pra anexar</p>
        </div>
      )}
      <Sidebar aoSelecionar={() => setMenuAberto(false)} aoAuroraHover={setAuroraAtiva} />

      <div
        className={`relative z-10 min-h-dvh transition-all duration-300 lg:flex-1 lg:translate-x-0 lg:blur-none ${menuAberto ? 'translate-x-[78%] blur-[2px]' : 'translate-x-0'}`}
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
            volta no talo. Some também (opacity-0) enquanto auroraAtiva: é o gatilho
            do hover no CTA "Descubra o Astro!", que acende a aurora cheia da página. */}
        <div
          className={`absolute inset-0 -z-20 bg-[#1e1f24] transition-opacity duration-500 ${auroraAtiva ? 'opacity-0' : chatAtivo ? 'opacity-[0.82] lg:opacity-[0.85]' : 'opacity-0'}`}
        />
        {/* camada CINZA que surge com fade ao abrir o menu */}
        <div
          className={`absolute inset-0 -z-10 bg-[#2e2f36] transition-opacity duration-300 ${!auroraAtiva && menuAberto ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* conteudo real, acima das duas camadas de fundo */}
        <div className="relative h-dvh flex flex-col text-white">
          {/* ===== ZONA 1: topo (avatar + logo) — SOBREPOSTO; as mensagens rolam por trás ===== */}
          <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
            {/* no desktop a sidebar já está sempre visível, então o atalho "foto abre menu" some */}
            <button type="button" aria-label="Abrir menu" onClick={() => setMenuAberto(true)} className="shrink-0 lg:hidden">
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
            <main className="flex-1 overflow-y-auto sem-scrollbar px-4 pb-[calc(11rem+var(--kb,0px))] pt-[calc(env(safe-area-inset-top)+5rem)] flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-[768px]">
              {chatAtivo.mensagens.map((m, i) =>
                m.autor === 'user' ? (
                  // mensagem do usuário: balão à direita, com copiar + editar/reenviar
                  <MensagemUsuario
                    key={i}
                    texto={m.texto}
                    nomesAnexos={m.anexos?.map((a) => a.nome)}
                    aoSalvar={(novo) => editarMensagem(chatAtivoId!, i, novo)}
                  />
                ) : (
                  // resposta da IA: textão corrido (sem balão), com **negrito** e
                  // cursor piscando enquanto ainda está sendo escrita.
                  // extrairAcao tira o marcador [acao: ...] do texto (se houver) e
                  // devolve o que precisamos pra desenhar o botão no lugar dele.
                  (() => {
                    const { texto, acao } = extrairAcao(m.texto)
                    return (
                      <div
                        key={i}
                        className="animar-subida break-words font-sans text-[15px] leading-relaxed text-white/90"
                      >
                        <TextoIA texto={texto} />
                        {escrevendo && i === chatAtivo.mensagens.length - 1 ? (
                          <span className="cursor-piscando ml-0.5 inline-block">▍</span>
                        ) : (
                          <div className="mt-1 flex items-center gap-2">
                            <BotaoCopiar texto={texto} titulo="Copiar resposta" />
                          </div>
                        )}
                        {acao && (
                          <button
                            type="button"
                            onClick={() => navigate('/estudar', { state: { tema: acao.tema } })}
                            className="animar-subida mt-2 flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
                          >
                            <IconeEstudar />
                            Montar estudo de "{acao.tema}"
                          </button>
                        )}
                      </div>
                    )
                  })()
                ),
              )}

              {/* "pensando": o "A" da marca dando pulinhos na frente do status.
                  invert = o PNG é preto sobre fundo transparente; invertido fica
                  branco, visível no escuro (mesma imagem, só a cor trocada). */}
              {mostrarPensando && (
                <div className="animar-subida flex items-center gap-2.5 text-white/60">
                  <img src="/logo-a.png" alt="" className="h-5 w-5 shrink-0 animate-bounce" />
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
          <footer className="absolute bottom-0 inset-x-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 translate-y-[calc(-1*var(--kb,0px))] transition-transform duration-200 ease-out lg:mx-auto lg:max-w-[768px]">
            <div
              className={`mx-auto flex flex-col gap-3.5 transition-all duration-300 ease-out ${
                focado ? 'w-full translate-y-0' : 'w-[88%] -translate-y-1.5'
              }`}
            >
              {/* ABAS DE FLUXO — soltas, acima do input. Componente compartilhado com
                  o Estudar (mesma posição + seleção persistente): entrar no Estudar
                  não parece trocar de lugar, é o mesmo chat com outra direção. */}
              <AbasFluxo />

              {/* input de arquivo ESCONDIDO: o "+" abaixo e o drag-and-drop da tela
                  toda chamam ele; aceita VÁRIOS de uma vez, só PDF (igual o Estudar). */}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) processarArquivos(e.target.files)
                  e.target.value = '' // permite escolher o(s) MESMO(S) arquivo(s) de novo depois
                }}
              />

              {/* INPUT PILL — UMA caixa só (flex-col): a fileira de anexos (quando
                  há) fica DENTRO, no topo — a borda cresce junto ("acopla"), em vez
                  de ser uma caixa separada flutuando por cima. */}
              <div
                className={`flex flex-col gap-2 rounded-[26px] border backdrop-blur-md px-2 py-1.5 transition-colors duration-200 ${
                  focado ? 'border-white/80 bg-white/10' : 'border-white/50 bg-white/5'
                }`}
              >
                {/* fileira de anexos pendentes: retângulos largos, rolável na
                    horizontal. Cada um é independente: extrai em paralelo, remove
                    sem afetar os outros. Nome numa linha só, ao lado do ícone. */}
                {anexos.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto px-2 pt-1">
                    {anexos.map((a) => (
                      <div
                        key={a.id}
                        title={a.file.name}
                        className="animar-subida relative flex h-11 w-40 shrink-0 items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-2"
                      >
                        {a.extraindo ? (
                          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white/80" />
                        ) : (
                          <IconeArquivo nome={a.file.name} />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[11px] leading-tight text-white/70">
                          {a.file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removerAnexo(a.id)}
                          aria-label="Remover arquivo"
                          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-[10px] text-white"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* linha da textarea + botões (era o conteúdo direto da pílula antes) */}
                <div className="flex items-center gap-2 pl-2 pr-0">
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
                  className="flex-1 resize-none bg-transparent font-sans text-[18px] lg:text-[15px] leading-6 text-white placeholder:text-white/40 placeholder:text-[14px] outline-none py-1"
                  style={{ maxHeight: ALTURA_MAX }}
                />
                {/* "+" ao lado do enviar — abre o modal de opções (por ora só
                    "Adicionar arquivos"; é aqui que mais opções entram depois). */}
                <div className="relative shrink-0 self-end mb-0.5">
                  <button
                    type="button"
                    onClick={() => setModalAberto((v) => !v)}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="Mais opções"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 text-white/80 transition-colors active:bg-white/10"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  {modalAberto && (
                    <>
                      {/* backdrop: fecha o modal ao tocar fora */}
                      <div className="fixed inset-0 z-30" onClick={() => setModalAberto(false)} />
                      <div className="absolute bottom-full right-0 z-40 mb-2 w-52 overflow-hidden rounded-2xl border border-white/15 bg-[#232428] shadow-xl">
                        <button
                          type="button"
                          onClick={abrirSeletorArquivo}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-white/90 active:bg-white/10"
                        >
                          <IconeAnexo />
                          Adicionar arquivos
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {/* mesmo botão troca de função: pensando -> PARAR (quadrado),
                    senão -> ENVIAR (seta). Círculo azul-marinho em CSS. */}
                <button
                  type="button"
                  onClick={gerando ? () => pararResposta(chatAtivoId!) : enviar}
                  onMouseDown={(e) => e.preventDefault()} // não tira o foco do campo (teclado não fecha, layout não pula no celular)
                  disabled={!gerando && ((!texto.trim() && anexos.length === 0) || anexos.some((a) => a.extraindo))} // gerando: sempre clicável (pra parar)
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

              {/* Aviso de falibilidade: só em conversa ativa (não polui a saudação).
                  Fica abaixo do input; como o footer é ancorado no rodapé, o input
                  sobe um pouco sozinho pra abrir espaço pra esta linha. */}
              {chatAtivoId && (
                <p className="-mt-1.5 px-2 text-center text-[11px] leading-snug text-white/35">
                  O Astrodny pode errar em fatos e números — confira o que for importante.
                </p>
              )}
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
  // Hierarquia com respiro: h1 (título principal da resposta) é o maior; h2/h3 descem
  // de forma equilibrada. mt generoso separa seções; mb afasta o título do parágrafo.
  // first:mt-0 evita que o 1º título empurre o topo do balão.
  h1: ({ children }) => <h2 className="mb-2.5 mt-1 text-xl font-bold leading-snug text-white first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 className="mb-4 mt-8 text-[19px] font-bold leading-snug text-white first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2.5 mt-6 text-base font-semibold text-white first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-3.5 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3.5 ml-4 list-decimal space-y-1">{children}</ol>,
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
      <pre className="scroll-chat overflow-x-auto rounded-lg bg-black/40 px-4 py-3 pt-9 text-[13px]">{children}</pre>
    </div>
  ),
  // Tabela "limpa": container arredondado com borda fina, cabeçalho sombreado e só
  // DIVISÓRIAS HORIZONTAIS (sem grade vertical pesada). Zebra discreta ajuda a ler
  // linhas largas. overflow-x-auto deixa rolar no celular sem quebrar o layout.
  table: ({ children }) => (
    <div className="scroll-chat my-4 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.06]">{children}</thead>,
  // :nth-child é por elemento-pai, então o even: só pega as linhas pares do tbody —
  // a linha do cabeçalho (sozinha no thead) não é afetada.
  tr: ({ children }) => <tr className="even:bg-white/[0.02]">{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap border-b border-white/15 px-4 py-3 text-left font-semibold text-white">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-white/[0.07] px-4 py-3 align-top leading-relaxed">{children}</td>,
  // citação (>): a IA costuma usar pra ENTREGAR um exemplo / texto pronto pra colar.
  // Em vez da barra lateral (traço grande) + itálico, vira um QUADRO na mesma linguagem
  // das tabelas (borda fina, cantos arredondados, fundo sutil) com o exemplo DENTRO.
  // Botão de copiar no canto; o pr-12 reserva o espaço dele.
  blockquote: ({ children }) => (
    <div className="relative my-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <BotaoCopiar
        texto={extrairTexto(children)}
        titulo="Copiar texto"
        className="absolute right-2 top-2 bg-black/30 backdrop-blur-sm"
      />
      {/* neutraliza o mb-4 do <p> interno pra o respiro ficar no padding do quadro:
          parágrafos internos ganham mb-2, e o último zera. */}
      <blockquote className="px-4 py-3 pr-12 leading-relaxed text-white/80 [&>p]:mb-2 [&>p:last-child]:mb-0">
        {children}
      </blockquote>
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

// Ícone de anexo (clipe de papel) — usado no chip de anexo pendente, no item do
// modal "Adicionar arquivos" e na bolha da mensagem que carregou o arquivo.
function IconeAnexo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78" />
    </svg>
  )
}

// Ícone de PDF: página clara com cantinho dobrado + faixa vermelha "PDF" embaixo
// (padrão visual de ícone de arquivo real, não só um selo solto).
function IconePdf() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
      {/* página, com o canto superior direito dobrado */}
      <path
        d="M6 2.5h8.17a1 1 0 0 1 .7.3l3.83 3.83a1 1 0 0 1 .3.7V20a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5Z"
        fill="#EDEEF0"
      />
      <path d="M14.5 2.7V6a1 1 0 0 0 1 1h3.3" fill="none" stroke="#C7C9CC" strokeWidth="1" />
      {/* linhas de texto sugeridas (dão a sensação de página escrita) */}
      <rect x="7" y="9" width="7" height="1.1" rx="0.5" fill="#C7C9CC" />
      <rect x="7" y="11.3" width="5" height="1.1" rx="0.5" fill="#C7C9CC" />
      {/* faixa vermelha com o rótulo */}
      <rect x="4.3" y="13.8" width="13.4" height="6.6" rx="1.3" fill="#E5433A" />
      <text x="11" y="18.6" textAnchor="middle" fontSize="6" fontWeight="800" fill="#fff" fontFamily="Arial, Helvetica, sans-serif">
        PDF
      </text>
    </svg>
  )
}

// Escolhe o ícone pelo NOME do arquivo (extensão) — hoje só PDF é aceito, mas já
// fica pronto pra quando outros tipos entrarem (cai no clipe genérico).
function IconeArquivo({ nome }: { nome: string }) {
  return nome.toLowerCase().endsWith('.pdf') ? <IconePdf /> : <IconeAnexo />
}

// Ícone do botão de ação "Montar estudo de X" (livro simples).
function IconeEstudar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 22Z" />
      <path d="M4 5.5v14A2.5 2.5 0 0 0 6.5 22" />
    </svg>
  )
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
function MensagemUsuario({
  texto,
  nomesAnexos,
  aoSalvar,
}: {
  texto: string
  nomesAnexos?: string[]
  aoSalvar: (novo: string) => void
}) {
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
        {nomesAnexos?.map((nome, k) => (
          <div key={k} className="mb-1.5 flex items-center gap-1.5 text-xs text-white/70">
            <IconeArquivo nome={nome} />
            {nome}
          </div>
        ))}
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
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={componentesMarkdown}
    >
      {texto}
    </ReactMarkdown>
  )
}

export default Conversa
