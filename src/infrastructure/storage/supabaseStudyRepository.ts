/*
  INFRAESTRUTURA (infrastructure/storage) — adaptador da porta StudyRepository
  que guarda os estudos feitos na nuvem (tabela `estudos`, Supabase), usado só
  por quem está logado (ver ui/studies.tsx, que escolhe este repo OU o
  localStorageStudyRepository conforme `usuario`).

  Fábrica (recebe o userId) em vez de objeto fixo — mesmo padrão de
  infrastructure/auth/perfilRepository — porque cada upsert precisa saber de
  quem é a linha (RLS da tabela exige `auth.uid() = user_id`).
*/
import { supabase } from '../auth/supabaseClient'
import type { StudyRepository } from '../../application/ports/StudyRepository'
import type { StudySalvo } from '../../domain/study'

type LinhaEstudo = {
  id: string
  materia: string
  data: string
  origem: string | null
  estudo: StudySalvo['estudo']
  resultado: StudySalvo['resultado']
  progresso: StudySalvo['progresso']
}

function paraStudySalvo(linha: LinhaEstudo): StudySalvo {
  return {
    id: linha.id,
    data: linha.data,
    origem: linha.origem ?? '',
    materia: linha.materia,
    estudo: linha.estudo,
    resultado: linha.resultado,
    progresso: linha.progresso,
  }
}

export function supabaseStudyRepository(userId: string): StudyRepository {
  return {
    async listar(): Promise<StudySalvo[]> {
      if (!supabase) return []

      const { data, error } = await supabase
        .from('estudos')
        .select('id, materia, data, origem, estudo, resultado, progresso')
        .eq('user_id', userId)
        .order('data', { ascending: false })

      if (error) {
        console.warn('[estudos] não deu pra carregar os estudos da nuvem:', error.message)
        return []
      }
      return (data as LinhaEstudo[]).map(paraStudySalvo)
    },

    async salvar(estudo: StudySalvo): Promise<void> {
      if (!supabase) return

      const { error } = await supabase.from('estudos').upsert(
        {
          id: estudo.id,
          user_id: userId,
          materia: estudo.materia,
          data: estudo.data,
          origem: estudo.origem || null,
          estudo: estudo.estudo,
          resultado: estudo.resultado,
          progresso: estudo.progresso,
        },
        { onConflict: 'id' },
      )

      if (error) {
        console.warn('[estudos] não deu pra salvar o estudo na nuvem:', error.message)
      }
    },
  }
}
