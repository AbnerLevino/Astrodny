/*
  BYOK: providers.ts agora recebe a chave por parâmetro (não mais process.env) e lê o
  tempo de espera real (retry-after/x-ratelimit-reset-tokens) da resposta de erro.
  Cobre as duas coisas + a garantia de nunca interpolar a chave na mensagem de erro.
*/
import { describe, it, expect, vi, afterEach } from 'vitest'
import { groqProvider, geminiProvider } from './providers'
import { IALimiteError, ehLimite } from '../../src/application/ports/aiErrors'

function respostaErro(status: number, headers: Record<string, string> = {}) {
  return new Response(null, { status, headers })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('groqProvider', () => {
  it('lança IALimiteError com esperaMs lido de retry-after (segundos -> ms)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro(429, { 'retry-after': '6' })))
    const erro = await groqProvider('gsk_teste').generate('oi').catch((e) => e)
    expect(ehLimite(erro)).toBe(true)
    expect((erro as IALimiteError).esperaMs).toBe(6000)
  })

  it('cai pra x-ratelimit-reset-tokens (ex.: "592ms") quando não há retry-after', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro(429, { 'x-ratelimit-reset-tokens': '592ms' })))
    const erro = await groqProvider('gsk_teste').generate('oi').catch((e) => e)
    expect((erro as IALimiteError).esperaMs).toBe(592)
  })

  it('nunca interpola a chave na mensagem de erro (status não-limite)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro(401)))
    const erro: Error = await groqProvider('gsk_segredo_super_secreto').generate('oi').catch((e) => e)
    expect(erro.message).not.toContain('gsk_segredo_super_secreto')
    expect(erro.message).toBe('Groq respondeu 401')
  })
})

describe('geminiProvider', () => {
  it('lança IALimiteError com esperaMs lido do header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro(503, { 'retry-after': '2' })))
    const erro = await geminiProvider('AIza_teste').generate('oi').catch((e) => e)
    expect(ehLimite(erro)).toBe(true)
    expect((erro as IALimiteError).esperaMs).toBe(2000)
  })

  it('nunca interpola a chave na mensagem de erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro(403)))
    const erro: Error = await geminiProvider('AIza_segredo').generate('oi').catch((e) => e)
    expect(erro.message).not.toContain('AIza_segredo')
  })
})
