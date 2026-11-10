/*
  Estado global do GUIA DE CHAVES (BYOK) — Context do React.

  RESPONSABILIDADE ÚNICA: saber se o guia está aberto, POR QUE abriu (motivo) e o
  que fazer quando a pessoa terminar (a ação que ela tinha tentado: enviar a
  mensagem do chat, montar o estudo, organizar o trabalho). O guia em si (telas,
  textos) vive em ui/components/GuiaChaves.tsx.

  Quem abre: o chat (chats.tsx) quando falta a chave do Gemini, o Estudar e o
  Trabalhos quando falta a do Groq, e o botão de chave do topo (atalho).
*/
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import type { Provedor } from '../infrastructure/ai/validarChave'

// de onde a pessoa veio — define qual chave é OBRIGATÓRIA pra concluir e o texto do botão final
export type MotivoGuia = 'atalho' | 'chat' | 'estudar' | 'trabalho'

export const PROVEDOR_DO_MOTIVO: Record<MotivoGuia, Provedor | null> = {
  atalho: null,
  chat: 'gemini',
  estudar: 'groq',
  trabalho: 'groq',
}

export type AbrirGuiaOpcoes = {
  motivo: MotivoGuia
  // roda ao concluir o guia com a chave obrigatória válida — a ação que a pessoa veio fazer
  aoConcluir?: () => void
  // roda se a pessoa fechar sem concluir (ex.: o chat avisa que a mensagem ficou sem resposta)
  aoCancelar?: () => void
}

type GuiaContexto = {
  aberto: boolean
  motivo: MotivoGuia
  abrir: (opcoes: AbrirGuiaOpcoes) => void
  fechar: () => void   // sem concluir (✕, Esc, toque fora)
  concluir: () => void // botão final: fecha e dispara a ação pendente
}

const Contexto = createContext<GuiaContexto | null>(null)

export function GuiaChavesProvider({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState<MotivoGuia>('atalho')
  // callbacks em ref: não precisam re-renderizar nada, só ser chamados depois
  const pendente = useRef<Pick<AbrirGuiaOpcoes, 'aoConcluir' | 'aoCancelar'>>({})

  const abrir = useCallback((opcoes: AbrirGuiaOpcoes) => {
    pendente.current = { aoConcluir: opcoes.aoConcluir, aoCancelar: opcoes.aoCancelar }
    setMotivo(opcoes.motivo)
    setAberto(true)
  }, [])

  const fechar = useCallback(() => {
    setAberto(false)
    const { aoCancelar } = pendente.current
    pendente.current = {}
    aoCancelar?.()
  }, [])

  const concluir = useCallback(() => {
    setAberto(false)
    const { aoConcluir } = pendente.current
    pendente.current = {}
    aoConcluir?.()
  }, [])

  return <Contexto.Provider value={{ aberto, motivo, abrir, fechar, concluir }}>{children}</Contexto.Provider>
}

export function useGuiaChaves() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useGuiaChaves precisa estar dentro de <GuiaChavesProvider>')
  return ctx
}
