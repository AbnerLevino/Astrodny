/*
  Estado compartilhado dos ESTUDOS feitos — Context do React (espelho do chats.tsx).

  A StudySession ADICIONA um estudo ao terminar a prova; o Sidebar LÊ a lista pra
  mostrar o histórico. Como é um Context, terminar um estudo atualiza o menu na
  hora, sem recarregar a página.
*/
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { StudySalvo } from '../domain/study'
import { localStorageStudyRepository } from '../infrastructure/storage/localStorageStudyRepository'

// Onde os estudos são guardados. Trocar localStorage -> nuvem = mudar SÓ esta linha.
const repo = localStorageStudyRepository

type EstudosContexto = {
  estudos: StudySalvo[]
  salvarEstudo: (estudo: StudySalvo) => void
}

const Contexto = createContext<EstudosContexto | null>(null)

export function StudiesProvider({ children }: { children: ReactNode }) {
  // carrega o histórico salvo uma vez, na montagem
  const [estudos, setEstudos] = useState<StudySalvo[]>(() => repo.listar())

  function salvarEstudo(estudo: StudySalvo) {
    repo.salvar(estudo) // persiste no disco
    setEstudos((prev) => [estudo, ...prev]) // atualiza a tela na hora (mais novo no topo)
  }

  return <Contexto.Provider value={{ estudos, salvarEstudo }}>{children}</Contexto.Provider>
}

export function useStudies() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useStudies precisa estar dentro de <StudiesProvider>')
  return ctx
}
