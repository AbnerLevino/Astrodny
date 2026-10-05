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
  constructor(
    mensagem = 'A IA está sobrecarregada no momento. Tente de novo em instantes.',
    status?: number,
  ) {
    super(mensagem)
    this.name = 'IALimiteError'
    this.status = status
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
