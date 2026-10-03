/*
  CASO DE USO (application) — corrige a prova.

  Recebe o estudo e as respostas do aluno (o índice da alternativa escolhida em
  cada questão) e devolve o resultado completo: nota, desempenho por bloco e a
  lista de erros. É uma função PURA — só números entram e saem, sem React e sem
  tela — então dá pra testar sozinha, sem clicar em nada.
*/
import type {
  Study,
  ResultadoProva,
  DesempenhoBloco,
  ErroProva,
} from '../domain/study'

export function gradeExam(estudo: Study, respostas: number[]): ResultadoProva {
  let acertos = 0
  const erros: ErroProva[] = []
  // acumula acertos/total por bloco: blocoIndex -> { acertos, total }
  const contagem = new Map<number, { acertos: number; total: number }>()

  estudo.prova.forEach((questao, i) => {
    // gradeExam corrige SÓ múltipla escolha (índice certo = correção exata). Estudo
    // discursivo tem o caso de uso próprio (IA). O guard também ESTREITA o tipo da
    // união: depois dele, o TS sabe que aqui existem `correta` e `alternativas`.
    if (questao.tipo !== 'multipla_escolha') return
    const escolha = respostas[i]
    const acertou = escolha === questao.correta
    if (acertou) acertos++

    // atualiza a contagem do bloco desta questão
    const atual = contagem.get(questao.blocoIndex) ?? { acertos: 0, total: 0 }
    atual.total++
    if (acertou) atual.acertos++
    contagem.set(questao.blocoIndex, atual)

    // guarda o erro (pra revisão / futura orientação da IA)
    if (!acertou) {
      erros.push({
        enunciado: questao.enunciado,
        suaResposta: questao.alternativas[escolha] ?? '(sem resposta)',
        respostaCerta: questao.alternativas[questao.correta],
        blocoIndex: questao.blocoIndex,
      })
    }
  })

  // um item por bloco do estudo (mesmo os que não tiveram questão na prova)
  const porBloco: DesempenhoBloco[] = estudo.blocos.map((bloco, indice) => {
    const c = contagem.get(indice) ?? { acertos: 0, total: 0 }
    return { blocoIndex: indice, titulo: bloco.titulo, acertos: c.acertos, total: c.total }
  })

  return { acertos, total: estudo.prova.length, porBloco, erros }
}
