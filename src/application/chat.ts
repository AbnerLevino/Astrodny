/*
  CASO DE USO (application) — a regra do chat, SEM React e SEM tela.

  Recebe o histórico da conversa, monta o prompt e pede a resposta em stream à IA.
  Não sabe se a IA é mock ou Ollama (fala só pela porta AIProvider), e não sabe o
  que é uma <div> (só devolve os pedaços de texto). É a "tradução" entre o mundo da
  tela e o mundo da IA — e por isso dá pra testar sozinho.

  Espelha o buildStudy: lá é conteúdo -> prompt -> IA -> Study; aqui é
  histórico -> prompt -> IA -> stream de texto.
*/
import type { AIProvider, ChatMessage } from './ports/AIProvider'
import type { Mensagem } from '../domain/chat'
import type { Personalidade } from '../domain/settings'
import type { Perfil } from '../domain/perfil'
import { systemPromptTutor, systemPromptMiniAulaPdf } from './prompts'

// Devolve a resposta da IA em pedaços (stream), a partir do histórico da conversa.
// A personalidade define o TOM do tutor (escolhida pelo usuário nas Configurações).
// O perfil (quem está logado) é opcional — quem usa anônimo não manda nada aqui.
export function chat(
  historico: Mensagem[],
  ia: AIProvider,
  personalidade: Personalidade,
  perfil?: Perfil,
): AsyncIterable<string> {
  const mensagens = montarMensagens(historico, personalidade, perfil)
  // Mesmo gatilho da mini-aula usado em montarMensagens: manda nos INGREDIENTES do
  // system prompt (Task 3) — quem fala com o nosso backend (proxyProvider) usa isto
  // pra deixar o SERVIDOR remontar o system, em vez de confiar no texto já pronto.
  const ultima = historico[historico.length - 1]
  const temAnexo = ultima?.autor === 'user' && !!ultima.anexos?.length
  return ia.generateStream(mensagens, { modo: temAnexo ? 'mini_aula' : 'tutor', personalidade, perfil })
}

// Transforma a lista de mensagens da UI numa conversa com ROLE de verdade pro modelo:
// 'system' (quem o tutor é, SEPARADO da conversa) + um turno 'user'/'assistant' por
// mensagem do histórico. Antes isso virava um texto único (tudo colado, sem role) —
// modelos de chat de verdade entendem melhor (e obedecem mais) a instrução quando ela
// chega isolada no papel 'system', em vez de misturada ao fio da conversa.
// Exportada (mesmo sendo um detalhe) pra ter teste próprio — é uma peça pura,
// fácil de quebrar sem perceber quando mexermos no formato do prompt.
export function montarMensagens(
  historico: Mensagem[],
  personalidade: Personalidade,
  perfil?: Perfil,
): ChatMessage[] {
  // Se a ÚLTIMA mensagem (a que dispara esta resposta) trouxe anexo(s), é o
  // gatilho da mini-aula (Spec C) — só nesta resposta, o resto da conversa segue
  // o tutor normal. O texto dos anexos vai embutido no turno 'user' (some da
  // bolha na tela, mas a IA precisa dele) — quem decide isso é a UI, aqui só lemos.
  const ultima = historico[historico.length - 1]
  const sistema =
    ultima?.autor === 'user' && ultima.anexos?.length
      ? systemPromptMiniAulaPdf(personalidade, perfil)
      : systemPromptTutor(personalidade, perfil)
  const conversa: ChatMessage[] = historico.map((m) => ({
    role: m.autor === 'user' ? 'user' : 'assistant',
    content: m.anexos?.length
      ? `${m.texto}\n\n${m.anexos.map((a) => `[Conteúdo extraído do arquivo "${a.nome}"]:\n${a.conteudo}`).join('\n\n')}`
      : m.texto,
  }))
  return [{ role: 'system', content: sistema }, ...conversa]
}
