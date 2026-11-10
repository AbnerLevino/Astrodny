/*
  Trabalhos (Trabalho.tsx): o aluno cola o texto → a IA ESTRUTURA (seções + citações,
  nunca escreve conteúdo novo) → o visualizer mostra como ficaria em ABNT → se algo saiu
  errado, o aluno digita uma INSTRUÇÃO de ajuste (não edita o texto direto, não é
  tira-dúvida) e a IA reprocessa. SÓ quando o aluno aprova e clica em "Exportar" é que
  pedimos os dados da capa (Metadados) — não faz sentido pedir isso antes de o conteúdo
  estar do jeito certo. O export (.docx em ABNT) em si é determinístico, sem IA — ver
  application/exportarAbnt.ts.
*/
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BotaoChaves from '../components/BotaoChaves'
import type { TipoTrabalho, Metadados, Trabalho as TrabalhoDomain } from '../../domain/trabalho'
import { ESTRUTURA_POR_TIPO, numerarSecoes } from '../../domain/trabalho'
import { buildTrabalho, type EstruturaTrabalho } from '../../application/buildTrabalho'
import { exportarAbnt } from '../../application/exportarAbnt'
import { groqProvider } from '../../infrastructure/ai/groqProvider'
import { proxyProvider } from '../../infrastructure/ai/proxyProvider'
import { retryProvider } from '../../infrastructure/ai/retryProvider'
import Sidebar from './Sidebar'
import { AbasFluxo } from '../abas'
import { useAuth } from '../auth'

// mesma lógica de wiring do StudySession: em PROD passa pelo proxy (chaves seguras,
// cadeia Gemini→Groq 120b); em DEV usa Groq direto (free tier). SEM retryProvider no
// proxy (já é fallback por dentro — ver nota em StudySession.tsx); no Groq direto
// (provedor ÚNICO em dev) o retry continua fazendo sentido.
const PROD = import.meta.env.PROD
const ia = PROD ? proxyProvider : retryProvider(groqProvider)

type Etapa = 'entrada' | 'processando' | 'visualizer' | 'metadados'

const TIPOS: TipoTrabalho[] = ['resumo', 'paper', 'artigo', 'tcc']

function Trabalho() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const [etapa, setEtapa] = useState<Etapa>('entrada')
  const [tipo, setTipo] = useState<TipoTrabalho>('paper')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [estrutura, setEstrutura] = useState<EstruturaTrabalho | null>(null)
  const [instrucao, setInstrucao] = useState('')
  const [corrigindo, setCorrigindo] = useState(false)
  const [exportando, setExportando] = useState(false)

  async function organizar() {
    if (!texto.trim()) return
    setErro(null)
    setEtapa('processando')
    try {
      const resultado = await buildTrabalho(texto, ia)
      setEstrutura(resultado)
      setEtapa('visualizer')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao organizar o texto.')
      setEtapa('entrada')
    }
  }

  // correção conversacional: manda só o estado JÁ estruturado + a instrução (não o
  // texto colado de novo) — ver buildTrabalho/buildTrabalhoPrompt.
  async function corrigir() {
    if (!instrucao.trim() || !estrutura) return
    setCorrigindo(true)
    setErro(null)
    try {
      const resultado = await buildTrabalho('', ia, { estadoAtual: estrutura, instrucao: instrucao.trim() })
      setEstrutura(resultado)
      setInstrucao('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao aplicar a correção.')
    } finally {
      setCorrigindo(false)
    }
  }

  // gera o .docx (sem IA — determinístico, ver exportarAbnt.ts) e dispara o download
  // do navegador. `Object.assign` só junta os campos opcionais que vieram preenchidos.
  async function exportar(metadados: Metadados) {
    if (!estrutura) return
    setExportando(true)
    setErro(null)
    try {
      const trabalho: TrabalhoDomain = { tipo, metadados, secoes: estrutura.secoes, citacoes: estrutura.citacoes }
      const blob = await exportarAbnt(trabalho)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${metadados.titulo || 'trabalho'}.docx`
      link.click()
      URL.revokeObjectURL(url)
      setEtapa('visualizer')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o arquivo.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="relative isolate overflow-hidden h-svh flex flex-col bg-[#2e2f36] text-white lg:flex-row">
      {/* aoSelecionar é NO-OP: sem drawer mobile pra fechar aqui (apenasDesktop), e
          cada item do menu já navega pro destino certo por conta própria (ex.:
          "Novo Chat" → /chat) — sobrescrever navegando pra Home depois era o bug. */}
      <Sidebar apenasDesktop aoSelecionar={() => {}} />
      <div className="relative flex min-w-0 min-h-0 flex-1 flex-col">
        {/* mesmo fundo AURORA do Estudar — véu escuro por cima pra não disputar com o texto */}
        <div className="fundo-aurora absolute inset-0 -z-20">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <span className="blob blob-3" />
        </div>
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[#0a0d1f] opacity-[0.5]" />

        <header className="relative z-10 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mx-auto flex w-full items-center gap-3 lg:max-w-[860px]">
            <button type="button" onClick={() => navigate('/chat')} aria-label="Voltar" className="shrink-0 text-3xl leading-none -mt-1">
              ‹
            </button>
            <span className="shrink-0 text-lg font-semibold">Trabalhos</span>
            <BotaoChaves />
            <div className="ml-auto min-w-0">
              <AbasFluxo />
            </div>
          </div>
        </header>

        <main className="relative z-10 flex-1 min-h-0 overflow-y-auto sem-scrollbar flex flex-col px-5 pt-6 pb-28">
          <div className="mx-auto w-full flex flex-col gap-5 lg:my-auto lg:max-w-[860px]">
            {erro && (
              <div className="rounded-2xl border border-red-400/50 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {erro}
              </div>
            )}

            {etapa === 'entrada' && (
              <Entrada tipo={tipo} texto={texto} aoMudarTipo={setTipo} aoMudarTexto={setTexto} aoOrganizar={organizar} />
            )}

            {etapa === 'processando' && <Processando />}

            {etapa === 'visualizer' && estrutura && (
              <Visualizer
                tipo={tipo}
                estrutura={estrutura}
                instrucao={instrucao}
                corrigindo={corrigindo}
                aoMudarInstrucao={setInstrucao}
                aoCorrigir={corrigir}
                aoExportar={() => setEtapa('metadados')}
              />
            )}

            {etapa === 'metadados' && (
              <MetadadosForm
                tipo={tipo}
                perfilNome={perfil?.nome}
                perfilCurso={perfil?.curso}
                exportando={exportando}
                aoVoltar={() => setEtapa('visualizer')}
                aoConfirmar={exportar}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Trabalho

/* ===== Tela 1: Entrada (tipo + texto colado) ===== */

type EntradaProps = {
  tipo: TipoTrabalho
  texto: string
  aoMudarTipo: (t: TipoTrabalho) => void
  aoMudarTexto: (v: string) => void
  aoOrganizar: () => void
}

function Entrada({ tipo, texto, aoMudarTipo, aoMudarTexto, aoOrganizar }: EntradaProps) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[17px] font-bold">Novo trabalho</h1>
        <p className="text-sm leading-relaxed text-white/60">
          Escolha o tipo de trabalho, cole o texto que você já escreveu e a IA organiza tudo
          nas seções certas, no padrão ABNT — sem inventar ou reescrever o seu conteúdo. Se
          algo ficar no lugar errado, você só precisa dizer o que corrigir.
        </p>
      </div>

      {/* seletor de tipo: pílulas simples (não os cards grandes do Estudar) — aqui é
          só "qual norma seguir", não uma escolha que precisa de descrição longa. */}
      <div className="flex gap-2 overflow-x-auto sem-scrollbar">
        {TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => aoMudarTipo(t)}
            aria-pressed={tipo === t}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              tipo === t
                ? 'border-[#3b7bff] bg-[#3b7bff]/20 text-white'
                : 'border-white/20 text-white/70 hover:border-[#3b7bff]/70 hover:text-white'
            }`}
          >
            {ESTRUTURA_POR_TIPO[t].nome}
          </button>
        ))}
      </div>

      <textarea
        value={texto}
        onChange={(e) => aoMudarTexto(e.target.value)}
        placeholder="Cole aqui o texto completo do seu trabalho…"
        rows={14}
        className="w-full resize-none rounded-2xl border border-white/50 bg-white/5 backdrop-blur-md px-4 py-3 text-sm leading-relaxed text-white placeholder:text-white/40 focus:border-white/80 focus:outline-none"
      />

      <button
        type="button"
        onClick={aoOrganizar}
        disabled={!texto.trim()}
        className="self-center rounded-full bg-[#2a4bff] px-6 py-2.5 font-semibold text-white shadow-[0_0_16px_rgba(42,75,255,0.55)] transition-opacity active:opacity-70 disabled:opacity-40 disabled:shadow-none"
      >
        Organizar
      </button>
    </>
  )
}

/* ===== Tela 2: Processando ===== */

function Processando() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-white/70">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#3b7bff]" />
      <p className="text-sm">Organizando seu trabalho…</p>
    </div>
  )
}

/* ===== Tela 3: Visualizer (pré-visualização + correção conversacional) ===== */

type VisualizerProps = {
  tipo: TipoTrabalho
  estrutura: EstruturaTrabalho
  instrucao: string
  corrigindo: boolean
  aoMudarInstrucao: (v: string) => void
  aoCorrigir: () => void
  aoExportar: () => void
}

function Visualizer({ tipo, estrutura, instrucao, corrigindo, aoMudarInstrucao, aoCorrigir, aoExportar }: VisualizerProps) {
  const numeradas = numerarSecoes(estrutura.secoes)
  const config = ESTRUTURA_POR_TIPO[tipo]

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-[17px] font-bold">Pré-visualização</h1>
        <span className="text-xs text-white/50">
          {config.nome} · {config.norma}
        </span>
      </div>

      {/* a "folha" simulada em ABNT: só EXIBE o que a IA entendeu — nenhum arquivo é
          gerado aqui. Fundo claro + fonte serifada pra lembrar visualmente um documento. */}
      <div className="rounded-2xl bg-[#f4f1ea] px-6 py-8 text-[#1a1a1a] shadow-inner">
        <div className="mx-auto max-w-[620px] space-y-5 font-serif text-[15px] leading-relaxed">
          {numeradas.map(({ secao, numero }) => (
            <div key={secao.id}>
              <p className={`font-bold ${secao.nivel === 1 ? 'text-base' : 'text-sm'}`}>
                {numero} {secao.titulo.toUpperCase()}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-justify indent-6">{secao.texto}</p>
            </div>
          ))}

          {estrutura.citacoes.length > 0 && (
            <div>
              <p className="font-bold text-base">REFERÊNCIAS</p>
              <ul className="mt-2 space-y-1.5">
                {estrutura.citacoes.map((c, i) => (
                  <li key={i} className={c.completa ? '' : 'text-red-700'}>
                    {c.autor} ({c.ano}){c.titulo ? `. ${c.titulo}` : ''}
                    {!c.completa && <span className="ml-1 text-xs">· falta completar (título/obra)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* correção CONVERSACIONAL: não edita o visualizer direto — o aluno DIZ o que
          corrigir (ex.: "isso é conclusão, não desenvolvimento") e a IA reprocessa. */}
      <div className="flex items-center gap-2">
        <input
          value={instrucao}
          onChange={(e) => aoMudarInstrucao(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && aoCorrigir()}
          placeholder='Algo errado? Diga o que corrigir — ex.: "isso é conclusão, não desenvolvimento"'
          disabled={corrigindo}
          className="flex-1 rounded-full border border-white/50 bg-white/5 backdrop-blur-md px-4 py-2.5 text-sm placeholder:text-white/40 focus:border-white/80 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={aoCorrigir}
          disabled={corrigindo || !instrucao.trim()}
          className="shrink-0 rounded-full bg-[#2a4bff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(42,75,255,0.55)] transition-opacity active:opacity-70 disabled:opacity-40 disabled:shadow-none"
        >
          {corrigindo ? '…' : 'Enviar'}
        </button>
      </div>

      {/* só pede os dados da capa (MetadadosForm) depois que o aluno aprovou o
          conteúdo aqui — exportar de fato acontece na etapa seguinte. */}
      <button
        type="button"
        onClick={aoExportar}
        className="rounded-full border border-white/30 bg-white/5 backdrop-blur-md px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-white/60"
      >
        Exportar (.docx)
      </button>
    </>
  )
}

/* ===== Tela 4: Metadados (capa) — só aparece quando o aluno clica em Exportar ===== */

type MetadadosFormProps = {
  tipo: TipoTrabalho
  perfilNome?: string
  perfilCurso?: string
  exportando: boolean
  aoVoltar: () => void
  aoConfirmar: (metadados: Metadados) => void
}

function MetadadosForm({ tipo, perfilNome, perfilCurso, exportando, aoVoltar, aoConfirmar }: MetadadosFormProps) {
  const config = ESTRUTURA_POR_TIPO[tipo]
  const [titulo, setTitulo] = useState('')
  const [autor, setAutor] = useState(perfilNome ?? '')
  const [instituicao, setInstituicao] = useState('')
  const [curso, setCurso] = useState(perfilCurso ?? '')
  const [orientador, setOrientador] = useState('')
  const [cidade, setCidade] = useState('')
  const [ano, setAno] = useState(String(new Date().getFullYear()))

  const valido = titulo.trim() !== '' && autor.trim() !== ''

  function confirmar() {
    if (!valido) return
    aoConfirmar({
      titulo: titulo.trim(),
      autor: autor.trim(),
      instituicao: instituicao.trim() || undefined,
      curso: curso.trim() || undefined,
      orientador: config.temCapaFormal ? orientador.trim() || undefined : undefined,
      cidade: cidade.trim() || undefined,
      ano: Number(ano) || new Date().getFullYear(),
    })
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[17px] font-bold">Dados da capa</h1>
        <p className="text-sm leading-relaxed text-white/60">
          Último passo: esses dados vão na capa{config.temCapaFormal && tipo === 'tcc' ? '/folha de rosto' : ''} do
          seu {config.nome.toLowerCase()}, formatado em {config.norma}.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Campo label="Título *" valor={titulo} aoMudar={setTitulo} placeholder="Título do trabalho" />
        <Campo label="Autor *" valor={autor} aoMudar={setAutor} placeholder="Seu nome completo" />
        <Campo label="Instituição" valor={instituicao} aoMudar={setInstituicao} placeholder="Ex.: Universidade Federal de..." />
        <Campo label="Curso" valor={curso} aoMudar={setCurso} placeholder="Ex.: Ciência da Computação" />
        {config.temCapaFormal && (
          <Campo label="Orientador" valor={orientador} aoMudar={setOrientador} placeholder="Nome do orientador (opcional)" />
        )}
        <div className="flex gap-3">
          <Campo label="Cidade" valor={cidade} aoMudar={setCidade} placeholder="Ex.: São Paulo" classeExtra="flex-1" />
          <Campo label="Ano" valor={ano} aoMudar={setAno} placeholder="2026" classeExtra="w-24" />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={aoVoltar}
          disabled={exportando}
          className="flex-1 rounded-full border border-white/30 bg-white/5 px-5 py-3 text-sm font-medium text-white/80 transition-colors hover:border-white/60 disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={!valido || exportando}
          className="flex-1 rounded-full bg-[#2a4bff] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_16px_rgba(42,75,255,0.55)] transition-opacity active:opacity-70 disabled:opacity-40 disabled:shadow-none"
        >
          {exportando ? 'Gerando…' : 'Gerar .docx'}
        </button>
      </div>
    </>
  )
}

function Campo({
  label,
  valor,
  aoMudar,
  placeholder,
  classeExtra = '',
}: {
  label: string
  valor: string
  aoMudar: (v: string) => void
  placeholder: string
  classeExtra?: string
}) {
  return (
    <label className={`flex flex-col gap-1 ${classeExtra}`}>
      <span className="text-xs text-white/50">{label}</span>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-white/30 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/70 focus:outline-none"
      />
    </label>
  )
}
