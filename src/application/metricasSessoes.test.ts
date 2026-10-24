import { describe, expect, test } from 'vitest'
import { tendenciaRecente, blocoMaisFraco, frequenciaEstudo } from './metricasSessoes'
import type { StudySalvo, Block } from '../domain/study'

function bloco(titulo: string): Block {
  return {
    titulo,
    conteudo: [],
    pergunta: { tipo: 'multipla_escolha', enunciado: '', alternativas: [], correta: 0 },
  }
}

function estudoConcluido(
  materia: string,
  acertos: number,
  total: number,
  data: string,
  erros: { enunciado: string; blocoIndex: number }[] = [],
  blocos: string[] = [],
): StudySalvo {
  return {
    id: `${materia}-${data}`,
    data,
    origem: 'teste.pdf',
    materia,
    estudo: { nome: 'teste', formato: 'multipla_escolha', blocos: blocos.map(bloco), prova: [] },
    resultado: {
      acertos,
      total,
      porBloco: [],
      erros: erros.map((e) => ({ enunciado: e.enunciado, suaResposta: '', respostaCerta: '', blocoIndex: e.blocoIndex })),
    },
    progresso: null,
  }
}

function estudoEmAndamento(materia: string, data: string): StudySalvo {
  return { ...estudoConcluido(materia, 0, 0, data), resultado: null, progresso: { blocoAtual: 1, totalBlocos: 3 } }
}

describe('tendenciaRecente', () => {
  test('sem estudos: null', () => {
    expect(tendenciaRecente([])).toBeNull()
  })

  test('só 1 sessão concluída na matéria: null (não dá pra comparar)', () => {
    expect(tendenciaRecente([estudoConcluido('Banco de Dados', 8, 10, '2026-01-02')])).toBeNull()
  })

  test('2 sessões na mesma matéria: aponta a direção', () => {
    const estudos = [
      estudoConcluido('Banco de Dados', 9, 10, '2026-01-03'),
      estudoConcluido('Banco de Dados', 5, 10, '2026-01-01'),
    ]
    const t = tendenciaRecente(estudos)
    expect(t?.materia).toBe('Banco de Dados')
    expect(t?.direcao).toBe('subindo')
  })

  test('sessão em andamento (sem resultado) não entra no cálculo', () => {
    const estudos = [
      estudoEmAndamento('Cálculo', '2026-01-05'),
      estudoConcluido('Banco de Dados', 9, 10, '2026-01-03'),
      estudoConcluido('Banco de Dados', 5, 10, '2026-01-01'),
    ]
    expect(tendenciaRecente(estudos)?.materia).toBe('Banco de Dados')
  })
})

describe('blocoMaisFraco', () => {
  test('sem erros: null', () => {
    expect(blocoMaisFraco([estudoConcluido('X', 10, 10, '2026-01-01')])).toBeNull()
  })

  test('aponta o bloco com mais erros, somando entre sessões', () => {
    const estudos = [
      estudoConcluido(
        'BD',
        5,
        10,
        '2026-01-01',
        [{ enunciado: 'a', blocoIndex: 0 }, { enunciado: 'b', blocoIndex: 1 }],
        ['Normalização', 'Índices'],
      ),
      estudoConcluido('BD', 6, 10, '2026-01-02', [{ enunciado: 'c', blocoIndex: 0 }], ['Normalização', 'Índices']),
    ]
    const b = blocoMaisFraco(estudos)
    expect(b?.titulo).toBe('Normalização')
    expect(b?.erros).toBe(2)
  })
})

describe('frequenciaEstudo', () => {
  test('sem estudos: null', () => {
    expect(frequenciaEstudo([])).toBeNull()
  })

  test('dias consecutivos contam o streak', () => {
    const estudos = [
      estudoConcluido('BD', 1, 1, '2026-01-03T10:00:00Z'),
      estudoConcluido('BD', 1, 1, '2026-01-02T10:00:00Z'),
      estudoConcluido('BD', 1, 1, '2026-01-01T10:00:00Z'),
    ]
    const f = frequenciaEstudo(estudos)
    expect(f?.totalSessoes).toBe(3)
    expect(f?.diasConsecutivos).toBe(3)
  })

  test('quebra de dia interrompe o streak', () => {
    const estudos = [
      estudoConcluido('BD', 1, 1, '2026-01-05T10:00:00Z'),
      estudoConcluido('BD', 1, 1, '2026-01-01T10:00:00Z'),
    ]
    expect(frequenciaEstudo(estudos)?.diasConsecutivos).toBe(1)
  })
})
