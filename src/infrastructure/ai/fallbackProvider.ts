/*
  INFRAESTRUTURA (infrastructure/ai) — o ROTEADOR com fallback.

  Recebe uma lista ORDENADA de AIProviders e tenta um por um: se o primeiro falhar
  (fora do ar, limite de requisição estourado, erro de rede), cai pro próximo. É ele
  que implementa a cadeia do chat: nuvem(s) primeiro, local por último.

  Ele mesmo É um AIProvider (mesma porta) — então o caso de uso `chat` nem sabe que
  existe fallback; pra ele é só "uma IA".
*/
import type { AIProvider, ChatMeta } from '../../application/ports/AIProvider'
import { IALimiteError, ehLimite } from '../../application/ports/aiErrors'

export function fallbackProvider(provedores: AIProvider[]): AIProvider {
  if (provedores.length === 0) {
    throw new Error('fallbackProvider precisa de pelo menos 1 provedor')
  }

  return {
    // Tenta gerar completo em cada provedor, na ordem; usa o primeiro que responder.
    async generate(prompt, opcoes) {
      let ultimoErro: unknown
      let houveLimite = false
      for (const p of provedores) {
        try {
          return await p.generate(prompt, opcoes)
        } catch (e) {
          ultimoErro = e // tenta o próximo
          if (ehLimite(e)) houveLimite = true
        }
      }
      // se a cadeia caiu e PELO MENOS UM elo foi por sobrecarga, trate o todo como LIMITE
      // (temporário → vale re-tentar/avisar), mesmo que o último erro tenha sido outro.
      if (houveLimite) throw new IALimiteError()
      throw ultimoErro
    },

    // Streaming com fallback: a decisão acontece no PRIMEIRO pedaço. Se pedir o
    // primeiro token e o provedor falhar (ex.: 429), caímos pro próximo ANTES de
    // desenhar qualquer coisa na tela. Depois que o texto começou, seguimos com ele.
    async *generateStream(prompt, meta?: ChatMeta) {
      let ultimoErro: unknown
      let houveLimite = false
      for (const p of provedores) {
        try {
          const it = p.generateStream(prompt, meta)[Symbol.asyncIterator]()
          const primeiro = await it.next() // aqui a conexão abre; se falhar, cai no catch
          if (!primeiro.done) yield primeiro.value
          while (true) {
            const n = await it.next()
            if (n.done) return
            yield n.value
          }
        } catch (e) {
          ultimoErro = e // provedor indisponível: tenta o próximo da cadeia
          if (ehLimite(e)) houveLimite = true
        }
      }
      if (houveLimite) throw new IALimiteError()
      throw ultimoErro
    },
  }
}
