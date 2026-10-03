/*
  INFRAESTRUTURA (infrastructure/storage) — adaptador da porta ChatRepository
  que guarda os chats no localStorage do navegador.

  localStorage só guarda TEXTO, então convertemos com JSON (stringify pra salvar,
  parse pra carregar). Tudo é embrulhado em try/catch: se o localStorage estiver
  indisponível (aba privada antiga) ou o dado corrompido, é melhor começar vazio
  do que derrubar o app inteiro.
*/
import type { ChatRepository } from '../../application/ports/ChatRepository'
import type { Chat } from '../../domain/chat'

const CHAVE = 'astrodny:chats' // nome da "gaveta" no localStorage

export const localStorageChatRepository: ChatRepository = {
  carregar(): Chat[] {
    try {
      const bruto = localStorage.getItem(CHAVE)
      return bruto ? (JSON.parse(bruto) as Chat[]) : []
    } catch {
      return []
    }
  },

  salvar(chats: Chat[]): void {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(chats))
    } catch {
      // sem espaço ou indisponível: não vale a pena quebrar a UI por isso
    }
  },
}
