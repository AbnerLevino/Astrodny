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
}

// Padrão pra quem nunca escolheu (formal, por decisão de produto).
// No futuro: perguntar ao abrir o app pela 1ª vez (onboarding).
export const CONFIG_PADRAO: Config = {
  personalidade: 'formal',
}
