/*
  CASO DE USO (application) — a regra do chat, SEM React e SEM tela.

  Recebe o histórico da conversa, monta o prompt e pede a resposta em stream à IA.
  Não sabe se a IA é mock ou Ollama (fala só pela porta AIProvider), e não sabe o
  que é uma <div> (só devolve os pedaços de texto). É a "tradução" entre o mundo da
  tela e o mundo da IA — e por isso dá pra testar sozinho.

  Espelha o buildStudy: lá é conteúdo -> prompt -> IA -> Study; aqui é
  histórico -> prompt -> IA -> stream de texto.
*/
import type { AIProvider } from './ports/AIProvider'
import type { Mensagem } from '../domain/chat'
import type { Personalidade } from '../domain/settings'
import { systemPromptTutor } from './prompts'

// Devolve a resposta da IA em pedaços (stream), a partir do histórico da conversa.
// A personalidade define o TOM do tutor (escolhida pelo usuário nas Configurações).
export function chat(
  historico: Mensagem[],
  ia: AIProvider,
  personalidade: Personalidade,
): AsyncIterable<string> {
  const prompt = montarPrompt(historico, personalidade)
  return ia.generateStream(prompt)
}

// Transforma a lista de mensagens num texto único pro modelo entender a conversa.
// Começa pela "instrução de sistema" (quem o tutor é), depois o histórico.
// Exportada (mesmo sendo um detalhe) pra ter teste próprio — é uma peça pura,
// fácil de quebrar sem perceber quando mexermos no formato do prompt.
export function montarPrompt(historico: Mensagem[], personalidade: Personalidade): string {
  const sistema = systemPromptTutor(personalidade)
  const conversa = historico
    .map((m) => `${m.autor === 'user' ? 'Aluno' : 'Assistente'}: ${m.texto}`)
    .join('\n')
  return `${sistema}\n\n${conversa}\nAssistente:`
}
