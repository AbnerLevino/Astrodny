import { describe, it, expect } from 'vitest'
import { ipDaRequisicao } from './rateLimit'

describe('ipDaRequisicao', () => {
  it('pega o primeiro IP de x-forwarded-for', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })
    expect(ipDaRequisicao(req)).toBe('1.2.3.4')
  })

  it("devolve 'desconhecido' sem o header", () => {
    const req = new Request('http://x')
    expect(ipDaRequisicao(req)).toBe('desconhecido')
  })
})
