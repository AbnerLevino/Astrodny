/*
  DOMÍNIO — o coração do app. Tipos puros do "estudo".
  Não importa NADA de fora (nem React, nem IA, nem armazenamento).
  Toda a arquitetura aponta as dependências pra cá.

  Obs: os NOMES dos tipos estão em inglês (convenção de código). Os NOMES DOS
  CAMPOS seguem em português por enquanto — eles atravessam a ui e o JSON do
  mock; convertê-los é uma varredura que faremos aos poucos.
*/

// PROFUNDIDADE do estudo, escolhida na Tela 1 (aulas curtas x aulas longas).
// NÃO confundir com o FORMATO das perguntas (abaixo) — são dimensões diferentes.
export type Mode = 'objetiva' | 'completa'

// FORMATO das perguntas do estudo, escolhido POR ESTUDO (o toggle do aluno):
//   'multipla_escolha' -> alternativas, corrigidas por índice (gradeExam, puro e exato)
//   'discursivo'       -> o aluno ESCREVE; a IA corrige (certo/errado + por quê + melhoria)
// Um estudo é inteiro de um formato só — não mistura perguntas das duas naturezas.
export type Formato = 'multipla_escolha' | 'discursivo'

/*
  Uma PERGUNTA é uma de duas formas. Isto é uma UNIÃO DISCRIMINADA: o campo
  `tipo` é a etiqueta que diz QUAL das duas é. Com ela, o TypeScript sabe, dentro
  de um `if (pergunta.tipo === 'discursivo')`, que ali existem `respostaEsperada`
  e `pontosChave` — e BARRA quem tentar ler `alternativas` numa discursiva.
  É o compilador trabalhando a nosso favor: ninguém acessa o campo errado.
*/

// pergunta de MÚLTIPLA ESCOLHA: enunciado, opções e o índice da correta
export type QuestionMultiplaEscolha = {
  tipo: 'multipla_escolha'
  enunciado: string
  alternativas: string[]
  correta: number
}

// pergunta DISCURSIVA: enunciado + o gabarito-modelo e os pontos-chave gerados no
// build. A IA corrige a resposta escrita do aluno COMPARANDO com esses dois
// (+ o conteúdo do bloco) — é o que ancora a correção e a impede de "inventar".
export type QuestionDiscursiva = {
  tipo: 'discursivo'
  enunciado: string
  respostaEsperada: string // resposta-modelo correta e completa (o "gabarito")
  pontosChave: string[]    // afirmações CONCRETAS que uma boa resposta precisa conter
}

// uma pergunta é UMA das duas (o `tipo` decide)
export type Question = QuestionMultiplaEscolha | QuestionDiscursiva

// um bloco da aula: um pedaço do conteúdo (parágrafos) + 1 pergunta pra fixar
export type Block = {
  titulo: string
  conteudo: string[]
  pergunta: Question
}

// uma questão da PROVA: uma pergunta normal + a qual bloco ela pertence.
// O blocoIndex é o que permite calcular o desempenho por tópico.
// (A união se distribui na interseção: cada variante ganha o `blocoIndex`.)
export type ProvaQuestion = Question & { blocoIndex: number }

// o estudo inteiro: nome + formato + os blocos da aula + a prova final.
// `formato` deixa a ui e a correção escolherem o caminho sem vasculhar cada pergunta.
// INVARIANTE: toda pergunta tem `tipo` igual a este `formato` — o validador cobra isso.
export type Study = {
  nome: string
  formato: Formato
  blocos: Block[]
  prova: ProvaQuestion[]
}

// ===== Resultado da prova de MÚLTIPLA ESCOLHA (dados REAIS, calculados por gradeExam) =====

// desempenho num bloco: quantas questões da prova daquele bloco você acertou
export type DesempenhoBloco = {
  blocoIndex: number
  titulo: string
  acertos: number
  total: number
}

// uma questão que você errou — o "terreno" pra IA depois indicar o que revisar
export type ErroProva = {
  enunciado: string
  suaResposta: string
  respostaCerta: string
  blocoIndex: number
}

// o resultado completo da prova de múltipla escolha
export type ResultadoProva = {
  acertos: number
  total: number
  porBloco: DesempenhoBloco[]
  erros: ErroProva[]
}

// ===== Correção DISCURSIVA (feita pela IA, uma por questão) =====
// Tipos prontos para a Frente 4 (o caso de uso gradeDiscursiveAnswer). Ninguém os
// usa ainda, então não quebram nada — só deixam o domínio completo e documentado.

// o veredito da IA sobre UMA resposta escrita (o MESMO formato que validamos no teste
// com o 7B e o Groq: nota + acertou + por quê + 1 melhoria).
export type CorrecaoDiscursiva = {
  nota: number     // 0 a 100
  acertou: boolean // true se nota >= 60 (limiar de aprovação)
  porque: string   // por que essa nota: o que faltou ou errou
  melhoria: string // 1 sugestão concreta pra melhorar a resposta
}

// o resultado da prova discursiva: a % média de acerto + a correção de cada questão.
// (O gradeExam NÃO produz isto — a prova discursiva terá seu próprio caso de uso.)
export type ResultadoProvaDiscursiva = {
  notaMedia: number               // média das notas = a "% de acerto" da prova
  correcoes: CorrecaoDiscursiva[] // uma por questão, na ordem da prova
}

// um estudo SALVO no histórico: o estudo em si + como você foi + de onde veio.
// Guarda o resultado inteiro (desempenho + erros) — matéria-prima pra futura área
// de comparação e pra IA indicar o que revisar.
// TODO (frente do salvar): quando a prova discursiva for integrada, `resultado`
// vira `ResultadoProva | ResultadoProvaDiscursiva`. Por ora segue só o MC.
export type StudySalvo = {
  id: string
  data: string // data ISO de quando foi feito
  origem: string // nome(s) do(s) PDF(s) que geraram o estudo
  estudo: Study
  resultado: ResultadoProva
}
