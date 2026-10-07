/*
  PORTA (application/ports) — o contrato entre a aplicação e qualquer modelo de IA.

  A camada de aplicação (o método) fala com um modelo APENAS por este contrato:
  manda um texto (prompt), recebe um texto (a resposta).

  Quem IMPLEMENTA isto vive na infraestrutura (mockProvider, futuro ollamaProvider).
  Trocar o fornecedor = trocar o adaptador. A aplicação não muda.
*/
// Opções de uma geração. `json: true` pede pro modelo devolver JSON VÁLIDO
// (no Ollama vira `format:"json"`). Usada pelo Estudo pra proteger o parse.
// Opcional: o Chat não passa nada e recebe texto livre.
//
// `reasoningEffort`/`maxCompletionTokens`: só o Groq (modelos de raciocínio tipo
// gpt-oss-120b) entende — os demais providers simplesmente ignoram o campo.
// Usado pelo buildTrabalho: "low" evita que o modelo gaste tempo/tokens "pensando"
// numa tarefa que é só ESTRUTURAR texto já pronto (não criar conteúdo), e o teto de
// tokens generoso dá espaço pra trabalhos acadêmicos longos (TCC com várias seções).
export type GenerateOptions = {
  json?: boolean
  reasoningEffort?: 'low' | 'medium' | 'high'
  maxCompletionTokens?: number
}

// Uma mensagem de CONVERSA com papel (role) explícito — é como toda API de chat de
// verdade (OpenAI/Groq/Cloudflare/Gemini/Ollama) entende contexto: 'system' é a
// instrução fixa (quem o tutor é), 'user'/'assistant' são os turnos da conversa.
// Antes o Chat colava tudo isso num texto único; modelos maiores tratam melhor
// quando o 'system' chega separado da conversa (ver prompts.ts/chat.ts).
export type ChatRole = 'system' | 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }

// O que um provider recebe: um prompt solto (tarefas de 1 tiro, ex.: montar a prova)
// ou uma conversa estruturada (o Chat). Mantém os dois porque nem toda chamada tem
// (ou precisa de) histórico/role — só normalizar facilita a vida de quem implementa.
export type PromptInput = string | ChatMessage[]

// Normaliza um PromptInput pra lista de mensagens — um prompt solto vira 1 mensagem
// 'user'. Cada provider usa isto pra nunca lidar com os dois formatos separadamente.
export function paraMensagens(prompt: PromptInput): ChatMessage[] {
  return typeof prompt === 'string' ? [{ role: 'user', content: prompt }] : prompt
}

export interface AIProvider {
  // Resposta COMPLETA de uma vez. Usada pelo Estudo, que precisa do JSON inteiro
  // pra parsear. assíncrono porque modelos reais respondem "com o tempo".
  generate(prompt: PromptInput, opcoes?: GenerateOptions): Promise<string>

  // Resposta em PEDAÇOS (stream), conforme o modelo vai gerando. Usada pelo Chat,
  // pro efeito "digitando" ser real. AsyncIterable = "vou te entregando fatia por
  // fatia"; quem consome usa `for await`. É assim que o Ollama responde de verdade.
  generateStream(prompt: PromptInput): AsyncIterable<string>
}
