/*
  INFRAESTRUTURA (infrastructure/ai) — o lado CLIENTE da verificação de chave BYOK.

  PROD: pergunta ao nosso /api/validar-chave (a CSP não deixa o navegador falar com
  Groq/Gemini direto). DEV: Vite não serve api/*, então consulta o provedor direto — a
  mesma lógica, reaproveitada de api/_lib/validarChave.ts (é código puro, só fetch).
*/
import { validarChave as validarDireto, type Provedor, type ResultadoValidacao } from '../../../api/_lib/validarChave'

export type { Provedor, ResultadoValidacao }

export async function validarChave(provedor: Provedor, chave: string): Promise<ResultadoValidacao> {
  if (!import.meta.env.PROD) return validarDireto(provedor, chave)
  try {
    const r = await fetch('/api/validar-chave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provedor, chave }),
    })
    if (!r.ok) return 'erro'
    const d = (await r.json()) as { resultado?: ResultadoValidacao }
    return d.resultado ?? 'erro'
  } catch {
    return 'erro'
  }
}
