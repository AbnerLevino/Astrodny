/*
  SERVIDOR (api/_lib) — verifica se uma chave BYOK é ACEITA pelo provedor, sem gastar
  tokens: consulta a lista de modelos (GET), que exige autenticação mas não gera texto.

  Resultado em três estados, de propósito:
    'valida'   → o provedor aceitou (200)
    'invalida' → o provedor RECUSOU a chave (401/403, ou 400 API_KEY_INVALID no Gemini)
    'erro'     → não deu pra saber (provedor fora, 5xx, rede) — a UI NÃO deve marcar como
                 inválida nesse caso, só pedir pra tentar de novo.
  `fetchFn` é injetável pra testar sem rede.
*/
export type Provedor = 'groq' | 'gemini'
export type ResultadoValidacao = 'valida' | 'invalida' | 'erro'

const URL_GROQ = 'https://api.groq.com/openai/v1/models'
const URL_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1'

export async function validarChave(
  provedor: Provedor,
  chave: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResultadoValidacao> {
  const requisicao =
    provedor === 'groq'
      ? fetchFn(URL_GROQ, { headers: { Authorization: `Bearer ${chave}` } })
      : fetchFn(URL_GEMINI, { headers: { 'x-goog-api-key': chave } })
  let r: Response
  try {
    r = await requisicao
  } catch {
    return 'erro'
  }
  if (r.ok) return 'valida'
  if (r.status === 401 || r.status === 403) return 'invalida'
  if (provedor === 'gemini' && r.status === 400) {
    // Gemini devolve 400 INVALID_ARGUMENT + reason API_KEY_INVALID pra chave malformada
    const texto = await r.text().catch(() => '')
    if (texto.includes('API_KEY_INVALID') || texto.includes('API key not valid')) return 'invalida'
  }
  return 'erro'
}
