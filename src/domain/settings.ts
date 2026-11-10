/*
  DOMÍNIO (domain) — as preferências do usuário. Tipos puros, sem React nem storage.

  Por enquanto só a personalidade do tutor. Cresce aqui conforme surgirem outras
  configurações (tema, tamanho de fonte, etc.).
*/

// Como o tutor conversa no chat. Muda só o TOM — o método (ensinar em porções,
// checar entendimento) é o mesmo nos dois.
export type Personalidade = 'formal' | 'descontraido'

// As preferências guardadas do usuário.
export type Config = {
  personalidade: Personalidade
  // BYOK: cada pessoa usa a PRÓPRIA chave (Groq pra Estudar/Trabalhos, Gemini pro
  // chat) — sem fallback silencioso pra chave compartilhada do dono do projeto.
  groqApiKey: string
  geminiApiKey: string
  // Resultado da última verificação de cada chave junto ao provedor (ver
  // infrastructure/ai/validarChave). Editar a chave zera pra false; só vira true
  // depois que o provedor aceitou. É isso que decide se o botão de chave (topo
  // das telas) ainda aparece: some quando as duas estão válidas.
  chavesValidas: { groq: boolean; gemini: boolean }
}

// Padrão pra quem nunca escolheu (formal, por decisão de produto).
// No futuro: perguntar ao abrir o app pela 1ª vez (onboarding).
export const CONFIG_PADRAO: Config = {
  personalidade: 'formal',
  groqApiKey: '',
  geminiApiKey: '',
  chavesValidas: { groq: false, gemini: false },
}

// Chave única do localStorage onde a Config inteira é guardada — compartilhada pelo
// repositório (React) e pelo proxyProvider (lê direto, sem React, mesmo padrão de
// deviceAnon.ts) pra não duplicar a string mágica em dois lugares.
export const CHAVE_STORAGE = 'astrodny:config'

// Qual provedor ainda precisa de atenção: o primeiro sem chave válida (Groq antes, por
// ser o do Estudar). Com os dois ok devolve null — ou 'groq', se `abrirAlgo` (a pessoa
// pediu pra ver as chaves mesmo assim).
export function provedorPendente(
  validas: Config['chavesValidas'],
  abrirAlgo = false,
): 'groq' | 'gemini' | null {
  if (!validas.groq) return 'groq'
  if (!validas.gemini) return 'gemini'
  return abrirAlgo ? 'groq' : null
}
