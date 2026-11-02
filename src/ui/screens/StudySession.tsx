/*
  Sessão de Estudo (StudySession): o fluxo de 5 telas.
  Um estado `etapa` decide qual tela aparece.

  Camada de apresentação (ui): só desenha e coleta. Fala com o caso de uso
  `buildStudy` (application), nunca com o modelo de IA direto.
*/
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TextoIA, BotaoCopiar } from '../components/ChatTexto'
import type {
  Study,
  StudySalvo,
  Mode,
  Formato,
  EstudoConfig,
  QuestionMultiplaEscolha,
  QuestionDiscursiva,
  ExercicioCodigo,
  CorrecaoDiscursiva,
  ResultadoProva,
  ResultadoProvaDiscursiva,
  ConteudoItem,
} from '../../domain/study'
import type { Mensagem } from '../../domain/chat'
import { buildStudy } from '../../application/buildStudy'
import { buildExam } from '../../application/buildExam'
import { narrarEstudo } from '../../application/narrarEstudo'
import { gradeExam } from '../../application/gradeExam'
import { gradeDiscursiveAnswer, gradeDiscursiveExam, gradeCodeAnswer } from '../../application/gradeDiscursiveAnswer'
import { extractContent } from '../../application/extractContent'
import { studyChat, montarContextoEstudo } from '../../application/studyChat'
import { groqProvider, groqRapidoProvider, groqConfigurado } from '../../infrastructure/ai/groqProvider'
import { geminiProvider, geminiConfigurado } from '../../infrastructure/ai/geminiProvider'
import { proxyProvider } from '../../infrastructure/ai/proxyProvider'
import { fallbackProvider } from '../../infrastructure/ai/fallbackProvider'
import { retryProvider } from '../../infrastructure/ai/retryProvider'
import { pdfExtractor, contarPaginasPdf } from '../../infrastructure/documents/pdfExtractor'
import { useStudies } from '../studies'
import { useSettings } from '../settings'
import { useAuth } from '../auth'
import Sidebar from './Sidebar'
import { AbasFluxo } from '../abas'

// qual tela do fluxo aparece (estado da ui) — o esqueleto da maquina de estados
type Etapa = 'preparar' | 'analisando' | 'aula' | 'prova' | 'resultado'

// EM PRODUÇÃO, tudo passa pelo nosso proxy (/api/*): ele guarda as chaves, roteia a cadeia
// (Groq→Gemini) e coleta os dados. EM DEV, espelhamos a MESMA cadeia direto do navegador
// (free tier), pra não ficar refém de um só provedor quando ele estourar o limite — foi
// exatamente isso que travou o modo objetiva (só Groq, sem fallback, depois que tiramos o
// Ollama). Trocar o "cérebro" é só trocar qual adaptador implementa a porta.
const PROD = import.meta.env.PROD
const provedoresDev = [...(groqConfigurado ? [groqProvider] : []), ...(geminiConfigurado ? [geminiProvider] : [])]
// sem NENHUMA chave em dev: cai no Groq mesmo assim, só pra dar um erro claro ao
// chamar (em vez de derrubar o módulo inteiro na hora de montar a cadeia).
const cadeiaDev = fallbackProvider(provedoresDev.length ? provedoresDev : [groqProvider])
// mesma função de 1 linha já duplicada em buildStudy.ts/buildTrabalho.ts/retryProvider.ts
// (não é exportada de nenhum deles) — usada pro respiro entre aula e prova (ver abaixo).
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// IA do dia a dia (correção discursiva, tira-dúvidas e aula do modo OBJETIVA).
// SEM retryProvider aqui: tanto proxyProvider (prod) quanto cadeiaDev (dev) JÁ SÃO
// fallbackProvider por dentro (Groq→Gemini) — envolver de novo com retry faz a
// cadeia INTEIRA rodar de novo a cada retentativa, martelando os MESMOS provedores
// que acabaram de dizer "sem limite" (foi isso que gerou a enxurrada de 429/503 ao
// vivo: cada etapa do Estudar rodava até 2x a cadeia de 2 provedores = 4 chamadas).
const ia = PROD ? proxyProvider : cadeiaDev
// Estágio 2 (prova): em prod vai pelo proxy (já é fallback, sem retry por fora); em
// dev, Groq É um provedor ÚNICO (não uma cadeia) — aí sim o retry ajuda de verdade
// (ou null → buildExam deriva dos blocos).
const iaProva = PROD ? proxyProvider : groqConfigurado ? retryProvider(groqProvider) : null

function StudySession() {
  const navigate = useNavigate()
  // tema que veio do botão "Montar estudo de X" no chat (Fase 2) — ver Home.tsx.
  // OU uma sessão salva pra RETOMAR (botão "Continuar" em Sessões de Estudos) — nesse
  // caso pulamos direto pra etapa 'aula', já com o Study e o bloco de onde parou.
  const location = useLocation()
  const estadoRota = location.state as { tema?: string; retomar?: StudySalvo } | null
  const temaInicial = estadoRota?.tema
  const retomar = estadoRota?.retomar
  const { salvarEstudo } = useStudies()
  const [etapa, setEtapa] = useState<Etapa>(retomar ? 'aula' : 'preparar')
  // começam SEM seleção (null): o aluno escolhe de propósito ao abrir o Estudar.
  const [modo, setModo] = useState<Mode | null>(null)
  // FORMATO das perguntas (o toggle por estudo): também sem padrão marcado.
  const [formato, setFormato] = useState<Formato | null>(null)
  // categoria escolhida na tela Preparar (dropdown busca-ou-cria, ver CampoMateria) —
  // controlada aqui (não dentro de Preparar) pra sobreviver a um "Refazer" (que
  // desmonta e remonta a tela Preparar sem perder o que o aluno já escolheu).
  const [materia, setMateria] = useState(retomar?.materia ?? 'Geral')
  const [arquivos, setArquivos] = useState<File[]>([]) // os PDFs anexados (material real)
  const [contexto, setContexto] = useState('') // pedido extra do aluno (foco/dificuldades)
  const [config, setConfig] = useState<EstudoConfig>({}) // ajustes opt-in (nº tópicos, código)
  const [erro, setErro] = useState<string | null>(null) // msg quando a leitura/estudo falha
  const [estudo, setEstudo] = useState<Study | null>(retomar?.estudo ?? null) // o que o caso de uso produziu
  // nasce ao entrar na etapa 'aula' (não só no save final): progresso e resultado da
  // MESMA sessão caem no mesmo registro salvo (upsert por id — ver StudyRepository).
  const [sessaoId, setSessaoId] = useState<string | null>(retomar?.id ?? null)
  // o resultado é de MC (gradeExam) OU discursivo (gradeDiscursiveExam) — depende do formato
  const [resultado, setResultado] = useState<ResultadoProva | ResultadoProvaDiscursiva | null>(null)

  // nome do PDF/pedido que originou o estudo — usado tanto no save de progresso
  // (a cada bloco) quanto no save final (ao concluir a prova). Ao retomar, reusa a
  // origem já salva (não há PDF/pedido novo nesta visita).
  const origem =
    retomar?.origem ?? (arquivos.map((a) => a.name).join(', ') || contexto.trim().slice(0, 60) || 'Estudo por chat')

  function salvarProgresso(blocoAtual: number, totalBlocos: number) {
    if (!sessaoId || !estudo) return
    salvarEstudo({
      id: sessaoId,
      data: new Date().toISOString(),
      origem,
      materia,
      estudo,
      resultado: null,
      progresso: { blocoAtual, totalBlocos },
    })
  }

  return (
    <div className="relative isolate overflow-hidden h-svh flex flex-col bg-[#2e2f36] text-white lg:flex-row">
      {/* No DESKTOP a sidebar fica fixa também no modo Estudar (coluna à esquerda).
          No MOBILE ela some (apenasDesktop → hidden) e o estudo segue em tela cheia,
          imersivo. aoSelecionar é NO-OP: sem drawer mobile pra fechar aqui, e cada item
          já navega pro destino certo por conta própria (ex.: "Novo Chat" → /chat) — não
          dá pra sobrescrever isso navegando pra Home depois (era o bug: todo clique no
          menu, inclusive "Novo Chat", acabava voltando pra Home). */}
      <Sidebar apenasDesktop aoSelecionar={() => {}} />
      {/* área de conteúdo: ocupa o resto ao lado da sidebar (lg:flex-1). relative pra
          ancorar os rodapés absolutos das sub-telas. min-w-0 evita estouro horizontal;
          min-h-0 é ESSENCIAL: sem ele, o <main> de rolagem não encolhe e o conteúdo
          transborda pra baixo, empurrando o input do rodapé pra fora da tela no celular. */}
      <div className="relative flex min-w-0 min-h-0 flex-1 flex-col">
      {etapa === 'preparar' && (
        <Preparar
          modo={modo}
          formato={formato}
          materia={materia}
          erro={erro}
          temaInicial={temaInicial}
          aoEscolherModo={setModo}
          aoEscolherFormato={setFormato}
          aoEscolherMateria={setMateria}
          aoVoltar={() => navigate('/chat')}
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
            setSessaoId(Date.now().toString(36))
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
          material={arquivos.map((a) => a.name).join(', ') || contexto.trim() || origem}
          blocoInicial={retomar?.progresso?.blocoAtual}
          aoVoltar={() => (retomar ? navigate('/sessoes') : setEtapa('preparar'))}
          aoConcluir={() => setEtapa('prova')}
          aoProgresso={salvarProgresso}
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
              // mesmo id da sessão: conclui o MESMO registro que vinha recebendo o
              // progresso (upsert) — sempre fecha como concluída, fonte de dado pra IA.
              salvarEstudo({
                id: sessaoId ?? Date.now().toString(36),
                data: new Date().toISOString(),
                origem,
                materia,
                estudo,
                resultado: res,
                progresso: null,
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
    // Sem AbortController, o StrictMode do dev (ou qualquer re-render que recrie
    // `aoFalhar` durante a geração) deixava a chamada anterior rodando em paralelo,
    // desperdiçando cota à toa. Abortamos a chamada em voo sempre que o efeito
    // reexecuta ou a tela é desmontada (aluno saiu no meio).
    const controller = new AbortController()

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
        // Estágio 1 (aula): em dev, os dois modos (objetiva/completa) usam a MESMA cadeia
        // (Groq→Gemini) — a profundidade do ensino muda só pelo PROMPT (ver buildStudyPrompt),
        // não pelo provedor. Em prod, tudo pelo proxy.
        setStatus('Separando os tópicos e montando a aula…')
        // sem retryProvider aqui pelo mesmo motivo do `ia` acima: já é fallback por dentro.
        const iaAula = PROD ? proxyProvider : cadeiaDev
        const estudo = await buildStudy(
          conteudo,
          modo,
          formato,
          iaAula,
          contexto,
          config,
          (ms) => setStatus(`Groq está ocupado, tentando de novo em ${Math.ceil(ms / 1000)}s…`),
          controller.signal,
        )
        if (!vivo) return
        // respiro entre aula e prova: reduz a chance das duas caírem no mesmo instante
        // de pico do balde de tokens/minuto do Groq (as duas competem pela mesma cota).
        await dormir(1500)
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
        // proxyProvider (prod) já é fallback por dentro; groqRapidoProvider (dev) é
        // provedor ÚNICO, aí o retry continua fazendo sentido.
        const iaNarracao = PROD ? proxyProvider : groqConfigurado ? retryProvider(groqRapidoProvider) : null
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
        if (controller.signal.aborted) return // cancelado de propósito, não é falha
        console.error('Falha ao montar o estudo:', e)
        if (vivo) {
          aoFalhar(e instanceof Error ? e.message : 'Algo deu errado ao ler o material.')
        }
      }
    }
    processar()

    return () => {
      vivo = false
      controller.abort()
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
  materia: string
  erro: string | null
  // tema que chegou do botão de ação do chat ("Montar estudo de X") — pré-preenche
  // o campo de pedido, mas NÃO avança: o aluno confirma modo/formato e decide.
  temaInicial?: string
  aoEscolherModo: (m: Mode) => void
  aoEscolherFormato: (f: Formato) => void
  aoEscolherMateria: (m: string) => void
  aoVoltar: () => void
  aoComecar: (arquivos: File[], contexto?: string, config?: EstudoConfig) => void
}

// um PDF anexado + sua contagem de páginas (null enquanto ainda está sendo lida)
type ItemArquivo = { arquivo: File; paginas: number | null }

function Preparar({
  modo,
  formato,
  materia,
  erro,
  temaInicial,
  aoEscolherModo,
  aoEscolherFormato,
  aoEscolherMateria,
  aoVoltar,
  aoComecar,
}: PrepararProps) {
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
      <header className="relative z-10 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full items-center gap-3 lg:max-w-[860px]">
          <button type="button" onClick={aoVoltar} aria-label="Voltar" className="text-3xl leading-none -mt-1">
            ‹
          </button>
          <span className="text-lg font-semibold">Novo estudo</span>
        </div>
      </header>

      {/* conteudo — pb maior que o pt empurra o grupo centralizado um pouco pra cima
          (só o conteúdo; o input vive no footer, intocado) */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto sem-scrollbar flex flex-col px-5 pt-8 pb-28">
        {/* Wrapper com m-auto: centraliza quando há espaço e, quando o conteúdo cresce
            (ex.: com o toggle de formato), rola a partir do TOPO em vez de cortá-lo.
            O pt-8 no main "desce" o conteúdo um tico. Scroll invisível (sem-scrollbar +
            overflow-y-auto) já funciona com toque E mouse — nativo, sem detectar device. */}
        <div className="m-auto w-full flex flex-col gap-6 lg:max-w-[860px]">
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

        {/* categoria do estudo — pré-configurada pelas matérias do perfil (logado) ou
            pelas já usadas localmente (visitante); dropdown busca-ou-cria */}
        <CampoMateria valor={materia} aoMudar={aoEscolherMateria} />

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
      <footer className="relative z-10 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto w-full lg:max-w-[860px]">
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
        </div>
      </footer>
    </>
  )
}

/* ===== Campo "Matéria": combobox busca-ou-cria, single-select =====
   Sugestões vêm de `perfil.materias` (logado — e criar aqui persiste lá, mesmo
   caminho do onboarding) ou, sem login, das matérias já usadas localmente nos
   estudos salvos. Digitar um termo que não existe oferece "criar". */
function CampoMateria({ valor, aoMudar }: { valor: string; aoMudar: (m: string) => void }) {
  const { usuario, perfil, salvarPerfil } = useAuth()
  const { estudos } = useStudies()
  const [busca, setBusca] = useState(valor === 'Geral' ? '' : valor)
  const [aberto, setAberto] = useState(false)

  const sugestoesBase =
    perfil?.materias && perfil.materias.length > 0
      ? perfil.materias
      : [...new Set(estudos.map((e) => e.materia).filter((m) => m && m !== 'Geral'))]
  const termo = busca.trim().toLowerCase()
  const filtradas = termo ? sugestoesBase.filter((m) => m.toLowerCase().includes(termo)) : sugestoesBase
  const podeCriar = busca.trim().length > 0 && !sugestoesBase.some((m) => m.toLowerCase() === termo)

  function confirmar(materiaEscolhida: string) {
    const limpa = materiaEscolhida.trim()
    if (!limpa) return
    aoMudar(limpa)
    setBusca(limpa)
    setAberto(false)
    if (usuario && perfil && !(perfil.materias ?? []).some((m) => m.toLowerCase() === limpa.toLowerCase())) {
      salvarPerfil({ ...perfil, materias: [...(perfil.materias ?? []), limpa] })
    }
  }

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm text-white/70">Matéria</label>
      <input
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value)
          setAberto(true)
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            confirmar(podeCriar ? busca : (filtradas[0] ?? busca))
          }
          if (e.key === 'Escape') setAberto(false)
        }}
        placeholder="Ex.: Banco de Dados"
        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/40"
      />
      {aberto && (filtradas.length > 0 || podeCriar) && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-white/15 bg-[#141416] shadow-xl">
          {filtradas.map((m) => (
            <button
              key={m}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => confirmar(m)}
              className="block w-full px-4 py-2.5 text-left text-[14px] text-white/85 hover:bg-white/5"
            >
              {m}
            </button>
          ))}
          {podeCriar && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => confirmar(busca)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] text-white/85 hover:bg-white/5"
            >
              <span className="text-white/50">+</span> Criar "{busca.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
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
    <header className="flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] lg:mx-auto lg:w-full lg:max-w-[860px]">
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

/* ===== Cartao de EXERCÍCIO DE CÓDIGO (mini-IDE) — ADITIVO, só aparece quando o
   bloco trouxe `exercicioCodigo`. É o gêmeo do CartaoPerguntaDiscursiva: mesmo
   fluxo (escreve -> corrige -> acerta ou tenta de novo), só troca a textarea por
   uma monoespaçada (preserva indentação com Tab) e a correção por gradeCodeAnswer
   (julga lógica/comportamento, não redação). */
function CartaoExercicioCodigo({
  exercicio,
  conteudoBloco,
  rotuloProximo,
  aoProximo,
}: {
  exercicio: ExercicioCodigo
  conteudoBloco: string[]
  rotuloProximo: string
  aoProximo: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [corrigindo, setCorrigindo] = useState(false)
  const [correcao, setCorrecao] = useState<CorrecaoDiscursiva | null>(null)

  async function responder() {
    if (!codigo.trim() || corrigindo) return
    setCorrigindo(true)
    try {
      setCorrecao(await gradeCodeAnswer(exercicio, conteudoBloco, codigo, ia))
    } catch {
      setCorrecao({ nota: 0, acertou: false, porque: 'Não consegui corrigir agora. Tente de novo.', melhoria: '' })
    } finally {
      setCorrigindo(false)
    }
  }

  function tentarDeNovo() {
    setCorrecao(null)
  }

  // Tab insere 2 espaços em vez de tirar o foco do campo — sem isso, escrever
  // código indentado numa textarea comum é desconfortável (Tab pula pro próximo elemento).
  function aoTab(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = e.currentTarget
    const inicio = el.selectionStart
    const fim = el.selectionEnd
    const novo = codigo.slice(0, inicio) + '  ' + codigo.slice(fim)
    setCodigo(novo)
    requestAnimationFrame(() => el.setSelectionRange(inicio + 2, inicio + 2))
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">{exercicio.enunciado}</p>

      <textarea
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        onKeyDown={aoTab}
        disabled={!!correcao || corrigindo}
        rows={8}
        spellCheck={false}
        placeholder={`// escreva seu código em ${exercicio.linguagem} aqui…`}
        className="resize-none rounded-xl border border-[#CACACA] bg-black px-4 py-3 font-mono text-[13px] leading-relaxed outline-none transition-colors focus:border-white disabled:opacity-70"
      />

      {!correcao ? (
        <button
          type="button"
          disabled={!codigo.trim() || corrigindo}
          onClick={responder}
          className="mt-1 rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white disabled:opacity-40"
        >
          {corrigindo ? 'Corrigindo…' : 'Rodar correção'}
        </button>
      ) : (
        <>
          <div className={`rounded-2xl border p-4 ${correcao.acertou ? 'border-green-400/50 bg-green-400/10' : 'border-amber-400/50 bg-amber-400/10'}`}>
            <p className={`text-sm font-semibold ${correcao.acertou ? 'text-green-300' : 'text-amber-300'}`}>
              {correcao.nota}/100 — {correcao.acertou ? 'Boa, seu código funciona!' : 'Dá pra melhorar'}
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
              Tentar de novo
            </button>
          )}
          <button
            type="button"
            onClick={aoProximo}
            className="rounded-2xl border border-[#CACACA] bg-black py-3 font-semibold text-white"
          >
            {rotuloProximo}
          </button>
        </>
      )}
    </div>
  )
}

// Prefixo de cada item do "conteudo" → como ele é destacado na tela. "Exemplo:" e
// "Problema:" ganham borda/fundo (igual já existia); "Conclusão:" fecha o bloco em
// texto menor e apagado (reforça a ideia principal sem "gritar"). Sem prefixo = parágrafo normal.
// Quando o item TEM uma tabela dentro, a borda colorida NÃO entra — a tabela fica neutra
// (fundo preto, sem acento), só o texto em volta (se houver) ganha o destaque.
function wrapperConteudo(item: string): { className: string | null } {
  const texto = item.trimStart()
  if (texto.startsWith('Exemplo:')) {
    return { className: 'rounded-lg border-l-2 border-amber-400/60 bg-white/5 px-4 py-3' }
  }
  if (texto.startsWith('Problema:')) {
    return { className: 'rounded-lg border-l-2 border-rose-400/60 bg-white/5 px-4 py-3' }
  }
  if (texto.startsWith('Conclusão:')) {
    return { className: 'text-xs text-white/50' }
  }
  return { className: null }
}

// Rede de segurança: se por algum motivo um item de TEXTO ainda vier com uma tabela
// markdown espremida dentro da string (modelo antigo/bug de geração), detecta e aplica
// o mesmo tratamento neutro/preto — mas o caminho normal agora é o item ESTRUTURADO
// (ver TabelaConteudo abaixo), que não depende de parsing de markdown pra tabela.
const TEM_TABELA = /\|\s*:?-{2,}:?\s*\|/

// Tabela ESTRUTURADA (ver domain/study.ts TabelaConteudo): desenhada DIRETO em JSX, sem
// markdown no meio — por isso nunca quebra por newline mal escapado. Fundo preto sólido,
// sem o acento colorido do card de Problema/Exemplo (pedido explícito do usuário), com
// mais respiro que uma tabela comum do chat.
function TabelaConteudoView({ tabela }: { tabela: Extract<ConteudoItem, { tipo: 'tabela' }> }) {
  return (
    <div className="mb-4 last:mb-0">
      {tabela.legenda && <p className="mb-2 text-sm text-white/70">{tabela.legenda}</p>}
      <div className="scroll-chat overflow-x-auto rounded-xl border border-white/10 bg-black font-sans">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-white/[0.04]">
            <tr>
              {tabela.cabecalho.map((c, k) => (
                <th key={k} className="whitespace-nowrap border-b border-white/15 px-5 py-3.5 text-left font-semibold text-white">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabela.linhas.map((linha, i) => (
              <tr key={i} className="even:bg-white/[0.02]">
                {linha.map((c, k) => (
                  <td key={k} className="border-b border-white/[0.07] px-5 py-3.5 align-top leading-relaxed text-white/80">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ItemConteudo({ item }: { item: ConteudoItem }) {
  if (typeof item !== 'string') return <TabelaConteudoView tabela={item} />

  const ehTabelaCrua = TEM_TABELA.test(item) // defensivo — ver comentário acima
  const { className } = wrapperConteudo(item)
  const corpo = <TextoIA texto={item} tabelaPreta={ehTabelaCrua} />
  if (ehTabelaCrua) return <div className="mb-4 last:mb-0">{corpo}</div>
  return className ? <div className={`mb-4 last:mb-0 ${className}`}>{corpo}</div> : <div className="mb-3 last:mb-0">{corpo}</div>
}

/* ===== Tela 3: Aula (ensina o bloco + pergunta + tira-dúvidas fixo) ===== */
function Aula({
  estudo,
  material,
  blocoInicial,
  aoVoltar,
  aoConcluir,
  aoProgresso,
}: {
  estudo: Study
  material: string
  // ao RETOMAR uma sessão salva (ver SessoesEstudo "Continuar"), entra direto no
  // bloco onde o aluno parou em vez de sempre começar do zero.
  blocoInicial?: number
  aoVoltar: () => void
  aoConcluir: () => void
  // chamado ao entrar e a cada troca de bloco — quem persiste é o pai (StudySession),
  // que sabe o id/matéria da sessão; aqui só reporta "onde o aluno está agora".
  aoProgresso?: (blocoAtual: number, totalBlocos: number) => void
}) {
  const { personalidade } = useSettings()
  const [i, setI] = useState(blocoInicial ?? 0)
  const [fase, setFase] = useState<'ensino' | 'exercicio' | 'pergunta'>('ensino')
  const total = estudo.blocos.length
  const bloco = estudo.blocos[i]
  const ultimo = i === total - 1

  useEffect(() => {
    aoProgresso?.(i, total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

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
    // o exercício de código (mini-IDE) é ADITIVO: só entra no caminho quando o
    // bloco trouxe um (decisão já tomada na geração, não aqui).
    if (fase === 'ensino') setFase(bloco.exercicioCodigo ? 'exercicio' : 'pergunta')
    else if (fase === 'exercicio') setFase('pergunta')
    else avancarBloco()
  }

  return (
    <>
      <TopoProgresso nome={estudo.nome} atual={i} total={total} aoVoltar={aoVoltar} />
      {/* pb-28 reserva espaço pro input fixo lá embaixo */}
      <main className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-6 px-6 py-6 pb-[calc(7rem+var(--kb,0px))] lg:mx-auto lg:w-full lg:max-w-[860px]">
        <h2 className="text-lg font-semibold">{bloco.titulo}</h2>

        {fase === 'ensino' ? (
          // Fase 1: a IA ensina (so o conteudo + botao pra ir pra pergunta)
          <>
            <div className="text-sm leading-relaxed text-white/80">
              {bloco.conteudo.map((item, idx) => (
                <ItemConteudo key={idx} item={item} />
              ))}
            </div>
            {/* o avanço ensino -> pergunta agora é o botão DUAL do rodapé (seta pra direita
                quando o input está vazio). Dica discreta pro aluno achar o controle: */}
            <p className="text-xs text-white/40">
              Terminou de ler? Use a seta embaixo pra avançar — ou escreva ali pra tirar uma dúvida.
            </p>
          </>
        ) : fase === 'exercicio' && bloco.exercicioCodigo ? (
          // Fase 1.5 (ADITIVA, só quando o bloco trouxe exercicioCodigo): mini-IDE
          <CartaoExercicioCodigo
            key={`${i}-codigo`}
            exercicio={bloco.exercicioCodigo}
            conteudoBloco={bloco.conteudo}
            rotuloProximo="Ir para a pergunta"
            aoProximo={() => setFase('pergunta')}
          />
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
                <div key={k} className="animar-subida self-end flex max-w-[85%] flex-col items-end">
                  <div className="whitespace-pre-wrap break-words rounded-3xl bg-[#142073] px-4 py-2 font-sans text-[15px]">
                    {m.texto}
                  </div>
                  <div className="mt-0.5">
                    <BotaoCopiar texto={m.texto} titulo="Copiar mensagem" />
                  </div>
                </div>
              ) : (
                <div key={k} className="animar-subida break-words font-sans text-[15px] leading-relaxed text-white/90">
                  <TextoIA texto={m.texto} />
                  <div className="mt-1 flex items-center gap-2">
                    <BotaoCopiar texto={m.texto} titulo="Copiar resposta" />
                  </div>
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
      <footer className="absolute bottom-0 inset-x-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-[#0a0d1f] via-[#0a0d1f]/85 to-transparent translate-y-[calc(-1*var(--kb,0px))] transition-transform duration-200 ease-out lg:bg-none lg:pt-2 lg:mx-auto lg:max-w-[860px]">
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
      <main className="flex-1 px-6 py-6 lg:mx-auto lg:w-full lg:max-w-[860px]">
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
      <main className="flex-1 px-6 py-6 flex flex-col gap-3 lg:mx-auto lg:w-full lg:max-w-[860px]">
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
    <main className="flex-1 flex flex-col gap-6 px-6 py-8 overflow-y-auto lg:mx-auto lg:w-full lg:max-w-[860px]">
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
    <main className="flex-1 flex flex-col gap-6 px-6 py-8 overflow-y-auto lg:mx-auto lg:w-full lg:max-w-[860px]">
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
