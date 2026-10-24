/*
  CASO DE USO (application) — a conversa contextual DURANTE o estudo.

  É o gêmeo do `application/chat.ts`, mas ciente do estudo: em vez de só o histórico,
  recebe também o `ContextoEstudo` (qual estudo, qual bloco, o que já foi respondido…)
  e o injeta no prompt. Devolve a resposta em stream — a MESMA forma que o chat já usa
  (`AsyncIterable<string>`), então o frontend existente pluga com o mesmo `for await`.

  Não sabe o que é uma <div>, nem se a IA é mock ou Groq (fala só pela porta). E,
  importante: NÃO mexe no progresso do estudo — só responde. Avançar bloco, responder
  questão etc. continua sendo responsabilidade do fluxo de estudo atual (intacto).
*/
import type { AIProvider } from './ports/AIProvider'
import type { Mensagem } from '../domain/chat'
import type { Personalidade } from '../domain/settings'
import type { Study } from '../domain/study'
import type { ContextoEstudo, ProgressoEstudo } from '../domain/studyChat'
import { montarMensagensEstudo } from './prompts'

// Responde a uma dúvida do aluno DENTRO de um estudo, em stream.
// `historico` é a conversa contextual daquele estudo (perguntas/respostas anteriores),
// separada do chat geral — é o que garante a continuidade ("não entendi" → "mas por quê?").
export function studyChat(
  contexto: ContextoEstudo,
  historico: Mensagem[],
  ia: AIProvider,
  personalidade: Personalidade,
): AsyncIterable<string> {
  const mensagens = montarMensagensEstudo(contexto, historico, personalidade)
  // Ingredientes do system prompt (Task 3) — ver comentário em chat.ts.
  return ia.generateStream(mensagens, { modo: 'estudo', personalidade, contextoEstudo: contexto })
}

// Helper puro: monta o `ContextoEstudo` a partir do `Study` + o bloco atual + extras.
// O frontend (futuro) chama isto passando o que tiver em mãos; o que faltar fica de fora.
// Mapeia do Block REAL de hoje (titulo/conteudo/pergunta) — não exige campos que o
// domínio ainda não tem (conceitos/exemplos entram como extra opcional).
export function montarContextoEstudo(
  estudo: Study,
  blocoIndex: number,
  extras?: {
    usuario?: string
    materia?: string
    material?: string
    conceitosRelacionados?: string[]
    progresso?: ProgressoEstudo
  },
): ContextoEstudo {
  const bloco = estudo.blocos[blocoIndex]
  return {
    usuario: extras?.usuario,
    estudoNome: estudo.nome,
    materia: extras?.materia ?? estudo.nome, // por padrão, a matéria é o nome do estudo
    material: extras?.material,
    blocoIndex,
    blocoTitulo: bloco?.titulo ?? '',
    blocoConteudo: bloco?.conteudo ?? [],
    // só os TÍTULOS dos outros blocos (não o conteúdo) — ver comentário no tipo.
    outrosBlocosTitulos: estudo.blocos.filter((_, idx) => idx !== blocoIndex).map((b) => b.titulo),
    perguntaDoBloco: bloco?.pergunta?.enunciado,
    conceitosRelacionados: extras?.conceitosRelacionados,
    progresso:
      extras?.progresso ?? {
        blocosConcluidos: blocoIndex, // por padrão, tudo antes do bloco atual está feito
        totalBlocos: estudo.blocos.length,
      },
  }
}
