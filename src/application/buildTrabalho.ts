/*
  CASO DE USO (application) — estruturar o texto colado pelo aluno na feature Trabalhos/ABNT.

  Fluxo: recebe o texto colado (ou, num 2º+ turno, o estado já estruturado + a instrução
  de ajuste do aluno), monta o prompt e pede pra porta AIProvider segmentar em `secoes` +
  extrair `citacoes`. A IA NUNCA escreve conteúdo novo nem inventa citação — só estrutura
  o que já está no texto (ver buildTrabalhoPrompt). Formatação ABNT (margem, numeração,
  export) é código à parte, determinístico — não é responsabilidade deste caso de uso.

  Mesma BLINDAGEM do buildStudy: resposta de IA pode vir torta, por isso valida em
  RUNTIME e re-tenta uma vez antes de desistir.
*/
import type { AIProvider } from './ports/AIProvider'
import type { Secao, Citacao } from '../domain/trabalho'
import { buildTrabalhoPrompt } from './prompts'
import { comoObjeto, comoLista, comoTexto, comoNumero } from './validacao'
import { IALimiteError, ehLimite } from './ports/aiErrors'

const MAX_TENTATIVAS = 2
const PAUSA_ENTRE_TENTATIVAS_MS = 1200
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// "low": a tarefa é ESTRUTURAR texto que o aluno já escreveu, nunca criar conteúdo —
// não há raciocínio complexo a fazer, então gastar esforço de reasoning só adiciona
// latência (era a causa da falha de entrega por processamento alto no Groq). O teto de
// tokens é generoso porque trabalhos acadêmicos (TCC) podem ter muitas seções longas —
// a resposta é o texto inteiro reescrito em JSON (secoes + citacoes), não um resumo.
const OPCOES_IA = { json: true, reasoningEffort: 'low' as const, maxCompletionTokens: 16000 }

export type EstruturaTrabalho = { secoes: Secao[]; citacoes: Citacao[] }

// `correcao`: presente a partir do 2º turno em diante — manda só o estado JÁ estruturado
// (não o texto colado original de novo) + a instrução do aluno. Economiza tokens e evita
// que a IA re-segmente do zero (podendo perder um ajuste manual anterior).
export async function buildTrabalho(
  textoColado: string,
  ai: AIProvider,
  correcao?: { estadoAtual: EstruturaTrabalho; instrucao: string },
): Promise<EstruturaTrabalho> {
  const prompt = buildTrabalhoPrompt(
    textoColado,
    correcao
      ? {
          estadoAtual: JSON.stringify({ secoes: correcao.estadoAtual.secoes, citacoes: correcao.estadoAtual.citacoes }),
          instrucao: correcao.instrucao,
        }
      : undefined,
  )

  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const resposta = await ai.generate(prompt, OPCOES_IA)
      const bruto = extrairJson(resposta)
      return validarEstrutura(bruto)
    } catch (e) {
      ultimoErro = e
      console.warn(`buildTrabalho: tentativa ${tentativa}/${MAX_TENTATIVAS} falhou:`, e)
      if (tentativa < MAX_TENTATIVAS) await dormir(PAUSA_ENTRE_TENTATIVAS_MS)
    }
  }

  if (ehLimite(ultimoErro)) throw new IALimiteError()
  throw new Error(
    'A IA não conseguiu estruturar esse texto. Tente de novo ou ajuste o texto colado.',
    { cause: ultimoErro },
  )
}

// Extrai o JSON da resposta (mesma lógica do buildStudy — modelos às vezes cercam o
// JSON com texto ou ```json; pegamos do primeiro "{" ao último "}").
function extrairJson(resposta: string): unknown {
  const inicio = resposta.indexOf('{')
  const fim = resposta.lastIndexOf('}')
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('a resposta não continha um JSON reconhecível')
  }
  return JSON.parse(resposta.slice(inicio, fim + 1))
}

// id só precisa ser único NESTA sessão de edição (não persiste entre estruturações) —
// chave de React/reconciliação do visualizer, nada mais.
let proximoId = 0
const gerarId = () => `secao-${Date.now()}-${proximoId++}`

// ===== Validação em RUNTIME =====

function validarEstrutura(valor: unknown): EstruturaTrabalho {
  const o = comoObjeto(valor, 'estrutura')
  const secoes = comoLista(o.secoes, 'secoes').map((s, i) => validarSecao(s, i))
  if (secoes.length === 0) throw new Error('estrutura sem seções')
  const citacoes = comoLista(o.citacoes ?? [], 'citacoes').map((c, i) => validarCitacao(c, i))
  return { secoes, citacoes }
}

function validarSecao(valor: unknown, ordem: number): Secao {
  const o = comoObjeto(valor, `secao ${ordem}`)
  const nivel = comoNumero(o.nivel, `secao ${ordem}.nivel`)
  if (nivel < 1 || nivel > 4) throw new Error(`secao ${ordem}.nivel fora do alcance (1 a 4)`)
  return {
    id: gerarId(),
    nivel: nivel as 1 | 2 | 3 | 4,
    titulo: comoTexto(o.titulo, `secao ${ordem}.titulo`),
    texto: comoTexto(o.texto, `secao ${ordem}.texto`),
    ordem,
  }
}

// BLINDAGEM: "ano" às vezes vem como número (2020) em vez de string — aceitamos os dois,
// igual ao comoNumero do validacao.ts faz na direção oposta.
function validarCitacao(valor: unknown, i: number): Citacao {
  const o = comoObjeto(valor, `citacao ${i}`)
  const ano = typeof o.ano === 'number' ? String(o.ano) : comoTexto(o.ano, `citacao ${i}.ano`)
  const titulo = typeof o.titulo === 'string' && o.titulo.trim() !== '' ? o.titulo : undefined
  const tiposValidos = ['livro', 'artigo', 'site', 'outro']
  const tipo = typeof o.tipo === 'string' && tiposValidos.includes(o.tipo) ? (o.tipo as Citacao['tipo']) : undefined
  return {
    autor: comoTexto(o.autor, `citacao ${i}.autor`),
    ano,
    titulo,
    tipo,
    completa: o.completa === true,
  }
}
