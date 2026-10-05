import { describe, expect, test } from 'vitest'
import { systemPromptTutor } from './prompts'
import { materiasDoCurso } from '../domain/materiasPorCurso'

describe('systemPromptTutor', () => {
  test('sem perfil: não menciona matérias nem curso', () => {
    const p = systemPromptTutor('formal')
    expect(p).not.toContain('Matérias')
  })

  test('com matérias no perfil: lista elas pro tutor usar', () => {
    const p = systemPromptTutor('formal', {
      nome: 'Ana',
      curso: 'TADS',
      materias: ['Estrutura de Dados', 'Power Query'],
    })
    expect(p).toContain('Estrutura de Dados, Power Query')
  })

  test('sempre inclui o marcador de ação nas regras do produto', () => {
    const p = systemPromptTutor('descontraido')
    expect(p).toContain('[acao: abrir_estudar | tema:')
  })

  // Ponta a ponta com 1 exemplo real: pega a grade de um curso real
  // (materiasDoCurso, Fase da tabela curso->matéria) e confirma que UMA
  // matéria escolhida pelo aluno chega de verdade no prompt do tutor.
  test('1 matéria real escolhida de um curso real chega ao prompt do tutor', () => {
    const materiasDoADS = materiasDoCurso('Análise e Desenvolvimento de Sistemas (ADS)')
    const materiaEscolhida = materiasDoADS.find((m) => m === 'Programação Orientada a Objetos')
    expect(materiaEscolhida).toBeDefined()

    const p = systemPromptTutor('formal', {
      nome: 'João',
      curso: 'Análise e Desenvolvimento de Sistemas (ADS)',
      materias: [materiaEscolhida!],
    })

    expect(p).toContain('Programação Orientada a Objetos')
  })
})
