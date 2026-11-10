/*
  Botão de chave no canto ESQUERDO do topo das telas (Home, Chat, Estudar, Trabalhos,
  Sessões): o quadradinho com o ícone de chave. Toca → desce um painel ancorado nele com o
  acordeão compacto de chaves (ver ChavesIA.tsx). Toca fora, Esc ou ✕ → fecha.

  SÓ aparece enquanto falta chave verificada: assim que as duas (Groq e Gemini)
  são aceitas pelo provedor, o botão some de vez — as chaves continuam acessíveis
  pelo cartão de perfil ("Chaves de IA") e por Configurações.

  No mobile o painel ocupa quase a largura da tela e escurece o resto; no desktop
  (lg+) é um popover de 340px pendurado no botão, sem véu — mesmo padrão do modal
  da conta na Sidebar.
*/
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../settings'
import { provedorPendente } from '../../domain/settings'
import { AcordeaoChaves } from './ChavesIA'

export default function BotaoChaves({ className = '' }: { className?: string }) {
  const { chavesProntas, chavesValidas } = useSettings()
  const [aberto, setAberto] = useState(false)
  const fechar = useCallback(() => setAberto(false), [])
  const botaoRef = useRef<HTMLButtonElement>(null)
  // DESKTOP: o painel é `position: fixed` com top/left medidos do botão na hora de abrir
  // (um `absolute` dentro do header seria cortado pelo overflow-hidden das telas).
  // MOBILE: fica null e as classes cuidam (largura quase toda, abaixo do topo).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  function abrirOuFechar() {
    if (aberto) return fechar()
    const r = botaoRef.current?.getBoundingClientRect()
    const desktop = window.matchMedia('(min-width: 1024px)').matches
    setPos(desktop && r ? { top: r.bottom + 8, left: r.left } : null)
    setAberto(true)
  }

  useEffect(() => {
    if (!aberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, fechar])

  if (chavesProntas) return null

  return (
    <div className={`relative ${className}`}>
      <button
        ref={botaoRef}
        type="button"
        onClick={abrirOuFechar}
        aria-label="Chaves de IA"
        aria-expanded={aberto}
        className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors ${
          aberto ? 'border-white/40 bg-white/15' : 'border-white/20 bg-white/5 hover:bg-white/10'
        }`}
      >
        <IconeChave />
        {/* pontinho âmbar: ainda falta chave */}
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
      </button>

      {/* véu + painel vão num PORTAL no <body>: dentro do header eles herdariam o
          contexto de empilhamento (z-10) e o conteúdo da página passaria por cima. */}
      {aberto &&
        createPortal(
        <>
          {/* véu: no mobile escurece/borra; no desktop é só a área clicável de fechar */}
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none" onClick={fechar} />
          <div
            role="dialog"
            aria-label="Chaves de IA"
            style={pos ? { top: pos.top, left: pos.left } : undefined}
            className={`animar-subida fixed z-[70] rounded-3xl border border-white/10 bg-[#141416] p-4 text-white shadow-2xl shadow-black/50 ${
              pos ? 'w-[340px]' : 'inset-x-4 top-[calc(env(safe-area-inset-top)+4.25rem)]'
            }`}
          >
            <div className="flex items-center justify-between pb-3">
              <div>
                <p className="font-semibold">Chaves de IA</p>
                <p className="text-xs text-white/50">Cada pessoa usa a própria chave, grátis.</p>
              </div>
              <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-full p-1.5 text-white/70 hover:bg-white/10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <AcordeaoChaves compacto inicial={provedorPendente(chavesValidas, true)} aoFicarProntas={fechar} />
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

// Chave cuja cabeça é uma órbita (anel + núcleo) — mesmo desenho do modal da conta
export function IconeChave() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="12" r="4.2" />
      <circle cx="8" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12.2 12h8.3M17.5 12v3M20.5 12v2.2" />
    </svg>
  )
}
