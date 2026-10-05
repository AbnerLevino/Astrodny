import { describe, expect, test } from 'vitest'
import { gerarInsightsPainel } from './homeInsights'
import type { AIProvider } from './ports/AIProvider'
import { IALimiteError } from './ports/aiErrors'

function fakeAI(respostas: (string | Error)[]): AIProvider {
  let i = 0
  return {
    async generate() {
      const r = respostas[i++]
      if (r instanceof Error) throw r
      return r
    },
    async *generateStream() {
      yield ''
    },
  }
}

const JSON_VALIDO = JSON.stringify({
  titulos: ['Bom dia! Vamos revisar Estrutura de Dados?'],
  sugestoes: {
    novoChat: 'Pergunte sobre o que viu hoje',
    estudar: 'Continue o estudo de Árvores Binárias',
    trabalhos: null,
    provas: null,
  },
})

describe('gerarInsightsPainel', () => {
  test('JSON válido: devolve títulos e sugestões (campos ausentes viram null)', async () => {
    const ai = fakeAI([JSON_VALIDO])
    const r = await gerarInsightsPainel(null, [], [], ai)
    expect(r.titulos).toEqual(['Bom dia! Vamos revisar Estrutura de Dados?'])
    expect(r.sugestoes.estudar).toBe('Continue o estudo de Árvores Binárias')
    expect(r.sugestoes.trabalhos).toBeNull()
  })

  test('1ª resposta vem com JSON quebrado: re-tenta e usa a 2ª', async () => {
    const ai = fakeAI(['isso não é json', JSON_VALIDO])
    const r = await gerarInsightsPainel(null, [], [], ai)
    expect(r.titulos.length).toBeGreaterThan(0)
  })

  test('esgota as tentativas com erro de limite: lança IALimiteError', async () => {
    const ai = fakeAI([new IALimiteError(), new IALimiteError()])
    await expect(gerarInsightsPainel(null, [], [], ai)).rejects.toBeInstanceOf(IALimiteError)
  })

  test('sem nenhum título na resposta: trata como falha (não devolve lista vazia)', async () => {
    const semTitulos = JSON.stringify({
      titulos: [],
      sugestoes: { novoChat: null, estudar: null, trabalhos: null, provas: null },
    })
    const ai = fakeAI([semTitulos, semTitulos])
    await expect(gerarInsightsPainel(null, [], [], ai)).rejects.toThrow()
  })
})
