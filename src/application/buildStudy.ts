/*
  CASO DE USO (application) — montar a AULA de um estudo (ESTÁGIO 1).

  Fluxo: recebe o conteúdo + o modo, monta um prompt, pede pra porta AIProvider
  e INTERPRETA a resposta (texto -> blocos estruturados).

  O modelo interpreta e propõe (o texto); a aplicação valida e executa (o parse).
  A ui nunca fala com o modelo: fala com este caso de uso, que devolve um `Study`.

  IMPORTANTE (arquitetura de 2 estágios): este caso de uso monta SÓ os BLOCOS da aula.
  A PROVA é montada à parte, pelo `buildExam` (estágio 2), por um modelo FORTE (ex.: Groq).
  Motivo: um modelo pequeno local, num schema grande, "dava o estudo por encerrado"
  depois dos blocos e OMITIA a prova — derrubando o estudo inteiro. Separando, o local
  faz bem o que sabe (ler o 
  aterial e ensinar) e a prova vira responsabilidade de quem
  a monta bem. Por isso o `Study` sai daqui com `prova: []` — o estágio 2 a preenche.

  BLINDAGEM: a resposta de um modelo pequeno não é confiável. Pode vir JSON torto
  (quebra no parse) OU JSON válido com a forma errada (quebra depois, na tela). Por
  isso validamos em RUNTIME e, se falhar, TENTAMOS de novo — geração de LLM é aleatória,
  a próxima costuma vir ok.
*/
import type { AIProvider } from './ports/AIProvider'
import type { Mode, Formato, Study, Block, EstudoConfig } from '../domain/study'
import { buildStudyPrompt } from './prompts'
import { comoObjeto, comoLista, comoTexto, validarPergunta, validarExercicioCodigo, validarConteudoItem } from './validacao'
import { IALimiteError, ehLimite, ehSemChave } from './ports/aiErrors'

// Quantas vezes pedir à IA antes de desistir. 3 (era 2): com o retry agora esperando o
// tempo REAL sugerido pelo provedor (ver TETO_ESPERA_MS abaixo), uma 3ª tentativa tem
// chance real de vingar num caso de rate limit — antes, com espera fixa e curta, só
// bateria no mesmo teto de novo.
const MAX_TENTATIVAS = 3

// Pausa ENTRE as tentativas quando NÃO há espera real sugerida pelo provedor (erro que
// não é de limite, ou limite sem o header). Sem ela, a 2ª chamada sai logo após a 1ª
// (rajada) e, num pico de rate limit, as duas estouram juntas (429).
const PAUSA_ENTRE_TENTATIVAS_MS = 1200
// Teto de segurança pra espera real (retry-after/x-ratelimit-reset-tokens): nunca trava
// a pessoa além disso, mesmo se o provedor sugerir um valor absurdo.
const TETO_ESPERA_MS = 45_000
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Teto de saída explícito (sem isso, o Groq usa um padrão ~3072 pro gpt-oss-120b).
// Testado contra um PDF denso (45 págs/SQL): sem isso, a resposta vinha com
// finish_reason "length" (cortada no meio do JSON — gerava erro de validação ou
// perdia blocos inteiros, ex.: parava antes de chegar em JOIN). Com 6000, a mesma
// aula terminou com finish_reason "stop" (completa) e cobriu 1 tópico a mais.
// NÃO é de graça: o modelo "pensa" mais com mais espaço (reasoning_tokens subiu de
// ~1600 pra ~2000 no teste), então o custo por chamada sobe — mas trocar "falha
// garantida" por "funciona, só mais caro" vale a pena.
const MAX_COMPLETION_TOKENS = 6000

export async function buildStudy(
  content: string,
  mode: Mode,
  formato: Formato,
  ai: AIProvider,
  contexto?: string, // pedido extra do aluno (dificuldades, foco…) — opcional
  config?: EstudoConfig, // ajustes opt-in (nº de tópicos, código) — opcional
  aoEsperar?: (ms: number) => void, // avisa a UI antes de cada espera por rate limit
  signal?: AbortSignal, // aborta a chamada em voo se o aluno saiu da tela no meio
): Promise<Study> {
  const prompt = buildStudyPrompt(content, mode, formato, contexto, config)

  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      // json:true => pedimos JSON válido ao modelo (no Groq, ativa response_format json_object).
      const resposta = await ai.generate(prompt, { json: true, signal, maxCompletionTokens: MAX_COMPLETION_TOKENS })
      const bruto = extrairJson(resposta) // texto -> objeto (lança se malformado)
      return validarStudy(bruto, formato) // objeto -> Study (só a aula; prova vem no estágio 2)
    } catch (e) {
      if (ehSemChave(e)) throw e // não é transitório: propaga sem re-tentar nem embrulhar
      ultimoErro = e
      console.warn(`buildStudy: tentativa ${tentativa}/${MAX_TENTATIVAS} falhou:`, e)
      // espaça a próxima tentativa (menos na última, que não vai re-tentar): usa a espera
      // REAL sugerida pelo provedor se vier (com teto de segurança), senão a pausa fixa.
      if (tentativa < MAX_TENTATIVAS) {
        const espera = ehLimite(e) && e.esperaMs ? Math.min(e.esperaMs, TETO_ESPERA_MS) : PAUSA_ENTRE_TENTATIVAS_MS
        aoEsperar?.(espera)
        await dormir(espera)
      }
    }
  }

  // Esgotou as tentativas. Se o motivo foi SOBRECARGA, repassa como limite (mensagem
  // amigável + é temporário); senão, o erro genérico de "material não deu certo".
  if (ehLimite(ultimoErro)) throw new IALimiteError()
  throw new Error(
    'A IA não conseguiu montar um estudo válido a partir desse material. Tente de novo ou com outro conteúdo.',
    { cause: ultimoErro },
  )
}

// Extrai o JSON da resposta e parseia. Modelos às vezes cercam o JSON com texto ou
// ```json; por isso pegamos do primeiro "{" ao último "}". JSON.parse lança se vier torto.
function extrairJson(resposta: string): unknown {
  const inicio = resposta.indexOf('{')
  const fim = resposta.lastIndexOf('}')
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('a resposta não continha um JSON reconhecível')
  }
  return JSON.parse(resposta.slice(inicio, fim + 1))
}

// ===== Validação em RUNTIME =====
// Transforma `unknown` na AULA (blocos) de confiança. Os type guards primitivos e a
// validação de pergunta vêm de ./validacao (compartilhados com o buildExam).

function validarStudy(valor: unknown, formato: Formato): Study {
  const o = comoObjeto(valor, 'estudo')
  const blocos = comoLista(o.blocos, 'blocos').map((b, i) => validarBloco(b, i, formato))
  if (blocos.length === 0) throw new Error('estudo sem blocos')
  // prova VAZIA de propósito: o estágio 2 (buildExam) a monta a partir destes blocos.
  return { nome: comoTexto(o.nome, 'nome'), formato, blocos, prova: [] }
}

function validarBloco(valor: unknown, i: number, formato: Formato): Block {
  const o = comoObjeto(valor, `bloco ${i}`)
  return {
    titulo: comoTexto(o.titulo, `bloco ${i}.titulo`),
    conteudo: comoLista(o.conteudo, `bloco ${i}.conteudo`).map((p, k) =>
      validarConteudoItem(p, `bloco ${i}.conteudo[${k}]`),
    ),
    pergunta: validarPergunta(o.pergunta, `bloco ${i}.pergunta`, formato),
    exercicioCodigo: validarExercicioCodigo(o.exercicioCodigo),
  }
}
