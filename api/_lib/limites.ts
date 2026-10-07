/*
  SERVIDOR (api/_lib) — tetos de tamanho de entrada. Sem isso, um prompt ou uma
  conversa gigante processa (e cobra da cota de IA) antes de qualquer checagem.
*/
export const MAX_PROMPT_CHARS = 8000
export const MAX_MESSAGES_CHARS = 16000

export function somaCaracteres(messages: { content: string }[]): number {
  return messages.reduce((soma, m) => soma + (m.content?.length ?? 0), 0)
}
