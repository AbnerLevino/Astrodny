# Hardening do Backend (Proxy de IA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as 5 vulnerabilidades levantadas no backend (`api/generate.ts` e `api/stream.ts`) antes de crescer o tráfego em produção: proxy aberto sem limite, system prompt forjável pelo cliente, entrada sem teto de tamanho, ausência de CORS/CSP, e RLS da tabela de coleta.

**Architecture:** Tudo roda nos dois Edge Functions existentes (`api/generate.ts`, `api/stream.ts`) + helpers novos em `api/_lib/`. Rate limit usa o PRÓPRIO Supabase (já pago/zero custo extra — sem contratar Upstash) via uma função Postgres atômica chamada por RPC com a service key que o `log.ts` já usa. O "system prompt forjável" se resolve fazendo o SERVIDOR reconstruir a mensagem `system` a partir de campos estruturados (`personalidade`, `perfil`, `modo`) em vez de confiar no texto livre que o cliente manda — qualquer `role: "system"` que chegar no corpo é descartado.

**Tech Stack:** TypeScript, Vercel Edge Functions, Supabase (Postgres + RPC via REST), Vitest.

## Global Constraints

- Zero custo adicional: nada de contratar serviço novo (Upstash etc.) — reusar Supabase, que já está em produção.
- Origem permitida no CORS: qualquer subdomínio `*.vercel.app` + `http://localhost:5173` (dev). Trocar pelo domínio próprio quando existir (um array, fácil de editar).
- Nenhuma mudança pode quebrar os providers locais (`ollamaProvider`, `mockProvider`, `groqProvider` direto) usados em dev — toda extensão de tipo é aditiva/opcional.
- Estilo do repo: comentários só explicam o "porquê" (não o "o quê"), nomes de função em português, `best-effort` para coisas não-críticas (mesmo padrão de `log.ts`).

---

### Task 1: Rate limit por IP (sem serviço pago)

**Files:**
- Create: `supabase/migrations/20261007120000_rate_limit.sql`
- Create: `api/_lib/rateLimit.ts`
- Create: `api/_lib/rateLimit.test.ts`
- Modify: `api/generate.ts`
- Modify: `api/stream.ts`

**Interfaces:**
- Produces: `ipDaRequisicao(request: Request): string`, `dentroDoLimite(request: Request): Promise<boolean>` — usados pelos dois handlers.

- [ ] **Step 1: Criar a migration da tabela + função atômica no Postgres**

```sql
-- supabase/migrations/20261007120000_rate_limit.sql
create table if not exists public.api_rate_limit (
  ip text primary key,
  janela_inicio timestamptz not null default now(),
  contagem int not null default 1
);

alter table public.api_rate_limit enable row level security;
-- ninguém além do service_role mexe aqui (service_role sempre ignora RLS).

create or replace function public.checar_rate_limite(p_ip text, p_limite int, p_janela_segundos int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contagem int;
begin
  insert into public.api_rate_limit (ip, janela_inicio, contagem)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set contagem = case
          when public.api_rate_limit.janela_inicio < now() - make_interval(secs => p_janela_segundos)
            then 1
          else public.api_rate_limit.contagem + 1
        end,
        janela_inicio = case
          when public.api_rate_limit.janela_inicio < now() - make_interval(secs => p_janela_segundos)
            then now()
          else public.api_rate_limit.janela_inicio
        end
  returning contagem into v_contagem;

  return v_contagem <= p_limite;
end;
$$;

revoke all on function public.checar_rate_limite(text, int, int) from public, anon, authenticated;
grant execute on function public.checar_rate_limite(text, int, int) to service_role;
```

Aplique no painel do Supabase (SQL Editor) ou via `supabase db push`, dependendo de como as migrations anteriores foram aplicadas neste projeto (só há uma migration no repo até agora — confirme se o projeto já usa `supabase db push` ou se a tabela `criar_tabela_perfis` foi aplicada manualmente).

- [ ] **Step 2: Escrever o teste do helper (parte pura, sem rede)**

```ts
// api/_lib/rateLimit.test.ts
import { describe, it, expect } from 'vitest'
import { ipDaRequisicao } from './rateLimit'

describe('ipDaRequisicao', () => {
  it('pega o primeiro IP de x-forwarded-for', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })
    expect(ipDaRequisicao(req)).toBe('1.2.3.4')
  })

  it("devolve 'desconhecido' sem o header", () => {
    const req = new Request('http://x')
    expect(ipDaRequisicao(req)).toBe('desconhecido')
  })
})
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npx vitest run api/_lib/rateLimit.test.ts`
Expected: FAIL — `rateLimit.ts` ainda não existe.

- [ ] **Step 4: Implementar o helper**

```ts
// api/_lib/rateLimit.ts
/*
  SERVIDOR (api/_lib) — rate limit por IP usando o PRÓPRIO Supabase (sem contratar
  serviço novo): chama a função `checar_rate_limite` via RPC com a SERVICE KEY (a
  mesma que o log.ts já usa). A função no Postgres é ATÔMICA (um único UPDATE), então
  não há corrida entre requisições concorrentes como haveria num "ler, somar, gravar"
  feito aqui no código.

  best-effort: se o Supabase não estiver configurado ou a chamada falhar, NÃO bloqueia
  ninguém — é melhor abrir mão do rate limit por um instante do que derrubar o app.
*/
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

const LIMITE_REQUISICOES = 20
const JANELA_SEGUNDOS = 60

export function ipDaRequisicao(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
}

export async function dentroDoLimite(request: Request): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true
  const ip = ipDaRequisicao(request)
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/checar_rate_limite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ p_ip: ip, p_limite: LIMITE_REQUISICOES, p_janela_segundos: JANELA_SEGUNDOS }),
    })
    if (!r.ok) return true
    return (await r.json()) === true
  } catch {
    return true
  }
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npx vitest run api/_lib/rateLimit.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 6: Plugar nos dois handlers**

Em `api/generate.ts`, logo após o `export default async function handler`:

```ts
import { dentroDoLimite } from './_lib/rateLimit'
// ...dentro do handler, antes de ler o corpo:
if (!(await dentroDoLimite(request))) {
  return json({ error: 'Muitas requisições. Aguarde um instante e tente de novo.' }, 429)
}
```

Em `api/stream.ts`, mesma ideia (resposta em texto puro, igual ao resto do arquivo):

```ts
import { dentroDoLimite } from './_lib/rateLimit'
// ...dentro do handler, antes de ler o corpo:
if (!(await dentroDoLimite(request))) {
  return new Response('Muitas requisições. Aguarde um instante e tente de novo.', { status: 429 })
}
```

O cliente já trata 429 como `IALimiteError` (`ehStatusDeLimite` em `aiErrors.ts`) e mostra a mensagem amigável de sobrecarga — nenhuma mudança necessária no front.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261007120000_rate_limit.sql api/_lib/rateLimit.ts api/_lib/rateLimit.test.ts api/generate.ts api/stream.ts
git commit -m "feat: adiciona rate limit por IP nos endpoints de IA (via Supabase RPC)"
```

---

### Task 2: Teto de tamanho na entrada (413)

**Files:**
- Create: `api/_lib/limites.ts`
- Create: `api/_lib/limites.test.ts`
- Modify: `api/generate.ts`
- Modify: `api/stream.ts`

**Interfaces:**
- Produces: `MAX_PROMPT_CHARS`, `MAX_MESSAGES_CHARS`, `somaCaracteres(messages: {content: string}[]): number`

- [ ] **Step 1: Teste do somatório**

```ts
// api/_lib/limites.test.ts
import { describe, it, expect } from 'vitest'
import { somaCaracteres } from './limites'

describe('somaCaracteres', () => {
  it('soma o content de todas as mensagens', () => {
    expect(somaCaracteres([{ content: 'ab' }, { content: 'cde' }])).toBe(5)
  })

  it('devolve 0 pra lista vazia', () => {
    expect(somaCaracteres([])).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run api/_lib/limites.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// api/_lib/limites.ts
/*
  SERVIDOR (api/_lib) — tetos de tamanho de entrada. Sem isso, um prompt ou uma
  conversa gigante processa (e cobra da cota de IA) antes de qualquer checagem.
*/
export const MAX_PROMPT_CHARS = 8000
export const MAX_MESSAGES_CHARS = 16000

export function somaCaracteres(messages: { content: string }[]): number {
  return messages.reduce((soma, m) => soma + (m.content?.length ?? 0), 0)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run api/_lib/limites.test.ts`
Expected: PASS

- [ ] **Step 5: Plugar em `api/generate.ts`** (logo após validar que `prompt` não é vazio)

```ts
import { MAX_PROMPT_CHARS } from './_lib/limites'
// ...
if (prompt.length > MAX_PROMPT_CHARS) {
  return json({ error: `Prompt muito grande (máx. ${MAX_PROMPT_CHARS} caracteres).` }, 413)
}
```

- [ ] **Step 6: Plugar em `api/stream.ts`** (logo após validar `messages`)

```ts
import { MAX_MESSAGES_CHARS, somaCaracteres } from './_lib/limites'
// ...
if (somaCaracteres(messages) > MAX_MESSAGES_CHARS) {
  return new Response(`Conversa muito grande (máx. ${MAX_MESSAGES_CHARS} caracteres).`, { status: 413 })
}
```

- [ ] **Step 7: Commit**

```bash
git add api/_lib/limites.ts api/_lib/limites.test.ts api/generate.ts api/stream.ts
git commit -m "feat: limita tamanho de prompt/mensagens nos endpoints de IA (413)"
```

---

### Task 3: Servidor reconstrói o system prompt (ignora `role: system` do cliente)

Hoje `chat.ts`/`studyChat.ts` montam a mensagem `system` inteira (personalidade + perfil + contexto do estudo) e mandam pro servidor como texto livre dentro de `messages` — qualquer um que bata direto em `/api/stream` (sem passar pela UI) pode mandar QUALQUER instrução de sistema. A correção: o cliente passa a mandar só os INGREDIENTES (`modo`, `personalidade`, `perfil`, `contextoEstudo`) à parte, OBETO o `messages` só com os turnos `user`/`assistant`; o servidor é quem monta o `system`, usando as MESMAS funções de `prompts.ts` que já existem. Qualquer `role: "system"` que chegar no corpo é descartado antes de qualquer coisa.

**Files:**
- Modify: `src/application/ports/AIProvider.ts` (novo tipo `ChatMeta`, parâmetro opcional em `generateStream`)
- Modify: `src/application/chat.ts` (passa `ChatMeta`)
- Modify: `src/application/studyChat.ts` (passa `ChatMeta`)
- Modify: `src/application/prompts.ts` (extrai `systemPromptEstudoContexto`)
- Modify: `src/application/prompts.test.ts` (se precisar, cobre a extração)
- Modify: `src/infrastructure/ai/proxyProvider.ts` (manda `modo`/`personalidade`/`perfil`/`contextoEstudo`, filtra `role: system` do que envia)
- Modify: `api/stream.ts` (ignora `role: system` recebido; reconstrói)
- Create: `api/_lib/systemPrompt.ts` (fino wrapper que decide qual função de `prompts.ts` chamar conforme `modo`)
- Create: `api/_lib/systemPrompt.test.ts`

**Interfaces:**
- Produces (AIProvider.ts): `export type ModoChat = 'tutor' | 'mini_aula' | 'estudo'`, `export type ChatMeta = { modo: ModoChat; personalidade: Personalidade; perfil?: Perfil; contextoEstudo?: ContextoEstudo }`
- Produces (prompts.ts): `export function systemPromptEstudoContexto(contexto: ContextoEstudo, personalidade: Personalidade): string`
- Produces (api/_lib/systemPrompt.ts): `export function montarSystemPrompt(modo: ModoChat, personalidade: Personalidade, perfil?: Perfil, contextoEstudo?: ContextoEstudo): string`

- [ ] **Step 1: Extrair `systemPromptEstudoContexto` em `prompts.ts`**

Em `src/application/prompts.ts`, troque a função `montarMensagensEstudo` (linhas ~531-558) por:

```ts
export function systemPromptEstudoContexto(contexto: ContextoEstudo, personalidade: Personalidade): string {
  const base = systemPromptTutor(personalidade)
  return `${base}

# Contexto do estudo atual
O aluno está no modo ESTUDAR (não numa conversa solta). A dúvida abaixo acontece
DENTRO deste estudo — responda considerando este contexto, principalmente o conteúdo
do bloco atual:
${descreverContexto(contexto)}

# Regras deste modo (suporte ao estudo)
- Responda à dúvida com base no conteúdo do bloco atual e no material do estudo.
- NÃO avance o estudo nem mude de bloco: o aluno controla o próprio ritmo. Uma pergunta
  NÃO significa que ele terminou o bloco — significa só que precisa de ajuda agora.
- Seja focado e direto na dúvida; não repita o bloco inteiro, esclareça o ponto.
- Se a dúvida fugir do estudo atual, ajude mesmo assim, mas tente conectar de volta ao
  que ele está estudando.`
}

export function montarMensagensEstudo(
  contexto: ContextoEstudo,
  historico: Mensagem[],
  personalidade: Personalidade,
): ChatMessage[] {
  const sistema = systemPromptEstudoContexto(contexto, personalidade)
  const conversa: ChatMessage[] = historico.map((m) => ({
    role: m.autor === 'user' ? 'user' : 'assistant',
    content: m.texto,
  }))
  return [{ role: 'system', content: sistema }, ...conversa]
}
```

- [ ] **Step 2: Rodar os testes existentes de prompts.ts pra confirmar que nada quebrou**

Run: `npx vitest run src/application/prompts.test.ts`
Expected: PASS (comportamento idêntico — só foi extraído)

- [ ] **Step 3: Adicionar `ChatMeta` à porta `AIProvider`**

Em `src/application/ports/AIProvider.ts`, adicione os imports e o tipo, e amplie a assinatura de `generateStream`:

```ts
import type { Personalidade } from '../../domain/settings'
import type { Perfil } from '../../domain/perfil'
import type { ContextoEstudo } from '../../domain/studyChat'

export type ModoChat = 'tutor' | 'mini_aula' | 'estudo'

export type ChatMeta = {
  modo: ModoChat
  personalidade: Personalidade
  perfil?: Perfil
  contextoEstudo?: ContextoEstudo
}

export interface AIProvider {
  generate(prompt: PromptInput, opcoes?: GenerateOptions): Promise<string>
  generateStream(prompt: PromptInput, meta?: ChatMeta): AsyncIterable<string>
}
```

(Só os dois lugares — `ChatMeta` opcional é aditivo: `ollamaProvider`, `mockProvider`, `groqProvider`, `fallbackProvider`, etc. continuam compilando sem tocar neles, porque nenhum declara um 2º parâmetro.)

- [ ] **Step 4: `chat.ts` passa o `ChatMeta`**

Em `src/application/chat.ts`, a função `chat` passa a mandar o meta:

```ts
export function chat(
  historico: Mensagem[],
  ia: AIProvider,
  personalidade: Personalidade,
  perfil?: Perfil,
): AsyncIterable<string> {
  const mensagens = montarMensagens(historico, personalidade, perfil)
  const ultima = historico[historico.length - 1]
  const temAnexo = ultima?.autor === 'user' && !!ultima.anexos?.length
  return ia.generateStream(mensagens, { modo: temAnexo ? 'mini_aula' : 'tutor', personalidade, perfil })
}
```

- [ ] **Step 5: `studyChat.ts` passa o `ChatMeta`**

```ts
export function studyChat(
  contexto: ContextoEstudo,
  historico: Mensagem[],
  ia: AIProvider,
  personalidade: Personalidade,
): AsyncIterable<string> {
  const mensagens = montarMensagensEstudo(contexto, historico, personalidade)
  return ia.generateStream(mensagens, { modo: 'estudo', personalidade, contextoEstudo: contexto })
}
```

- [ ] **Step 6: Teste do helper do servidor `montarSystemPrompt`**

```ts
// api/_lib/systemPrompt.test.ts
import { describe, it, expect } from 'vitest'
import { montarSystemPrompt } from './systemPrompt'

describe('montarSystemPrompt', () => {
  it('modo tutor usa a personalidade pedida', () => {
    const texto = montarSystemPrompt('tutor', 'descontraido')
    expect(texto).toContain('Seu tom')
    expect(texto.toLowerCase()).toContain('leve')
  })

  it('modo inválido cai pro tutor formal (nunca quebra)', () => {
    // @ts-expect-error -- testando entrada forjada vinda da rede
    const texto = montarSystemPrompt('qualquer-coisa', 'formal')
    expect(texto).toContain('Seu tom')
  })
})
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `npx vitest run api/_lib/systemPrompt.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 8: Implementar `api/_lib/systemPrompt.ts`**

```ts
// api/_lib/systemPrompt.ts
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

  if (modo === 'estudo' && contextoEstudo) {
    return systemPromptEstudoContexto(contextoEstudo, personalidade)
  }
  if (modo === 'mini_aula') {
    return systemPromptMiniAulaPdf(personalidade, perfil)
  }
  return systemPromptTutor(personalidade, perfil)
}
```

- [ ] **Step 9: Rodar e ver passar**

Run: `npx vitest run api/_lib/systemPrompt.test.ts`
Expected: PASS

- [ ] **Step 10: `proxyProvider.ts` manda os campos estruturados e filtra `system`**

```ts
// src/infrastructure/ai/proxyProvider.ts
import { paraMensagens } from '../../application/ports/AIProvider'
import type { AIProvider, GenerateOptions, PromptInput, ChatMeta } from '../../application/ports/AIProvider'
// ...

  async *generateStream(prompt: PromptInput, meta?: ChatMeta): AsyncIterable<string> {
    const mensagens = paraMensagens(prompt).filter((m) => m.role !== 'system')
    const r = await fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: mensagens,
        modo: meta?.modo ?? 'tutor',
        personalidade: meta?.personalidade ?? 'formal',
        perfil: meta?.perfil,
        contextoEstudo: meta?.contextoEstudo,
        device: deviceAnon(),
      }),
    })
    // ...resto IGUAL ao que já existe hoje
  },
```

- [ ] **Step 11: `api/stream.ts` ignora `system` do corpo e reconstrói**

```ts
// api/stream.ts
import { montarSystemPrompt } from './_lib/systemPrompt'
import type { Personalidade } from '../src/domain/settings'
import type { Perfil } from '../src/domain/perfil'
import type { ContextoEstudo } from '../src/domain/studyChat'

// no tipo do corpo, adicione:
let corpo: {
  messages?: ChatMessage[]
  type?: TipoEvento
  subject?: string
  device?: string
  modo?: string
  personalidade?: Personalidade
  perfil?: Perfil
  contextoEstudo?: ContextoEstudo
}
// ...
const messages = corpo.messages
if (!Array.isArray(messages) || messages.length === 0) {
  return new Response('Faltou o campo "messages".', { status: 400 })
}

// NUNCA confia em role:"system" vindo do cliente — descarta e reconstrói aqui.
const conversa = messages.filter((m) => m.role !== 'system')
const sistema = montarSystemPrompt(corpo.modo, corpo.personalidade, corpo.perfil, corpo.contextoEstudo)
const mensagensFinais: ChatMessage[] = [{ role: 'system', content: sistema }, ...conversa]

// ...troque `cadeiaChat().generateStream(messages)` por:
for await (const pedaco of cadeiaChat().generateStream(mensagensFinais)) {
```

(O log de `entradaLog` continua usando `messages` recebido original, pra auditoria — só a chamada à IA usa `mensagensFinais`.)

- [ ] **Step 12: Checar tipos do projeto inteiro**

Run: `npx tsc -b`
Expected: sem erros (confirma que nenhum provider local quebrou com o parâmetro opcional novo).

- [ ] **Step 13: Rodar toda a suíte**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 14: Teste manual rápido (dev)**

Run: `npm run dev`, abra o chat, mande uma mensagem normal e confirme que a resposta e o tom (personalidade) continuam corretos; teste também o fluxo de anexar um PDF no chat (mini-aula) e uma dúvida dentro do Estudar.

- [ ] **Step 15: Commit**

```bash
git add src/application/ports/AIProvider.ts src/application/chat.ts src/application/studyChat.ts src/application/prompts.ts src/infrastructure/ai/proxyProvider.ts api/stream.ts api/_lib/systemPrompt.ts api/_lib/systemPrompt.test.ts
git commit -m "fix: servidor reconstroi o system prompt e ignora role:system vindo do cliente"
```

---

### Task 4: CORS restrito + CSP básica

**Files:**
- Create: `api/_lib/cors.ts`
- Create: `api/_lib/cors.test.ts`
- Modify: `api/generate.ts`
- Modify: `api/stream.ts`
- Create: `vercel.json`

**Interfaces:**
- Produces: `origemPermitida(origin: string | null): string | null`, `headersCors(request: Request): HeadersInit`

- [ ] **Step 1: Teste da checagem de origem**

```ts
// api/_lib/cors.test.ts
import { describe, it, expect } from 'vitest'
import { origemPermitida } from './cors'

describe('origemPermitida', () => {
  it('aceita qualquer subdomínio .vercel.app', () => {
    expect(origemPermitida('https://astrodny-git-main.vercel.app')).toBe('https://astrodny-git-main.vercel.app')
  })
  it('aceita localhost:5173 (dev)', () => {
    expect(origemPermitida('http://localhost:5173')).toBe('http://localhost:5173')
  })
  it('rejeita domínio de fora', () => {
    expect(origemPermitida('https://evil.example.com')).toBeNull()
  })
  it('rejeita quando não há Origin', () => {
    expect(origemPermitida(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run api/_lib/cors.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```ts
// api/_lib/cors.ts
/*
  SERVIDOR (api/_lib) — CORS explícito pros endpoints de IA. Sem domínio próprio
  ainda, então liberamos qualquer preview/produção do PRÓPRIO projeto na Vercel
  (*.vercel.app) + o Vite local. Troque SUFIXOS_PERMITIDOS/ORIGENS_EXTRAS quando
  houver domínio final — é só esse array que muda.
*/
const SUFIXOS_PERMITIDOS = ['.vercel.app']
const ORIGENS_EXTRAS = ['http://localhost:5173']

export function origemPermitida(origin: string | null): string | null {
  if (!origin) return null
  if (ORIGENS_EXTRAS.includes(origin)) return origin
  try {
    const host = new URL(origin).hostname
    if (SUFIXOS_PERMITIDOS.some((s) => host.endsWith(s))) return origin
  } catch {
    return null
  }
  return null
}

export function headersCors(request: Request): HeadersInit {
  const origin = origemPermitida(request.headers.get('origin'))
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run api/_lib/cors.test.ts`
Expected: PASS

- [ ] **Step 5: Plugar em `api/generate.ts`** — responder `OPTIONS` e anexar os headers em toda resposta:

```ts
import { headersCors } from './_lib/cors'

export default async function handler(request: Request): Promise<Response> {
  const cors = headersCors(request)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, cors)
  // ... troque as outras chamadas a json(...) pra passar `cors` também
}

function json(obj: unknown, status: number, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}
```

Atualize TODAS as chamadas a `json(...)` dentro do handler pra passar `cors` como 3º argumento.

- [ ] **Step 6: Plugar em `api/stream.ts`**, mesma ideia:

```ts
import { headersCors } from './_lib/cors'

export default async function handler(request: Request): Promise<Response> {
  const cors = headersCors(request)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405, headers: cors })
  // ...
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', ...cors },
  })
}
```

- [ ] **Step 7: Criar `vercel.json` com CSP básica pro app**

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

- [ ] **Step 8: Testar manualmente após deploy**

Run: `vercel --prod` (ou o fluxo de deploy já usado) e abrir o app no navegador, checando o Console: se algo for bloqueado pela CSP (ex.: uma fonte ou domínio do Supabase diferente), ajustar o `connect-src`/`font-src`/`img-src` em `vercel.json` conforme o erro mostrado.

- [ ] **Step 9: Commit**

```bash
git add api/_lib/cors.ts api/_lib/cors.test.ts api/generate.ts api/stream.ts vercel.json
git commit -m "feat: adiciona CORS restrito nos endpoints de IA e CSP basica no app"
```

---

### Task 5: Habilitar RLS em `astrocore_dataset`

Não há migration no repo criando essa tabela (só a de `perfis`) — ela foi criada manualmente no painel. Confirme lá se RLS já está ligado antes de rodar isto; se já estiver, pule pra só adicionar a migration como documentação do estado atual (idempotente, não quebra nada).

**Files:**
- Create: `supabase/migrations/20261007120100_rls_astrocore_dataset.sql`

- [ ] **Step 1: Confirmar no painel do Supabase** (Table Editor → `astrocore_dataset` → ícone de cadeado) se RLS está habilitado. Caso já esteja com "deny all" pra `anon`, trate o passo 2 como documentação (idempotente).

- [ ] **Step 2: Migration**

```sql
-- supabase/migrations/20261007120100_rls_astrocore_dataset.sql
alter table public.astrocore_dataset enable row level security;

-- Nenhuma policy criada de propósito: sem policy, RLS = NEGA tudo por padrão pra
-- anon/authenticated. Só o service_role (que o log.ts usa) grava, porque o
-- service_role ignora RLS inteiramente — não precisa de policy pra ele.
revoke all on public.astrocore_dataset from anon, authenticated;
```

- [ ] **Step 3: Aplicar e confirmar**

Rode a migration (painel SQL Editor ou `supabase db push`) e then teste: no painel, em "Run SQL as anon role" (ou via `curl` com a `anon` key pública), tente `select * from astrocore_dataset limit 1` — deve vir vazio/erro de permissão, nunca dados.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261007120100_rls_astrocore_dataset.sql
git commit -m "fix: garante RLS habilitado em astrocore_dataset (nega leitura anonima)"
```

---

## Fora de escopo (decisão deliberada, não esquecimento)

- **`device_anon` assinado por cookie do servidor**: o próprio pedido original marcou como baixa prioridade (não é brecha de invasão, só de métrica). Fica pra quando precisar de dado de uso confiável.
- **Vercel Firewall / WAF avançado**: as 5 vulnerabilidades do pedido já ficam cobertas com o rate limit do Task 1; regras de firewall adicionais (bot management, IP block) são um upgrade futuro, não bloqueador.

## Self-Review

- **Cobertura do pedido original**: item 1 → Task 1; item 2 → Task 3; item 3 → Task 2; item 4 → Task 4; item 5 → fora de escopo (documentado); item 6 → Task 5. Todos cobertos.
- **Placeholders**: nenhum "TODO"/"implementar depois" — todo código é completo e compilável; a única decisão pendente do usuário (domínio final) foi resolvida usando `*.vercel.app` como padrão, documentado como fácil de trocar.
- **Consistência de tipos**: `ChatMeta`/`ModoChat` definidos uma vez em `AIProvider.ts` e usados com os MESMOS nomes em `chat.ts`, `studyChat.ts`, `proxyProvider.ts` e `api/_lib/systemPrompt.ts`.
