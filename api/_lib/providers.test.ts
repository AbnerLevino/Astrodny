/*
  BYOK: providers.ts agora recebe a chave por parâmetro (não mais process.env) e lê o
  tempo de espera real (retry-after/x-ratelimit-reset-tokens) da resposta de erro.
  Cobre as duas coisas + a garantia de nunca interpolar a chave na mensagem de erro.
*/
import { describe, it, expect, vi, afterEach } from 'vitest'
import { groqProvider, geminiProvider } from './providers'
import { IALimiteError, ehLimite, ehChaveInvalida, ehSemChave } from '../../src/application/ports/aiErrors'

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

  it('401 vira IAChaveInvalidaError (não-transitório, também reconhecido por ehSemChave) sem vazar a chave', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro(401)))
    const erro: Error = await groqProvider('gsk_segredo_super_secreto').generate('oi').catch((e) => e)
    expect(ehChaveInvalida(erro)).toBe(true)
    expect(ehSemChave(erro)).toBe(true)
    expect(ehLimite(erro)).toBe(false)
    expect(erro.message).not.toContain('gsk_segredo_super_secreto')
    expect(erro.message).toContain('Configurações')
  })

  it('nunca interpola a chave na mensagem de erro (status genérico)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro(500)))
    const erro: Error = await groqProvider('gsk_segredo_super_secreto').generate('oi').catch((e) => e)
    expect(erro.message).not.toContain('gsk_segredo_super_secreto')
    expect(erro.message).toBe('Groq respondeu 500')
  })
})

describe('geminiProvider', () => {
  it('lança IALimiteError com esperaMs lido do header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro(503, { 'retry-after': '2' })))
    const erro = await geminiProvider('AIza_teste').generate('oi').catch((e) => e)
    expect(ehLimite(erro)).toBe(true)
    expect((erro as IALimiteError).esperaMs).toBe(2000)
  })

  it('403 vira IAChaveInvalidaError sem vazar a chave', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respostaErro(403)))
    const erro: Error = await geminiProvider('AIza_segredo').generate('oi').catch((e) => e)
    expect(ehChaveInvalida(erro)).toBe(true)
    expect(erro.message).not.toContain('AIza_segredo')
  })

  it('manda a chave no header x-goog-api-key, nunca na URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await geminiProvider('AIza_segredo').generate('oi')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain('AIza_segredo')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza_segredo')
  })
})
