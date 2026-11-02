/*
  BYOK: mesmo ajuste do buildStudy.test.ts (retry ciente de rate-limit + corte por
  falta de chave) — ver comentário completo lá.
*/
import { describe, it, expect, vi } from 'vitest'
import { buildTrabalho } from './buildTrabalho'
import { IALimiteError, IASemChaveError } from './ports/aiErrors'
import type { AIProvider } from './ports/AIProvider'

const ESTRUTURA_JSON = JSON.stringify({
  secoes: [{ nivel: 1, titulo: 'Introdução', texto: 'Texto.' }],
  citacoes: [],
})

describe('buildTrabalho', () => {
  it('IASemChaveError propaga direto, sem re-tentar', async () => {
    let chamadas = 0
    const ai: AIProvider = {
      async generate() {
        chamadas++
        throw new IASemChaveError('Configure sua chave Groq em Configurações.')
      },
      async *generateStream() {},
    }
    await expect(buildTrabalho('texto', ai)).rejects.toBeInstanceOf(IASemChaveError)
    expect(chamadas).toBe(1)
  })

  it('usa a espera real sugerida (aoEsperar) e tenta até MAX_TENTATIVAS=3', async () => {
    vi.useFakeTimers()
    let chamadas = 0
    const ai: AIProvider = {
      async generate() {
        chamadas++
        throw new IALimiteError(undefined, 429, 5000)
      },
      async *generateStream() {},
    }
    const esperas: number[] = []
    const promessa = buildTrabalho('texto', ai, undefined, (ms) => esperas.push(ms))
    const resultadoFinal = promessa.catch((e) => e)

    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(5000)
    }
    const erro = await resultadoFinal

    expect(chamadas).toBe(3)
    expect(erro).toBeInstanceOf(IALimiteError)
    expect(esperas).toEqual([5000, 5000])
    vi.useRealTimers()
  })

  it('sucesso devolve a estrutura validada', async () => {
    const ai: AIProvider = {
      async generate() {
        return ESTRUTURA_JSON
      },
      async *generateStream() {},
    }
    const estrutura = await buildTrabalho('texto', ai)
    expect(estrutura.secoes).toHaveLength(1)
    expect(estrutura.secoes[0].titulo).toBe('Introdução')
  })
})
