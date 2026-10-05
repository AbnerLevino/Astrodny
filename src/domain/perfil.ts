/*
  DOMÍNIO — o perfil da pessoa quando logada (Google). Tipos puros, sem React
  nem Supabase. Pra quem usa anônimo, simplesmente não existe (undefined) e o
  tutor não recebe nada extra no prompt.
*/
export type Nivel = 'iniciante' | 'intermediario' | 'avancado'

export type Perfil = {
  nome: string
  curso?: string
  nivel?: Nivel
  // o que o aluno está estudando AGORA, em texto livre (ex.: "Estrutura de
  // Dados", "Power Query"). Dá pro tutor citar a matéria certa sem o aluno
  // ter que digitar isso de novo em cada chat.
  materias?: string[]
}

// Perfil "completo" pra decidir se pede o onboarding: só exige o CURSO (o
// resto é enriquecimento opcional). null cobre quem ainda não logou/perfil
// não carregou.
export function perfilCompleto(perfil: Perfil | null): boolean {
  return !!perfil?.curso
}
