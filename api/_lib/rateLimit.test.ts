import { describe, it, expect } from 'vitest'
import { ipDaRequisicao } from './rateLimit'

describe('ipDaRequisicao', () => {
  it('ignora x-real-ip (não é garantido pela borda da Vercel, cliente pode forjar) e usa x-forwarded-for', () => {
    const req = new Request('http://x', {
      headers: { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(ipDaRequisicao(req)).toBe('5.6.7.8')
  })

  it('pega o ÚLTIMO IP de x-forwarded-for (o observado pela borda, não o forjado pelo cliente)', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })
    expect(ipDaRequisicao(req)).toBe('5.6.7.8')
  })

  it("devolve 'desconhecido' sem nenhum dos dois headers", () => {
    const req = new Request('http://x')
    expect(ipDaRequisicao(req)).toBe('desconhecido')
  })
})
