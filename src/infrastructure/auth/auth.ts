/*
  INFRAESTRUTURA — entrar/sair da conta via Supabase Auth (Google OAuth).

  Não sabe de React (isso é do ui/auth.tsx, que escuta a sessão mudar). Se o
  Supabase ainda não estiver configurado, falha em silêncio no logout e avisa
  no login — não existe sessão pra fechar nem provedor pra abrir.
*/
import { supabase } from './supabaseClient'

export async function entrarComGoogle(): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado ainda (faltam as variáveis em .env.local)')
  await supabase.auth.signInWithOAuth({ provider: 'google' })
}

export async function sairDaConta(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}
