/*
  CASO DE USO (application) — a narração do estudo recém-montado.

  Depois que o estudo já está pronto, a IA conta em 1ª pessoa o que preparou (os
  tópicos, as perguntas, a prova, o foco pedido). É puro enfeite de UX: dá ao aluno
  a sensação de ver a IA "estruturando" o material. Narra o RESULTADO real (recebe o
  Study já montado) — então nunca mente sobre o que foi feito.

  Devolve a resposta em stream (AsyncIterable<string>), a MESMA forma do chat/studyChat,
  então o frontend pluga com o mesmo `for await`. Fala só pela porta AIProvider.

  Custo baixo de propósito: o prompt leva só os TÍTULOS já prontos (curtos) + o pedido
  do aluno — nunca o material inteiro. Em dev isso roda no modelo pequeno local; em prod,
  pelo proxy (idealmente roteado pro modelo pequeno no servidor).
*/
import type { AIProvider } from './ports/AIProvider'
import type { Study } from '../domain/study'
import type { Personalidade } from '../domain/settings'
import { narrarEstudoPrompt } from './prompts'

export function narrarEstudo(
  estudo: Study,
  contexto: string,
  ia: AIProvider,
  personalidade: Personalidade,
): AsyncIterable<string> {
  // modo 'narracao': sem persona de tutor por cima — o prompt já é a instrução inteira,
  // auto-contida (ver prompts.ts/narrarEstudoPrompt), igual era antes do servidor passar
  // a reconstruir um `system` por padrão pra toda chamada de stream (Task 3 do hardening).
  return ia.generateStream(narrarEstudoPrompt(estudo, contexto, personalidade), { modo: 'narracao', personalidade })
}
