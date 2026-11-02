import { describe, it, expect } from 'vitest'
import { IALimiteError, ehLimite, IASemChaveError, ehSemChave } from './aiErrors'

describe('IALimiteError', () => {
  it('guarda status e esperaMs quando fornecidos', () => {
    const e = new IALimiteError('sobrecarregada', 429, 6600)
    expect(ehLimite(e)).toBe(true)
    expect(e.status).toBe(429)
    expect(e.esperaMs).toBe(6600)
  })

  it('esperaMs fica undefined quando o provedor não manda o header', () => {
    const e = new IALimiteError(undefined, 503)
    expect(e.esperaMs).toBeUndefined()
  })

  it('ehLimite rejeita erro genérico', () => {
    expect(ehLimite(new Error('qualquer coisa'))).toBe(false)
  })
})

describe('IASemChaveError', () => {
  it('ehSemChave reconhece o tipo e não confunde com IALimiteError', () => {
    const semChave = new IASemChaveError('Configure sua chave Groq em Configurações.')
    expect(ehSemChave(semChave)).toBe(true)
    expect(ehLimite(semChave)).toBe(false)
  })

  it('ehSemChave rejeita erro genérico', () => {
    expect(ehSemChave(new Error('qualquer coisa'))).toBe(false)
  })
})
