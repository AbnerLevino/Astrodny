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
          <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] lg:px-8 lg:pb-4 lg:pt-7">
            <div className="flex min-w-0 items-center gap-3">
              {/* marca do Astrodny (o "A", em fundo transparente) — no desktop ela vai na coluna de etapas */}
              <img src="/logo-a.png" alt="" aria-hidden="true" className="h-8 w-8 shrink-0 invert lg:hidden" />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-white/40 lg:hidden">
                  Etapa {indice + 1} de {ETAPAS.length}
                </p>
                <h2 className="truncate text-lg font-semibold text-white lg:text-xl">{etapa.titulo}</h2>
              </div>
            </div>
            <button type="button" onClick={fechar} aria-label="Fechar" className="shrink-0 rounded-full p-2 text-white/70 hover:bg-white/10">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <main className="sem-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-4 lg:px-8">
            <Conteudo id={etapa.id} motivo={motivo} irParaEtapa={(id) => setIndice(ETAPAS.findIndex((e) => e.id === id))} />
          </main>

          <footer className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 lg:px-8 lg:pb-7">
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
        <nav aria-label="Etapas do guia" className="hidden w-[240px] shrink-0 flex-col gap-0.5 border-l border-white/[0.08] p-5 pt-7 lg:flex">
          <div className="mb-5 flex items-center gap-3 px-3">
            {/* logo-a.png é a marca "A" preta em fundo transparente — `invert` deixa branca no cartão escuro */}
            <img src="/logo-a.png" alt="" aria-hidden="true" className="h-8 w-8 shrink-0 invert" />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold text-white">Astrodny</p>
              <p className="text-xs text-white/45">Guia de chaves</p>
            </div>
          </div>
          <p className="px-3 pb-3 text-[11px] font-medium uppercase tracking-wider text-white/35">Etapas</p>
          {ETAPAS.map((e, i) => {
            const ativa = i === indice
            const feita = e.provedor ? chavesValidas[e.provedor] : i < indice
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setIndice(i)}
                aria-current={ativa ? 'step' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  ativa ? 'text-white' : 'text-white/55 hover:text-white/80'
                }`}
              >
                {/* marcador: check discreto se feita; círculo vazado fino; só a etapa atual acende */}
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[10px] ${
                    feita
                      ? 'border-emerald-400/50 text-emerald-300'
                      : ativa
                        ? 'border-white bg-white text-black font-semibold'
                        : 'border-white/25 text-white/40'
                  }`}
                >
                  {feita ? '✓' : i + 1}
                </span>
                <span className={`min-w-0 flex-1 truncate ${ativa ? 'font-medium' : ''}`}>{e.tituloCurto}</span>
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

function Conteudo({ id, motivo, irParaEtapa }: { id: Etapa['id']; motivo: MotivoGuia; irParaEtapa: (id: Etapa['id']) => void }) {
  switch (id) {
    case 'como-funciona':
      return <EtapaComoFunciona />
    case 'por-que':
      return <EtapaPorQue />
    case 'groq':
      return <EtapaProvedor provedor="groq" irParaEtapa={irParaEtapa} />
    case 'gemini':
      return <EtapaProvedor provedor="gemini" irParaEtapa={irParaEtapa} />
    case 'pronto':
      return <EtapaPronto motivo={motivo} />
  }
}

// Tipografia do guia: texto corrido em cinza claro nítido com respiro (leading 1.6);
// títulos de item em branco puro, peso 600.
function P({ children }: { children: ReactNode }) {
  return <p className="pb-4 text-[15px] leading-[1.6] text-white/70">{children}</p>
}

// Item "editorial": sem caixa — só uma linha divisória fina entre um e outro.
function Item({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border-b border-white/10 py-3.5 last:border-b-0">
      <p className="pb-1 text-[15px] font-semibold text-white">{titulo}</p>
      <p className="text-sm leading-[1.6] text-white/70">{children}</p>
    </div>
  )
}

function Lista({ children }: { children: ReactNode }) {
  return <div className="mb-4 border-t border-white/10">{children}</div>
}

function EtapaComoFunciona() {
  return (
    <div className="pt-1">
      <P>
        O Astrodny é um assistente de estudos pensado pra quem tem pouco tempo e muito material. A ideia
        é simples: você traz o conteúdo da aula, e ele transforma isso em um estudo guiado, em porções
        pequenas, com verificação de verdade.
      </P>
      <Lista>
        <Item titulo="1. Você anexa o material">
          Os slides ou o PDF que o professor mandou. O Astrodny lê o texto e entende os tópicos.
        </Item>
        <Item titulo="2. Ele monta a aula em blocos">
          Em vez de "leia 40 páginas", cada tópico vira um bloco curto: explica, dá exemplo e faz uma
          pergunta pra conferir se você entendeu antes de seguir.
        </Item>
        <Item titulo="3. Prova e desempenho por tópico">
          No fim, uma prova sobre o que foi estudado. O resultado mostra o que ficou firme e o que precisa
          revisar — por tópico, não só uma nota.
        </Item>
        <Item titulo="Chat e Trabalhos">
          O chat tira dúvidas a qualquer momento, lembrando do seu curso e das suas matérias. Em
          Trabalhos, você cola o texto e ele organiza e formata nas normas da ABNT.
        </Item>
      </Lista>
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
        Pra gerar aulas, provas e respostas, o Astrodny usa dois serviços de IA: o{' '}
        <strong className="text-white">Groq</strong> (Estudar e Trabalhos) e o{' '}
        <strong className="text-white">Gemini</strong>, do Google (chat). Pra usar esses serviços, é
        preciso uma <strong className="text-white">chave de acesso</strong>: um código, parecido com uma
        senha, que identifica quem está usando.
      </P>
      <P>
        No Astrodny, <strong className="text-white">cada pessoa usa a própria chave</strong>. Você cria a
        sua, de graça, em menos de 2 minutos, e cola aqui. Por quê?
      </P>
      <Lista>
        <Item titulo="É grátis">
          Os dois serviços têm um plano gratuito que dá pra estudar todo dia: dezenas de aulas e
          muitas mensagens de chat, sem cartão de crédito.
        </Item>
        <Item titulo="O limite é só seu">
          Se o Astrodny usasse uma chave única pra todo mundo, bastaria algumas pessoas estudando ao
          mesmo tempo pra travar pra todas. Com a sua chave, o seu limite é só seu.
        </Item>
        <Item titulo="Fica no seu navegador">
          A chave é guardada só neste aparelho. Ela é enviada pro nosso servidor apenas pra repassar
          o seu pedido ao Groq ou ao Gemini, e nunca é gravada nem compartilhada.
        </Item>
      </Lista>
      <P>
        Nas próximas duas etapas você cria cada uma. Se quiser usar só o chat, ou só o Estudar, pode
        fazer só a chave correspondente e deixar a outra pra depois.
      </P>
    </div>
  )
}

function EtapaProvedor({ provedor, irParaEtapa }: { provedor: Provedor; irParaEtapa: (id: Etapa['id']) => void }) {
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
          : 'O Gemini é quem responde no chat e no tira-dúvidas durante o estudo. Sem esta chave, o chat não funciona.'}{' '}
        <button type="button" onClick={() => irParaEtapa('por-que')} className="text-white/55 underline decoration-white/30 underline-offset-2 hover:text-white">
          Por que preciso da minha própria chave?
        </button>
      </P>
      <ol className="mb-5 border-t border-white/10">
        {passos.map((passo, i) => (
          <li key={i} className="flex gap-3 border-b border-white/10 py-3.5 text-sm leading-[1.6] text-white/70">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/25 text-[11px] text-white/70">
              {i + 1}
            </span>
            <span>{passo}</span>
          </li>
        ))}
      </ol>
      <ChaveProvedor provedor={provedor} comRotulo />
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
      <div className="mb-4 border-t border-white/10">
        <Linha ok={chavesValidas.groq} titulo="Groq — Estudar e Trabalhos" />
        <Linha ok={chavesValidas.gemini} titulo="Gemini — Chat" />
      </div>
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
      ) : chavesValidas.groq || chavesValidas.gemini ? (
        <P>
          Uma das chaves já está pronta. A outra pode ficar pra depois: o botão de chave continua no topo
          das telas até as duas estarem configuradas.
        </P>
      ) : (
        <P>
          Nenhuma chave configurada ainda. Você pode fechar e explorar o app à vontade; na hora de usar o
          chat ou o Estudar, este guia volta na etapa certa. O botão de chave do topo também abre ele.
        </P>
      )}
    </div>
  )
}

function Linha({ ok, titulo }: { ok: boolean; titulo: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 py-3.5">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
          ok ? 'border-emerald-400/50 text-emerald-300' : 'border-amber-400/50 text-amber-200'
        }`}
      >
        {ok ? '✓' : '!'}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-white">{titulo}</p>
        <p className="text-xs text-white/55">{ok ? 'Chave válida' : 'Falta configurar'}</p>
      </div>
    </div>
  )
}
