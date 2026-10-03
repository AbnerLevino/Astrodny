/*
  PORTA (application/ports) — o contrato pra GUARDAR e RECUPERAR os chats.

  A aplicação só sabe "carregar a lista" e "salvar a lista". Não sabe se é
  localStorage, IndexedDB ou um backend na nuvem. Quem implementa vive na
  infraestrutura (localStorageChatRepository). Trocar o "onde guardar" = trocar
  o adaptador; o resto do app não muda.
*/
import type { Chat } from '../../domain/chat'

export interface ChatRepository {
  carregar(): Chat[]
  salvar(chats: Chat[]): void
}
