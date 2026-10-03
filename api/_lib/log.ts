/*
  SERVIDOR (api/_lib) — grava um evento ANÔNIMO no Supabase (tabela astrocore_dataset).

  Usa a REST API do Supabase (PostgREST) via fetch — sem adicionar biblioteca. A chave usada
  é a SERVICE KEY (poder de escrita), que vive SÓ no servidor (process.env), nunca no cliente.

  REGRA DE OURO: logar é "best-effort". Se a gravação falhar (Supabase fora, pausado, etc.),
  a gente NÃO derruba a resposta do aluno — engole o erro e segue. O estudo é mais importante
  que a coleta. E os dados são anônimos: só o par (entrada → saída) + um id de dispositivo
  aleatório, sem nome, sem e-mail, sem nada que identifique a pessoa.
*/
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

export type TipoEvento = 'study_session' | 'correction' | 'chat'

export type Evento = {
  type: TipoEvento
  subject?: string
  input?: string
  output?: string
  device_anon: string
}

export async function registrarEvento(ev: Evento): Promise<void> {
  // sem configuração de Supabase: silenciosamente não loga (ex.: rodando local sem as vars)
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/astrocore_dataset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=minimal', // não precisamos do registro de volta
      },
      body: JSON.stringify({
        type: ev.type,
        subject: ev.subject ?? null,
        input: ev.input ?? null,
        output: ev.output ?? null,
        device_anon: ev.device_anon,
      }),
    })
  } catch (e) {
    // best-effort: nunca propaga — a coleta não pode atrapalhar o uso
    console.error('registrarEvento falhou (ignorado):', e)
  }
}
