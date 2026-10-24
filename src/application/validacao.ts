/*
  VALIDAÇÃO em RUNTIME (application) — os type guards COMPARTILHADOS.

  A resposta de um modelo não é confiável: pode vir com a forma errada mesmo quando o
  JSON é válido (os `as` do TS não verificam nada em tempo de execução). Estas funções
  transformam `unknown` em tipos de confiança e, se algo não bate, lançam um erro
  DESCRITIVO (dizendo ONDE) — o que vira a mensagem do retry e ajuda a depurar.

  Moram aqui (e não dentro do buildStudy) porque DOIS casos de uso precisam delas: o
  buildStudy (valida os blocos da aula) e o buildExam (valida as questões da prova).
*/
import type { Question, ProvaQuestion, Formato, ExercicioCodigo, ConteudoItem } from '../domain/study'

// ----- primitivos: as peças que todos os validadores usam -----

export function comoObjeto(v: unknown, onde: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`${onde}: esperava um objeto`)
  }
  return v as Record<string, unknown>
}

export function comoLista(v: unknown, onde: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`${onde}: esperava uma lista`)
  return v
}

export function comoTexto(v: unknown, onde: string): string {
  if (typeof v !== 'string') throw new Error(`${onde}: esperava texto`)
  return v
}

// Aceita número OU string numérica ("2") — quirk comum de modelo pequeno.
export function comoNumero(v: unknown, onde: string): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  throw new Error(`${onde}: esperava número`)
}

// Igual ao comoNumero, mas NÃO lança: ausente/inválido vira 0. Usado só no blocoIndex,
// que é um "de onde veio" — vale mais ter a prova com um índice chutado do que não ter.
export function comoNumeroOuZero(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return 0
}

// Valida uma pergunta RAMIFICANDO pelo formato do estudo e CARIMBA o `tipo` (o modelo
// não manda esse campo — ele é decidido pelo formato que o aluno escolheu).
export function validarPergunta(valor: unknown, onde: string, formato: Formato): Question {
  const o = comoObjeto(valor, onde)
  const enunciado = comoTexto(o.enunciado, `${onde}.enunciado`)

  if (formato === 'discursivo') {
    // BLINDAGEM: respostaEsperada e pontosChave são AUXILIARES (ancoram a correção, mas
    // não são a pergunta em si). Um modelo pequeno às vezes os omite ao escrever um bloco
    // denso. Em vez de derrubar o estudo inteiro, DEGRADAMOS: campo ausente vira vazio. A
    // correção ainda funciona (cai de volta no conteúdo do bloco), só perde um pouco de
    // precisão. O `enunciado`, esse sim, continua essencial — sem ele não existe pergunta.
    const pontosChave = Array.isArray(o.pontosChave)
      ? o.pontosChave.filter((p): p is string => typeof p === 'string')
      : []
    const respostaEsperada = typeof o.respostaEsperada === 'string' ? o.respostaEsperada : ''
    return { tipo: 'discursivo', enunciado, respostaEsperada, pontosChave }
  }

  // múltipla escolha
  const alternativas = comoLista(o.alternativas, `${onde}.alternativas`).map((a, k) =>
    comoTexto(a, `${onde}.alternativas[${k}]`),
  )
  if (alternativas.length < 2) throw new Error(`${onde}: menos de 2 alternativas`)
  const correta = comoNumero(o.correta, `${onde}.correta`)
  if (correta < 0 || correta >= alternativas.length) {
    throw new Error(`${onde}: índice "correta" (${correta}) fora do alcance`)
  }
  return { tipo: 'multipla_escolha', enunciado, alternativas, correta }
}

// Valida UMA questão da prova: uma pergunta normal + a qual bloco ela pertence.
export function validarProvaQuestion(
  valor: unknown,
  i: number,
  totalBlocos: number,
  formato: Formato,
): ProvaQuestion {
  const base = validarPergunta(valor, `prova ${i}`, formato)
  const o = comoObjeto(valor, `prova ${i}`)
  // BLINDAGEM: blocoIndex ausente OU inválido vira 0 (vale mais ter a prova com um
  // índice chutado do que derrubá-la por causa de um "de onde veio").
  let blocoIndex = comoNumeroOuZero(o.blocoIndex)
  if (blocoIndex < 0 || blocoIndex >= totalBlocos) blocoIndex = 0
  return { ...base, blocoIndex }
}

// Valida o "exercicioCodigo" OPCIONAL de um bloco (mini-IDE). É ADITIVO e o modelo só
// o inclui quando faz sentido — por isso DEGRADA em vez de lançar: qualquer forma
// estranha (campo faltando, tipo errado) vira undefined, e o bloco segue sem o
// exercício, em vez de derrubar o estudo inteiro por causa de um campo extra.
export function validarExercicioCodigo(valor: unknown): ExercicioCodigo | undefined {
  if (typeof valor !== 'object' || valor === null) return undefined
  const o = valor as Record<string, unknown>
  if (typeof o.linguagem !== 'string' || typeof o.enunciado !== 'string') return undefined
  const respostaEsperada = typeof o.respostaEsperada === 'string' ? o.respostaEsperada : ''
  const pontosChave = Array.isArray(o.pontosChave)
    ? o.pontosChave.filter((p): p is string => typeof p === 'string')
    : []
  return { linguagem: o.linguagem, enunciado: o.enunciado, respostaEsperada, pontosChave }
}

// Valida UM item do array "conteudo" de um bloco: OU texto (parágrafo) OU uma tabela
// estruturada ({ tipo: "tabela", cabecalho, linhas }). Lança se vier um objeto que não
// é nem uma coisa nem outra — o buildStudy trata isso como falha de geração e TENTA DE
// NOVO (mesma blindagem dos outros campos essenciais, não é auxiliar/opcional).
export function validarConteudoItem(valor: unknown, onde: string): ConteudoItem {
  if (typeof valor === 'string') return valor
  const o = comoObjeto(valor, onde)
  if (o.tipo !== 'tabela') throw new Error(`${onde}: esperava texto ou uma tabela ({ tipo: "tabela" })`)
  const cabecalho = comoLista(o.cabecalho, `${onde}.cabecalho`).map((c, k) =>
    comoTexto(c, `${onde}.cabecalho[${k}]`),
  )
  const linhas = comoLista(o.linhas, `${onde}.linhas`).map((linha, i) =>
    comoLista(linha, `${onde}.linhas[${i}]`).map((c, k) => comoTexto(c, `${onde}.linhas[${i}][${k}]`)),
  )
  const legenda = typeof o.legenda === 'string' ? o.legenda : undefined
  return { tipo: 'tabela', cabecalho, linhas, legenda }
}

// Igual ao comoTexto, mas NÃO lança: ausente/inválido vira null. Usado nas
// sugestões do Painel, onde "sem sinal" é um resultado VÁLIDO (não um erro) —
// ver application/homeInsights.ts.
export function comoTextoOuNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
