/*
  INFRAESTRUTURA (infrastructure/storage) — guarda o cache dos insights do
  Painel no localStorage. Mesmo padrão do localStorageSettingsRepository:
  JSON + try/catch, nunca quebra o app por falta de storage.

  Não sincroniza entre dispositivos nesta v1 (YAGNI — se virar necessidade
  real, migra pra Supabase como o perfil).
*/
import type { HomeInsightsRepository } from '../../application/ports/HomeInsightsRepository'
import type { PainelCache } from '../../domain/painel'

const CHAVE = 'astrodny:painel'

export const localStorageHomeInsightsRepository: HomeInsightsRepository = {
  carregar(): PainelCache | null {
    try {
      const bruto = localStorage.getItem(CHAVE)
      return bruto ? (JSON.parse(bruto) as PainelCache) : null
    } catch {
      return null
    }
  },

  salvar(cache: PainelCache): void {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(cache))
    } catch {
      // sem storage (aba privada, etc.): ignora — só não persiste
    }
  },
}
