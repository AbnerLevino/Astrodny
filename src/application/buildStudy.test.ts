/*
  BYOK: cobre o ajuste do retry (item 12) e o corte por falta de chave (item 10).
*/
import { describe, it, expect, vi } from 'vitest'
import { buildStudy } from './buildStudy'
import { IALimiteError, IASemChaveError } from './ports/aiErrors'
import type { AIProvider } from './ports/AIProvider'

const ESTUDO_JSON = JSON.stringify({
  nome: 'Teste',
  blocos: [
    {
      titulo: 'Bloco 1',
      conteudo: ['Conteúdo simples'],
      pergunta: { tipo: 'multipla_escolha', enunciado: 'Pergunta?', alternativas: ['a', 'b'], correta: 0 },
    },
  ],
})

describe('buildStudy', () => {
  it('IASemChaveError propaga direto, sem re-tentar (não é transitório)', async () => {
    let chamadas = 0
    const ai: AIProvider = {
      async generate() {
        chamadas++
        throw new IASemChaveError('Configure sua chave Groq em Configurações.')
      },
      async *generateStream() {},
    }
    await expect(buildStudy('conteudo', 'objetiva', 'multipla_escolha', ai)).rejects.toBeInstanceOf(IASemChaveError)
    expect(chamadas).toBe(1)
  })

  it('usa a espera REAL sugerida (esperaMs) em vez da pausa fixa, com teto de segurança', async () => {
    vi.useFakeTimers()
    let chamadas = 0
    const ai: AIProvider = {
      async generate() {
        chamadas++
        // sugere 999999ms (acima do teto de 45s) — deve ser cortado pro teto.
        throw new IALimiteError(undefined, 429, 999_999)
      },
      async *generateStream() {},
    }
    const esperas: number[] = []
    const promessa = buildStudy('c', 'objetiva', 'multipla_escolha', ai, undefined, undefined, (ms) => esperas.push(ms))
    const resultadoFinal = promessa.catch((e) => e)

    // 3 tentativas (MAX_TENTATIVAS=3) => 2 esperas entre elas.
    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(45_000)
    }
    const erro = await resultadoFinal

    expect(chamadas).toBe(3)
    expect(erro).toBeInstanceOf(IALimiteError)
    expect(esperas).toEqual([45_000, 45_000]) // cortado pelo TETO_ESPERA_MS, não os 999999 sugeridos
    vi.useRealTimers()
  })

  it('sucesso numa tentativa posterior devolve o Study validado', async () => {
    let chamadas = 0
    const ai: AIProvider = {
      async generate() {
        chamadas++
        if (chamadas === 1) throw new IALimiteError(undefined, 429, 10)
        return ESTUDO_JSON
      },
      async *generateStream() {},
    }
    const estudo = await buildStudy('c', 'objetiva', 'multipla_escolha', ai)
    expect(estudo.nome).toBe('Teste')
    expect(estudo.blocos).toHaveLength(1)
    expect(chamadas).toBe(2)
  })
})
