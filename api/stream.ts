/*
  SERVIDOR — endpoint POST /api/stream (resposta em PEDAÇOS, streaming).

  É o backend do chat/tira-dúvidas: vai devolvendo o texto token a token (efeito "digitando").
  Protocolo simples: o corpo tem o prompt; a RESPOSTA é um fluxo de TEXTO PURO (os pedaços,
  concatenados pelo cliente). O `proxyProvider` do front lê esse fluxo e repassa como
  AsyncIterable<string> — exatamente o que a porta AIProvider promete.

  Ao terminar o fluxo, registra o evento anônimo com o texto completo acumulado.
*/
import { cadeiaChat } from './_lib/chain'
import { registrarEvento, type TipoEvento } from './_lib/log'
import { ehLimite } from '../src/application/ports/aiErrors'

export const config = { runtime: 'edge' }

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Use POST.', { status: 405 })
  }

  let corpo: { prompt?: string; type?: TipoEvento; subject?: string; device?: string }
  try {
    corpo = await request.json()
  } catch {
    return new Response('Corpo inválido (esperava JSON).', { status: 400 })
  }

  const prompt = corpo.prompt
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return new Response('Faltou o campo "prompt".', { status: 400 })
  }

  const encoder = new TextEncoder()
  let completo = '' // acumula pra logar no fim

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const pedaco of cadeiaChat().generateStream(prompt)) {
          completo += pedaco
          controller.enqueue(encoder.encode(pedaco))
        }
      } catch (e) {
        // se falhar ANTES de qualquer texto, sinaliza o erro no próprio fluxo (o cliente
        // detecta o prefixo e converte no erro certo). "[erro:limite]" = sobrecarga (429/503).
        if (completo === '') {
          const prefixo = ehLimite(e) ? '[erro:limite] ' : '[erro] '
          controller.enqueue(encoder.encode(prefixo + (e instanceof Error ? e.message : 'falha no stream')))
        }
      } finally {
        controller.close()
        // coleta anônima depois de fechar o fluxo (não atrasa o aluno)
        void registrarEvento({
          type: corpo.type ?? 'chat',
          subject: corpo.subject,
          input: prompt,
          output: completo,
          device_anon: corpo.device || NIL_UUID,
        })
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
