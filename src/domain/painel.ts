/*
  DOMÍNIO — tipos puros do Painel (a tela inicial com título rotativo + os 4
  atalhos). Não importa nada de fora (nem React, nem IA).
*/

// uma sugestão contextual por atalho — null quando não há sinal suficiente
// (usuário novo, pouco histórico): a tela cai pro texto genérico fixo.
export type SugestoesPainel = {
  novoChat: string | null
  estudar: string | null
  trabalhos: string | null
  provas: string | null
}

// o que o motor de insight devolve: títulos (pra variar, ver Painel.tsx) + as
// 4 sugestões.
export type InsightsPainel = {
  titulos: string[]
  sugestoes: SugestoesPainel
}

// o que fica cacheado (localStorage): os insights + QUANDO foram gerados —
// usado pra decidir se o cache ainda vale (ver application/homeInsightsCache).
export type PainelCache = {
  geradoEm: string // data ISO
  insights: InsightsPainel
}
