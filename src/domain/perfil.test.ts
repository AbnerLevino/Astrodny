import { describe, expect, test } from 'vitest'
import { perfilCompleto, type Perfil } from './perfil'

describe('perfilCompleto', () => {
  test('false quando não tem curso', () => {
    const perfil: Perfil = { nome: 'Ana' }
    expect(perfilCompleto(perfil)).toBe(false)
  })

  test('true quando tem curso', () => {
    const perfil: Perfil = { nome: 'Ana', curso: 'TADS' }
    expect(perfilCompleto(perfil)).toBe(true)
  })

  test('null (sem perfil, ex. anônimo) é incompleto', () => {
    expect(perfilCompleto(null)).toBe(false)
  })
})
