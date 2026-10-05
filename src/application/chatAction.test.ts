import { describe, expect, test } from 'vitest'
import { extrairAcao } from './chatAction'

describe('extrairAcao', () => {
  test('sem marcador: devolve o texto intacto e ação null', () => {
    const r = extrairAcao('Oi, como vai?')
    expect(r.texto).toBe('Oi, como vai?')
    expect(r.acao).toBeNull()
  })

  test('com marcador: extrai o tema e remove o marcador do texto', () => {
    const r = extrairAcao('Quer que eu monte um estudo disso? [acao: abrir_estudar | tema: Herança em Java]')
    expect(r.texto).toBe('Quer que eu monte um estudo disso?')
    expect(r.acao).toEqual({ tipo: 'abrir_estudar', tema: 'Herança em Java' })
  })

  test('marcador no meio do texto: remove só o marcador, mantém o resto', () => {
    const r = extrairAcao('Antes. [acao: abrir_estudar | tema: POO] Depois.')
    expect(r.texto).toBe('Antes.  Depois.')
    expect(r.acao?.tema).toBe('POO')
  })
})
