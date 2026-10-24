/*
  CASO DE USO (application) — montar a PROVA do estudo (ESTÁGIO 2).

  Recebe a aula já pronta (os blocos do estágio 1) e monta a prova a partir dela.
  Delegado a um modelo FORTE (ex.: Groq) porque é exatamente onde o modelo pequeno
  local falhava: num schema grande, ele "esquecia" a prova no fim e derrubava o estudo
  inteiro. Separando, a prova vira responsabilidade de quem a monta bem.

  Não sabe se a IA é Groq, Gemini ou mock — fala só pela porta AIProvider.

  FALLBACK (nunca travar): se a IA falhar — sem chave, offline (ex.: faculdade sem
  internet), limite estourado ou schema torto após os retries — a prova é DERIVADA dos
  próprios blocos (reusa a pergunta de fixação de cada um). O estudo NUNCA mais trava
  por causa da prova; no pior caso, ela fica menos original, mas existe.
*/
import type { AIProvider } from './ports/AIProvider'
import type { Study, ProvaQuestion } from '../domain/study'
import { buildExamPrompt } from './prompts'
import { comoObjeto, comoLista, validarProvaQuestion } from './validacao'

// A 1ª tentativa + 1 retry (geração de LLM é aleatória; a próxima costuma vir ok).
const MAX_TENTATIVAS = 2

// Monta a prova. `ai` pode ser null (ex.: Groq sem chave configurada) — aí vai direto
// pro plano B. NUNCA lança: devolve sempre uma prova (da IA ou derivada dos blocos).
export async function buildExam(estudo: Study, ai: AIProvider | null): Promise<ProvaQuestion[]> {
  if (ai) {
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        const resposta = await ai.generate(buildExamPrompt(estudo), { json: true })
        const prova = interpretarProva(resposta, estudo)
        if (prova.length === 0) throw new Error('prova vazia')
        return prova
      } catch (e) {
        console.warn(`buildExam: tentativa ${tentativa}/${MAX_TENTATIVAS} falhou:`, e)
      }
    }
  }

  // PLANO B: deriva a prova dos blocos (determinístico, local, sem rede — não falha).
  console.warn('buildExam: usando a prova derivada dos blocos (fallback).')
  return derivarProvaDosBlocos(estudo)
}

// texto da IA -> ProvaQuestion[] validadas (lança se o JSON/forma não baterem -> retry).
function interpretarProva(resposta: string, estudo: Study): ProvaQuestion[] {
  const bruto = extrairJson(resposta)
  const o = comoObjeto(bruto, 'resposta')
  const lista = comoLista(o.prova, 'prova')
  return lista.map((q, i) => validarProvaQuestion(q, i, estudo.blocos.length, estudo.formato))
}

// PLANO B: cada bloco já tem 1 pergunta (de fixação) válida — reusamos como questão da
// prova, carimbando o blocoIndex. Garante uma prova coerente com a aula, sem rede nem IA.
function derivarProvaDosBlocos(estudo: Study): ProvaQuestion[] {
  return estudo.blocos.map((bloco, i) => ({ ...bloco.pergunta, blocoIndex: i }))
}

// Igual ao do buildStudy: pega do primeiro "{" ao último "}". JSON.parse lança se torto.
function extrairJson(resposta: string): unknown {
  const inicio = resposta.indexOf('{')
  const fim = resposta.lastIndexOf('}')
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('a resposta não continha um JSON reconhecível')
  }
  return JSON.parse(resposta.slice(inicio, fim + 1))
}
