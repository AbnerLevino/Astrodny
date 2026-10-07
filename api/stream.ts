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
import { dentroDoLimite } from './_lib/rateLimit'
import { MAX_MESSAGES_CHARS, somaCaracteres } from './_lib/limites'
import { montarSystemPrompt } from './_lib/systemPrompt'
import { ehLimite } from '../src/application/ports/aiErrors'
import type { ChatMessage } from '../src/application/ports/AIProvider'
import type { Personalidade } from '../src/domain/settings'
import type { Perfil } from '../src/domain/perfil'
import type { ContextoEstudo } from '../src/domain/studyChat'

export const config = { runtime: 'edge' }

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Use POST.', { status: 405 })
  }

  if (!(await dentroDoLimite(request))) {
    return new Response('Muitas requisições. Aguarde um instante e tente de novo.', { status: 429 })
  }

  let corpo: {
    messages?: ChatMessage[]
    type?: TipoEvento
    subject?: string
    device?: string
    modo?: string
    personalidade?: Personalidade
    perfil?: Perfil
    contextoEstudo?: ContextoEstudo
  }
  try {
    corpo = await request.json()
  } catch {
    return new Response('Corpo inválido (esperava JSON).', { status: 400 })
  }

  const messages = corpo.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Faltou o campo "messages".', { status: 400 })
  }

  if (somaCaracteres(messages) > MAX_MESSAGES_CHARS) {
    return new Response(`Conversa muito grande (máx. ${MAX_MESSAGES_CHARS} caracteres).`, { status: 413 })
  }

  // log: igual ao que o prompt-texto único registrava antes — a conversa inteira,
  // com o role de cada turno, pra continuar dando pra auditar o que a IA recebeu
  // (texto ORIGINAL, antes de descartar o "system" forjado — ver abaixo).
  const entradaLog = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n')

  // NUNCA confia em role:"system" vindo do cliente — descarta e reconstrói aqui,
  // a partir só dos campos estruturados (modo/personalidade/perfil/contextoEstudo).
  // Esta é a linha que fecha a brecha: por mais que o corpo chegue com um `system`
  // pronto (direto na API, sem passar pela UI), ele nunca entra na chamada à IA.
  const conversa = messages.filter((m) => m.role !== 'system')
  const sistema = montarSystemPrompt(corpo.modo, corpo.personalidade, corpo.perfil, corpo.contextoEstudo)
  const mensagensFinais: ChatMessage[] = [{ role: 'system', content: sistema }, ...conversa]

  const encoder = new TextEncoder()
  let completo = '' // acumula pra logar no fim

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const pedaco of cadeiaChat().generateStream(mensagensFinais)) {
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
          input: entradaLog,
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
