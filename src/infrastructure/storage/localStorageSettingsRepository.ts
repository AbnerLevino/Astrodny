/*
  INFRAESTRUTURA (infrastructure/storage) — guarda as preferências no localStorage.

  Implementa a porta SettingsRepository. Se algo der errado (JSON corrompido,
  storage indisponível), cai no CONFIG_PADRAO em vez de quebrar o app.
*/
import type { SettingsRepository } from '../../application/ports/SettingsRepository'
import { CONFIG_PADRAO, CHAVE_STORAGE, type Config } from '../../domain/settings'

export const localStorageSettingsRepository: SettingsRepository = {
  carregar(): Config {
    try {
      const bruto = localStorage.getItem(CHAVE_STORAGE)
      if (!bruto) return CONFIG_PADRAO
      // mescla com o padrão: se faltar um campo novo no salvo, não fica undefined
      // (inclusive dentro de chavesValidas, que é um objeto)
      const salvo = JSON.parse(bruto) as Partial<Config>
      return {
        ...CONFIG_PADRAO,
        ...salvo,
        chavesValidas: { ...CONFIG_PADRAO.chavesValidas, ...(salvo.chavesValidas ?? {}) },
      }
    } catch {
      return CONFIG_PADRAO
    }
  },

  salvar(config: Config): void {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(config))
    } catch {
      // sem storage (aba privada, etc.): ignora — só não persiste
    }
  },
}
