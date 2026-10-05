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
  faz bem o que sabe (ler o material e ensinar) e a prova vira responsabilidade de quem
  a monta bem. Por isso o `Study` sai daqui com `prova: []` — o estágio 2 a preenche.

  BLINDAGEM: a resposta de um modelo pequeno não é confiável. Pode vir JSON torto
  (quebra no parse) OU JSON válido com a forma errada (quebra depois, na tela). Por
  isso validamos em RUNTIME e, se falhar, TENTAMOS de novo — geração de LLM é aleatória,
  a próxima costuma vir ok.
*/
import type { AIProvider } from './ports/AIProvider'
import type { Mode, Formato, Study, Block, EstudoConfig } from '../domain/study'
import { buildStudyPrompt } from './prompts'
import { comoObjeto, comoLista, comoTexto, validarPergunta } from './validacao'
import { IALimiteError, ehLimite } from './ports/aiErrors'

// Quantas vezes pedir à IA antes de desistir (a 1ª + 1 retry).
const MAX_TENTATIVAS = 2

// Pausa ENTRE as tentativas. Sem ela, a 2ª chamada sai logo após a 1ª (rajada) e,
// num pico de rate limit, as duas estouram juntas (429). Uma pausa curta dá fôlego.
const PAUSA_ENTRE_TENTATIVAS_MS = 1200
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function buildStudy(
  content: string,
  mode: Mode,
  formato: Formato,
  ai: AIProvider,
  contexto?: string, // pedido extra do aluno (dificuldades, foco…) — opcional
  config?: EstudoConfig, // ajustes opt-in (nº de tópicos, código) — opcional
): Promise<Study> {
  const prompt = buildStudyPrompt(content, mode, formato, contexto, config)

  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      // json:true => pedimos JSON válido ao modelo (no Ollama, ativa format:"json").
      const resposta = await ai.generate(prompt, { json: true })
      const bruto = extrairJson(resposta) // texto -> objeto (lança se malformado)
      return validarStudy(bruto, formato) // objeto -> Study (só a aula; prova vem no estágio 2)
    } catch (e) {
      ultimoErro = e
      console.warn(`buildStudy: tentativa ${tentativa}/${MAX_TENTATIVAS} falhou:`, e)
      // espaça a próxima tentativa (menos na última, que não vai re-tentar)
      if (tentativa < MAX_TENTATIVAS) await dormir(PAUSA_ENTRE_TENTATIVAS_MS)
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
      comoTexto(p, `bloco ${i}.conteudo[${k}]`),
    ),
    pergunta: validarPergunta(o.pergunta, `bloco ${i}.pergunta`, formato),
  }
}
