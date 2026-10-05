import { describe, expect, test } from 'vitest'
import { systemPromptTutor, montarPromptPainel } from './prompts'
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

describe('montarPromptPainel', () => {
  test('sem perfil e sem estudos: avisa que não há dado, não inventa', () => {
    const p = montarPromptPainel(null, [], [])
    expect(p).toContain('sem dado de perfil ainda')
    expect(p).toContain('nenhum estudo feito ainda')
  })

  test('com curso, nível e matérias: todos aparecem no prompt', () => {
    const p = montarPromptPainel(
      { nome: 'Ana', curso: 'TADS', nivel: 'intermediario', materias: ['Estrutura de Dados'] },
      [],
      [],
    )
    expect(p).toContain('TADS')
    expect(p).toContain('intermediario')
    expect(p).toContain('Estrutura de Dados')
  })

  test('estudos recentes aparecem com nome e desempenho', () => {
    const p = montarPromptPainel(null, [
      {
        id: '1',
        data: '2026-10-01',
        origem: 'aula.pdf',
        estudo: { nome: 'Árvores Binárias', formato: 'multipla_escolha', blocos: [], prova: [] },
        resultado: { acertos: 7, total: 10, porBloco: [], erros: [] },
      },
    ], [])
    expect(p).toContain('Árvores Binárias')
    expect(p).toContain('7/10')
  })

  test('mensagens de abertura recentes aparecem no prompt', () => {
    const p = montarPromptPainel(null, [], ['quero estudar pra um concurso'])
    expect(p).toContain('quero estudar pra um concurso')
  })

  test('pede JSON com as 4 chaves de sugestão', () => {
    const p = montarPromptPainel(null, [], [])
    expect(p).toContain('"novoChat"')
    expect(p).toContain('"estudar"')
    expect(p).toContain('"trabalhos"')
    expect(p).toContain('"provas"')
  })
})
