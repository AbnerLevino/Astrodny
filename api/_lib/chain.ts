/*
  SERVIDOR (api/_lib) — monta as CADEIAS de IA do backend.

  BYOK: cada chamada já vem com a chave da PRÓPRIA pessoa (validada nos endpoints antes
  de chegar aqui) — não há mais "configurado no servidor" nem fallback entre provedores
  (cada funcionalidade usa só o provedor dela, com a chave de quem está chamando).

  cadeiaServidor(): usada por /api/generate (Estudar — aula/prova/correção). Groq.
  cadeiaChat():     usada por /api/stream (o CHAT). Gemini.
*/
import type { AIProvider } from '../../src/application/ports/AIProvider'
import { groqProvider, geminiProvider } from './providers'

export function cadeiaServidor(chaveGroq: string): AIProvider {
  return groqProvider(chaveGroq)
}

export function cadeiaChat(chaveGemini: string): AIProvider {
  return geminiProvider(chaveGemini)
}
