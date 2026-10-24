/*
  INFRAESTRUTURA (infrastructure/storage) — adaptador da porta StudyRepository
  que guarda os estudos feitos no localStorage (visitante, sem login).

  Mesma ideia do repositório de chats (JSON + try/catch). `salvar` faz UPSERT
  por `id`: mesma sessão que ganha progresso ou conclui a prova atualiza o
  registro existente em vez de duplicar — ver supabaseStudyRepository (mesma
  regra lá, mas em SQL).
*/
import type { StudyRepository } from '../../application/ports/StudyRepository'
import type { StudySalvo } from '../../domain/study'

const CHAVE = 'astrodny:estudos'

// leitura crua da gaveta (usada pelo listar e pelo salvar)
function ler(): StudySalvo[] {
  try {
    const bruto = localStorage.getItem(CHAVE)
    return bruto ? (JSON.parse(bruto) as StudySalvo[]) : []
  } catch {
    return []
  }
}

export const localStorageStudyRepository: StudyRepository = {
  async listar(): Promise<StudySalvo[]> {
    return ler()
  },

  async salvar(estudo: StudySalvo): Promise<void> {
    try {
      const resto = ler().filter((e) => e.id !== estudo.id)
      const lista = [estudo, ...resto] // mais novo (ou recém-tocado) no topo
      localStorage.setItem(CHAVE, JSON.stringify(lista))
    } catch {
      // sem espaço ou indisponível: ignora
    }
  },
}
