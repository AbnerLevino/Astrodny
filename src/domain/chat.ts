/*
  DOMÍNIO — tipos puros da "conversa" (o chat).
  Igual ao study.ts: não importa NADA de fora (nem React, nem IA).

  `Mensagem` morava na ui/chats.tsx, mas é um conceito de NEGÓCIO (o que foi dito
  na conversa), não de tela. Por isso desce pra cá: assim tanto a aplicação
  (application/chat.ts) quanto a ui podem usá-la sem a aplicação depender da ui.
*/

// uma fala da conversa: quem falou (aluno ou IA) e o texto
export type Mensagem = { autor: 'user' | 'ia'; texto: string }

// uma conversa inteira: id, título (derivado da 1ª mensagem) e as mensagens.
// É o que a gente vai persistir no histórico.
export type Chat = { id: string; titulo: string; mensagens: Mensagem[] }
