/*
  PORTA (application/ports) — onde o cache dos insights do Painel é guardado.
  Mesmo contrato enxuto do SettingsRepository: carregar/salvar.
*/
import type { PainelCache } from '../../domain/painel'

export interface HomeInsightsRepository {
  carregar(): PainelCache | null
  salvar(cache: PainelCache): void
}
