import { describe, expect, test } from 'vitest'
import { gerarInsightsPainel } from './homeInsights'
import type { StudySalvo } from '../domain/study'
import type { Perfil } from '../domain/perfil'

const MANHA = new Date('2026-01-01T09:00:00').getTime()

function estudo(nome: string, acertos: number, total: number, data: string): StudySalvo {
  return {
    id: nome,
    data,
    origem: 'teste.pdf',
    materia: 'Geral',
    estudo: { nome, formato: 'multipla_escolha', blocos: [], prova: [] },
    resultado: { acertos, total, porBloco: [], erros: [] },
    progresso: null,
  }
}

describe('gerarInsightsPainel', () => {
  test('sem perfil e sem histórico: só a saudação genérica', () => {
    const r = gerarInsightsPainel(null, [], MANHA)
    expect(r.titulos).toEqual(['Bom dia!'])
    expect(r.sugestoes.estudar).toBeNull()
    expect(r.sugestoes.provas).toBeNull()
  })

  test('com nome no perfil: saudação personalizada', () => {
    const perfil: Perfil = { nome: 'Maria Silva' }
    const r = gerarInsightsPainel(perfil, [], MANHA)
    expect(r.titulos[0]).toBe('Bom dia, Maria!')
  })

  test('com estudo recente: sugere continuar e título cita o estudo', () => {
    const estudos = [estudo('Estrutura de Dados', 8, 10, '2026-01-01')]
    const r = gerarInsightsPainel(null, estudos, MANHA)
    expect(r.sugestoes.estudar).toBe('Continue estudando Estrutura de Dados')
    expect(r.titulos).toContain('Vamos continuar de onde parou em Estrutura de Dados?')
  })

  test('desempenho baixo entre os recentes: sugere revisão de provas', () => {
    const estudos = [estudo('Árvores', 3, 10, '2026-01-01'), estudo('Listas', 9, 10, '2025-12-31')]
    const r = gerarInsightsPainel(null, estudos, MANHA)
    expect(r.sugestoes.provas).toBe('Revise Árvores, onde você acertou menos')
  })

  test('desempenho bom: não força sugestão de revisão', () => {
    const estudos = [estudo('Árvores', 9, 10, '2026-01-01')]
    const r = gerarInsightsPainel(null, estudos, MANHA)
    expect(r.sugestoes.provas).toBeNull()
  })
})
