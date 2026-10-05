import { describe, expect, test } from 'vitest'
import { materiasDoCurso } from './materiasPorCurso'

describe('materiasDoCurso', () => {
  test('curso de tecnologia traz as matérias técnicas + o bloco comum + os 3 finais com o nome do curso', () => {
    const materias = materiasDoCurso('Engenharia de Software')
    expect(materias).toContain('Metodologia da Pesquisa Científica')
    expect(materias).toContain('Programação Orientada a Objetos')
    expect(materias).toContain('Tópicos Avançados em Engenharia de Software')
    expect(materias).toContain('Estágio Curricular Supervisionado em Engenharia de Software')
  })

  test('curso não cadastrado devolve array vazio (não quebra)', () => {
    expect(materiasDoCurso('Curso Inexistente')).toEqual([])
  })
})
