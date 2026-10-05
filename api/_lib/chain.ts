/*
  SERVIDOR (api/_lib) — monta as CADEIAS de IA do backend.

  Reaproveita o `fallbackProvider` do front (é código PURO — não sabe se roda no navegador
  ou no servidor; só recebe uma lista de providers e tenta um a um). DRY: a mesma regra de
  "tenta a nuvem na ordem, cai pro próximo se falhar" serve aos dois lados.

  DUAS cadeias, propósitos diferentes:
  - cadeiaServidor(): usada por /api/generate (Estudar — aula/prova/correção). Gemini → Groq.
  - cadeiaChat(): usada por /api/stream (o CHAT). Cloudflare → Gemini → Groq — medido mais
    rápido no chat (TTFT < 0,4s contra 4-11s do Gemini em prompts médios/complexos; ver
    docs/Infraestrutura.md). Fica SEPARADA de propósito: assim o Estudar continua na cadeia
    de hoje (Groq reservado pra ele) e o chat ganha o provedor mais rápido sem competir
    pela mesma cota.
  Só entra quem tem chave configurada. Se nenhum tiver chave, lança — e o endpoint responde
  um erro claro (melhor que silêncio).
*/
import type { AIProvider } from '../../src/application/ports/AIProvider'
import { fallbackProvider } from '../../src/infrastructure/ai/fallbackProvider'
import {
  geminiProvider,
  geminiConfigurado,
  groqProvider,
  groqConfigurado,
  cloudflareProvider,
  cloudflareConfigurado,
} from './providers'

export function cadeiaServidor(): AIProvider {
  const provedores: AIProvider[] = []
  if (geminiConfigurado) provedores.push(geminiProvider)
  if (groqConfigurado) provedores.push(groqProvider)

  // ===== TERCEIRO ELO (rede de segurança) =====
  // Se Gemini e Groq estourarem o limite ao mesmo tempo, não há pra onde cair. Um 3º
  // provedor de OUTRA conta dá esse fôlego. Candidatos GRATUITOS ainda livres (precisam
  // de chave nova): OpenRouter (OPENROUTER_API_KEY), HuggingFace Inference (HF_TOKEN).
  // Ex.: if (openRouterConfigurado) provedores.push(openRouterProvider)

  if (provedores.length === 0) {
    throw new Error('Nenhum provedor de IA configurado no servidor (faltam GEMINI_API_KEY / GROQ_API_KEY).')
  }
  return fallbackProvider(provedores)
}

export function cadeiaChat(): AIProvider {
  const provedores: AIProvider[] = []
  if (cloudflareConfigurado) provedores.push(cloudflareProvider)
  if (geminiConfigurado) provedores.push(geminiProvider)
  if (groqConfigurado) provedores.push(groqProvider)

  if (provedores.length === 0) {
    throw new Error('Nenhum provedor de IA configurado no servidor (faltam CF_API_TOKEN / GEMINI_API_KEY / GROQ_API_KEY).')
  }
  return fallbackProvider(provedores)
}
