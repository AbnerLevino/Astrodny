/*
  Acordeão das chaves BYOK (Groq / Gemini) — UM componente, duas caras:
    - completo (Configurações): descrição + passo a passo + campo, com selo de estado.
    - compacto (painel do botão de chave no topo das telas): só o essencial — campo,
      link de onde pegar a chave e o selo.
  Uma opção aberta por vez: abrir uma fecha a outra.

  Verificação: ao sair do campo (blur) a chave é conferida junto ao provedor
  (infrastructure/ai/validarChave) e o resultado vai pro Config (marcarChaveValida).
  Também confere ao montar uma chave que já estava salva mas nunca foi verificada
  (quem salvou antes desta tela existir).
*/
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSettings } from '../settings'
import { validarChave, type Provedor, type ResultadoValidacao } from '../../infrastructure/ai/validarChave'

type Estado = 'vazia' | 'verificando' | 'valida' | 'invalida' | 'erro' | 'nao-verificada'

const INFO: Record<
  Provedor,
  { titulo: string; subtitulo: string; descricao: string; aviso: string; link: string; linkRotulo: string; prefixo: string; passos: ReactNode[] }
> = {
  groq: {
    titulo: 'Groq',
    subtitulo: 'Estudar e Trabalhos',
    descricao: 'O Astrodny usa o Groq pra gerar aulas, provas e trabalhos.',
    aviso: 'Sem chave, Estudar e Trabalhos não funcionam. Leva menos de 2 minutos e é grátis.',
    link: 'https://console.groq.com/keys',
    linkRotulo: 'console.groq.com/keys',
    prefixo: 'gsk_...',
    passos: [
      <>Acesse <Link href="https://console.groq.com/keys">console.groq.com/keys</Link> (crie uma conta grátis se não tiver).</>,
      <>Clique em "Create API Key", dê um nome qualquer e confirme.</>,
      <>Copie a chave (começa com "gsk_...") — ela só aparece uma vez.</>,
      <>Cole aqui abaixo.</>,
    ],
  },
  gemini: {
    titulo: 'Gemini',
    subtitulo: 'Chat / tira-dúvidas',
    descricao: 'O Astrodny usa o Gemini pro chat/tira-dúvidas.',
    aviso: 'Sem chave, o chat não funciona. Leva menos de 2 minutos e é grátis.',
    link: 'https://aistudio.google.com/apikey',
    linkRotulo: 'aistudio.google.com/apikey',
    prefixo: 'AIza...',
    passos: [
      <>Acesse <Link href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</Link> (entre com uma conta Google).</>,
      <>Clique em "Create API key", escolha um projeto (ou crie um) e confirme.</>,
      <>Copie a chave (começa com "AIza...").</>,
      <>Cole aqui abaixo.</>,
    ],
  },
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[#6f8dff] underline">
      {children}
    </a>
  )
}

export function AcordeaoChaves({
  compacto = false,
  inicial = null,
  aoFicarProntas,
}: {
  compacto?: boolean
  inicial?: Provedor | null
  // chamado quando as DUAS chaves passam a estar válidas (o painel do topo se fecha)
  aoFicarProntas?: () => void
}) {
  const { chavesProntas } = useSettings()
  const [aberta, setAberta] = useState<Provedor | null>(inicial)
  const prontasAntes = useRef(chavesProntas)

  useEffect(() => {
    if (chavesProntas && !prontasAntes.current) aoFicarProntas?.()
    prontasAntes.current = chavesProntas
  }, [chavesProntas, aoFicarProntas])

  function alternar(p: Provedor) {
    setAberta((atual) => (atual === p ? null : p))
  }

  return (
    <div className={`flex flex-col ${compacto ? 'gap-2' : 'gap-3'}`}>
      {(['groq', 'gemini'] as Provedor[]).map((p) => (
        <OpcaoChave key={p} provedor={p} compacto={compacto} aberta={aberta === p} aoAlternar={() => alternar(p)} />
      ))}
    </div>
  )
}

function OpcaoChave({
  provedor,
  compacto,
  aberta,
  aoAlternar,
}: {
  provedor: Provedor
  compacto: boolean
  aberta: boolean
  aoAlternar: () => void
}) {
  const { groqApiKey, geminiApiKey, definirGroqApiKey, definirGeminiApiKey, chavesValidas, marcarChaveValida } =
    useSettings()
  const info = INFO[provedor]
  const valor = provedor === 'groq' ? groqApiKey : geminiApiKey
  const definir = provedor === 'groq' ? definirGroqApiKey : definirGeminiApiKey
  const valida = chavesValidas[provedor]
  const idPainel = `painel-chave-${provedor}`

  // estado local da verificação (o Config só guarda o booleano final)
  const [verificando, setVerificando] = useState(false)
  const [ultimo, setUltimo] = useState<ResultadoValidacao | null>(null)

  const estado: Estado = !valor
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
    if (limpa && limpa !== valor) void verificar(limpa)
    else if (limpa && !valida && !verificando) void verificar(limpa)
  }

  return (
    <div
      className={`rounded-2xl border transition-colors ${aberta ? 'border-white/40 bg-white/10' : 'border-white/15 bg-white/5'}`}
    >
      <button
        type="button"
        onClick={aoAlternar}
        aria-expanded={aberta}
        aria-controls={idPainel}
        className={`flex w-full items-center justify-between gap-3 text-left ${compacto ? 'px-3 py-2.5' : 'p-4'}`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{info.titulo}</span>
            <Selo estado={estado} />
          </div>
          <p className={`text-white/50 ${compacto ? 'text-xs' : 'pt-0.5 text-sm'}`}>{info.subtitulo}</p>
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
        <div id={idPainel} className={`border-t border-white/10 ${compacto ? 'px-3 pb-3 pt-2.5' : 'px-4 pb-4 pt-3'}`}>
          <CampoChave
            info={info}
            compacto={compacto}
            estado={estado}
            valor={valor}
            aoSalvar={aoSalvar}
            aoTentarDeNovo={() => void verificar(valor)}
          />
        </div>
      )}
    </div>
  )
}

function Selo({ estado }: { estado: Estado }) {
  const mapa: Record<Estado, { texto: string; classe: string } | null> = {
    vazia: { texto: 'Falta configurar', classe: 'bg-amber-400/15 text-amber-200' },
    verificando: { texto: 'Verificando…', classe: 'bg-white/10 text-white/60' },
    valida: { texto: 'Válida', classe: 'bg-emerald-400/15 text-emerald-300' },
    invalida: { texto: 'Inválida', classe: 'bg-red-400/15 text-red-300' },
    erro: { texto: 'Não verificada', classe: 'bg-white/10 text-white/60' },
    'nao-verificada': { texto: 'Não verificada', classe: 'bg-white/10 text-white/60' },
  }
  const s = mapa[estado]
  if (!s) return null
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.classe}`}>{s.texto}</span>
}

// O conteúdo do painel de uma chave. Estado LOCAL (rascunho) — só chama aoSalvar no
// blur, não a cada tecla, pra não gravar (nem verificar) no meio de uma colagem.
function CampoChave({
  info,
  compacto,
  estado,
  valor,
  aoSalvar,
  aoTentarDeNovo,
}: {
  info: (typeof INFO)[Provedor]
  compacto: boolean
  estado: Estado
  valor: string
  aoSalvar: (chave: string) => void
  aoTentarDeNovo: () => void
}) {
  const [rascunho, setRascunho] = useState(valor)
  const [mostrar, setMostrar] = useState(false)

  return (
    <div>
      {!compacto && <p className="pb-3 text-sm text-white/50">{info.descricao}</p>}

      {estado === 'vazia' &&
        (compacto ? (
          <p className="pb-2.5 text-xs text-amber-200">
            Pegue sua chave grátis em <Link href={info.link}>{info.linkRotulo}</Link> e cole abaixo.
          </p>
        ) : (
          <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-200">
            <p className="pb-2">⚠️ {info.aviso}</p>
            <p className="pb-1 font-medium text-amber-100">Como criar sua chave grátis:</p>
            <ol className="list-decimal space-y-1 pl-4">
              {info.passos.map((passo, i) => (
                <li key={i}>{passo}</li>
              ))}
            </ol>
          </div>
        ))}

      {estado === 'invalida' && (
        <p className="pb-2.5 text-xs text-red-300">
          O {info.titulo} recusou essa chave. Confira se copiou inteira, ou gere outra em{' '}
          <Link href={info.link}>{info.linkRotulo}</Link>.
        </p>
      )}
      {estado === 'erro' && (
        <p className="pb-2.5 text-xs text-white/60">
          Não consegui verificar agora.{' '}
          <button type="button" onClick={aoTentarDeNovo} className="underline">
            Tentar de novo
          </button>
        </p>
      )}

      {!compacto && <label className="mb-1.5 block text-sm text-white/70">Sua chave {info.titulo}</label>}
      <div className="flex items-center gap-2">
        <input
          type={mostrar ? 'text' : 'password'}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => aoSalvar(rascunho)}
          placeholder={info.prefixo}
          autoComplete="off"
          aria-label={`Sua chave ${info.titulo}`}
          className={`w-full rounded-xl border border-white/15 bg-black/20 px-4 text-white outline-none placeholder:text-white/35 focus:border-white/40 ${
            compacto ? 'py-2 text-sm' : 'py-2.5 text-[15px]'
          }`}
        />
        <button
          type="button"
          onClick={() => setMostrar((v) => !v)}
          className={`shrink-0 rounded-xl border border-white/15 px-3 text-xs text-white/70 hover:bg-white/5 ${compacto ? 'py-2' : 'py-2.5'}`}
        >
          {mostrar ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      {!compacto && (
        <p className="pt-3 text-xs text-white/40">
          Sua chave fica só no seu navegador. Ela é enviada pro nosso servidor apenas pra repassar sua
          requisição — nunca é salva nem compartilhada.
        </p>
      )}
    </div>
  )
}
