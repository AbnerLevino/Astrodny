/*
  DOMÍNIO — tipos puros da "conversa" (o chat).
  Igual ao study.ts: não importa NADA de fora (nem React, nem IA).

  `Mensagem` morava na ui/chats.tsx, mas é um conceito de NEGÓCIO (o que foi dito
  na conversa), não de tela. Por isso desce pra cá: assim tanto a aplicação
  (application/chat.ts) quanto a ui podem usá-la sem a aplicação depender da ui.
*/

// um arquivo anexado numa mensagem do aluno (ex.: PDF) — guarda o NOME (pra mostrar
// na bolha) e o CONTEÚDO já extraído (pra IA usar). Nunca aparece pra IA junto do
// `texto` normal: quem monta o prompt (application/chat.ts) decide como embutir.
export type Anexo = { nome: string; conteudo: string }

// uma fala da conversa: quem falou (aluno ou IA) e o texto. `anexos` é OPCIONAL —
// só existe na mensagem do aluno que trouxe arquivo(s) (ver Anexo acima). É LISTA
// porque o aluno pode anexar mais de um de uma vez (fileira de quadradinhos na ui).
export type Mensagem = { autor: 'user' | 'ia'; texto: string; anexos?: Anexo[] }

// uma conversa inteira: id, título (derivado da 1ª mensagem) e as mensagens.
// É o que a gente vai persistir no histórico.
// `fixado?` é OPCIONAL de propósito: os chats já salvos no localStorage (que não
// têm esse campo) continuam válidos — undefined conta como "não fixado".
// `criadoEm?` é OPCIONAL de propósito, igual `fixado?`: chats já salvos no
// localStorage antes dessa feature existir não têm esse campo — undefined
// significa "não sabemos quando foi criado" (fica de fora da amostra de
// temas recentes do Painel, ver application/amostraChats.ts).
export type Chat = { id: string; titulo: string; mensagens: Mensagem[]; fixado?: boolean; criadoEm?: number }
