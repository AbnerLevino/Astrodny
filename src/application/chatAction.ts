/*
  CASO DE USO (application) — o "botão de ação" do chat (Fase 2).

  A IA, quando identifica que o aluno quer estudar algo e já pediu permissão,
  emite um marcador de texto no formato [acao: abrir_estudar | tema: X] no
  meio da resposta. Esta peça pura PARSEIA esse marcador: separa o texto
  "normal" (pra mostrar) do botão que a tela deve desenhar no lugar dele.
*/
export type Acao = {
  tipo: 'abrir_estudar'
  tema: string
}

export type TextoComAcao = {
  // o texto da mensagem SEM o marcador (o que deve ser renderizado como texto)
  texto: string
  // a ação encontrada, se houver
  acao: Acao | null
}

const REGEX_ACAO = /\[acao:\s*abrir_estudar\s*\|\s*tema:\s*([^\]]+)\]/i

export function extrairAcao(textoCompleto: string): TextoComAcao {
  const match = textoCompleto.match(REGEX_ACAO)
  if (!match) return { texto: textoCompleto, acao: null }

  const tema = match[1].trim()
  const texto = textoCompleto.replace(match[0], '').trim()
  return { texto, acao: { tipo: 'abrir_estudar', tema } }
}
