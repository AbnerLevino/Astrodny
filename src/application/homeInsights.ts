/*
  CASO DE USO (application) — gera os insights do Painel (título + 4
  sugestões) a partir de perfil + histórico de estudos.

  PURA e SEM IA: é texto de boas-vindas/atalho pra tela inicial, gerado a
  cada visita — não vale o custo (nem a latência) de uma chamada de IA pra
  isso. Heurística simples sobre dados que já temos localmente.
*/
import type { Perfil } from '../domain/perfil'
import type { StudySalvo } from '../domain/study'
import type { InsightsPainel, SugestoesPainel } from '../domain/painel'

function saudacao(hora: number): string {
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

// taxa de acerto de um estudo CONCLUÍDO (0 a 1)
function taxaAcerto(e: StudySalvo): number {
  if (!e.resultado || e.resultado.total === 0) return 1
  return e.resultado.acertos / e.resultado.total
}

// entre os N mais recentes, o de PIOR desempenho — candidato a sugestão de revisão
// (sessões em andamento, sem resultado ainda, não entram)
function piorDesempenhoRecente(estudos: StudySalvo[]): StudySalvo | null {
  const recentes = estudos.slice(0, 5).filter((e) => e.resultado && e.resultado.total > 0)
  if (recentes.length === 0) return null
  return recentes.reduce((pior, atual) => (taxaAcerto(atual) < taxaAcerto(pior) ? atual : pior))
}

export function gerarInsightsPainel(
  perfil: Perfil | null,
  estudos: StudySalvo[],
  agora: number = Date.now(),
): InsightsPainel {
  const primeiroNome = perfil?.nome?.split(' ')[0]
  const saud = saudacao(new Date(agora).getHours())
  const ultimo = estudos[0] ?? null

  const titulos: string[] = [primeiroNome ? `${saud}, ${primeiroNome}!` : `${saud}!`]
  if (ultimo) titulos.push(`Vamos continuar de onde parou em ${ultimo.estudo.nome}?`)
  if (perfil?.materias?.length) titulos.push(`Pronto pra avançar em ${perfil.materias[0]}?`)

  const pior = piorDesempenhoRecente(estudos)

  const sugestoes: SugestoesPainel = {
    novoChat: null,
    estudar: ultimo ? `Continue estudando ${ultimo.estudo.nome}` : null,
    trabalhos: null,
    provas: pior && taxaAcerto(pior) < 0.7 ? `Revise ${pior.estudo.nome}, onde você acertou menos` : null,
  }

  return { titulos, sugestoes }
}
