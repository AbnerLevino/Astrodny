/*
  PORTA (application/ports) — o contrato pra GUARDAR e LISTAR os estudos feitos.

  Diferente do ChatRepository (que salva a lista inteira), aqui salvamos UM estudo
  por vez — ele é acrescentado ao histórico. A aplicação não sabe onde isso é
  guardado; quem implementa vive na infraestrutura.
*/
import type { StudySalvo } from '../../domain/study'

export interface StudyRepository {
  listar(): StudySalvo[]
  salvar(estudo: StudySalvo): void
}
