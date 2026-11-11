/*
  Chaves BYOK (Groq / Gemini) — as peças de UI pra configurar UMA chave, reaproveitadas
  em dois lugares:
    - AcordeaoChaves (Configurações): as duas opções, uma aberta por vez.
    - ChaveProvedor (etapas 3 e 4 do GuiaChaves): o bloco de um provedor só, sem acordeão.

  Verificação: ao sair do campo (blur) a chave é conferida junto ao provedor
  (infrastructure/ai/validarChave) e o resultado vai pro Config (marcarChaveValida).
  Também confere ao montar uma chave que já estava salva mas nunca foi verificada
  (quem salvou antes desta verificação existir).
*/
import { useEffect, useState, type ReactNode } from 'react'
import { useSettings } from '../settings'
import type { Provedor } from '../../infrastructure/ai/validarChave'

export type EstadoChave = 'vazia' | 'verificando' | 'valida' | 'invalida' | 'erro' | 'nao-verificada'

export const INFO_PROVEDOR: Record<
  Provedor,
  {
    titulo: string
    subtitulo: string
    usoChip: string
    descricao: string
    link: string
    linkRotulo: string
    prefixo: string
  }
> = {
  groq: {
    titulo: 'Groq',
    subtitulo: 'Estudar e Trabalhos',
    usoChip: 'Estudar · Trabalhos',
    descricao: 'O Astrodny usa o Groq pra gerar aulas, provas e trabalhos.',
    link: 'https://console.groq.com/keys',
    linkRotulo: 'console.groq.com/keys',
    prefixo: 'gsk_...',
  },
  gemini: {
    titulo: 'Gemini',
    subtitulo: 'Chat / tira-dúvidas',
    usoChip: 'Chat',
    descricao: 'O Astrodny usa o Gemini pro chat/tira-dúvidas.',
    link: 'https://aistudio.google.com/apikey',
    linkRotulo: 'aistudio.google.com/apikey',
    prefixo: 'AIza...',
  },
}

export function LinkExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[#6f8dff] underline">
      {children}
    </a>
  )
}

// Estado e ações de UMA chave, lidos do contexto (o estado de verificação vive lá, pra
// que o selo do acordeão e o campo contem a mesma história). Compartilhado por
// OpcaoChave (acordeão) e ChaveProvedor (guia).
export function useChaveProvedor(provedor: Provedor) {
  const { groqApiKey, geminiApiKey, definirGroqApiKey, definirGeminiApiKey, chavesValidas, verificacao, verificarChave } =
    useSettings()
  const valor = provedor === 'groq' ? groqApiKey : geminiApiKey
  const definir = provedor === 'groq' ? definirGroqApiKey : definirGeminiApiKey
  const valida = chavesValidas[provedor]
  const { verificando, ultimo } = verificacao[provedor]

  // formato claramente errado (Groq sempre começa com "gsk_") — nem vale bater na API:
  // dá o feedback na hora, sem esperar a volta do servidor.
  const formatoInvalido = provedor === 'groq' && valor !== '' && !valor.startsWith('gsk_')

  const estado: EstadoChave = !valor
    ? 'vazia'
    : formatoInvalido
      ? 'invalida'
      : verificando
        ? 'verificando'
        : valida
          ? 'valida'
          : ultimo === 'invalida'
            ? 'invalida'
            : ultimo === 'erro'
              ? 'erro'
              : 'nao-verificada'

  // chave salva antes de existir verificação (ou nunca conferida nesta sessão): confere ao montar
  useEffect(() => {
    if (valor && !valida && ultimo === null && !formatoInvalido) void verificarChave(provedor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function aoSalvar(chave: string) {
    const limpa = chave.trim()
    definir(limpa)
    if (!limpa) return
    if (provedor === 'groq' && !limpa.startsWith('gsk_')) return // formato local já reprovou
    if (limpa !== valor || !valida) void verificarChave(provedor, limpa)
  }

  return { valor, estado, formatoInvalido, aoSalvar, tentarDeNovo: () => void verificarChave(provedor) }
}

export function AcordeaoChaves({ inicial = null }: { inicial?: Provedor | null }) {
  const [aberta, setAberta] = useState<Provedor | null>(inicial)
  function alternar(p: Provedor) {
    setAberta((atual) => (atual === p ? null : p))
  }
  return (
    <div className="flex flex-col gap-3">
      {(['groq', 'gemini'] as Provedor[]).map((p) => (
        <OpcaoChave key={p} provedor={p} aberta={aberta === p} aoAlternar={() => alternar(p)} />
      ))}
    </div>
  )
}

function OpcaoChave({ provedor, aberta, aoAlternar }: { provedor: Provedor; aberta: boolean; aoAlternar: () => void }) {
  const info = INFO_PROVEDOR[provedor]
  const chave = useChaveProvedor(provedor)
  const idPainel = `painel-chave-${provedor}`

  return (
    <div className={`rounded-2xl border transition-colors ${aberta ? 'border-white/40 bg-white/10' : 'border-white/15 bg-white/5'}`}>
      <button
        type="button"
        onClick={aoAlternar}
        aria-expanded={aberta}
        aria-controls={idPainel}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{info.titulo}</span>
            <SeloChave estado={chave.estado} />
          </div>
          <p className="pt-0.5 text-sm text-white/50">{info.subtitulo}</p>
        </div>
        <svg
          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className={`shrink-0 text-white/60 transition-transform ${aberta ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberta && (
        <div id={idPainel} className="border-t border-white/10 px-4 pb-4 pt-3">
          <p className="pb-3 text-sm text-white/50">{info.descricao}</p>
          {chave.estado === 'vazia' && (
            <p className="pb-3 text-xs text-amber-200">
              Pegue sua chave grátis em <LinkExterno href={info.link}>{info.linkRotulo}</LinkExterno> e cole abaixo.
              Precisa de ajuda? O guia passo a passo está no botão de chave do topo das telas.
            </p>
          )}
          <ChaveProvedor provedor={provedor} comRotulo />
        </div>
      )}
    </div>
  )
}

export function SeloChave({ estado }: { estado: EstadoChave }) {
  const mapa: Record<EstadoChave, { texto: string; classe: string }> = {
    vazia: { texto: 'Falta configurar', classe: 'bg-amber-400/15 text-amber-200' },
    verificando: { texto: 'Verificando…', classe: 'bg-white/10 text-white/60' },
    valida: { texto: 'Válida', classe: 'bg-emerald-400/15 text-emerald-300' },
    invalida: { texto: 'Inválida', classe: 'bg-red-400/15 text-red-300' },
    erro: { texto: 'Não verificada', classe: 'bg-white/10 text-white/60' },
    'nao-verificada': { texto: 'Não verificada', classe: 'bg-white/10 text-white/60' },
  }
  const s = mapa[estado]
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.classe}`}>{s.texto}</span>
}

// O campo de UMA chave + feedback da verificação (inválida / não deu pra verificar).
// Estado LOCAL (rascunho) — só salva no blur, não a cada tecla, pra não gravar (nem
// verificar) no meio de uma colagem.
export function ChaveProvedor({ provedor, comRotulo = false }: { provedor: Provedor; comRotulo?: boolean }) {
  const info = INFO_PROVEDOR[provedor]
  const { valor, estado, formatoInvalido, aoSalvar, tentarDeNovo } = useChaveProvedor(provedor)
  const [rascunho, setRascunho] = useState(valor)
  const [mostrar, setMostrar] = useState(false)

  return (
    <div>
      {estado === 'invalida' && (
        <p className="pb-2.5 text-xs text-red-300">
          {formatoInvalido ? (
            <>
              Essa chave não foi aceita pelo {info.titulo}. Confira se copiou inteira, começando com{' '}
              <code className="rounded bg-white/10 px-1">{info.prefixo.replace('...', '')}</code>.
            </>
          ) : (
            <>
              O {info.titulo} recusou essa chave. Confira se copiou inteira, ou gere outra em{' '}
              <LinkExterno href={info.link}>{info.linkRotulo}</LinkExterno>.
            </>
          )}
        </p>
      )}
      {estado === 'erro' && (
        <p className="pb-2.5 text-xs text-white/60">
          Não consegui verificar agora.{' '}
          <button type="button" onClick={tentarDeNovo} className="underline">
            Tentar de novo
          </button>
        </p>
      )}

      {comRotulo && (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label className="text-sm text-white/70">Sua chave {info.titulo}</label>
          <SeloChave estado={estado} />
        </div>
      )}
      <div className="relative">
        <input
          type={mostrar ? 'text' : 'password'}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => aoSalvar(rascunho)}
          placeholder={info.prefixo}
          autoComplete="off"
          aria-label={`Sua chave ${info.titulo}`}
          className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-2.5 pr-11 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/40"
        />
        <button
          type="button"
          onClick={() => setMostrar((v) => !v)}
          aria-label={mostrar ? 'Ocultar chave' : 'Mostrar chave'}
          aria-pressed={mostrar}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/50 hover:text-white/80"
        >
          <OlhoIcone aberto={mostrar} />
        </button>
      </div>
      <p className="pt-2 text-xs text-white/40">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 inline-block -translate-y-px" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Salva só neste aparelho
      </p>
    </div>
  )
}

function OlhoIcone({ aberto }: { aberto: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {aberto ? (
        <>
          <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
          <path d="M9.88 5.09A9.4 9.4 0 0 1 12 5c5.5 0 9 7 9 7a13.9 13.9 0 0 1-2.1 2.9M6.1 6.1A14 14 0 0 0 3 12s3.5 7 9 7a9.3 9.3 0 0 0 3.1-.53" />
        </>
      )}
    </svg>
  )
}
