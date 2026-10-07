/*
  SERVIDOR (api/_lib) — decide qual "instrução de sistema" usar, a partir de campos
  ESTRUTURADOS (modo/personalidade/perfil/contexto), nunca de texto livre vindo do
  cliente. É a peça que fecha a brecha de "o cliente manda o system prompt pronto":
  aqui ele só pode ESCOLHER entre opções fixas — o TEXTO em si é sempre montado aqui.
*/
import { systemPromptTutor, systemPromptMiniAulaPdf, systemPromptEstudoContexto } from '../../src/application/prompts'
import type { ModoChat } from '../../src/application/ports/AIProvider'
import type { Personalidade } from '../../src/domain/settings'
import type { Perfil } from '../../src/domain/perfil'
import type { ContextoEstudo } from '../../src/domain/studyChat'

function personalidadeValida(p: unknown): p is Personalidade {
  return p === 'formal' || p === 'descontraido'
}

export function montarSystemPrompt(
  modo: unknown,
  personalidadeBruta: unknown,
  perfil?: Perfil,
  contextoEstudo?: ContextoEstudo,
): string {
  const personalidade: Personalidade = personalidadeValida(personalidadeBruta) ? personalidadeBruta : 'formal'
  const modoChat = modo as ModoChat

  if (modoChat === 'estudo' && contextoEstudo) {
    return systemPromptEstudoContexto(contextoEstudo, personalidade)
  }
  if (modoChat === 'mini_aula') {
    return systemPromptMiniAulaPdf(personalidade, perfil)
  }
  return systemPromptTutor(personalidade, perfil)
}
