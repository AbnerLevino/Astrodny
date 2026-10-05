/*
  CASO DE USO (application) — gera os insights do Painel (título + 4
  sugestões) a partir de perfil + estudos + amostra de chats recentes.

  Mesmo padrão do buildStudy: monta o prompt, pede JSON pra porta AIProvider,
  valida em runtime (um modelo pode errar a forma) e RE-TENTA uma vez antes
  de desistir.
*/
import type { AIProvider } from './ports/AIProvider'
import type { Perfil } from '../domain/perfil'
import type { StudySalvo } from '../domain/study'
import type { InsightsPainel, SugestoesPainel } from '../domain/painel'
import { montarPromptPainel } from './prompts'
import { comoObjeto, comoLista, comoTexto, comoTextoOuNull } from './validacao'
import { IALimiteError, ehLimite } from './ports/aiErrors'

const MAX_TENTATIVAS = 2
const PAUSA_ENTRE_TENTATIVAS_MS = 600
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function gerarInsightsPainel(
  perfil: Perfil | null,
  estudos: StudySalvo[],
  mensagensAbertura: string[],
  ai: AIProvider,
): Promise<InsightsPainel> {
  const prompt = montarPromptPainel(perfil, estudos, mensagensAbertura)

  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const resposta = await ai.generate(prompt, { json: true })
      const bruto = extrairJson(resposta)
      return validarInsights(bruto)
    } catch (e) {
      ultimoErro = e
      console.warn(`gerarInsightsPainel: tentativa ${tentativa}/${MAX_TENTATIVAS} falhou:`, e)
      if (tentativa < MAX_TENTATIVAS) await dormir(PAUSA_ENTRE_TENTATIVAS_MS)
    }
  }

  if (ehLimite(ultimoErro)) throw new IALimiteError()
  throw new Error('Não consegui gerar as sugestões do Painel agora.', { cause: ultimoErro })
}

function extrairJson(resposta: string): unknown {
  const inicio = resposta.indexOf('{')
  const fim = resposta.lastIndexOf('}')
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('a resposta não continha um JSON reconhecível')
  }
  return JSON.parse(resposta.slice(inicio, fim + 1))
}

function validarInsights(valor: unknown): InsightsPainel {
  const o = comoObjeto(valor, 'insights')
  const titulos = comoLista(o.titulos, 'titulos').map((t, i) => comoTexto(t, `titulos[${i}]`))
  if (titulos.length === 0) throw new Error('insights sem nenhum título')

  const s = comoObjeto(o.sugestoes, 'sugestoes')
  const sugestoes: SugestoesPainel = {
    novoChat: comoTextoOuNull(s.novoChat),
    estudar: comoTextoOuNull(s.estudar),
    trabalhos: comoTextoOuNull(s.trabalhos),
    provas: comoTextoOuNull(s.provas),
  }

  return { titulos, sugestoes }
}
