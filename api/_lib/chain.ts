/*
  SERVIDOR (api/_lib) — monta a CADEIA de IA do backend.

  Reaproveita o `fallbackProvider` do front (é código PURO — não sabe se roda no navegador
  ou no servidor; só recebe uma lista de providers e tenta um a um). DRY: a mesma regra de
  "tenta a nuvem na ordem, cai pro próximo se falhar" serve aos dois lados.

  Ordem: Gemini primeiro (free tier folgado, rápido), Groq depois (modelo forte de reserva).
  Só entra quem tem chave configurada. Se nenhum tiver chave, lança — e o endpoint responde
  um erro claro (melhor que silêncio).
*/
import type { AIProvider } from '../../src/application/ports/AIProvider'
import { fallbackProvider } from '../../src/infrastructure/ai/fallbackProvider'
import { geminiProvider, geminiConfigurado, groqProvider, groqConfigurado } from './providers'

export function cadeiaServidor(): AIProvider {
  const provedores: AIProvider[] = []
  if (geminiConfigurado) provedores.push(geminiProvider)
  if (groqConfigurado) provedores.push(groqProvider)
  if (provedores.length === 0) {
    throw new Error('Nenhum provedor de IA configurado no servidor (faltam GEMINI_API_KEY / GROQ_API_KEY).')
  }
  return fallbackProvider(provedores)
}
