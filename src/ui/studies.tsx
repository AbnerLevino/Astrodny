/*
  Estado compartilhado dos ESTUDOS feitos — Context do React (espelho do chats.tsx).

  A StudySession ADICIONA um estudo ao terminar a prova; o Sidebar LÊ a lista pra
  mostrar o histórico. Como é um Context, terminar um estudo atualiza o menu na
  hora, sem recarregar a página.

  Repositório muda conforme o login (mesma ideia do perfil em ui/auth.tsx):
  visitante guarda só no aparelho; logado guarda na nuvem (tabela `estudos`) —
  ver infrastructure/storage/{localStorageStudyRepository,supabaseStudyRepository}.
*/
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { StudySalvo } from '../domain/study'
import type { StudyRepository } from '../application/ports/StudyRepository'
import { localStorageStudyRepository } from '../infrastructure/storage/localStorageStudyRepository'
import { supabaseStudyRepository } from '../infrastructure/storage/supabaseStudyRepository'
import { useAuth } from './auth'

type EstudosContexto = {
  estudos: StudySalvo[]
  salvarEstudo: (estudo: StudySalvo) => Promise<void>
}

const Contexto = createContext<EstudosContexto | null>(null)

export function StudiesProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const [estudos, setEstudos] = useState<StudySalvo[]>([])
  const repo: StudyRepository = usuario ? supabaseStudyRepository(usuario.id) : localStorageStudyRepository

  // recarrega a lista sempre que o login muda (visitante -> logado troca de
  // gaveta inteira: do localStorage pra nuvem)
  useEffect(() => {
    let cancelado = false
    repo.listar().then((lista) => {
      if (!cancelado) setEstudos(lista)
    })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id])

  async function salvarEstudo(estudo: StudySalvo) {
    setEstudos((prev) => [estudo, ...prev.filter((e) => e.id !== estudo.id)]) // otimista, upsert
    await repo.salvar(estudo)
  }

  return <Contexto.Provider value={{ estudos, salvarEstudo }}>{children}</Contexto.Provider>
}

export function useStudies() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useStudies precisa estar dentro de <StudiesProvider>')
  return ctx
}
