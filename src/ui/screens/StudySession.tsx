/*
  Sessão de Estudo (StudySession): o fluxo de 5 telas.
  Um estado `etapa` decide qual tela aparece.

  Camada de apresentação (ui): só desenha e coleta. Fala com o caso de uso
  `buildStudy` (application), nunca com o modelo de IA direto.
*/
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  Study,
  Mode,
  Formato,
  QuestionMultiplaEscolha,
  QuestionDiscursiva,
  CorrecaoDiscursiva,
  ResultadoProva,
  ResultadoProvaDiscursiva,
} from '../../domain/study'
import type { Mensagem } from '../../domain/chat'
import { buildStudy } from '../../application/buildStudy'
import { buildExam } from '../../application/buildExam'
import { gradeExam } from '../../application/gradeExam'
import { gradeDiscursiveAnswer, gradeDiscursiveExam } from '../../application/gradeDiscursiveAnswer'
import { extractContent } from '../../application/extractContent'
import { studyChat, montarContextoEstudo } from '../../application/studyChat'
import { ollamaProvider } from '../../infrastructure/ai/ollamaProvider'
import { groqProvider, groqConfigurado } from '../../infrastructure/ai/groqProvider'
import { fallbackProvider } from '../../infrastructure/ai/fallbackProvider'
import { proxyProvider } from '../../infrastructure/ai/proxyProvider'
import { pdfExtractor, contarPaginasPdf } from '../../infrastructure/documents/pdfExtractor'
import { useStudies } from '../studies'
import { useSettings } from '../settings'

// qual tela do fluxo aparece (estado da ui) — o esqueleto da maquina de estados
type Etapa = 'preparar' | 'analisando' | 'aula' | 'prova' | 'resultado'

// EM PRODUÇÃO, tudo passa pelo nosso proxy (/api/*): ele guarda as chaves, roteia a cadeia
// (Gemini→Groq) e coleta os dados. EM DEV, usamos os modelos direto (Ollama local etc.) pra
// iterar de graça e offline. Trocar o "cérebro" é só trocar qual adaptador implementa a porta.
const PROD = import.meta.env.PROD

// IA do dia a dia (correção discursiva, tira-dúvidas e aula do modo OBJETIVA).
const ia = PROD ? proxyProvider : ollamaProvider
// Estágio 2 (prova): em prod vai pelo proxy; em dev, Groq direto (ou null → buildExam deriva dos blocos).
const iaProva = PROD ? proxyProvider : groqConfigurado ? groqProvider : null

function StudySession() {
  const navigate = useNavigate()
  const { salvarEstudo } = useStudies()
  const [etapa, setEtapa] = useState<Etapa>('preparar')
  // começam SEM seleção (null): o aluno escolhe de propósito ao abrir o Estudar.
  const [modo, setModo] = useState<Mode | null>(null)
  // FORMATO das perguntas (o toggle por estudo): também sem padrão marcado.
  const [formato, setFormato] = useState<Formato | null>(null)
  const [arquivos, setArquivos] = useState<File[]>([]) // os PDFs anexados (material real)
  const [contexto, setContexto] = useState('') // pedido extra do aluno (foco/dificuldades)
  const [erro, setErro] = useState<string | null>(null) // msg quando a leitura/estudo falha
  const [estudo, setEstudo] = useState<Study | null>(null) // o que o caso de uso produziu
  // o resultado é de MC (gradeExam) OU discursivo (gradeDiscursiveExam) — depende do formato
  const [resultado, setResultado] = useState<ResultadoProva | ResultadoProvaDiscursiva | null>(null)

  return (
    <div className="relative isolate overflow-hidden h-dvh flex flex-col bg-[#2e2f36] text-white">
      {etapa === 'preparar' && (
        <Preparar
          modo={modo}
          formato={formato}
          erro={erro}
          aoEscolherModo={setModo}
          aoEscolherFormato={setFormato}
          aoVoltar={() => navigate('/')}
          aoComecar={(pdfs, ctx) => {
            setArquivos(pdfs)
            setContexto(ctx ?? '')
            setErro(null)
            setEtapa('analisando')
          }}
        />
      )}

      {etapa === 'analisando' && modo && formato && (
        <Analisando
          arquivos={arquivos}
          modo={modo}
          formato={formato}
          contexto={contexto}
          aoConcluir={(novoEstudo) => {
            setEstudo(novoEstudo)
            setEtapa('aula')
          }}
          aoFalhar={(msg) => {
            setErro(msg)
            setEtapa('preparar') // volta pra tela de anexar, mostrando o erro
          }}
        />
      )}

      {etapa === 'aula' && estudo && (
        <Aula
          estudo={estudo}
          material={arquivos.map((a) => a.name).join(', ') || contexto.trim() || 'seu pedido'}
          aoVoltar={() => setEtapa('preparar')}
          aoConcluir={() => setEtapa('prova')}
        />
      )}

      {etapa === 'prova' && estudo && (
        <Prova
          estudo={estudo}
          aoConcluir={(res) => {
            setResultado(res)
            // salva no histórico só o MC por ora (StudySalvo ainda é MC; a persistência
            // do discursivo entra na frente do "salvar", junto com a área de comparação).
            if (estudo.formato === 'multipla_escolha' && 'acertos' in res) {
              salvarEstudo({
                id: Date.now().toString(36),
                data: new Date().toISOString(),
                origem: arquivos.map((a) => a.name).join(', ') || contexto.trim().slice(0, 60) || 'Estudo por chat',
                estudo,
                resultado: res,
              })
            }
            setEtapa('resultado')
          }}
        />
      )}

      {etapa === 'resultado' && resultado && (
        <Resultado
          resultado={resultado}
          aoRefazer={() => {
            setResultado(null)
            setEtapa('preparar')
          }}
          aoSair={() => navigate('/')}
        />
      )}
    </div>
  )
}

/* ===== Tela 2: Analisando (IA lendo o PDF e separando em blocos) ===== */

// Aqui a IA (mock) trabalha DE VERDADE: o Motor monta o estudo a partir do
// conteudo + modo. Quando fica pronto, avancamos — garantindo um tempo minimo
// de animacao pra tela nao "piscar". O radar 8bit e a estrela: tela cheia.
function Analisando({
  arquivos,
  modo,
  formato,
  contexto,
  aoConcluir,
  aoFalhar,
}: {
  arquivos: File[]
  modo: Mode
  formato: Formato
  contexto: string
  aoConcluir: (estudo: Study) => void
  aoFalhar: (mensagem: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let vivo = true
    const inicio = Date.now()
    const MIN_MS = 2500 // segura a animacao pelo menos esse tanto

    // roda a sequência real: extrair texto do(s) PDF(s) -> montar o estudo.
    // se qualquer etapa falhar, avisamos (aoFalhar) em vez de travar na tela.
    async function processar() {
      try {
        // com PDF: extrai o texto (e cobra que tenha texto mesmo). Sem PDF: segue
        // só com o pedido do aluno (conteudo vazio) — estudar direto pelo chat.
        let conteudo = ''
        if (arquivos.length) {
          conteudo = await extractContent(arquivos, pdfExtractor)
          if (!conteudo) {
            throw new Error(
              'Não consegui ler texto desse PDF. Ele pode ser uma imagem escaneada.',
            )
          }
        }
        // Estágio 1 (aula): a escolha do modelo depende do MODO.
        //  - COMPLETA: a aula densa exige um modelo forte (o 7B local perde a FORMA e a
        //    profundidade). Vai de Groq, com o Ollama local como REDE DE SEGURANÇA (offline).
        //  - OBJETIVA: o local dá conta — barato e sem depender de internet.
        // Em prod, a aula (objetiva OU completa) vai pelo proxy — o servidor decide a cadeia.
        // Em dev, a completa usa Groq direto com Ollama de reserva; a objetiva usa o local (ia).
        const iaAula = PROD
          ? proxyProvider
          : modo === 'completa' && groqConfigurado
            ? fallbackProvider([groqProvider, ollamaProvider])
            : ia
        const estudo = await buildStudy(conteudo, modo, formato, iaAula, contexto)
        // Estágio 2: a prova é montada à parte (Groq, com fallback local) e acoplada ao
        // estudo. É aqui que a prova — que antes derrubava o estudo inteiro — entra com segurança.
        const prova = await buildExam(estudo, iaProva)
        const estudoCompleto = { ...estudo, prova }
        const restante = Math.max(0, MIN_MS - (Date.now() - inicio))
        setTimeout(() => {
          if (vivo) aoConcluir(estudoCompleto)
        }, restante)
      } catch (e) {
        console.error('Falha ao montar o estudo:', e)
        if (vivo) {
          aoFalhar(e instanceof Error ? e.message : 'Algo deu errado ao ler o material.')
        }
      }
    }
    processar()

    return () => {
      vivo = false
    }
  }, [arquivos, modo, formato, contexto, aoConcluir, aoFalhar])

  // Radar 8bit: aneis concentricos em baixa resolucao (blocos grandes = pixel
  // art) que nascem do centro (big bang) e marcham pra fora em loop, tela cheia.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Aliases com TIPO já não-nulo: as funções aninhadas abaixo (ajustar/frame) são
    // closures, e o TS não preserva nelas o estreitamento de `canvas`/`ctx`. Como o
    // tipo destes aqui já é não-nulo, as closures param de reclamar (TS18047).
    const cv = canvas
    const g = ctx

    const COLS = 44 // largura em "blocos" (quanto menor, mais grosso o pixel)
    let linhas = 96
    const CLARO = [107, 138, 253]
    const ESCURO = [28, 47, 156]
    const LARGURA_ANEL = 3.5 // espessura de cada anel, em blocos

    function ajustar() {
      const r = cv.getBoundingClientRect()
      linhas = Math.max(1, Math.round(COLS * (r.height / r.width)))
      cv.width = COLS
      cv.height = linhas
    }
    ajustar()

    const CRESC_MS = 2800 // cresce devagar: enche a tela com calma
    let raf = 0
    let inicio = 0
    function frame(t: number) {
      if (!inicio) inicio = t
      const decorrido = t - inicio
      const fase = decorrido / 260 // marcha pra fora (lenta/contemplativa)
      const cx = COLS / 2
      const cy = linhas / 2
      const raioMax = Math.hypot(cx, cy)
      const raioVisivel = Math.min(1, decorrido / CRESC_MS) * raioMax
      const img = g.createImageData(COLS, linhas)
      for (let y = 0; y < linhas; y++) {
        for (let x = 0; x < COLS; x++) {
          const d = Math.hypot(x - cx, y - cy)
          if (d > raioVisivel) continue
          const banda = Math.floor((d - fase) / LARGURA_ANEL)
          const cor = ((banda % 2) + 2) % 2 === 0 ? CLARO : ESCURO
          const p = (y * COLS + x) * 4
          img.data[p] = cor[0]
          img.data[p + 1] = cor[1]
          img.data[p + 2] = cor[2]
          img.data[p + 3] = 255
        }
      }
      g.putImageData(img, 0, 0)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    window.addEventListener('resize', ajustar)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', ajustar)
    }
  }, [])

  return (
    <div className="relative flex-1 overflow-hidden flex flex-col items-center justify-center px-6 text-center bg-[#0a0d1f]">
      {/* o radar preenchendo a tela toda */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full [image-rendering:pixelated]"
      />
      {/* texto por cima, num selo translucido pra ficar legivel sobre o radar,
          com um icone de carregando (spinner) girando */}
      <div className="relative z-10 flex items-center gap-4 rounded-2xl bg-black/35 px-6 py-4 backdrop-blur-sm">
        <div className="h-9 w-9 shrink-0 rounded-full border-4 border-white/25 border-t-white animate-spin" />
        <div className="text-left">
          <p className="text-lg font-semibold">Lendo seu material</p>
          <p className="mt-1 text-sm text-white/70">Separando em blocos...</p>
        </div>
      </div>
    </div>
  )
}

/* ===== Tela 1: Preparar o estudo (anexar PDF + escolher modo) ===== */

type PrepararProps = {
  modo: Mode | null
  formato: Formato | null
  erro: string | null
  aoEscolherModo: (m: Mode) => void
  aoEscolherFormato: (f: Formato) => void
  aoVoltar: () => void
  aoComecar: (arquivos: File[], contexto?: string) => void
}

// um PDF anexado + sua contagem de páginas (null enquanto ainda está sendo lida)
type ItemArquivo = { arquivo: File; paginas: number | null }

function Preparar({ modo, formato, erro, aoEscolherModo, aoEscolherFormato, aoVoltar, aoComecar }: PrepararProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const ctxRef = useRef<HTMLTextAreaElement>(null)
  const [itens, setItens] = useState<ItemArquivo[]>([])
  const [arrastando, setArrastando] = useState(false)
  const [ajudaAberta, setAjudaAberta] = useState(false) // popover do (i)
  const [contexto, setContexto] = useState('') // pedido do aluno (tema/foco/dúvidas)
  const [ctxFocado, setCtxFocado] = useState(false) // campo em foco?
  const temArquivo = itens.length > 0
  const aceso = temArquivo || arrastando // aurora/tracejado "acesos"
  // libera o Avançar com PDF OU texto (estudar é chat com direção) E com as DUAS
  // escolhas feitas: como estudar (modo) e como responder (formato). Sem elas, o
  // buildStudy receberia seleção vazia — então o botão fica travado até o aluno decidir.
  const podeAvancar = (temArquivo || contexto.trim().length > 0) && modo !== null && formato !== null

  // estimativa de duração (depende do modo): ~0,25 min/pág (objetiva), ~0,5 (completa)
  const minsPorPagina = modo === 'completa' ? 0.5 : 0.25

  // auto-resize do campo por linha: cresce até ~3 linhas e TRAVA (depois rola por
  // dentro, com a barra escondida). 1 linha ≈ 44px (24 da linha + 20 do padding);
  // cada linha extra +24 → 3 linhas ≈ 92px.
  const MAX_CTX = 92
  function ajustarCtx() {
    const el = ctxRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, MAX_CTX) + 'px'
  }

  // adiciona só PDFs e dispara a contagem de páginas de cada um (assíncrona)
  function adicionar(lista: FileList | null) {
    if (!lista) return
    const pdfs = Array.from(lista).filter((f) => f.type === 'application/pdf')
    if (!pdfs.length) return
    const novos: ItemArquivo[] = pdfs.map((arquivo) => ({ arquivo, paginas: null }))
    setItens((prev) => [...prev, ...novos])
    novos.forEach(async ({ arquivo }) => {
      try {
        const n = await contarPaginasPdf(arquivo)
        setItens((prev) => prev.map((it) => (it.arquivo === arquivo ? { ...it, paginas: n } : it)))
      } catch {
        /* sem número: a estimativa simplesmente ignora este arquivo */
      }
    })
  }

  function remover(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  function avancar() {
    if (!podeAvancar) return
    aoComecar(itens.map((it) => it.arquivo), contexto.trim() || undefined)
  }

  return (
    <>
      {/* fundo AURORA (só desta tela): acende pra um tom MEDIANO quando há arquivo.
          Mesma aurora do chat; o véu escuro por cima fica grosso sem arquivo
          (aurora fraca) e fino quando há arquivo/arraste (aurora média). */}
      <div className="fundo-aurora absolute inset-0 -z-20">
        <span className="blob blob-1" />
        <span className="blob blob-2" />
        <span className="blob blob-3" />
      </div>
      <div
        className={`pointer-events-none absolute inset-0 -z-10 bg-[#0a0d1f] transition-opacity duration-700 ${
          aceso ? 'opacity-[0.34]' : 'opacity-[0.62]'
        }`}
      />

      {/* topo: voltar + nome da tela */}
      <header className="relative z-10 flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="text-3xl leading-none -mt-1">
          ‹
        </button>
        <span className="text-lg font-semibold">Novo estudo</span>
      </header>

      {/* conteudo — pb maior que o pt empurra o grupo centralizado um pouco pra cima
          (só o conteúdo; o input vive no footer, intocado) */}
      <main className="relative z-10 flex-1 overflow-y-auto sem-scrollbar flex flex-col px-5 pt-8 pb-52">
        {/* Wrapper com m-auto: centraliza quando há espaço e, quando o conteúdo cresce
            (ex.: com o toggle de formato), rola a partir do TOPO em vez de cortá-lo.
            O pt-8 no main "desce" o conteúdo um tico. Scroll invisível (sem-scrollbar +
            overflow-y-auto) já funciona com toque E mouse — nativo, sem detectar device. */}
        <div className="m-auto w-full flex flex-col gap-6">
        {/* aviso de falha na leitura anterior (some ao tentar de novo) */}
        {erro && (
          <div className="rounded-2xl border border-red-400/50 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {erro}
          </div>
        )}

        {/* TÍTULO do conteúdo + (i) ajuda logo no fim do título (descrição BREVE) */}
        <div className="relative">
          <h1 className="flex items-center gap-2 text-[17px] font-bold">
            Monte seu estudo
            <button
              type="button"
              onClick={() => setAjudaAberta((v) => !v)}
              aria-label="Como funciona o estudo"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-white/40 font-serif text-xs italic leading-none text-white/75 active:bg-white/10"
            >
              i
            </button>
          </h1>
          {ajudaAberta && (
            <div className="absolute inset-x-0 top-8 z-30 rounded-2xl border border-white/15 bg-[#0c0f22]/95 p-3 text-xs leading-relaxed text-white/75 shadow-xl backdrop-blur-sm">
              Anexe um PDF, escreva o que quer estudar — ou os dois. A IA monta uma aula em
              blocos, com perguntas de fixação e um simulado por tópicos no fim.
              <button type="button" onClick={() => setAjudaAberta(false)} className="ml-1 font-medium text-[#6f8dff]">
                ok
              </button>
            </div>
          )}
        </div>

        {/* input escondido: abre o seletor de arquivos do celular/PC */}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => adicionar(e.target.files)}
        />

        {/* DROPZONE — SEMPRE visível (sempre há onde adicionar); vira NEON ao arrastar.
            Os arquivos ficam DENTRO do quadro, numa faixa de ~1 card: arraste (scroll)
            pra ver os outros que você adicionou. */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setArrastando(true)
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastando(false)
            adicionar(e.dataTransfer.files)
          }}
          className={`rounded-2xl border-2 border-dashed transition-all duration-300 ${
            arrastando
              ? 'border-[#3b7bff] bg-[#3b7bff]/10 shadow-[0_0_28px_rgba(59,123,255,0.5)]'
              : 'border-[#CACACA]/50 bg-black/20'
          }`}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`w-full flex flex-col items-center gap-2 py-6 transition-colors ${
              arrastando ? 'text-[#9db8ff]' : 'text-white/70'
            }`}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M7 9l5-5 5 5" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <span className="text-sm">
              {temArquivo ? 'Adicionar outro PDF' : 'Solte o PDF aqui ou toque para selecionar'}
            </span>
          </button>

          {temArquivo && (
            <div className="sem-scrollbar max-h-[4.25rem] space-y-2 overflow-y-auto px-2 pb-2">
              {itens.map((it, i) => {
                const mins = it.paginas == null ? null : Math.max(1, Math.round(it.paginas * minsPorPagina))
                return (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-[#3b7bff]/45 bg-[#0c0f22]/80 px-3 py-2 shadow-[0_0_14px_rgba(59,123,255,0.18)]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9db8ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{it.arquivo.name}</p>
                      <p className="text-xs text-white/55">
                        {it.paginas == null
                          ? 'Lendo páginas…'
                          : `${it.paginas} pág${it.paginas === 1 ? '' : 's'} · ~${mins} min de estudo`}
                      </p>
                    </div>
                    <button type="button" onClick={() => remover(i)} aria-label="Remover arquivo" className="shrink-0 px-1 text-white/50">
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* MODO: dois cards-radio lado a lado (substituem o toggle) */}
        <div>
          <p className="mb-3 text-sm text-white/70">Como você quer estudar?</p>
          <div className="grid grid-cols-2 gap-3">
            <CardModo
              ativo={modo === 'objetiva'}
              titulo="Objetiva"
              descricao="Curtas e diretas: o essencial de cada tópico e uma prova rápida. Ideal pra revisar."
              onClick={() => aoEscolherModo('objetiva')}
            />
            <CardModo
              ativo={modo === 'completa'}
              titulo="Completa"
              descricao="Mais longas: conceitos e detalhes de cada tópico. Ideal pra aprender a fundo."
              onClick={() => aoEscolherModo('completa')}
            />
          </div>
        </div>

        {/* FORMATO: como o aluno RESPONDE — escrevendo (discursivo) ou alternativas */}
        <div>
          <p className="mb-3 text-sm text-white/70">Como quer responder?</p>
          <div className="grid grid-cols-2 gap-3">
            <CardModo
              ativo={formato === 'discursivo'}
              titulo="Escrevendo"
              descricao="Você responde com suas palavras e a IA corrige como professor: o que faltou e como melhorar."
              onClick={() => aoEscolherFormato('discursivo')}
            />
            <CardModo
              ativo={formato === 'multipla_escolha'}
              titulo="Múltipla escolha"
              descricao="Perguntas de alternativas, correção na hora. Ideal pra vestibular e revisão rápida."
              onClick={() => aoEscolherFormato('multipla_escolha')}
            />
          </div>
        </div>
        </div>
      </main>

      {/* RODAPÉ: o canal do aluno (estudar é chat com direção). Em repouso o campo
          vai ATÉ o Avançar (ao lado, sem cobrir); ao focar, cresce "comendo" o
          botão, que fica acoplado na lateral direita. Enter avança, Shift+Enter quebra. */}
      <footer className="relative z-10 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        {/* subida (repouso) / descida (foco) pra dar fluidez, igual ao input do início */}
        <div
          className={`relative flex items-center transition-all duration-300 ease-out ${
            ctxFocado ? 'translate-y-[calc(-1*var(--kb,0px))]' : 'translate-y-[calc(-1*var(--kb,0px)-0.25rem)]'
          }`}
        >
          <textarea
            ref={ctxRef}
            value={contexto}
            onChange={(e) => {
              setContexto(e.target.value)
              ajustarCtx()
            }}
            onFocus={() => setCtxFocado(true)}
            onBlur={() => setCtxFocado(false)}
            onKeyDown={(e) => {
              // Enter avança; Shift+Enter quebra linha (igual ao input do início)
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                avancar()
              }
            }}
            rows={1}
            placeholder={ctxFocado ? 'O que quer estudar? tema, dificuldades, foco…' : 'O que quer estudar?'}
            // sem-scrollbar = a barra/arrastar fica invisível; rola só depois de 3 linhas
            className={`sem-scrollbar resize-none rounded-[22px] border backdrop-blur-md py-2.5 pl-4 text-[17px] leading-6 placeholder:text-white/40 outline-none transition-all duration-300 ease-out ${
              ctxFocado
                ? 'w-full pr-12 border-white/80 bg-white/20'
                : 'w-[calc(100%-3rem)] pr-4 border-white/50 bg-white/10'
            }`}
            style={{ maxHeight: MAX_CTX }}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()} // não desfoca o campo ao clicar
            onClick={avancar}
            disabled={!podeAvancar}
            aria-label="Avançar"
            className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-[#2a4bff] text-white shadow-[0_0_16px_rgba(42,75,255,0.55)] transition-opacity active:opacity-70 disabled:opacity-30 disabled:shadow-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </footer>
    </>
  )
}

/* ===== Card-radio do modo de estudo (Objetiva / Completa) =====
   Substitui o toggle: ao selecionar, a borda/fundo acendem no azul do app
   (com glow + um leve "pop" de escala) — feedback claro de qual está ativo. */
function CardModo({
  ativo,
  titulo,
  descricao,
  onClick,
}: {
  ativo: boolean
  titulo: string
  descricao: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-2xl border p-3 text-left transition-all duration-300 ${
        ativo
          ? 'border-[#3b7bff] bg-[#3b7bff]/15 shadow-[0_0_20px_rgba(59,123,255,0.4)] scale-[1.03]'
          : 'border-white/15 bg-black/25 active:bg-black/40'
      }`}
    >
      <span className={`text-sm font-semibold ${ativo ? 'text-white' : 'text-white/80'}`}>{titulo}</span>
      <span className="text-xs leading-snug text-white/55">{descricao}</span>
    </button>
  )
}

/* ===== Barra de progresso do topo (bolinhas + "2/5") ===== */
function TopoProgresso({
  nome,
  atual,
  total,
  aoVoltar,
}: {
  nome: string
  atual: number
  total: number
  aoVoltar?: () => void
}) {
  return (
    <header className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      {aoVoltar && (
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="-mt-1 text-3xl leading-none">
          ‹
        </button>
      )}
      <span className="flex-1 truncate font-semibold">{nome}</span>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i <= atual ? 'bg-white' : 'bg-white/25'}`} />
        ))}
      </div>
      <span className="text-sm text-white/60">
        {atual + 1}/{total}
      </span>
    </header>
  )
}

/* ===== Cartao de pergunta de MÚLTIPLA ESCOLHA (reaproveitado na aula e na prova) =====
   Tipado como QuestionMultiplaEscolha: quem chama ESTREITA o `tipo` antes de passar. */
function CartaoPergunta({
  pergunta,
  rotuloProximo,
  aoProximo,
}: {
  pergunta: QuestionMultiplaEscolha
  rotuloProximo: string
  aoProximo: (escolha: number) => void
}) {
  const [escolha, setEscolha] = useState<number | null>(null)
  const [respondido, setRespondido] = useState(false)
  const acertou = escolha === pergunta.correta

  function corAlternativa(i: number) {
    if (!respondido) return escolha === i ? 'border-white bg-white/10' : 'border-[#CACACA] bg-black'
    if (i === pergunta.correta) return 'border-green-400 bg-green-400/15'
    if (i === escolha) return 'border-red-400 bg-red-400/15'
    return 'border-[#CACACA]/20 opacity-60'
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">{pergunta.enunciado}</p>

      {pergunta.alternativas.map((alt, i) => (
        <button
          key={i}
          type="button"
          disabled={respondido}
          onClick={() => setEscolha(i)}
          className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${corAlternativa(i)}`}
        >
          {alt}
        </button>
      ))}

      {!respondido ? (
        <button
          type="button"
          disabled={escolha === null}
          onClick={() => setRespondido(true)}
          className="mt-2 rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white disabled:opacity-40"
        >
          Responder
        </button>
      ) : (
        <>
          <p className={`text-sm ${acertou ? 'text-green-400' : 'text-red-400'}`}>
            {acertou
              ? 'Boa! Você acertou.'
              : `Quase! A resposta certa era: "${pergunta.alternativas[pergunta.correta]}".`}
          </p>
          <button
            type="button"
            onClick={() => aoProximo(escolha as number)}
            className="rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white"
          >
            {rotuloProximo}
          </button>
        </>
      )}
    </div>
  )
}

/* ===== Cartao de pergunta DISCURSIVA (reaproveitado na aula e na prova) =====
   O aluno ESCREVE; ao responder, a IA corrige (nota + por quê + melhoria) comparando
   com a respostaEsperada + pontosChave + o conteúdo do bloco. Pode responder de novo
   (se errou) ou avançar. `aoProximo` recebe a correção, pra prova somar a nota média. */
function CartaoPerguntaDiscursiva({
  pergunta,
  conteudoBloco,
  rotuloProximo,
  aoProximo,
}: {
  pergunta: QuestionDiscursiva
  conteudoBloco: string[]
  rotuloProximo: string
  aoProximo: (correcao: CorrecaoDiscursiva) => void
}) {
  const [texto, setTexto] = useState('')
  const [corrigindo, setCorrigindo] = useState(false)
  const [correcao, setCorrecao] = useState<CorrecaoDiscursiva | null>(null)

  async function responder() {
    if (!texto.trim() || corrigindo) return
    setCorrigindo(true)
    try {
      setCorrecao(await gradeDiscursiveAnswer(pergunta, conteudoBloco, texto.trim(), ia))
    } catch {
      setCorrecao({ nota: 0, acertou: false, porque: 'Não consegui corrigir agora. Tente de novo.', melhoria: '' })
    } finally {
      setCorrigindo(false)
    }
  }

  function tentarDeNovo() {
    setCorrecao(null)
    setTexto('')
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">{pergunta.enunciado}</p>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        disabled={!!correcao || corrigindo}
        rows={5}
        placeholder="Escreva sua resposta com as suas palavras…"
        className="resize-none rounded-xl border border-[#CACACA] bg-black px-4 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-white disabled:opacity-70"
      />

      {!correcao ? (
        <button
          type="button"
          disabled={!texto.trim() || corrigindo}
          onClick={responder}
          className="mt-1 rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white disabled:opacity-40"
        >
          {corrigindo ? 'Corrigindo…' : 'Responder'}
        </button>
      ) : (
        <>
          {/* nota + barra: verde se passou, âmbar se não */}
          <div className={`rounded-2xl border p-4 ${correcao.acertou ? 'border-green-400/50 bg-green-400/10' : 'border-amber-400/50 bg-amber-400/10'}`}>
            <p className={`text-sm font-semibold ${correcao.acertou ? 'text-green-300' : 'text-amber-300'}`}>
              {correcao.nota}/100 — {correcao.acertou ? 'Boa, você mandou bem!' : 'Dá pra melhorar'}
            </p>
            {correcao.porque && <p className="mt-2 text-sm leading-relaxed text-white/80">{correcao.porque}</p>}
            {correcao.melhoria && (
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                <span className="font-medium text-white/85">Pra melhorar: </span>
                {correcao.melhoria}
              </p>
            )}
          </div>

          {!correcao.acertou && (
            <button
              type="button"
              onClick={tentarDeNovo}
              className="rounded-2xl border border-white/30 bg-transparent py-3 font-semibold text-white active:bg-white/10"
            >
              Responder de novo
            </button>
          )}
          <button
            type="button"
            onClick={() => aoProximo(correcao)}
            className="rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white"
          >
            {rotuloProximo}
          </button>
        </>
      )}
    </div>
  )
}

/* ===== Tela 3: Aula (ensina o bloco + pergunta + tira-dúvidas fixo) ===== */
function Aula({
  estudo,
  material,
  aoVoltar,
  aoConcluir,
}: {
  estudo: Study
  material: string
  aoVoltar: () => void
  aoConcluir: () => void
}) {
  const { personalidade } = useSettings()
  const [i, setI] = useState(0)
  const [fase, setFase] = useState<'ensino' | 'pergunta'>('ensino')
  const total = estudo.blocos.length
  const bloco = estudo.blocos[i]
  const ultimo = i === total - 1

  // Tira-dúvidas DO BLOCO ATUAL (camada de suporte; não avança o estudo).
  // Escopado ao bloco: ao trocar de bloco, zera — o contexto muda com ele.
  const [conversa, setConversa] = useState<Mensagem[]>([])
  const [duvida, setDuvida] = useState('')
  const [pensando, setPensando] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)
  const duvidaRef = useRef<HTMLTextAreaElement>(null)
  const [duvidaFocada, setDuvidaFocada] = useState(false)

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversa.length])

  async function perguntar() {
    const q = duvida.trim()
    if (!q || pensando) return
    const historico: Mensagem[] = [...conversa, { autor: 'user', texto: q }]
    setConversa(historico)
    setDuvida('')
    setPensando(true)
    // no celular, some o teclado ao enviar a dúvida (volta ao normal pra ler a resposta)
    if (window.matchMedia('(pointer: coarse)').matches) duvidaRef.current?.blur()
    // monta o contexto do bloco atual (recorte relevante) pro caso de uso studyChat
    const contexto = montarContextoEstudo(estudo, i, {
      material,
      progresso: { blocosConcluidos: i, totalBlocos: total },
    })
    try {
      let iaCriada = false
      for await (const pedaco of studyChat(contexto, historico, ia, personalidade)) {
        if (!iaCriada) {
          iaCriada = true
          setConversa((prev) => [...prev, { autor: 'ia', texto: pedaco }])
        } else {
          setConversa((prev) => {
            const m = prev.slice()
            m[m.length - 1] = { autor: 'ia', texto: m[m.length - 1].texto + pedaco }
            return m
          })
        }
      }
    } catch {
      setConversa((prev) => [...prev, { autor: 'ia', texto: 'Ops, não consegui responder agora. Tenta de novo?' }])
    } finally {
      setPensando(false)
    }
  }

  function avancarBloco() {
    if (ultimo) {
      aoConcluir()
    } else {
      setI(i + 1)
      setFase('ensino') // proximo bloco comeca ensinando de novo
      setConversa([]) // o tira-dúvidas é por bloco
    }
  }

  // O rodapé tem UM botão com DOIS modos, decididos pelo TEXTO do input (não pelo foco):
  //  - tem texto -> ENVIAR a dúvida pro chat (perguntar)
  //  - vazio     -> AVANÇAR no conteúdo (ensino -> pergunta -> próximo bloco)
  // É o padrão do WhatsApp (microfone↔enviar), trocado por avançar↔enviar.
  const temTexto = duvida.trim().length > 0
  function avancar() {
    if (fase === 'ensino') setFase('pergunta')
    else avancarBloco()
  }

  return (
    <>
      <TopoProgresso nome={estudo.nome} atual={i} total={total} aoVoltar={aoVoltar} />
      {/* pb-28 reserva espaço pro input fixo lá embaixo */}
      <main className="flex-1 overflow-y-auto flex flex-col gap-6 px-6 py-6 pb-[calc(7rem+var(--kb,0px))]">
        <h2 className="text-lg font-semibold">{bloco.titulo}</h2>

        {fase === 'ensino' ? (
          // Fase 1: a IA ensina (so o conteudo + botao pra ir pra pergunta)
          <>
            <div className="flex flex-col gap-4 text-sm leading-relaxed text-white/80">
              {bloco.conteudo.map((paragrafo, k) => (
                <p key={k}>{paragrafo}</p>
              ))}
            </div>
            {/* o avanço ensino -> pergunta agora é o botão DUAL do rodapé (seta pra direita
                quando o input está vazio). Dica discreta pro aluno achar o controle: */}
            <p className="text-xs text-white/40">
              Terminou de ler? Use a seta embaixo pra avançar — ou escreva ali pra tirar uma dúvida.
            </p>
          </>
        ) : bloco.pergunta.tipo === 'discursivo' ? (
          // Fase 2 (discursivo): o aluno escreve, a IA corrige
          <CartaoPerguntaDiscursiva
            key={i}
            pergunta={bloco.pergunta}
            conteudoBloco={bloco.conteudo}
            rotuloProximo={ultimo ? 'Ir para a prova' : 'Próximo bloco'}
            aoProximo={avancarBloco}
          />
        ) : (
          // Fase 2 (múltipla escolha): alternativas
          <CartaoPergunta
            key={i}
            pergunta={bloco.pergunta}
            rotuloProximo={ultimo ? 'Ir para a prova' : 'Próximo bloco'}
            aoProximo={avancarBloco}
          />
        )}

        {/* thread do tira-dúvidas (aparece conforme o aluno pergunta) */}
        {conversa.length > 0 && (
          <div className="mt-2 flex flex-col gap-3 border-t border-white/10 pt-4">
            {conversa.map((m, k) =>
              m.autor === 'user' ? (
                <div key={k} className="self-end max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-[#142073] px-3 py-2 text-sm">
                  {m.texto}
                </div>
              ) : (
                <div key={k} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
                  {m.texto}
                </div>
              ),
            )}
            {pensando && conversa[conversa.length - 1]?.autor === 'user' && (
              <div className="flex items-center gap-2 text-sm text-white/50">
                <img src="/logo-a.png" alt="" className="h-4 w-4 animate-bounce invert" />
                pensando…
              </div>
            )}
            <div ref={fimRef} />
          </div>
        )}
      </main>

      {/* INPUT FIXO: o controle é do aluno — ele pergunta a qualquer momento,
          sem travar o fluxo (pedir outro exemplo, tirar dúvida de um tópico…). */}
      <footer className="absolute bottom-0 inset-x-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-[#0a0d1f] via-[#0a0d1f]/85 to-transparent translate-y-[calc(-1*var(--kb,0px))] transition-transform duration-200 ease-out">
        <div
          className={`flex items-center gap-2 rounded-full border backdrop-blur-md pl-4 pr-2 py-1.5 transition-colors duration-200 ${
            duvidaFocada ? 'border-white/80 bg-white/20' : 'border-white/50 bg-white/10'
          }`}
        >
          <textarea
            ref={duvidaRef}
            value={duvida}
            onChange={(e) => setDuvida(e.target.value)}
            onFocus={() => setDuvidaFocada(true)}
            onBlur={() => setDuvidaFocada(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                perguntar()
              }
            }}
            rows={1}
            placeholder="Tirar uma dúvida sobre este bloco…"
            className="max-h-24 flex-1 resize-none bg-transparent text-[17px] leading-6 placeholder:text-white/40 outline-none py-1"
          />
          <button
            type="button"
            onClick={temTexto ? perguntar : avancar}
            onMouseDown={(e) => e.preventDefault()}
            disabled={pensando}
            aria-label={temTexto ? 'Enviar dúvida' : 'Avançar no estudo'}
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#0a1560] transition-opacity active:opacity-70 disabled:opacity-40"
          >
            {temTexto ? (
              // seta pra CIMA = enviar a dúvida
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V6M6 12l6-6 6 6" />
              </svg>
            ) : (
              // seta pra DIREITA = avançar no conteúdo
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>
      </footer>
    </>
  )
}

/* ===== Tela 4: Prova — escolhe o fluxo pelo formato do estudo ===== */
function Prova({
  estudo,
  aoConcluir,
}: {
  estudo: Study
  aoConcluir: (resultado: ResultadoProva | ResultadoProvaDiscursiva) => void
}) {
  return estudo.formato === 'discursivo' ? (
    <ProvaDiscursiva estudo={estudo} aoConcluir={aoConcluir} />
  ) : (
    <ProvaMultiplaEscolha estudo={estudo} aoConcluir={aoConcluir} />
  )
}

// Prova de MÚLTIPLA ESCOLHA: coleta os índices e corrige com gradeExam (puro, na hora).
function ProvaMultiplaEscolha({
  estudo,
  aoConcluir,
}: {
  estudo: Study
  aoConcluir: (resultado: ResultadoProva) => void
}) {
  const [i, setI] = useState(0)
  const [respostas, setRespostas] = useState<number[]>([]) // o índice escolhido em cada questão
  const total = estudo.prova.length
  const ultima = i === total - 1
  const questao = estudo.prova[i]

  // a prova de um estudo MC só tem perguntas MC — guard pro TS estreitar o tipo
  if (questao.tipo !== 'multipla_escolha') return null

  return (
    <>
      <TopoProgresso nome="Prova" atual={i} total={total} />
      <main className="flex-1 px-6 py-6">
        <CartaoPergunta
          key={i}
          pergunta={questao}
          rotuloProximo={ultima ? 'Ver resultado' : 'Próxima'}
          aoProximo={(escolha) => {
            const novas = [...respostas, escolha]
            setRespostas(novas)
            // na última, corrige a prova inteira de uma vez (função pura)
            if (ultima) aoConcluir(gradeExam(estudo, novas))
            else setI(i + 1)
          }}
        />
      </main>
    </>
  )
}

// Prova DISCURSIVA: coleta os TEXTOS (sem feedback por questão — é prova) e, na última,
// corrige tudo de uma vez com gradeDiscursiveExam (IA), com um "corrigindo…" enquanto roda.
function ProvaDiscursiva({
  estudo,
  aoConcluir,
}: {
  estudo: Study
  aoConcluir: (resultado: ResultadoProvaDiscursiva) => void
}) {
  const [i, setI] = useState(0)
  const [respostas, setRespostas] = useState<string[]>([])
  const [texto, setTexto] = useState('')
  const [corrigindo, setCorrigindo] = useState(false)
  const total = estudo.prova.length
  const ultima = i === total - 1
  const questao = estudo.prova[i]

  if (questao.tipo !== 'discursivo') return null

  async function avancar() {
    if (!texto.trim() || corrigindo) return
    const novas = [...respostas, texto.trim()]
    setRespostas(novas)
    setTexto('')
    if (!ultima) {
      setI(i + 1)
      return
    }
    // última: corrige a prova inteira de uma vez (IA)
    setCorrigindo(true)
    try {
      aoConcluir(await gradeDiscursiveExam(estudo, novas, ia))
    } catch {
      // melhor mostrar um resultado vazio do que travar a tela
      aoConcluir({ notaMedia: 0, correcoes: [] })
    }
  }

  if (corrigindo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="h-9 w-9 rounded-full border-4 border-white/25 border-t-white animate-spin" />
        <p className="text-sm text-white/70">Corrigindo suas respostas…</p>
      </div>
    )
  }

  return (
    <>
      <TopoProgresso nome="Prova" atual={i} total={total} />
      <main className="flex-1 px-6 py-6 flex flex-col gap-3">
        <p className="font-medium">{questao.enunciado}</p>
        <textarea
          key={i}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          placeholder="Escreva sua resposta…"
          className="resize-none rounded-xl border border-[#CACACA] bg-black px-4 py-3 text-sm leading-relaxed outline-none focus:border-white"
        />
        <button
          type="button"
          disabled={!texto.trim()}
          onClick={avancar}
          className="mt-1 rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white disabled:opacity-40"
        >
          {ultima ? 'Entregar e ver resultado' : 'Próxima'}
        </button>
      </main>
    </>
  )
}

/* ===== Tela 5: Resultado — escolhe a apresentação pelo tipo do resultado ===== */
function Resultado({
  resultado,
  aoRefazer,
  aoSair,
}: {
  resultado: ResultadoProva | ResultadoProvaDiscursiva
  aoRefazer: () => void
  aoSair: () => void
}) {
  // discursivo tem `notaMedia`; MC tem `acertos` — a presença do campo decide a tela
  if ('notaMedia' in resultado) {
    return <ResultadoDiscursivo resultado={resultado} aoRefazer={aoRefazer} aoSair={aoSair} />
  }
  return <ResultadoMultiplaEscolha resultado={resultado} aoRefazer={aoRefazer} aoSair={aoSair} />
}

// Resultado de MÚLTIPLA ESCOLHA: nota REAL + desempenho por bloco + erros pra revisar.
function ResultadoMultiplaEscolha({
  resultado,
  aoRefazer,
  aoSair,
}: {
  resultado: ResultadoProva
  aoRefazer: () => void
  aoSair: () => void
}) {
  return (
    <main className="flex-1 flex flex-col gap-6 px-6 py-8 overflow-y-auto">
      <div className="text-center">
        <p className="text-sm text-white/60">Resultado</p>
        <p className="text-4xl font-bold">
          {resultado.acertos}/{resultado.total} 🎉
        </p>
      </div>

      <div>
        <p className="mb-3 text-sm text-white/70">Desempenho por bloco</p>
        <div className="flex flex-col gap-3">
          {resultado.porBloco.map((b) => {
            const pct = b.total > 0 ? Math.round((b.acertos / b.total) * 100) : 0
            return (
              <div key={b.blocoIndex}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{b.titulo}</span>
                  <span className="text-white/60">{b.total > 0 ? `${pct}%` : '—'}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/15">
                  <div className="h-2 rounded-full bg-white" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[#CACACA]/30 bg-black/20 p-4 text-sm">
        <p className="mb-2 font-semibold">Pra revisar</p>
        {resultado.erros.length === 0 ? (
          <p className="text-white/70">Você acertou tudo! 🎯</p>
        ) : (
          <ul className="flex flex-col gap-3 text-white/70">
            {resultado.erros.map((e, i) => (
              <li key={i}>
                <span className="text-white/90">{e.enunciado}</span>
                <br />
                Resposta certa: <span className="text-green-400">{e.respostaCerta}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto flex gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={aoRefazer} className="flex-1 rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white">
          Refazer
        </button>
        <button type="button" onClick={aoSair} className="flex-1 rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white">
          Salvar e sair
        </button>
      </div>
    </main>
  )
}

// Resultado DISCURSIVO: a % média (nota da IA) + o feedback de cada questão escrita.
function ResultadoDiscursivo({
  resultado,
  aoRefazer,
  aoSair,
}: {
  resultado: ResultadoProvaDiscursiva
  aoRefazer: () => void
  aoSair: () => void
}) {
  return (
    <main className="flex-1 flex flex-col gap-6 px-6 py-8 overflow-y-auto">
      <div className="text-center">
        <p className="text-sm text-white/60">Resultado</p>
        <p className="text-4xl font-bold">{resultado.notaMedia}% 🎉</p>
        <p className="mt-1 text-xs text-white/50">média das suas respostas escritas</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-white/70">Feedback por questão</p>
        {resultado.correcoes.map((c, i) => (
          <div
            key={i}
            className={`rounded-2xl border p-4 ${c.acertou ? 'border-green-400/40 bg-green-400/10' : 'border-amber-400/40 bg-amber-400/10'}`}
          >
            <p className={`text-sm font-semibold ${c.acertou ? 'text-green-300' : 'text-amber-300'}`}>
              Questão {i + 1} — {c.nota}/100
            </p>
            {c.porque && <p className="mt-2 text-sm leading-relaxed text-white/80">{c.porque}</p>}
            {c.melhoria && (
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                <span className="font-medium text-white/85">Pra melhorar: </span>
                {c.melhoria}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto flex gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={aoRefazer} className="flex-1 rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white">
          Refazer
        </button>
        <button type="button" onClick={aoSair} className="flex-1 rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white">
          Salvar e sair
        </button>
      </div>
    </main>
  )
}

export default StudySession
