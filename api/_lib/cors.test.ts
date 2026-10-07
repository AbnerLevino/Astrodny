import { describe, it, expect } from 'vitest'
import { origemPermitida } from './cors'

describe('origemPermitida', () => {
  it('aceita qualquer subdomínio .vercel.app', () => {
    expect(origemPermitida('https://astrodny-git-main.vercel.app')).toBe('https://astrodny-git-main.vercel.app')
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
