import { describe, it, expect } from 'vitest'
import { somaCaracteres } from './limites'

describe('somaCaracteres', () => {
  it('soma o content de todas as mensagens', () => {
    expect(somaCaracteres([{ content: 'ab' }, { content: 'cde' }])).toBe(5)
  })

  it('devolve 0 pra lista vazia', () => {
    expect(somaCaracteres([])).toBe(0)
  })
})
