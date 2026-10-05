/*
  INFRAESTRUTURA — cliente único do Supabase (auth + banco).

  Lido das variáveis de ambiente (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
  Ainda não configuradas (.env.local vazio)? `supabase` fica null e o app
  continua funcionando 100% anônimo — só o login por Google fica indisponível
  até as variáveis existirem.
*/
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = url && anonKey ? createClient(url, anonKey) : null
