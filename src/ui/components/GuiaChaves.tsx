/*
  GUIA DE CHAVES — o modal que explica o Astrodny e leva a pessoa a criar as chaves
  (BYOK), em 2 etapas. Abre a partir de ui/guiaChaves.tsx (contexto): pelo botão de
  chave do topo (atalho), ou automaticamente quando a pessoa tenta usar o chat /
  Estudar / Trabalhos sem a chave — nesse caso, ao concluir, a ação que ela veio
  fazer é executada sozinha (a mensagem é enviada, o estudo é montado...).

  LAYOUT: coluna única (mobile-first) em todas as etapas — cartão centralizado no
  desktop (~600px), tela cheia no celular. Barra de progresso segmentada no topo,
  rodapé fixo (Anterior / Próximo) na largura toda.

  FLUXO: 1) "Como funciona" — por que o Astrodny existe e por que a chave é sua.
  2) "Suas chaves" — Groq e Gemini juntos, cada um com passo a passo recolhido por
  padrão e um vídeo de ajuda no fim. Essa é a ÚLTIMA etapa: quando a chave que a
  pessoa precisa fica válida, o guia mostra "Tudo pronto!" com uma contagem e se
  fecha sozinho, disparando a ação pendente (ver guiaChaves.tsx).

  Os TEXTOS ficam em ETAPAS, abaixo — é só editar ali.
*/
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../settings'
import { useGuiaChaves, PROVEDOR_DO_MOTIVO, type MotivoGuia } from '../guiaChaves'
import { provedorPendente } from '../../domain/settings'
import { ChaveProvedor, INFO_PROVEDOR } from './ChavesIA'
import type { Provedor } from '../../infrastructure/ai/validarChave'

type Etapa = { id: 'como-funciona' | 'chaves'; titulo: string }

const ETAPAS: Etapa[] = [
  { id: 'como-funciona', titulo: 'Como o Astrodny funciona' },
  { id: 'chaves', titulo: 'Suas chaves de IA' },
]

// Texto do botão final, conforme o que a pessoa veio fazer
const ACAO_FINAL: Record<MotivoGuia, string> = {
  atalho: 'Começar a usar',
  chat: 'Enviar minha mensagem',
  estudar: 'Montar meu estudo',
  trabalho: 'Organizar meu trabalho',
}

// Frase mostrada durante a contagem final, conforme o que a pessoa veio fazer
const ACAO_EM_ANDAMENTO: Record<MotivoGuia, string> = {
  atalho: 'Fechando o guia',
  chat: 'Enviando sua mensagem',
  estudar: 'Montando seu estudo',
  trabalho: 'Organizando seu trabalho',
}

// Etapa inicial: quem veio por uma ação específica cai direto na etapa de chaves;
// quem veio pelo atalho começa do início (é a leitura completa), a menos que já
// tenha uma chave feita e falte só a outra — aí também vai direto pra lá.
function etapaInicial(motivo: MotivoGuia, validas: { groq: boolean; gemini: boolean }): number {
  const obrigatorio = PROVEDOR_DO_MOTIVO[motivo]
  if (obrigatorio && !validas[obrigatorio]) return 1
  if (motivo === 'atalho') {
    const pendente = provedorPendente(validas)
    if (pendente && (validas.groq || validas.gemini)) return 1
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

      {/* cartão — coluna única em toda etapa */}
      <div className="animar-subida relative z-10 flex w-full flex-col bg-[#141416] text-white lg:h-[640px] lg:max-h-[90vh] lg:w-[600px] lg:overflow-hidden lg:rounded-3xl lg:border lg:border-white/10 lg:shadow-2xl lg:shadow-black/50">
        <header className="flex items-center justify-between gap-3 px-5 pt-[max(1.1rem,env(safe-area-inset-top))] pb-3 lg:px-7 lg:pt-6">
          <div className="flex items-center gap-2.5">
            <img src="/logo-a.png" alt="" aria-hidden="true" className="h-7 w-7 shrink-0 invert" />
            <span className="text-[15px] font-semibold text-white">Guia de chaves</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-white/40">
              Etapa {indice + 1} de {ETAPAS.length}
            </span>
            <button type="button" onClick={fechar} aria-label="Fechar" className="shrink-0 rounded-full p-2 text-white/70 hover:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </header>

        <BarraProgresso total={ETAPAS.length} atual={indice} />

        <main className="sem-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-5 lg:px-7">
          <h2 className="pb-4 text-lg font-semibold text-white lg:text-xl">{etapa.titulo}</h2>
          <Conteudo id={etapa.id} motivo={motivo} concluir={concluir} />
        </main>

        <footer className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 lg:px-7 lg:pb-6">
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
    </div>,
    document.body,
  )
}

function BarraProgresso({ total, atual }: { total: number; atual: number }) {
  return (
    <div className="flex gap-1.5 px-5 pb-4 lg:px-7" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= atual ? 'bg-white' : 'bg-white/15'}`} />
      ))}
    </div>
  )
}

/* ===================== TEXTOS DAS ETAPAS ===================== */

function Conteudo({ id, motivo, concluir }: { id: Etapa['id']; motivo: MotivoGuia; concluir: () => void }) {
  switch (id) {
    case 'como-funciona':
      return <EtapaComoFunciona />
    case 'chaves':
      return <EtapaChaves motivo={motivo} concluir={concluir} />
  }
}

// Tipografia do guia: texto corrido em cinza claro nítido com respiro (leading 1.6).
function P({ children }: { children: ReactNode }) {
  return <p className="pb-4 text-[15px] leading-[1.6] text-white/70">{children}</p>
}

function EtapaComoFunciona() {
  return (
    <div>
      <P>
        O Astrodny é um assistente de estudos pensado pra quem tem pouco tempo e muito material. Você traz
        o conteúdo da aula, e ele transforma isso em um estudo guiado, em porções pequenas, com verificação
        de verdade — e tira dúvidas no chat a qualquer momento.
      </P>
      <div className="flex flex-col gap-5 pb-2">
        <ItemIcone icone={<IconeGratis />} titulo="É grátis">
          Groq e Gemini têm um plano gratuito que dá pra estudar todo dia: dezenas de aulas e muitas
          mensagens de chat, sem cartão de crédito.
        </ItemIcone>
        <ItemIcone icone={<IconeLimite />} titulo="O limite é só seu">
          Com uma chave única pra todo mundo, bastaria algumas pessoas estudando ao mesmo tempo pra travar
          pra todas. Com a sua chave, o seu limite é só seu.
        </ItemIcone>
        <ItemIcone icone={<IconeNavegador />} titulo="Fica no seu navegador">
          A chave é guardada só neste aparelho. Ela é enviada pro nosso servidor apenas pra repassar o seu
          pedido ao Groq ou ao Gemini, e nunca é gravada nem compartilhada.
        </ItemIcone>
      </div>
    </div>
  )
}

function ItemIcone({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80">
        {icone}
      </span>
      <div>
        <p className="pb-1 text-[15px] font-semibold text-white">{titulo}</p>
        <p className="text-sm leading-[1.6] text-white/65">{children}</p>
      </div>
    </div>
  )
}

function IconeGratis() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

function IconeLimite() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 12 8 8" />
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="M12 21v-1M4.2 7.5l.9.5M19.8 7.5l-.9.5" />
    </svg>
  )
}

function IconeNavegador() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
    </svg>
  )
}

// Passos de cada provedor — o 1º passo não repete o link (já tem o botão "Abrir console" acima).
const PASSOS: Record<Provedor, ReactNode[]> = {
  groq: [
    'Abra o console do Groq (botão acima). Se não tiver conta, crie uma — é grátis e aceita login com Google.',
    <>
      Clique em <strong className="text-white">Create API Key</strong>. Dê um nome qualquer, tipo "Astrodny", e
      confirme.
    </>,
    <>
      Copie a chave. Ela começa com <code className="rounded bg-white/10 px-1">gsk_</code> e{' '}
      <strong className="text-white">só é mostrada uma vez</strong>: se fechar sem copiar, é só criar outra.
    </>,
    'Volte aqui e cole no campo abaixo. O Astrodny confere na hora se ela foi aceita.',
  ],
  gemini: [
    'Abra o console do Gemini (botão acima) e entre com a sua conta Google.',
    <>
      Clique em <strong className="text-white">Create API key</strong>. Se pedir um projeto, escolha o que
      aparecer ou crie um novo com qualquer nome.
    </>,
    <>
      Copie a chave. Ela começa com <code className="rounded bg-white/10 px-1">AIza</code>.
    </>,
    'Volte aqui e cole no campo abaixo. O Astrodny confere na hora se ela foi aceita.',
  ],
}

function EtapaChaves({ motivo, concluir }: { motivo: MotivoGuia; concluir: () => void }) {
  const { chavesValidas } = useSettings()
  const obrigatorio = PROVEDOR_DO_MOTIVO[motivo]
  const [porQueAberto, setPorQueAberto] = useState(false)

  // gatilho da conclusão automática: a chave que faltava pro motivo ACABOU de ficar válida
  // (no atalho, sem obrigatória, espera as duas — ver design doc).
  const gatilho = obrigatorio ? chavesValidas[obrigatorio] : chavesValidas.groq && chavesValidas.gemini
  const gatilhoAnterior = useRef(gatilho)
  const [contagem, setContagem] = useState<number | null>(null)

  useEffect(() => {
    if (gatilho && !gatilhoAnterior.current && contagem === null) setContagem(4)
    gatilhoAnterior.current = gatilho
  }, [gatilho, contagem])

  useEffect(() => {
    if (contagem === null) return
    if (contagem <= 0) {
      concluir()
      return
    }
    const t = setTimeout(() => setContagem((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [contagem, concluir])

  if (contagem !== null) {
    return <ConclusaoAutomatica contagem={contagem} motivo={motivo} chavesValidas={chavesValidas} />
  }

  return (
    <div>
      <P>
        Abra o console de cada serviço, crie a chave e cole no campo abaixo. É grátis e leva menos de 2
        minutos.{' '}
        <button
          type="button"
          onClick={() => setPorQueAberto((v) => !v)}
          aria-expanded={porQueAberto}
          className="text-white/55 underline decoration-white/30 underline-offset-2 hover:text-white"
        >
          Por que preciso da minha própria chave?
        </button>
      </P>
      {porQueAberto && (
        <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-[1.6] text-white/65">
          Com a sua própria chave, o seu limite de uso é só seu (ninguém trava o app pra você), o plano
          gratuito já dá pra estudar todo dia, e ela fica só no seu aparelho — nunca é gravada nem
          compartilhada.
        </div>
      )}
      <div className="flex flex-col gap-6">
        <CartaoChave provedor="groq" />
        <CartaoChave provedor="gemini" />
      </div>
      <VideoAjuda />
    </div>
  )
}

function CartaoChave({ provedor }: { provedor: Provedor }) {
  const info = INFO_PROVEDOR[provedor]
  const [passosAbertos, setPassosAbertos] = useState(false)

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <span className="text-[15px] font-semibold text-white">Chave do {info.titulo}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/60">
          Usada em: {info.usoChip}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
        <a
          href={info.link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5"
        >
          Abrir console do {info.titulo}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>
        <button
          type="button"
          onClick={() => setPassosAbertos((v) => !v)}
          aria-expanded={passosAbertos}
          className="text-xs text-white/55 underline decoration-white/30 underline-offset-2 hover:text-white"
        >
          {passosAbertos ? 'Ocultar passo a passo' : 'Ver como pegar a chave'}
        </button>
      </div>

      {passosAbertos && (
        <ol className="mb-4 flex flex-col gap-3 border-t border-white/10 pt-3.5">
          {PASSOS[provedor].map((passo, i) => (
            <li key={i} className="flex gap-3 text-sm leading-[1.6] text-white/70">
              <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/25 text-[11px] text-white/70">
                {i + 1}
              </span>
              <span>{passo}</span>
            </li>
          ))}
        </ol>
      )}

      <ChaveProvedor provedor={provedor} comRotulo />
    </div>
  )
}

// Vídeo de ajuda (opcional) — só pra quem prefere ver em vez de ler o passo a passo.
// Trocar o ícone de play por um <video>/embed real com o passo a passo das duas chaves.
function VideoAjuda() {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.02]">
      <div className="flex aspect-video items-center justify-center text-white/30">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M10 9l5 3-5 3V9Z" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <p className="px-4 py-3 text-center text-xs text-white/45">
        Prefere ver em vídeo? Um passo a passo curto de como criar as duas chaves e colar aqui.
      </p>
    </div>
  )
}

function ConclusaoAutomatica({
  contagem,
  motivo,
  chavesValidas,
}: {
  contagem: number
  motivo: MotivoGuia
  chavesValidas: { groq: boolean; gemini: boolean }
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <div>
        <p className="text-lg font-semibold text-white">Tudo pronto!</p>
        <p className="pt-1 text-sm text-white/55">
          {ACAO_EM_ANDAMENTO[motivo]} em {contagem}…
        </p>
      </div>
      <div className="w-full max-w-xs border-t border-white/10 pt-4">
        <Linha ok={chavesValidas.groq} titulo="Groq — Estudar e Trabalhos" />
        <Linha ok={chavesValidas.gemini} titulo="Gemini — Chat" />
      </div>
    </div>
  )
}

function Linha({ ok, titulo }: { ok: boolean; titulo: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
          ok ? 'border-emerald-400/50 text-emerald-300' : 'border-amber-400/50 text-amber-200'
        }`}
      >
        {ok ? '✓' : '!'}
      </span>
      <div className="min-w-0 text-left">
        <p className="text-[15px] font-semibold text-white">{titulo}</p>
        <p className="text-xs text-white/55">{ok ? 'Chave válida' : 'Falta configurar'}</p>
      </div>
    </div>
  )
}
