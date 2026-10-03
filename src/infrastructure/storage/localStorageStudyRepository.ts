/*
  INFRAESTRUTURA (infrastructure/storage) — adaptador da porta StudyRepository
  que guarda os estudos feitos no localStorage.

  Mesma ideia do repositório de chats (JSON + try/catch). A diferença: salvar
  ACRESCENTA o novo estudo no topo da lista existente.
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
  listar(): StudySalvo[] {
    return ler()
  },

  salvar(estudo: StudySalvo): void {
    try {
      const lista = [estudo, ...ler()] // mais novo no topo
      localStorage.setItem(CHAVE, JSON.stringify(lista))
    } catch {
      // sem espaço ou indisponível: ignora
    }
  },
}
