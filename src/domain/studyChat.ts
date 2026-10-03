/*
  DOMÍNIO — a "conversa contextual" que acontece DURANTE um estudo.

  Aqui mora só o TIPO do contexto: as informações do estudo atual que a IA precisa
  considerar quando o aluno faz uma dúvida no meio do estudo. Tipos puros, sem React,
  sem IA, sem armazenamento.

  Separação proposital (os três conceitos NÃO se misturam):
    - Conteúdo do estudo  -> `Study` (domain/study.ts) — o material estruturado.
    - Progresso           -> `ProgressoEstudo` (aqui) — o estado do aluno no estudo.
    - Conversa contextual -> as dúvidas do aluno (histórico de `Mensagem`) + este
                             `ContextoEstudo`, que dá "de onde" a pergunta veio.

  A conversa é uma CAMADA DE SUPORTE: ela não avança o estudo nem substitui a aula.
  Perguntar significa apenas "preciso de ajuda agora".
*/

// Uma questão que o aluno já respondeu durante o estudo — matéria-prima pra IA
// entender o que ele já viu e onde escorregou.
export type RespostaDada = {
  enunciado: string
  suaResposta: string
  correta: boolean
}

// O ESTADO do aluno dentro do estudo (o "progresso"). Separado do conteúdo de
// propósito. Tudo que o futuro frontend tiver em mãos ele passa; o que não tiver,
// deixa de fora (campos opcionais).
export type ProgressoEstudo = {
  blocosConcluidos: number
  totalBlocos: number
  respostasDadas?: RespostaDada[]
}

// O CONTEXTO que a IA deve considerar quando o aluno pergunta durante o estudo.
// Preenchido "na medida do possível": só o que estiver disponível no momento.
// Deliberadamente NÃO carrega o PDF inteiro — o conteúdo do bloco atual é o
// recorte relevante (e o material vem só pelo nome, pra não pesar o prompt).
export type ContextoEstudo = {
  usuario?: string // quem é o aluno (hoje fixo; futuro: auth)
  estudoNome: string // nome do estudo (ex.: "Banco de Dados")
  materia?: string // a matéria, se souber (por padrão, = estudoNome)
  material?: string // nome do(s) arquivo(s)/PDF de origem
  blocoIndex: number // índice do bloco em que o aluno está
  blocoTitulo: string // título do bloco atual (ex.: "Cardinalidade")
  blocoConteudo: string[] // os parágrafos do bloco atual (o recorte relevante)
  perguntaDoBloco?: string // enunciado da pergunta de fixação daquele bloco
  conceitosRelacionados?: string[] // terreno pro futuro (Block ainda não tem isso)
  progresso?: ProgressoEstudo // onde o aluno está no estudo
}
