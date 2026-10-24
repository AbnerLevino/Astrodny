import { describe, expect, test } from 'vitest'
import { precisaAtualizar } from './homeInsightsCache'
import type { PainelCache } from '../domain/painel'
import type { StudySalvo } from '../domain/study'

const INSIGHTS_VAZIOS = {
  titulos: ['x'],
  sugestoes: { novoChat: null, estudar: null, trabalhos: null, provas: null },
}

function estudoEm(dataISO: string): StudySalvo {
  return {
    id: '1',
    data: dataISO,
    origem: 'teste.pdf',
    materia: 'Geral',
    estudo: { nome: 'teste', formato: 'multipla_escolha', blocos: [], prova: [] },
    resultado: { acertos: 0, total: 0, porBloco: [], erros: [] },
    progresso: null,
  }
}

describe('precisaAtualizar', () => {
  test('sem cache: sempre precisa atualizar', () => {
    expect(precisaAtualizar(null, [], Date.now())).toBe(true)
  })

  test('cache recente, sem estudo novo: não precisa atualizar', () => {
    const agora = new Date('2026-10-05T12:00:00Z').getTime()
    const cache: PainelCache = { geradoEm: '2026-10-05T10:00:00Z', insights: INSIGHTS_VAZIOS }
    expect(precisaAtualizar(cache, [], agora)).toBe(false)
  })

  test('cache passou de 5h: precisa atualizar', () => {
    const agora = new Date('2026-10-05T16:01:00Z').getTime()
    const cache: PainelCache = { geradoEm: '2026-10-05T10:00:00Z', insights: INSIGHTS_VAZIOS }
    expect(precisaAtualizar(cache, [], agora)).toBe(true)
  })

  test('estudo salvo DEPOIS do cache: precisa atualizar mesmo antes das 5h', () => {
    const agora = new Date('2026-10-05T11:00:00Z').getTime()
    const cache: PainelCache = { geradoEm: '2026-10-05T10:00:00Z', insights: INSIGHTS_VAZIOS }
    const estudos = [estudoEm('2026-10-05T10:30:00Z')]
    expect(precisaAtualizar(cache, estudos, agora)).toBe(true)
  })

  test('estudo salvo ANTES do cache: não força atualização', () => {
    const agora = new Date('2026-10-05T11:00:00Z').getTime()
    const cache: PainelCache = { geradoEm: '2026-10-05T10:00:00Z', insights: INSIGHTS_VAZIOS }
    const estudos = [estudoEm('2026-10-05T09:00:00Z')]
    expect(precisaAtualizar(cache, estudos, agora)).toBe(false)
  })
})
