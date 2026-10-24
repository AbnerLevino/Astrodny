/*
  PORTA (application/ports) — o contrato pra GUARDAR e LISTAR os estudos feitos.

  Diferente do ChatRepository (que salva a lista inteira), aqui salvamos UM estudo
  por vez — ele é acrescentado (ou atualizado, se o `id` já existir — mesma sessão
  ganhando progresso ou concluindo a prova) no histórico. A aplicação não sabe
  onde isso é guardado; quem implementa vive na infraestrutura.

  Assíncrona pq o Supabase (infrastructure/storage/supabaseStudyRepository) fala
  com a rede; o localStorage só "finge" ser assíncrono pra caber no mesmo contrato.
*/
import type { StudySalvo } from '../../domain/study'

export interface StudyRepository {
  listar(): Promise<StudySalvo[]>
  salvar(estudo: StudySalvo): Promise<void>
}
