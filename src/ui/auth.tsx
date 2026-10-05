/*
  Estado global de autenticação — Context do React.

  RESPONSABILIDADE ÚNICA: saber se tem alguém logado (Google, via Supabase) e
  expor entrar/sair. Mesmo padrão de SettingsProvider/ChatsProvider.

  No primeiro login (evento SIGNED_IN), tenta vincular a conta ao perfil na
  nuvem — ver infrastructure/auth/perfilRepository (vincularContaAnonima).
*/
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../infrastructure/auth/supabaseClient'
import { entrarComGoogle, sairDaConta } from '../infrastructure/auth/auth'
import { vincularContaAnonima, buscarPerfil, salvarPerfil as salvarPerfilNaNuvem } from '../infrastructure/auth/perfilRepository'
import { perfilCompleto, type Perfil } from '../domain/perfil'

export type Usuario = {
  id: string
  nome: string
  email: string | null
}

type AuthContexto = {
  usuario: Usuario | null
  // perfil pronto pra injetar no prompt do tutor — null pra quem usa anônimo.
  perfil: Perfil | null
  // true quando está logado mas ainda não preencheu curso (onboarding deve abrir).
  onboardingPendente: boolean
  carregando: boolean
  entrar: () => Promise<void>
  sair: () => Promise<void>
  // grava curso/nível/matérias (onboarding e edição manual via Sidebar > Perfil).
  salvarPerfil: (dados: Perfil) => Promise<void>
}

const Contexto = createContext<AuthContexto | null>(null)

function paraUsuario(u: User): Usuario {
  const nome = (u.user_metadata?.full_name as string | undefined) ?? u.email ?? 'Aluno'
  return { id: u.id, nome, email: u.email ?? null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  // Carrega o que já foi salvo na nuvem (curso/nível/matérias). Se não houver
  // nada ainda (conta nova), o perfil fica só com o nome — perfilCompleto()
  // vê a falta do curso e o onboarding abre.
  async function carregarPerfil(u: Usuario) {
    const salvo = await buscarPerfil(u.id)
    setPerfil(salvo ? { ...salvo, nome: u.nome } : { nome: u.nome })
  }

  useEffect(() => {
    if (!supabase) {
      setCarregando(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        const u = paraUsuario(data.session.user)
        setUsuario(u)
        carregarPerfil(u)
      }
      setCarregando(false)
    })

    const { data: assinatura } = supabase.auth.onAuthStateChange((evento, session) => {
      if (session?.user) {
        const u = paraUsuario(session.user)
        setUsuario(u)
        if (evento === 'SIGNED_IN') {
          vincularContaAnonima(session.user.id, u.nome)
          carregarPerfil(u)
        }
      } else {
        setUsuario(null)
        setPerfil(null)
      }
    })

    return () => assinatura.subscription.unsubscribe()
  }, [])

  async function salvarPerfilContexto(dados: Perfil) {
    setPerfil(dados) // otimista: a tela não espera a nuvem pra refletir
    if (usuario) await salvarPerfilNaNuvem(usuario.id, dados)
  }

  const onboardingPendente = !!usuario && !perfilCompleto(perfil)

  return (
    <Contexto.Provider
      value={{
        usuario,
        perfil,
        onboardingPendente,
        carregando,
        entrar: entrarComGoogle,
        sair: sairDaConta,
        salvarPerfil: salvarPerfilContexto,
      }}
    >
      {children}
    </Contexto.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
