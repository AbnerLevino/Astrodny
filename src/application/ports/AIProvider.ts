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
export type GenerateOptions = { json?: boolean }

export interface AIProvider {
  // Resposta COMPLETA de uma vez. Usada pelo Estudo, que precisa do JSON inteiro
  // pra parsear. assíncrono porque modelos reais respondem "com o tempo".
  generate(prompt: string, opcoes?: GenerateOptions): Promise<string>

  // Resposta em PEDAÇOS (stream), conforme o modelo vai gerando. Usada pelo Chat,
  // pro efeito "digitando" ser real. AsyncIterable = "vou te entregando fatia por
  // fatia"; quem consome usa `for await`. É assim que o Ollama responde de verdade.
  generateStream(prompt: string): AsyncIterable<string>
}
