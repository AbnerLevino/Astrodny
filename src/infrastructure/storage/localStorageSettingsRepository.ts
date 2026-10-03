/*
  INFRAESTRUTURA (infrastructure/storage) — guarda as preferências no localStorage.

  Implementa a porta SettingsRepository. Se algo der errado (JSON corrompido,
  storage indisponível), cai no CONFIG_PADRAO em vez de quebrar o app.
*/
import type { SettingsRepository } from '../../application/ports/SettingsRepository'
import { CONFIG_PADRAO, type Config } from '../../domain/settings'

const CHAVE = 'astrodny:config'

export const localStorageSettingsRepository: SettingsRepository = {
  carregar(): Config {
    try {
      const bruto = localStorage.getItem(CHAVE)
      if (!bruto) return CONFIG_PADRAO
      // mescla com o padrão: se faltar um campo novo no salvo, não fica undefined
      return { ...CONFIG_PADRAO, ...(JSON.parse(bruto) as Partial<Config>) }
    } catch {
      return CONFIG_PADRAO
    }
  },

  salvar(config: Config): void {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(config))
    } catch {
      // sem storage (aba privada, etc.): ignora — só não persiste
    }
  },
}
