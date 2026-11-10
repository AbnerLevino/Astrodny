/*
  PORTA (application/ports) — ERROS tipados da IA.

  Conceito: um erro NÃO é só uma mensagem; é um TIPO. Hoje todo provider lança um
  `Error` genérico, então quem chama (UI, retry) não consegue distinguir "a IA está
  sobrecarregada" (429/503, temporário → vale re-tentar e avisar com calma) de um erro
  de verdade (prompt inválido, bug → não adianta re-tentar).

  `IALimiteError` é essa etiqueta: quando um provider recebe 429 (Too Many Requests) ou
  503 (Service Unavailable), ele lança ESTE tipo. Aí:
    - o retry (backoff) sabe que vale esperar e tentar de novo;
    - a UI sabe mostrar "sobrecarregada, tente em instantes" em vez de um erro seco.

  Vive em `application/ports` (não na infraestrutura) porque é um conceito do CONTRATO:
  tanto a infra (quem lança) quanto a aplicação e a ui (quem trata) dependem dele, e
  nenhuma delas deve depender de um provider específico.
*/

export class IALimiteError extends Error {
  readonly status?: number
  // tempo sugerido de espera (ms), lido de `retry-after`/`x-ratelimit-reset-tokens` da
  // resposta real do provedor — quando ausente, quem re-tenta cai num valor fixo próprio.
  readonly esperaMs?: number
  constructor(
    mensagem = 'A IA está sobrecarregada no momento. Tente de novo em instantes.',
    status?: number,
    esperaMs?: number,
  ) {
    super(mensagem)
    this.name = 'IALimiteError'
    this.status = status
    this.esperaMs = esperaMs
  }
}

// 429 = muitas requisições (rate limit); 503 = serviço indisponível/sobrecarregado.
// Os dois são TEMPORÁRIOS — a próxima tentativa costuma funcionar.
export function ehStatusDeLimite(status: number): boolean {
  return status === 429 || status === 503
}

// type guard: permite `if (ehLimite(e))` com o TypeScript estreitando o tipo.
export function ehLimite(erro: unknown): erro is IALimiteError {
  return erro instanceof IALimiteError
}

// BYOK: falta de chave do USUÁRIO (não configurou em Configurações). Ao contrário de
// IALimiteError, NÃO é transitório — re-tentar não resolve, então quem trata isto
// (retry/UI) deve propagar direto, nunca re-tentar nem esperar.
export class IASemChaveError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'IASemChaveError'
  }
}

export function ehSemChave(erro: unknown): erro is IASemChaveError {
  return erro instanceof IASemChaveError
}

// BYOK: a chave EXISTE mas o provedor a RECUSOU (401/403 — inválida, revogada, colada
// errada). Herda de IASemChaveError de propósito: pra retry/UI é o MESMO caso ("problema
// com a chave do usuário, não adianta re-tentar, mande pra Configurações"), só muda o
// texto. Quem precisar distinguir os dois usa ehChaveInvalida().
export class IAChaveInvalidaError extends IASemChaveError {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'IAChaveInvalidaError'
  }
}

export function ehChaveInvalida(erro: unknown): erro is IAChaveInvalidaError {
  return erro instanceof IAChaveInvalidaError
}

// 401 = chave inválida/ausente; 403 = chave sem permissão (revogada, projeto bloqueado).
// Nos dois casos re-tentar não adianta — é a chave da pessoa que está errada.
export function ehStatusDeChaveInvalida(status: number): boolean {
  return status === 401 || status === 403
}
