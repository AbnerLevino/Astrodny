/*
  INFRAESTRUTURA — lê/grava o perfil na nuvem (tabela `perfis`, Supabase).

  `vincularContaAnonima` roda no primeiro login (SIGNED_IN) e só grava o nome
  (o que já vem do Google, sem precisar perguntar nada). `buscarPerfil` carrega
  o que já foi salvo (curso/nível/matérias do onboarding ou de uma edição
  anterior). `salvarPerfil` é o upsert completo, usado pelo onboarding e pela
  tela de edição de perfil.

  Linha de colunas (SQL pra rodar uma vez no Supabase, ver docs/Infraestrutura.md):
    create table perfis (
      user_id uuid primary key references auth.users(id) on delete cascade,
      nome text not null,
      curso text,
      nivel text,
      materias text[],
      updated_at timestamptz not null default now()
    );
*/
import { supabase } from './supabaseClient'
import type { Perfil } from '../../domain/perfil'

type LinhaPerfil = {
  user_id: string
  nome: string
  curso: string | null
  nivel: string | null
  materias: string[] | null
}

function paraPerfil(linha: LinhaPerfil): Perfil {
  return {
    nome: linha.nome,
    curso: linha.curso ?? undefined,
    nivel: (linha.nivel as Perfil['nivel']) ?? undefined,
    materias: linha.materias && linha.materias.length > 0 ? linha.materias : undefined,
  }
}

export async function vincularContaAnonima(userId: string, nome: string): Promise<void> {
  if (!supabase) return

  const { error } = await supabase.from('perfis').upsert({ user_id: userId, nome }, { onConflict: 'user_id' })

  if (error) {
    console.warn('[perfil] ainda não deu pra salvar na nuvem (tabela `perfis` pendente?):', error.message)
  }
}

// Carrega o perfil salvo. null = ainda não existe linha (conta nova) OU
// Supabase não configurado — os dois casos o onboarding trata igual (pede os dados).
export async function buscarPerfil(userId: string): Promise<Perfil | null> {
  if (!supabase) return null

  const { data, error } = await supabase.from('perfis').select('user_id, nome, curso, nivel, materias').eq('user_id', userId).maybeSingle()

  if (error) {
    console.warn('[perfil] não deu pra carregar o perfil da nuvem:', error.message)
    return null
  }
  return data ? paraPerfil(data as LinhaPerfil) : null
}

// Upsert completo — usado no onboarding (1ª vez) e na edição manual (Sidebar > Perfil).
export async function salvarPerfil(userId: string, perfil: Perfil): Promise<void> {
  if (!supabase) return

  const { error } = await supabase.from('perfis').upsert(
    {
      user_id: userId,
      nome: perfil.nome,
      curso: perfil.curso ?? null,
      nivel: perfil.nivel ?? null,
      materias: perfil.materias ?? null,
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    console.warn('[perfil] não deu pra salvar o perfil na nuvem:', error.message)
  }
}
