/*
  CASO DE USO (application) — corrige uma resposta DISSERTATIVA com a IA.

  É o gêmeo discursivo do `gradeExam`: lá a correção é pura e exata (comparar índice);
  aqui ela é um JULGAMENTO delegado ao modelo, então é assíncrona e não-determinística.
  Por isso vive separada — o `gradeExam` continua puro e intacto pro modo múltipla escolha.

  O método pede ao modelo (via porta AIProvider) um veredito COMPARANDO a resposta do
  aluno com o gabarito-modelo + os pontos-chave + o conteúdo do bloco (o prompt rigoroso
  que validamos no teste). Depois BLINDA a resposta: modelo pequeno às vezes devolve nota
  como string, fora do intervalo, ou sem algum campo — a gente conserta em runtime.
*/
import type { AIProvider } from './ports/AIProvider'
import type {
  Study,
  QuestionDiscursiva,
  CorrecaoDiscursiva,
  ResultadoProvaDiscursiva,
} from '../domain/study'
import { montarPromptCorrecao } from './prompts'

const MAX_TENTATIVAS = 2
const LIMIAR_APROVACAO = 60 // nota >= 60 => acertou

// Corrige UMA resposta escrita. Devolve { nota, acertou, porque, melhoria }.
export async function gradeDiscursiveAnswer(
  pergunta: QuestionDiscursiva,
  conteudoBloco: string[],
  respostaAluno: string,
  ai: AIProvider,
): Promise<CorrecaoDiscursiva> {
  const prompt = montarPromptCorrecao(pergunta, conteudoBloco, respostaAluno)

  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const resposta = await ai.generate(prompt, { json: true })
      return validarCorrecao(extrairJson(resposta))
    } catch (e) {
      ultimoErro = e
      console.warn(`gradeDiscursiveAnswer: tentativa ${tentativa}/${MAX_TENTATIVAS} falhou:`, e)
    }
  }
  throw new Error('A IA não conseguiu corrigir a resposta agora. Tente de novo.', {
    cause: ultimoErro,
  })
}

// Corrige a PROVA discursiva inteira: uma correção por questão, na ordem, e a % média.
// `respostas[i]` é o texto que o aluno escreveu na questão `i` da prova.
export async function gradeDiscursiveExam(
  estudo: Study,
  respostas: string[],
  ai: AIProvider,
): Promise<ResultadoProvaDiscursiva> {
  const correcoes: CorrecaoDiscursiva[] = []
  for (let i = 0; i < estudo.prova.length; i++) {
    const questao = estudo.prova[i]
    // segurança de tipo: a prova de um estudo discursivo só tem perguntas discursivas
    if (questao.tipo !== 'discursivo') continue
    const conteudoBloco = estudo.blocos[questao.blocoIndex]?.conteudo ?? []
    correcoes.push(
      await gradeDiscursiveAnswer(questao, conteudoBloco, respostas[i] ?? '', ai),
    )
  }
  const notaMedia =
    correcoes.length === 0
      ? 0
      : Math.round(correcoes.reduce((soma, c) => soma + c.nota, 0) / correcoes.length)
  return { notaMedia, correcoes }
}

// ----- parse + blindagem -----

function extrairJson(resposta: string): unknown {
  const inicio = resposta.indexOf('{')
  const fim = resposta.lastIndexOf('}')
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('a correção não continha um JSON reconhecível')
  }
  return JSON.parse(resposta.slice(inicio, fim + 1))
}

function validarCorrecao(valor: unknown): CorrecaoDiscursiva {
  if (typeof valor !== 'object' || valor === null) throw new Error('correção não é objeto')
  const o = valor as Record<string, unknown>

  // nota: aceita número ou string numérica; prende no intervalo 0..100
  let nota = Number(o.nota)
  if (Number.isNaN(nota)) throw new Error('correção sem nota numérica')
  nota = Math.max(0, Math.min(100, Math.round(nota)))

  // acertou: confia na nota (fonte única de verdade), ignorando um `acertou` incoerente
  const acertou = nota >= LIMIAR_APROVACAO

  const porque = typeof o.porque === 'string' ? o.porque : ''
  const melhoria = typeof o.melhoria === 'string' ? o.melhoria : ''
  return { nota, acertou, porque, melhoria }
}
