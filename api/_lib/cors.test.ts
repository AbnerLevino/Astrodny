import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { origemPermitida } from './cors'

describe('origemPermitida', () => {
  beforeEach(() => {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_BRANCH_URL
    delete process.env.VERCEL_URL
  })
  afterEach(() => {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_BRANCH_URL
    delete process.env.VERCEL_URL
  })

  it('aceita o domínio de produção do NOSSO deployment (VERCEL_PROJECT_PRODUCTION_URL)', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'astrodny.vercel.app'
    expect(origemPermitida('https://astrodny.vercel.app')).toBe('https://astrodny.vercel.app')
  })

  it('aceita o domínio do deployment atual (VERCEL_URL)', () => {
    process.env.VERCEL_URL = 'astrodny-abc123.vercel.app'
    expect(origemPermitida('https://astrodny-abc123.vercel.app')).toBe('https://astrodny-abc123.vercel.app')
  })

  it('rejeita um subdomínio .vercel.app de OUTRO projeto, mesmo sem domínio próprio configurado', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'astrodny.vercel.app'
    expect(origemPermitida('https://evil.vercel.app')).toBeNull()
  })

  it('aceita localhost:5173 (dev)', () => {
    expect(origemPermitida('http://localhost:5173')).toBe('http://localhost:5173')
  })
  it('rejeita domínio de fora', () => {
    expect(origemPermitida('https://evil.example.com')).toBeNull()
  })
  it('rejeita quando não há Origin', () => {
    expect(origemPermitida(null)).toBeNull()
  })
})
