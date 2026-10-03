/*
  PORTA (application/ports) — o contrato pra guardar/ler as preferências.

  A UI fala só com este contrato. Hoje o adaptador é localStorage; amanhã pode ser
  a nuvem (perfil do usuário) sem mudar quem usa.
*/
import type { Config } from '../../domain/settings'

export interface SettingsRepository {
  carregar(): Config
  salvar(config: Config): void
}
