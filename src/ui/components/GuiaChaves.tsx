/*
  GUIA DE CHAVES — o modal que explica o Astrodny e leva a pessoa a criar as chaves
  (BYOK), em 5 etapas. Abre a partir de ui/guiaChaves.tsx (contexto): pelo botão de
  chave do topo (atalho), ou automaticamente quando a pessoa tenta usar o chat /
  Estudar / Trabalhos sem a chave — nesse caso, ao concluir, a ação que ela veio
  fazer é executada sozinha (a mensagem é enviada, o estudo é montado...).

  LAYOUT: no desktop (lg+) é um cartão centralizado com o CONTEÚDO à esquerda e a
  lista de etapas à DIREITA (clicável). No celular ocupa a tela toda, sem a lista:
  só "Anterior" / "Próximo" no rodapé e "Etapa N de 5" no topo.

  Os TEXTOS ficam em ETAPAS, abaixo — é só editar ali.
*/
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../settings'
import { useGuiaChaves, PROVEDOR_DO_MOTIVO, type MotivoGuia } from '../guiaChaves'
import { provedorPendente } from '../../domain/settings'
import { ChaveProvedor, INFO_PROVEDOR, LinkExterno } from './ChavesIA'
import type { Provedor } from '../../infrastructure/ai/validarChave'

type Etapa = {
  id: 'como-funciona' | 'por-que' | 'groq' | 'gemini' | 'pronto'
  titulo: string
  tituloCurto: string
  provedor?: Provedor
}

const ETAPAS: Etapa[] = [
  { id: 'como-funciona', titulo: 'Como o Astrodny funciona', tituloCurto: 'Como funciona' },
  { id: 'por-que', titulo: 'Por que a sua própria chave', tituloCurto: 'Sua chave' },
  { id: 'groq', titulo: 'Chave do Groq — Estudar e Trabalhos', tituloCurto: 'Chave do Groq', provedor: 'groq' },
  { id: 'gemini', titulo: 'Chave do Gemini — Chat', tituloCurto: 'Chave do Gemini', provedor: 'gemini' },
  { id: 'pronto', titulo: 'Tudo pronto', tituloCurto: 'Pronto' },
]

// Texto do botão final, conforme o que a pessoa veio fazer
const ACAO_FINAL: Record<MotivoGuia, string> = {
  atalho: 'Começar a usar',
  chat: 'Enviar minha mensagem',
  estudar: 'Montar meu estudo',
  trabalho: 'Organizar meu trabalho',
}

// Etapa inicial: quem veio por uma ação específica cai direto na chave que falta;
// quem veio pelo atalho começa do início (é a leitura completa).
function etapaInicial(motivo: MotivoGuia, validas: { groq: boolean; gemini: boolean }): number {
  const obrigatorio = PROVEDOR_DO_MOTIVO[motivo]
  if (obrigatorio && !validas[obrigatorio]) return ETAPAS.findIndex((e) => e.provedor === obrigatorio)
  if (motivo === 'atalho') {
    const pendente = provedorPendente(validas)
    // atalho com uma chave já feita: pula direto pra que falta
    if (pendente && (validas.groq || validas.gemini)) return ETAPAS.findIndex((e) => e.provedor === pendente)
  }
  return 0
}

export default function GuiaChaves() {
  const { aberto, motivo, fechar, concluir } = useGuiaChaves()
  const { chavesValidas } = useSettings()
  const [indice, setIndice] = useState(0)

  // ao abrir, posiciona na etapa certa (ver etapaInicial)
  useEffect(() => {
    if (aberto) setIndice(etapaInicial(motivo, chavesValidas))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, motivo])

  useEffect(() => {
    if (!aberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, fechar])

  if (!aberto) return null

  const etapa = ETAPAS[indice]
  const obrigatorio = PROVEDOR_DO_MOTIVO[motivo]
  const podeConcluir = !obrigatorio || chavesValidas[obrigatorio]
  const ultima = indice === ETAPAS.length - 1

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center lg:items-center lg:p-6" role="dialog" aria-modal="true" aria-label="Guia de chaves">
      {/* véu (fecha ao tocar fora, no desktop) */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={fechar} />

      {/* cartão */}
      <div className="animar-subida relative z-10 flex w-full flex-col bg-[#141416] text-white lg:h-[640px] lg:max-h-[90vh] lg:w-[900px] lg:flex-row lg:overflow-hidden lg:rounded-3xl lg:border lg:border-white/10 lg:shadow-2xl lg:shadow-black/50">
        {/* ===== conteúdo (esquerda) ===== */}
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] lg:px-8 lg:pt-7">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-white/40 lg:hidden">
                Etapa {indice + 1} de {ETAPAS.length}
              </p>
              <h2 className="truncate text-lg font-semibold lg:text-xl">{etapa.titulo}</h2>
            </div>
            <button type="button" onClick={fechar} aria-label="Fechar" className="shrink-0 rounded-full p-2 text-white/70 hover:bg-white/10">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <main className="sem-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-4 lg:px-8">
            <Conteudo id={etapa.id} motivo={motivo} />
          </main>

          <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:px-8 lg:pb-6">
            <button
              type="button"
              onClick={() => setIndice((i) => Math.max(0, i - 1))}
              disabled={indice === 0}
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              Anterior
            </button>
            {ultima ? (
              <button
                type="button"
                onClick={concluir}
                disabled={!podeConcluir}
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition-opacity disabled:opacity-40"
              >
                {ACAO_FINAL[motivo]}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIndice((i) => Math.min(ETAPAS.length - 1, i + 1))}
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black"
              >
                Próximo
              </button>
            )}
          </footer>
        </div>

        {/* ===== etapas (direita, só desktop) ===== */}
        <nav aria-label="Etapas do guia" className="hidden w-[260px] shrink-0 flex-col gap-1 border-l border-white/10 bg-white/[0.03] p-5 pt-7 lg:flex">
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-white/40">Etapas</p>
          {ETAPAS.map((e, i) => {
            const ativa = i === indice
            const feita = e.provedor ? chavesValidas[e.provedor] : i < indice
            const falta = e.provedor ? !chavesValidas[e.provedor] : false
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setIndice(i)}
                aria-current={ativa ? 'step' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  ativa ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                    feita ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300' : ativa ? 'border-white text-white' : 'border-white/30 text-white/50'
                  }`}
                >
                  {feita ? '✓' : i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.tituloCurto}</span>
                {falta && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-label="falta configurar" />}
              </button>
            )
          })}
        </nav>
      </div>
    </div>,
    document.body,
  )
}

/* ===================== TEXTOS DAS ETAPAS ===================== */

function Conteudo({ id, motivo }: { id: Etapa['id']; motivo: MotivoGuia }) {
  switch (id) {
    case 'como-funciona':
      return <EtapaComoFunciona />
    case 'por-que':
      return <EtapaPorQue />
    case 'groq':
      return <EtapaProvedor provedor="groq" />
    case 'gemini':
      return <EtapaProvedor provedor="gemini" />
    case 'pronto':
      return <EtapaPronto motivo={motivo} />
  }
}

function P({ children }: { children: ReactNode }) {
  return <p className="pb-3 text-[15px] leading-relaxed text-white/80">{children}</p>
}

function Cartao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="pb-1 font-medium">{titulo}</p>
      <p className="text-sm leading-relaxed text-white/60">{children}</p>
    </div>
  )
}

function EtapaComoFunciona() {
  return (
    <div className="pt-1">
      <P>
        O Astrodny é um assistente de estudos pensado pra quem tem pouco tempo e muito material. A ideia
        é simples: você traz o conteúdo da aula, e ele transforma isso em um estudo guiado, em porções
        pequenas, com verificação de verdade.
      </P>
      <Cartao titulo="1. Você anexa o material">
        Os slides ou o PDF que o professor mandou. O Astrodny lê o texto e entende os tópicos.
      </Cartao>
      <Cartao titulo="2. Ele monta a aula em blocos">
        Em vez de "leia 40 páginas", cada tópico vira um bloco curto: explica, dá exemplo e faz uma
        pergunta pra conferir se você entendeu antes de seguir.
      </Cartao>
      <Cartao titulo="3. Prova e desempenho por tópico">
        No fim, uma prova sobre o que foi estudado. O resultado mostra o que ficou firme e o que precisa
        revisar — por tópico, não só uma nota.
      </Cartao>
      <Cartao titulo="Chat e Trabalhos">
        O chat tira dúvidas a qualquer momento, lembrando do seu curso e das suas matérias. Em
        Trabalhos, você cola o texto e ele organiza e formata nas normas da ABNT.
      </Cartao>
      <P>
        Tudo isso usa inteligência artificial. E é aí que entra a parte das chaves, na próxima etapa.
      </P>
    </div>
  )
}

function EtapaPorQue() {
  return (
    <div className="pt-1">
      <P>
        Pra gerar aulas, provas e respostas, o Astrodny usa modelos de IA de duas empresas: o{' '}
        <strong className="text-white">Groq</strong> (Estudar e Trabalhos) e o{' '}
        <strong className="text-white">Gemini</strong>, do Google (chat). Pra usar esses modelos, é
        preciso uma <strong className="text-white">chave de acesso</strong>: um código, parecido com uma
        senha, que identifica quem está usando.
      </P>
      <P>
        No Astrodny, <strong className="text-white">cada pessoa usa a própria chave</strong>. Você cria a
        sua, de graça, em menos de 2 minutos, e cola aqui. Por quê?
      </P>
      <Cartao titulo="É grátis">
        As duas empresas oferecem um plano gratuito que dá e sobra pra estudar: dezenas de aulas e
        centenas de mensagens por dia. Sem cartão de crédito.
      </Cartao>
      <Cartao titulo="O limite é só seu">
        Se o Astrodny usasse uma chave única pra todo mundo, bastaria algumas pessoas estudando ao
        mesmo tempo pra travar pra todas. Com a sua chave, o seu limite é só seu.
      </Cartao>
      <Cartao titulo="Fica no seu navegador">
        A chave é guardada só neste aparelho. Ela é enviada pro nosso servidor apenas pra repassar
        o seu pedido ao Groq ou ao Gemini, e nunca é gravada nem compartilhada.
      </Cartao>
      <P>
        Nas próximas duas etapas você cria cada uma. Se quiser usar só o chat, ou só o Estudar, pode
        fazer só a chave correspondente e deixar a outra pra depois.
      </P>
    </div>
  )
}

function EtapaProvedor({ provedor }: { provedor: Provedor }) {
  const info = INFO_PROVEDOR[provedor]
  const passos: ReactNode[] =
    provedor === 'groq'
      ? [
          <>Abra <LinkExterno href={info.link}>{info.linkRotulo}</LinkExterno> em outra aba. Se não tiver conta, crie uma — é grátis e aceita login com Google.</>,
          <>Clique em <strong className="text-white">Create API Key</strong>. Dê um nome qualquer, tipo "Astrodny", e confirme.</>,
          <>Copie a chave que aparece. Ela começa com <code className="rounded bg-white/10 px-1">gsk_</code> e <strong className="text-white">só é mostrada uma vez</strong>: se fechar sem copiar, é só criar outra.</>,
          <>Volte aqui e cole no campo abaixo. O Astrodny confere na hora se ela foi aceita.</>,
        ]
      : [
          <>Abra <LinkExterno href={info.link}>{info.linkRotulo}</LinkExterno> em outra aba e entre com a sua conta Google.</>,
          <>Clique em <strong className="text-white">Create API key</strong>. Se pedir um projeto, escolha o que aparecer ou crie um novo com qualquer nome.</>,
          <>Copie a chave. Ela começa com <code className="rounded bg-white/10 px-1">AIza</code>.</>,
          <>Volte aqui e cole no campo abaixo. O Astrodny confere na hora se ela foi aceita.</>,
        ]

  return (
    <div className="pt-1">
      <P>
        {provedor === 'groq'
          ? 'O Groq é quem gera as aulas, as provas e a estrutura dos trabalhos. Sem esta chave, o Estudar e o Trabalhos não funcionam.'
          : 'O Gemini é quem responde no chat e no tira-dúvidas durante o estudo. Sem esta chave, o chat não funciona.'}
      </P>
      <ol className="mb-4 flex flex-col gap-2">
        {passos.map((passo, i) => (
          <li key={i} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/80">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-white">
              {i + 1}
            </span>
            <span>{passo}</span>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl border border-white/15 bg-black/20 p-4">
        <ChaveProvedor provedor={provedor} comRotulo />
      </div>
      <p className="pt-3 text-xs text-white/40">
        Sua chave fica só no seu navegador e nunca é gravada nos nossos servidores.
      </p>
    </div>
  )
}

function EtapaPronto({ motivo }: { motivo: MotivoGuia }) {
  const { chavesValidas } = useSettings()
  const obrigatorio = PROVEDOR_DO_MOTIVO[motivo]
  const faltaObrigatoria = obrigatorio && !chavesValidas[obrigatorio]

  return (
    <div className="pt-1">
      <Linha ok={chavesValidas.groq} titulo="Groq — Estudar e Trabalhos" />
      <Linha ok={chavesValidas.gemini} titulo="Gemini — Chat" />
      {faltaObrigatoria ? (
        <P>
          Pra {motivo === 'chat' ? 'enviar sua mensagem' : motivo === 'estudar' ? 'montar seu estudo' : 'organizar seu trabalho'},
          falta a chave do {INFO_PROVEDOR[obrigatorio].titulo}. Volte uma etapa e cole a chave — o botão abaixo libera sozinho.
        </P>
      ) : chavesValidas.groq && chavesValidas.gemini ? (
        <P>
          As duas chaves foram aceitas. O botão de chave do topo some a partir de agora; se um dia precisar
          trocar uma chave, é no cartão de perfil, em "Chaves de IA", ou em Configurações.
        </P>
      ) : (
        <P>
          A chave que você precisa agora já está pronta. A outra pode ficar pra depois: o botão de chave
          continua no topo das telas até as duas estarem configuradas.
        </P>
      )}
    </div>
  )
}

function Linha({ ok, titulo }: { ok: boolean; titulo: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          ok ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'
        }`}
      >
        {ok ? '✓' : '!'}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{titulo}</p>
        <p className="text-xs text-white/50">{ok ? 'Chave válida' : 'Falta configurar'}</p>
      </div>
    </div>
  )
}
