/*
  INFRAESTRUTURA — entrar/sair da conta via Supabase Auth (Google OAuth).

  Não sabe de React (isso é do ui/auth.tsx, que escuta a sessão mudar). Se o
  Supabase ainda não estiver configurado, falha em silêncio no logout e avisa
  no login — não existe sessão pra fechar nem provedor pra abrir.
*/
import { supabase } from './supabaseClient'

export async function entrarComGoogle(): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado ainda (faltam as variáveis em .env.local)')
  // redirectTo explícito: sem isso, o Supabase usa a "Site URL" configurada no
  // painel (Authentication → URL Configuration) — em preview/localhost isso
  // manda de volta pro domínio de produção em vez da aba atual. Forçando a
  // origem atual, funciona igual em qualquer ambiente (desde que a origem
  // esteja na lista de Redirect URLs permitidas do projeto Supabase).
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function sairDaConta(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}
