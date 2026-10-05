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
// `fixado?` é OPCIONAL de propósito: os chats já salvos no localStorage (que não
// têm esse campo) continuam válidos — undefined conta como "não fixado".
// `criadoEm?` é OPCIONAL de propósito, igual `fixado?`: chats já salvos no
// localStorage antes dessa feature existir não têm esse campo — undefined
// significa "não sabemos quando foi criado" (fica de fora da amostra de
// temas recentes do Painel, ver application/amostraChats.ts).
export type Chat = { id: string; titulo: string; mensagens: Mensagem[]; fixado?: boolean; criadoEm?: number }
