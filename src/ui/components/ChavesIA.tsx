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
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSettings } from '../settings'
import { validarChave, type Provedor, type ResultadoValidacao } from '../../infrastructure/ai/validarChave'

export type EstadoChave = 'vazia' | 'verificando' | 'valida' | 'invalida' | 'erro' | 'nao-verificada'

export const INFO_PROVEDOR: Record<
  Provedor,
  { titulo: string; subtitulo: string; descricao: string; link: string; linkRotulo: string; prefixo: string }
> = {
  groq: {
    titulo: 'Groq',
    subtitulo: 'Estudar e Trabalhos',
    descricao: 'O Astrodny usa o Groq pra gerar aulas, provas e trabalhos.',
    link: 'https://console.groq.com/keys',
    linkRotulo: 'console.groq.com/keys',
    prefixo: 'gsk_...',
  },
  gemini: {
    titulo: 'Gemini',
    subtitulo: 'Chat / tira-dúvidas',
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

// Estado e ações de UMA chave: valor salvo, resultado da verificação e o que fazer
// ao salvar. É o que OpcaoChave (acordeão) e ChaveProvedor (guia) compartilham.
export function useChaveProvedor(provedor: Provedor) {
  const { groqApiKey, geminiApiKey, definirGroqApiKey, definirGeminiApiKey, chavesValidas, marcarChaveValida } =
    useSettings()
  const valor = provedor === 'groq' ? groqApiKey : geminiApiKey
  const definir = provedor === 'groq' ? definirGroqApiKey : definirGeminiApiKey
  const valida = chavesValidas[provedor]

  const [verificando, setVerificando] = useState(false)
  const [ultimo, setUltimo] = useState<ResultadoValidacao | null>(null)

  const estado: EstadoChave = !valor
    ? 'vazia'
    : verificando
      ? 'verificando'
      : valida
        ? 'valida'
        : ultimo === 'invalida'
          ? 'invalida'
          : ultimo === 'erro'
            ? 'erro'
            : 'nao-verificada'

  async function verificar(chave: string) {
    if (!chave) return
    setVerificando(true)
    const resultado = await validarChave(provedor, chave)
    setVerificando(false)
    setUltimo(resultado)
    if (resultado !== 'erro') marcarChaveValida(provedor, resultado === 'valida')
  }

  // chave salva antes de existir verificação: confere uma vez ao montar
  const montouRef = useRef(false)
  useEffect(() => {
    if (montouRef.current) return
    montouRef.current = true
    if (valor && !valida) void verificar(valor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function aoSalvar(chave: string) {
    const limpa = chave.trim()
    definir(limpa)
    if (limpa && (limpa !== valor || (!valida && !verificando))) void verificar(limpa)
  }

  return { valor, estado, aoSalvar, tentarDeNovo: () => void verificar(valor) }
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
          <p className="pt-3 text-xs text-white/40">
            Sua chave fica só no seu navegador. Ela é enviada pro nosso servidor apenas pra repassar sua
            requisição — nunca é salva nem compartilhada.
          </p>
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
  const { valor, estado, aoSalvar, tentarDeNovo } = useChaveProvedor(provedor)
  const [rascunho, setRascunho] = useState(valor)
  const [mostrar, setMostrar] = useState(false)

  return (
    <div>
      {estado === 'invalida' && (
        <p className="pb-2.5 text-xs text-red-300">
          O {info.titulo} recusou essa chave. Confira se copiou inteira, ou gere outra em{' '}
          <LinkExterno href={info.link}>{info.linkRotulo}</LinkExterno>.
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

      {comRotulo && <label className="mb-1.5 block text-sm text-white/70">Sua chave {info.titulo}</label>}
      <div className="flex items-center gap-2">
        <input
          type={mostrar ? 'text' : 'password'}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => aoSalvar(rascunho)}
          placeholder={info.prefixo}
          autoComplete="off"
          aria-label={`Sua chave ${info.titulo}`}
          className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-white/40"
        />
        <button
          type="button"
          onClick={() => setMostrar((v) => !v)}
          className="shrink-0 rounded-xl border border-white/15 px-3 py-2.5 text-xs text-white/70 hover:bg-white/5"
        >
          {mostrar ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      <div className="pt-2">
        <SeloChave estado={estado} />
      </div>
    </div>
  )
}
