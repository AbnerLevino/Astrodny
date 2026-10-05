/*
  INFRAESTRUTURA (infrastructure/ai) — o RETRY com BACKOFF.

  Conceito: um pico de rate limit (429) quase sempre é passageiro — esperar um pouco e
  tentar de novo resolve, SEM o usuário perceber. Este wrapper envolve QUALQUER AIProvider
  (um provider direto, o fallback, ou o proxy) e, se a falha for de LIMITE (IALimiteError),
  espera um tempinho e tenta mais uma vez. Se for outro erro (prompt inválido, bug), NÃO
  insiste — re-tentar não consertaria e só atrasaria o erro.

  BACKOFF com JITTER: a espera cresce a cada tentativa (2,5s, depois 5s…) e leva um pedaço
  ALEATÓRIO. O aleatório ("jitter") dessincroniza vários usuários que bateram no limite ao
  mesmo tempo — se todos esperassem exatamente 2,5s, voltariam juntos e estourariam o limite
  de novo. Com jitter, eles se espalham no tempo.

  É um AIProvider (mesma porta), então quem usa nem sabe que há retry — é só "uma IA".
*/
import type { AIProvider, GenerateOptions } from '../../application/ports/AIProvider'
import { ehLimite } from '../../application/ports/aiErrors'

type OpcoesRetry = {
  tentativas?: number // total de tentativas (1ª + re-tentativas). Padrão 2 = 1 re-tentativa.
  esperaBaseMs?: number // base da espera; cresce por tentativa + jitter. Padrão 2500ms.
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// espera da tentativa `i` (0-based): base*(i+1) + até 1,5s de aleatório. Ex.: ~2,5–4s, depois ~5–6,5s.
function esperaBackoff(i: number, base: number): number {
  return base * (i + 1) + Math.random() * 1500
}

export function retryProvider(inner: AIProvider, opcoes: OpcoesRetry = {}): AIProvider {
  const tentativas = opcoes.tentativas ?? 2
  const base = opcoes.esperaBaseMs ?? 2500

  return {
    async generate(prompt: string, gen?: GenerateOptions): Promise<string> {
      let ultimoErro: unknown
      for (let i = 0; i < tentativas; i++) {
        try {
          return await inner.generate(prompt, gen)
        } catch (e) {
          ultimoErro = e
          // só re-tenta se for LIMITE e ainda houver tentativa sobrando
          if (ehLimite(e) && i < tentativas - 1) await dormir(esperaBackoff(i, base))
          else throw e
        }
      }
      throw ultimoErro
    },

    async *generateStream(prompt: string): AsyncIterable<string> {
      let ultimoErro: unknown
      for (let i = 0; i < tentativas; i++) {
        let emitiu = false
        try {
          for await (const pedaco of inner.generateStream(prompt)) {
            emitiu = true
            yield pedaco
          }
          return
        } catch (e) {
          ultimoErro = e
          // NÃO dá pra "voltar" um stream que já começou a escrever → só re-tenta se
          // o limite estourou ANTES de qualquer pedaço (emitiu === false).
          if (ehLimite(e) && !emitiu && i < tentativas - 1) await dormir(esperaBackoff(i, base))
          else throw e
        }
      }
      throw ultimoErro
    },
  }
}
