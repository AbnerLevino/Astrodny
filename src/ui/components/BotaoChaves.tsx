/*
  Botão de chave no canto ESQUERDO do topo das telas (Home, Chat, Estudar, Trabalhos,
  Sessões): o quadradinho com o ícone de chave. É o ATALHO pro guia de chaves
  (GuiaChaves.tsx) — abre o guia na etapa que ainda falta.

  SÓ aparece enquanto falta chave verificada: assim que as duas (Groq e Gemini)
  são aceitas pelo provedor, o botão some de vez — as chaves continuam acessíveis
  pelo cartão de perfil ("Chaves de IA") e por Configurações.
*/
import { useSettings } from '../settings'
import { useGuiaChaves } from '../guiaChaves'

export default function BotaoChaves({ className = '' }: { className?: string }) {
  const { chavesProntas } = useSettings()
  const { abrir } = useGuiaChaves()

  if (chavesProntas) return null

  return (
    <button
      type="button"
      onClick={() => abrir({ motivo: 'atalho' })}
      aria-label="Chaves de IA"
      className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/5 transition-colors hover:bg-white/10 ${className}`}
    >
      <IconeChave />
      {/* pontinho âmbar: ainda falta chave */}
      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
    </button>
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
