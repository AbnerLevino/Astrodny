/*
  CASO DE USO (application) — métricas da tela Sessões de Estudos.

  PURAS e SEM IA: agregações simples sobre o histórico de StudySalvo já
  salvo. Cada função devolve null quando não há dado suficiente — a UI só
  renderiza o card quando o valor existe (ver ui/screens/SessoesEstudo.tsx),
  pra tela ficar dinâmica em vez de forçar número sem sinal de verdade.
*/
import type { StudySalvo } from '../domain/study'

function concluidos(estudos: StudySalvo[]): StudySalvo[] {
  return estudos.filter((e) => e.resultado !== null)
}

function taxaAcerto(e: StudySalvo): number {
  const r = e.resultado!
  return r.total > 0 ? r.acertos / r.total : 0
}

export type Tendencia = {
  materia: string
  direcao: 'subindo' | 'caindo' | 'estavel'
  atual: number // taxa de acerto (0 a 1) da sessão concluída mais recente
  anterior: number
}

// Compara as 2 sessões concluídas mais recentes DA MESMA matéria (a matéria da
// sessão concluída mais recente entre todas). Só existe com >= 2 sessões
// concluídas naquela matéria — uma sessão sozinha não tem "tendência".
export function tendenciaRecente(estudos: StudySalvo[]): Tendencia | null {
  const feitos = concluidos(estudos).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  if (feitos.length === 0) return null

  const materia = feitos[0].materia
  const daMateria = feitos.filter((e) => e.materia === materia)
  if (daMateria.length < 2) return null

  const [atual, anterior] = daMateria
  const taxaAtual = taxaAcerto(atual)
  const taxaAnterior = taxaAcerto(anterior)
  const diff = taxaAtual - taxaAnterior

  return {
    materia,
    direcao: diff > 0.05 ? 'subindo' : diff < -0.05 ? 'caindo' : 'estavel',
    atual: taxaAtual,
    anterior: taxaAnterior,
  }
}

export type BlocoFraco = {
  titulo: string
  erros: number
}

// bloco (tópico) mais errado, somando entre TODAS as sessões concluídas.
// `ErroProva` guarda só o `blocoIndex`; o título vem do `estudo.blocos` de
// cada sessão (cada uma tem o seu próprio array de blocos).
export function blocoMaisFraco(estudos: StudySalvo[]): BlocoFraco | null {
  const contagem = new Map<string, number>()

  for (const e of concluidos(estudos)) {
    for (const erro of e.resultado!.erros) {
      const titulo = e.estudo.blocos[erro.blocoIndex]?.titulo ?? erro.enunciado.slice(0, 40)
      contagem.set(titulo, (contagem.get(titulo) ?? 0) + 1)
    }
  }

  if (contagem.size === 0) return null
  const [titulo, erros] = [...contagem.entries()].reduce((maior, atual) => (atual[1] > maior[1] ? atual : maior))
  return { titulo, erros }
}

export type Frequencia = {
  totalSessoes: number
  diasConsecutivos: number // streak contando pra trás a partir do estudo mais recente
}

// nº de sessões (qualquer matéria, concluídas ou em andamento) + streak de
// dias consecutivos estudando.
export function frequenciaEstudo(estudos: StudySalvo[]): Frequencia | null {
  if (estudos.length === 0) return null

  const dias = [...new Set(estudos.map((e) => new Date(e.data).toISOString().slice(0, 10)))]
    .sort()
    .reverse()

  let streak = 1
  for (let k = 1; k < dias.length; k++) {
    const diaAtual = new Date(dias[k - 1]).getTime()
    const diaAnterior = new Date(dias[k]).getTime()
    const diffDias = Math.round((diaAtual - diaAnterior) / 86_400_000)
    if (diffDias === 1) streak++
    else break
  }

  return { totalSessoes: estudos.length, diasConsecutivos: streak }
}
