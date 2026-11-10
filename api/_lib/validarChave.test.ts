import { describe, it, expect, vi } from 'vitest'
import { validarChave } from './validarChave'

const resposta = (status: number, corpo = '') => async () => new Response(corpo, { status })

describe('validarChave', () => {
  it('200 → valida, e manda a chave no header certo de cada provedor', async () => {
    const f = vi.fn(resposta(200))
    expect(await validarChave('groq', 'gsk_x', f)).toBe('valida')
    expect(await validarChave('gemini', 'AIza_x', f)).toBe('valida')
    const [, initGroq] = f.mock.calls[0] as unknown as [string, RequestInit]
    const [urlGemini, initGemini] = f.mock.calls[1] as unknown as [string, RequestInit]
    expect((initGroq.headers as Record<string, string>).Authorization).toBe('Bearer gsk_x')
    expect((initGemini.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza_x')
    expect(urlGemini).not.toContain('AIza_x')
  })

  it('401/403 → invalida', async () => {
    expect(await validarChave('groq', 'x', vi.fn(resposta(401)))).toBe('invalida')
    expect(await validarChave('gemini', 'x', vi.fn(resposta(403)))).toBe('invalida')
  })

  it('Gemini 400 com API_KEY_INVALID → invalida; 400 por outro motivo → erro', async () => {
    expect(await validarChave('gemini', 'x', vi.fn(resposta(400, '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}')))).toBe('invalida')
    expect(await validarChave('gemini', 'x', vi.fn(resposta(400, '{"error":{"message":"bad request"}}')))).toBe('erro')
  })

  it('5xx ou falha de rede → erro (não culpa a chave)', async () => {
    expect(await validarChave('groq', 'x', vi.fn(resposta(503)))).toBe('erro')
    expect(await validarChave('groq', 'x', vi.fn(async () => { throw new Error('rede') }))).toBe('erro')
  })
})
