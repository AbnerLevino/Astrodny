/*
  CASO DE USO (application) — pure: decide se o cache dos insights do Painel
  ainda vale ou precisa ser regerado.

  Regra híbrida (ver spec): o cache vale por até 5h — MAS é invalidado antes
  se algum estudo foi salvo DEPOIS da última geração (evita ficar com
  sugestão desatualizada logo após uma atividade real).
*/
import type { StudySalvo } from '../domain/study'
import type { PainelCache } from '../domain/painel'

const JANELA_MS = 5 * 60 * 60 * 1000 // 5 horas

export function precisaAtualizar(cache: PainelCache | null, estudos: StudySalvo[], agora: number): boolean {
  if (!cache) return true

  const geradoEmMs = new Date(cache.geradoEm).getTime()
  if (agora - geradoEmMs > JANELA_MS) return true

  return estudos.some((e) => new Date(e.data).getTime() > geradoEmMs)
}
