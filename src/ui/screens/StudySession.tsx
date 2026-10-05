/*
  Sessão de Estudo (StudySession): o fluxo de 5 telas.
  Um estado `etapa` decide qual tela aparece.

  Camada de apresentação (ui): só desenha e coleta. Fala com o caso de uso
  `buildStudy` (application), nunca com o modelo de IA direto.
*/
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type {
  Study,
  Mode,
  Formato,
  EstudoConfig,
  QuestionMultiplaEscolha,
  QuestionDiscursiva,
  CorrecaoDiscursiva,
  ResultadoProva,
  ResultadoProvaDiscursiva,
} from '../../domain/study'
import type { Mensagem } from '../../domain/chat'
import { buildStudy } from '../../application/buildStudy'
import { buildExam } from '../../application/buildExam'
import { narrarEstudo } from '../../application/narrarEstudo'
import { gradeExam } from '../../application/gradeExam'
import { gradeDiscursiveAnswer, gradeDiscursiveExam } from '../../application/gradeDiscursiveAnswer'
import { extractContent } from '../../application/extractContent'
import { studyChat, montarContextoEstudo } from '../../application/studyChat'
import { ollamaProvider } from '../../infrastructure/ai/ollamaProvider'
import { groqProvider, groqRapidoProvider, groqConfigurado } from '../../infrastructure/ai/groqProvider'
import { fallbackProvider } from '../../infrastructure/ai/fallbackProvider'
import { proxyProvider } from '../../infrastructure/ai/proxyProvider'
import { retryProvider } from '../../infrastructure/ai/retryProvider'
import { pdfExtractor, contarPaginasPdf } from '../../infrastructure/documents/pdfExtractor'
import { useStudies } from '../studies'
import { useSettings } from '../settings'
import Sidebar from './Sidebar'
import { AbasFluxo } from '../abas'

// qual tela do fluxo aparece (estado da ui) — o esqueleto da maquina de estados
type Etapa = 'preparar' | 'analisando' | 'aula' | 'prova' | 'resultado'

// EM PRODUÇÃO, tudo passa pelo nosso proxy (/api/*): ele guarda as chaves, roteia a cadeia
// (Gemini→Groq) e coleta os dados. EM DEV, usamos os modelos direto (Ollama local etc.) pra
// iterar de graça e offline. Trocar o "cérebro" é só trocar qual adaptador implementa a porta.
const PROD = import.meta.env.PROD

// Em DEV acessado pelo CELULAR (via IP da LAN), o Ollama do PC em `localhost` é
// inalcançável (localhost no celular = o próprio celular). Nesse caso a IA do Estudar
// vai pra NUVEM (Groq); no PC (localhost) segue no Ollama (grátis/offline).
const devRemoto =
  !PROD &&
  typeof location !== 'undefined' &&
  location.hostname !== 'localhost' &&
  location.hostname !== '127.0.0.1'

// IA do dia a dia (correção discursiva, tira-dúvidas e aula do modo OBJETIVA).
// retryProvider por fora: num pico de 429, espera (backoff) e tenta mais uma vez, em silêncio.
const ia = retryProvider(PROD ? proxyProvider : devRemoto && groqConfigurado ? groqProvider : ollamaProvider)
// Estágio 2 (prova): em prod vai pelo proxy; em dev, Groq direto (ou null → buildExam deriva dos blocos).
const iaProva = PROD ? retryProvider(proxyProvider) : groqConfigurado ? retryProvider(groqProvider) : null

function StudySession() {
  const navigate = useNavigate()
  // tema que veio do botão "Montar estudo de X" no chat (Fase 2) — ver Home.tsx.
  const location = useLocation()
  const temaInicial = (location.state as { tema?: string } | null)?.tema
  const { salvarEstudo } = useStudies()
  const [etapa, setEtapa] = useState<Etapa>('preparar')
  // começam SEM seleção (null): o aluno escolhe de propósito ao abrir o Estudar.
  const [modo, setModo] = useState<Mode | null>(null)
  // FORMATO das perguntas (o toggle por estudo): também sem padrão marcado.
  const [formato, setFormato] = useState<Formato | null>(null)
  const [arquivos, setArquivos] = useState<File[]>([]) // os PDFs anexados (material real)
  const [contexto, setContexto] = useState('') // pedido extra do aluno (foco/dificuldades)
  const [config, setConfig] = useState<EstudoConfig>({}) // ajustes opt-in (nº tópicos, código)
  const [erro, setErro] = useState<string | null>(null) // msg quando a leitura/estudo falha
  const [estudo, setEstudo] = useState<Study | null>(null) // o que o caso de uso produziu
  // o resultado é de MC (gradeExam) OU discursivo (gradeDiscursiveExam) — depende do formato
  const [resultado, setResultado] = useState<ResultadoProva | ResultadoProvaDiscursiva | null>(null)

  return (
    <div className="relative isolate overflow-hidden h-svh flex flex-col bg-[#2e2f36] text-white lg:flex-row">
      {/* No DESKTOP a sidebar fica fixa também no modo Estudar (coluna à esquerda);
          escolher um chat/opção leva de volta pra Home (aoSelecionar). No MOBILE ela
          some (apenasDesktop → hidden) e o estudo segue em tela cheia, imersivo. */}
      <Sidebar apenasDesktop aoSelecionar={() => navigate('/')} />
      {/* área de conteúdo: ocupa o resto ao lado da sidebar (lg:flex-1). relative pra
          ancorar os rodapés absolutos das sub-telas. min-w-0 evita estouro horizontal;
          min-h-0 é ESSENCIAL: sem ele, o <main> de rolagem não encolhe e o conteúdo
          transborda pra baixo, empurrando o input do rodapé pra fora da tela no celular. */}
      <div className="relative flex min-w-0 min-h-0 flex-1 flex-col">
      {etapa === 'preparar' && (
        <Preparar
          modo={modo}
          formato={formato}
          erro={erro}
          temaInicial={temaInicial}
          aoEscolherModo={setModo}
          aoEscolherFormato={setFormato}
          aoVoltar={() => navigate('/')}
          aoComecar={(pdfs, ctx, cfg) => {
            setArquivos(pdfs)
            setContexto(ctx ?? '')
            setConfig(cfg ?? {})
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
          config={config}
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
  config,
  aoConcluir,
  aoFalhar,
}: {
  arquivos: File[]
  modo: Mode
  formato: Formato
  contexto: string
  config: EstudoConfig
  aoConcluir: (estudo: Study) => void
  aoFalhar: (mensagem: string) => void
}) {
  const { personalidade } = useSettings()
  // status da etapa atual (reflete o trabalho REAL: ler → estruturar → prova)
  const [status, setStatus] = useState('Lendo seu material…')
  // o estudo já montado. Quando pronto, saímos do "montando" e mostramos a narração.
  const [estudoPronto, setEstudoPronto] = useState<Study | null>(null)
  // a frase da "Estrutura de chat" (streamada pela IA) + se já terminou de escrever.
  const [estruturaChat, setEstruturaChat] = useState('')
  const [fimEstrutura, setFimEstrutura] = useState(false)
  // qual bandeja de "ver detalhes" está aberta (só UMA por vez → abrir outra fecha a anterior)
  const [detalheAberto, setDetalheAberto] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true

    // roda a sequência real: extrair texto do(s) PDF(s) -> montar o estudo -> narrar.
    // Se qualquer etapa de MONTAGEM falhar, avisamos (aoFalhar) em vez de travar.
    async function processar() {
      try {
        // com PDF: extrai o texto (e cobra que tenha texto mesmo). Sem PDF: segue
        // só com o pedido do aluno (conteudo vazio) — estudar direto pelo chat.
        let conteudo = ''
        if (arquivos.length) {
          setStatus('Lendo seu material…')
          conteudo = await extractContent(arquivos, pdfExtractor)
          if (!conteudo) {
            throw new Error(
              'Não consegui ler texto desse PDF. Ele pode ser uma imagem escaneada.',
            )
          }
        }
        // Estágio 1 (aula): o modelo depende do MODO (completa = forte com fallback local;
        // objetiva = local). Em prod, tudo pelo proxy.
        setStatus('Separando os tópicos e montando a aula…')
        const iaAula = retryProvider(
          PROD
            ? proxyProvider
            : modo === 'completa' && groqConfigurado
              ? fallbackProvider([groqProvider, ollamaProvider])
              : devRemoto && groqConfigurado
                ? groqProvider
                : ollamaProvider,
        )
        const estudo = await buildStudy(conteudo, modo, formato, iaAula, contexto, config)
        if (!vivo) return
        // Estágio 2: a prova é montada à parte e acoplada ao estudo.
        setStatus('Preparando a prova…')
        const prova = await buildExam(estudo, iaProva)
        if (!vivo) return
        const estudoCompleto = { ...estudo, prova }
        setEstudoPronto(estudoCompleto) // trabalho pesado FEITO: libera o "Começar aula"

        // ESTRUTURA DE CHAT (única parte com IA): só se o aluno pediu um foco/contexto.
        // Modelo pequeno/rápido — Groq 8b-instant em dev, proxy em prod. Best-effort: se
        // não houver provider ou falhar, o painel segue só com os dados. Nunca trava.
        const iaNarracao = PROD ? retryProvider(proxyProvider) : groqConfigurado ? retryProvider(groqRapidoProvider) : null
        if (contexto.trim() && iaNarracao) {
          try {
            let acc = ''
            for await (const pedaco of narrarEstudo(estudoCompleto, contexto, iaNarracao, personalidade)) {
              if (!vivo) return
              acc += pedaco
              setEstruturaChat(acc)
            }
          } catch (e) {
            console.warn('Estrutura de chat falhou (seguindo sem ela):', e)
          }
        }
        if (vivo) setFimEstrutura(true)
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
  }, [arquivos, modo, formato, contexto, config, personalidade, aoFalhar])

  const pronto = estudoPronto !== null

  return (
    <div className="relative isolate flex-1 overflow-hidden flex flex-col items-center justify-center gap-6 px-6 text-center bg-[#04061a]">
      {/* fundo AURORA — um pouco MAIS intenso que o da home (brightness-125) e sem véu
          escuro por cima, pra o carregamento ficar vivo. */}
      <div className="fundo-aurora absolute inset-0 -z-10 brightness-125">
        <span className="blob blob-1" />
        <span className="blob blob-2" />
        <span className="blob blob-3" />
      </div>

      {/* O "A" pulando = carregando. O logo é PRETO (corpo preto, A branco), então num
          fundo escuro ele some — por isso vai num SELO branco com glow azul, que o faz
          aparecer e vira um "farol" de carregamento. */}
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_0_34px_rgba(59,123,255,0.65)]">
        <img src="/logo-a.png" alt="" className="h-11 w-11 animate-bounce" />
      </div>

      {!pronto ? (
        // MONTANDO: mostra a etapa REAL em andamento (ler → estruturar → prova)
        <p className="max-w-sm text-sm text-white/80">{status}</p>
      ) : (
        // PRONTO: painel de resumo (dados) + frase da IA + botão pra entrar na aula.
        <div className="flex w-full max-w-md flex-col gap-4">
          <p className="text-center text-xs uppercase tracking-wide text-white/50">Seu estudo está pronto</p>
          <div className="flex flex-col rounded-2xl border border-white/10 bg-black/30 px-4 backdrop-blur-sm">
            <LinhaResumo
              label="Tópicos"
              contagem={`${estudoPronto.blocos.length}`}
              detalhes={estudoPronto.blocos.map((b) => b.titulo)}
              aberto={detalheAberto === 'topicos'}
              onToggle={() => setDetalheAberto((a) => (a === 'topicos' ? null : 'topicos'))}
            />
            <LinhaResumo
              label="Perguntas"
              contagem={`${estudoPronto.blocos.length}`}
              detalhes={estudoPronto.blocos.map((b) => b.pergunta.enunciado)}
              aberto={detalheAberto === 'perguntas'}
              onToggle={() => setDetalheAberto((a) => (a === 'perguntas' ? null : 'perguntas'))}
            />
            <LinhaResumo
              label="Prova final"
              contagem={`${estudoPronto.prova.length} questões`}
              detalhes={estudoPronto.prova.map((q) => q.enunciado)}
              aberto={detalheAberto === 'prova'}
              onToggle={() => setDetalheAberto((a) => (a === 'prova' ? null : 'prova'))}
            />
            {contexto.trim() && (
              <LinhaResumoChat
                texto={estruturaChat}
                contexto={contexto}
                escrevendo={!fimEstrutura}
                aberto={detalheAberto === 'chat'}
                onToggle={() => setDetalheAberto((a) => (a === 'chat' ? null : 'chat'))}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => aoConcluir(estudoPronto)}
            className="self-center rounded-full bg-[#2a4bff] px-6 py-2.5 font-semibold text-white shadow-[0_0_16px_rgba(42,75,255,0.55)] transition-opacity active:opacity-70"
          >
            Começar aula →
          </button>
        </div>
      )}
    </div>
  )
}

// Uma linha do painel de resumo: "Label: N" + [ver detalhes] que expande a lista
// (em opacidade menor). CONTROLADA pelo pai (aberto/onToggle) pra só uma abrir por vez.
// A bandeja abre/fecha com animação suave via grid-rows 0fr→1fr (CSS puro, sem medir altura).
function LinhaResumo({
  label,
  contagem,
  detalhes,
  aberto,
  onToggle,
}: {
  label: string
  contagem: string
  detalhes: string[]
  aberto: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-white/10 py-3 text-left last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-white/90">
          {label}: <span className="font-semibold">{contagem}</span>
        </span>
        {detalhes.length > 0 && (
          <button type="button" onClick={onToggle} className="shrink-0 text-xs text-[#6f8dff] active:opacity-70">
            {aberto ? 'ocultar' : 'ver detalhes'}
          </button>
        )}
      </div>
      {/* bandeja animada: a linha do grid vai de 0fr (fechada) a 1fr (aberta) */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          aberto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-white/45">
            {detalhes.map((d, i) => (
              <li key={i}>→ {d}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// Linha da "Estrutura de chat": a frase calorosa da IA (streamando) + [ver detalhes]
// com o pedido cru do aluno. CONTROLADA pelo pai. Só é renderizada quando houve contexto.
function LinhaResumoChat({
  texto,
  contexto,
  escrevendo,
  aberto,
  onToggle,
}: {
  texto: string
  contexto: string
  escrevendo: boolean
  aberto: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-white/10 py-3 text-left last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-white/90">
          Estrutura de chat:{' '}
          <span className="font-normal text-white/70">
            {texto || (escrevendo ? '' : 'considerei o seu pedido.')}
            {escrevendo && <span className="cursor-piscando ml-0.5 inline-block">▍</span>}
          </span>
        </span>
        <button type="button" onClick={onToggle} className="shrink-0 text-xs text-[#6f8dff] active:opacity-70">
          {aberto ? 'ocultar' : 'ver detalhes'}
        </button>
      </div>
      <div
        className={`grid transition-all duration-300 ease-out ${
          aberto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="mt-2 text-xs leading-relaxed text-white/45">Seu pedido: "{contexto}"</p>
        </div>
      </div>
    </div>
  )
}

/* ===== Tela 1: Preparar o estudo (anexar PDF + escolher modo) ===== */

// Placeholder rotativo do campo de direção (troca a cada 6s): 2 instruções + 3 exemplos,
// pra o aluno perceber a variedade do que a "Estrutura de chat" aceita.
const PLACEHOLDERS = [
  'Descreva suas dificuldades, focos e pedidos…',
  'Diga o que a IA deve reforçar no seu estudo…',
  'Ex.: tenho dificuldade em requisitos não funcionais',
  'Ex.: foque nos exemplos práticos de elicitação',
  'Ex.: explique stakeholders com um caso real',
]

type PrepararProps = {
  modo: Mode | null
  formato: Formato | null
  erro: string | null
  // tema que chegou do botão de ação do chat ("Montar estudo de X") — pré-preenche
  // o campo de pedido, mas NÃO avança: o aluno confirma modo/formato e decide.
  temaInicial?: string
  aoEscolherModo: (m: Mode) => void
  aoEscolherFormato: (f: Formato) => void
  aoVoltar: () => void
  aoComecar: (arquivos: File[], contexto?: string, config?: EstudoConfig) => void
}

// um PDF anexado + sua contagem de páginas (null enquanto ainda está sendo lida)
type ItemArquivo = { arquivo: File; paginas: number | null }

function Preparar({ modo, formato, erro, temaInicial, aoEscolherModo, aoEscolherFormato, aoVoltar, aoComecar }: PrepararProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const ctxRef = useRef<HTMLTextAreaElement>(null)
  const [itens, setItens] = useState<ItemArquivo[]>([])
  const [arrastando, setArrastando] = useState(false)
  const [ajudaAberta, setAjudaAberta] = useState(false) // popover do (i)
  const [contexto, setContexto] = useState(temaInicial ?? '') // pedido do aluno (tema/foco/dúvidas)
  const [ctxFocado, setCtxFocado] = useState(false) // campo em foco?
  // Ajustes do estudo (opt-in): tudo com padrão sensato, só abre quem quer mexer.
  const [ajustesAberto, setAjustesAberto] = useState(false)
  const [topicosAuto, setTopicosAuto] = useState(true) // nº de tópicos no automático por padrão
  const [numTopicos, setNumTopicos] = useState(5) // valor quando o aluno fixa (1..10)
  const [incluirCodigo, setIncluirCodigo] = useState(false)
  // placeholder rotativo do campo (troca a cada 6s, com animação de "roda")
  const [phIdx, setPhIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 6000)
    return () => clearInterval(t)
  }, [])
  const temArquivo = itens.length > 0
  const aceso = temArquivo || arrastando // aurora/tracejado "acesos"
  // páginas totais do material (pra o aviso de "tópicos demais pra um PDF raso")
  const totalPaginas = itens.reduce((s, it) => s + (it.paginas ?? 0), 0)
  const avisoRaso = !topicosAuto && totalPaginas > 0 && numTopicos > totalPaginas
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
    const config: EstudoConfig = {
      numTopicos: topicosAuto ? null : numTopicos,
      incluirCodigo,
    }
    aoComecar(itens.map((it) => it.arquivo), contexto.trim() || undefined, config)
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
      <header className="relative z-10 flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] lg:mx-auto lg:w-full lg:max-w-[720px]">
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="text-3xl leading-none -mt-1">
          ‹
        </button>
        <span className="text-lg font-semibold">Novo estudo</span>
      </header>

      {/* conteudo — pb maior que o pt empurra o grupo centralizado um pouco pra cima
          (só o conteúdo; o input vive no footer, intocado) */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto sem-scrollbar flex flex-col px-5 pt-8 pb-28">
        {/* Wrapper com m-auto: centraliza quando há espaço e, quando o conteúdo cresce
            (ex.: com o toggle de formato), rola a partir do TOPO em vez de cortá-lo.
            O pt-8 no main "desce" o conteúdo um tico. Scroll invisível (sem-scrollbar +
            overflow-y-auto) já funciona com toque E mouse — nativo, sem detectar device. */}
        <div className="m-auto w-full flex flex-col gap-6 lg:max-w-[720px]">
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
              blocos, com perguntas de fixação e um simulado por tópicos no fim. Dica: deixar
              os tópicos no <span className="font-medium text-white/90">Automático</span> costuma
              deixar o estudo mais fiel ao seu material.
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

        {/* AJUSTES DO ESTUDO — opt-in: só quem quer mexer abre (tela limpa pro resto). */}
        <div>
          <button
            type="button"
            onClick={() => setAjustesAberto((v) => !v)}
            className="flex w-full items-center gap-2 text-sm text-white/70 active:opacity-70"
          >
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform duration-300 ${ajustesAberto ? 'rotate-90' : ''}`}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            Ajustes do estudo
          </button>

          <div
            className={`grid transition-all duration-300 ease-out ${
              ajustesAberto ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="overflow-hidden">
              <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                {/* Nº de tópicos: Automático (padrão) OU fixo 1..10, com aviso (i) de "raso" */}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-white/85">Número de tópicos</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTopicosAuto(true)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          topicosAuto ? 'border-[#3b7bff] bg-[#3b7bff]/20 text-white' : 'border-white/20 text-white/60'
                        }`}
                      >
                        Automático
                      </button>
                      {!topicosAuto ? (
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => setNumTopicos((n) => Math.max(1, n - 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-lg leading-none text-white/80 active:bg-white/10">−</button>
                          <span className="w-5 text-center text-sm font-semibold">{numTopicos}</span>
                          <button type="button" onClick={() => setNumTopicos((n) => Math.min(10, n + 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-lg leading-none text-white/80 active:bg-white/10">+</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setTopicosAuto(false)} className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/60 active:bg-white/10">
                          fixar
                        </button>
                      )}
                    </div>
                  </div>
                  {avisoRaso && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-300/90">
                      <span className="shrink-0 font-serif italic">ⓘ</span>
                      Seu material tem {totalPaginas} página{totalPaginas === 1 ? '' : 's'} — {numTopicos} tópicos pode deixar cada um raso.
                    </p>
                  )}
                </div>

                {/* Código + prática (toggle) — só pra matérias técnicas */}
                <button type="button" onClick={() => setIncluirCodigo((v) => !v)} className="flex items-center justify-between gap-3 text-left">
                  <span className="text-sm text-white/85">
                    Incluir código e exemplos práticos
                    <span className="block text-xs text-white/45">Ideal para matérias técnicas e programação</span>
                  </span>
                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${incluirCodigo ? 'bg-[#3b7bff]' : 'bg-white/20'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${incluirCodigo ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </main>

      {/* RODAPÉ: o canal do aluno (estudar é chat com direção). Em repouso o campo
          vai ATÉ o Avançar (ao lado, sem cobrir); ao focar, cresce "comendo" o
          botão, que fica acoplado na lateral direita. Enter avança, Shift+Enter quebra. */}
      <footer className="relative z-10 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 lg:mx-auto lg:w-full lg:max-w-[720px]">
        {/* as MESMAS abas da Home, aqui com "Estudar" aceso — continuidade: parece
            o mesmo chat, só que numa direção. Acompanham o teclado como o input. */}
        <div className="mb-3 translate-y-[calc(-1*var(--kb,0px))] transition-transform duration-300 ease-out">
          <AbasFluxo />
        </div>
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
            // placeholder nativo vazio: o visível é o overlay rotativo abaixo (animado)
            placeholder=""
            // sem-scrollbar = a barra/arrastar fica invisível; rola só depois de 3 linhas
            className={`sem-scrollbar resize-none rounded-[22px] border backdrop-blur-md py-2.5 pl-4 text-[18px] lg:text-[15px] leading-6 outline-none transition-all duration-300 ease-out ${
              ctxFocado
                ? 'w-full pr-12 border-white/80 bg-white/10'
                : 'w-[calc(100%-3rem)] pr-4 border-white/50 bg-white/5'
            }`}
            style={{ maxHeight: MAX_CTX }}
          />
          {/* PLACEHOLDER ROTATIVO: só quando o campo está vazio. key={phIdx} remonta a cada
              troca → re-dispara a animação de "roda" (sobe + fade). pointer-events-none
              deixa o clique passar pro textarea. */}
          {!contexto && (
            // container externo CENTRALIZA (flex, sem transform); o texto interno ANIMA
            // (translateY). Separados, a animação não "come" mais a centralização.
            <div className="pointer-events-none absolute inset-y-0 left-4 right-12 flex items-center overflow-hidden">
              <span key={phIdx} className="animar-placeholder w-full truncate text-[14px] leading-6 text-white/40">
                {PLACEHOLDERS[phIdx]}
              </span>
            </div>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()} // não desfoca o campo ao clicar
            onClick={avancar}
            aria-label="Avançar"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-[#2a4bff] text-white shadow-[0_0_16px_rgba(42,75,255,0.55)] transition-opacity active:opacity-70"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
    <header className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] lg:mx-auto lg:w-full lg:max-w-[720px]">
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

// Markdown da AULA: o conteúdo dos blocos agora é renderizado como markdown — assim
// CÓDIGO em bloco (```java ... ```) aparece formatado (monoespaçado, com rolagem), em vez
// de espremido numa linha de texto corrido. Negrito/listas também passam a funcionar.
const mdAula: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  code: ({ className, children }) => {
    // bloco = tem linguagem (```java) OU é multilinha; senão é código inline (pílula).
    const bloco = /language-/.test(className ?? '') || String(children).includes('\n')
    return bloco ? (
      <code className={`${className ?? ''} font-mono text-[13px]`}>{children}</code>
    ) : (
      <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[13px]">{children}</code>
    )
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-[13px] leading-relaxed">{children}</pre>
  ),
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
      <main className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-6 px-6 py-6 pb-[calc(7rem+var(--kb,0px))] lg:mx-auto lg:w-full lg:max-w-[720px]">
        <h2 className="text-lg font-semibold">{bloco.titulo}</h2>

        {fase === 'ensino' ? (
          // Fase 1: a IA ensina (so o conteudo + botao pra ir pra pergunta)
          <>
            <div className="text-sm leading-relaxed text-white/80">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdAula}>
                {bloco.conteudo.join('\n\n')}
              </ReactMarkdown>
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
                <img src="/logo-a.png" alt="" className="h-4 w-4 animate-bounce" />
                pensando…
              </div>
            )}
            <div ref={fimRef} />
          </div>
        )}
      </main>

      {/* INPUT FIXO: o controle é do aluno — ele pergunta a qualquer momento,
          sem travar o fluxo (pedir outro exemplo, tirar dúvida de um tópico…). */}
      <footer className="absolute bottom-0 inset-x-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-[#0a0d1f] via-[#0a0d1f]/85 to-transparent translate-y-[calc(-1*var(--kb,0px))] transition-transform duration-200 ease-out lg:mx-auto lg:max-w-[720px]">
        <div
          className={`flex items-center gap-2 rounded-full border backdrop-blur-md pl-4 pr-2 py-1.5 transition-colors duration-200 ${
            duvidaFocada ? 'border-white/80 bg-white/10' : 'border-white/50 bg-white/5'
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
            className="max-h-24 flex-1 resize-none bg-transparent text-[18px] lg:text-[15px] leading-6 placeholder:text-white/40 placeholder:text-[14px] outline-none py-1"
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
      <main className="flex-1 px-6 py-6 lg:mx-auto lg:w-full lg:max-w-[720px]">
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
      <main className="flex-1 px-6 py-6 flex flex-col gap-3 lg:mx-auto lg:w-full lg:max-w-[720px]">
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
    <main className="flex-1 flex flex-col gap-6 px-6 py-8 overflow-y-auto lg:mx-auto lg:w-full lg:max-w-[720px]">
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
    <main className="flex-1 flex flex-col gap-6 px-6 py-8 overflow-y-auto lg:mx-auto lg:w-full lg:max-w-[720px]">
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
