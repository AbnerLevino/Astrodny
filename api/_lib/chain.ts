/*
  SERVIDOR (api/_lib) — monta as CADEIAS de IA do backend.

  Reaproveita o `fallbackProvider` do front (é código PURO — não sabe se roda no navegador
  ou no servidor; só recebe uma lista de providers e tenta um a um). DRY: a mesma regra de
  "tenta a nuvem na ordem, cai pro próximo se falhar" serve aos dois lados.

  DUAS cadeias, propósitos diferentes:
  - cadeiaServidor(): usada por /api/generate (Estudar — aula/prova/correção). Gemini → Groq
    (gpt-oss-120b — modelo forte, cota própria, nunca compartilhada com o chat).
  - cadeiaChat(): usada por /api/stream (o CHAT). Gemini → Groq (llama-3.1-8b-instant,
    PROVIDER DIFERENTE do usado no Estudar — cota própria) → OpenRouter → Cloudflare.

    HISTÓRICO (2026-10): a ordem ERA Cloudflare → OpenRouter → Gemini → Groq, escolhida pela
    latência (TTFT < 0,4s contra 4-11s do Gemini — ver docs/Infraestrutura.md). Na prática isso
    pôs na FRENTE o provedor de pior qualidade de resposta (Cloudflare Workers AI, modelo
    quantizado) — a maioria das mensagens do chat respondia com o pior modelo, não com um
    fallback de emergência. Reordenado pra priorizar QUALIDADE: Gemini primeiro (modelo de
    produção do Google, cota real quando o `GEMINI_MODEL` certo está configurado — ver
    providers.ts), Groq 8b-instant como 2º elo RÁPIDO e ainda assim decente, Cloudflare
    empurrado pro ÚLTIMO degrau (só emergência de emergência, não removido).
  Só entra quem tem chave configurada. Se nenhum tiver chave, lança — e o endpoint responde
  um erro claro (melhor que silêncio).
*/
import type { AIProvider } from '../../src/application/ports/AIProvider'
import { fallbackProvider } from '../../src/infrastructure/ai/fallbackProvider'
import {
  geminiProvider,
  geminiConfigurado,
  groqProvider,
  groqRapidoProvider,
  groqConfigurado,
  cloudflareProvider,
  cloudflareConfigurado,
  openrouterProvider,
  openrouterConfigurado,
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
  if (geminiConfigurado) provedores.push(geminiProvider)
  if (groqConfigurado) provedores.push(groqRapidoProvider)
  if (openrouterConfigurado) provedores.push(openrouterProvider)
  if (cloudflareConfigurado) provedores.push(cloudflareProvider)

  if (provedores.length === 0) {
    throw new Error(
      'Nenhum provedor de IA configurado no servidor (faltam CF_API_TOKEN / OPENROUTER_API_KEY / GEMINI_API_KEY / GROQ_API_KEY).',
    )
  }
  return fallbackProvider(provedores)
}
