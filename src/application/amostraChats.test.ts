import { describe, expect, test } from 'vitest'
import { amostrarMensagensDeAbertura } from './amostraChats'
import type { Chat } from '../domain/chat'

const HORA = 60 * 60 * 1000

function chat(id: string, criadoEm: number | undefined, primeiraMensagem: string): Chat {
  return {
    id,
    titulo: primeiraMensagem.slice(0, 20),
    mensagens: [{ autor: 'user', texto: primeiraMensagem }],
    criadoEm,
  }
}

describe('amostrarMensagensDeAbertura', () => {
  test('sem chats: lista vazia', () => {
    expect(amostrarMensagensDeAbertura([], Date.now())).toEqual([])
  })

  test('chat sem criadoEm (salvo antes dessa feature existir): ignora', () => {
    const agora = Date.now()
    const chats = [chat('1', undefined, 'oi')]
    expect(amostrarMensagensDeAbertura(chats, agora)).toEqual([])
  })

  test('chat criado há mais de 5h: fica de fora', () => {
    const agora = 10 * HORA
    const chats = [chat('1', agora - 6 * HORA, 'muito antigo')]
    expect(amostrarMensagensDeAbertura(chats, agora)).toEqual([])
  })

  test('chat criado dentro das 5h: entra, só a 1ª mensagem', () => {
    const agora = 10 * HORA
    const chats = [chat('1', agora - 2 * HORA, 'quero estudar concursos')]
    expect(amostrarMensagensDeAbertura(chats, agora)).toEqual(['quero estudar concursos'])
  })

  test('mais de 5 chats recentes: corta no limite, mais recentes primeiro', () => {
    const agora = 10 * HORA
    const chats = [
      chat('1', agora - 4 * HORA, 'msg 1 (mais antiga)'),
      chat('2', agora - 3 * HORA, 'msg 2'),
      chat('3', agora - 2.5 * HORA, 'msg 3'),
      chat('4', agora - 2 * HORA, 'msg 4'),
      chat('5', agora - 1 * HORA, 'msg 5'),
      chat('6', agora - 0.5 * HORA, 'msg 6 (mais nova)'),
    ]
    const r = amostrarMensagensDeAbertura(chats, agora)
    expect(r).toHaveLength(5)
    expect(r[0]).toBe('msg 6 (mais nova)')
    expect(r).not.toContain('msg 1 (mais antiga)')
  })
})
