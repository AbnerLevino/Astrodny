/*
  Regressão: `retryProvider` embrulha o `proxyProvider` em produção (ver `chats.tsx`,
  `StudySession.tsx`). Se `generateStream` não repassar o `meta` pro provider de
  dentro, o chat em produção perde personalidade/perfil/modo silenciosamente — bug
  real encontrado na revisão da Task 3 (o meta nunca chegava no `fetch` do proxy).
*/
import { describe, it, expect } from 'vitest'
import { retryProvider } from './retryProvider'
import type { AIProvider, ChatMeta } from '../../application/ports/AIProvider'

describe('retryProvider.generateStream', () => {
  it('repassa o meta pro provider interno', async () => {
    let metaRecebido: ChatMeta | undefined
    const inner: AIProvider = {
      async generate() {
        return ''
      },
      async *generateStream(_prompt, meta) {
        metaRecebido = meta
        yield 'ok'
      },
    }
    const meta: ChatMeta = { modo: 'tutor', personalidade: 'descontraido' }

    const resultado: string[] = []
    for await (const pedaco of retryProvider(inner).generateStream('oi', meta)) {
      resultado.push(pedaco)
    }

    expect(resultado).toEqual(['ok'])
    expect(metaRecebido).toEqual(meta)
  })
})
