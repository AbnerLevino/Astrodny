# Painel (nova Home com cards de sugestão) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a tela inicial (`/`) pelo Painel — título rotativo + campo de
chat + 4 atalhos (Novo Chat, Estudar, Trabalhos, Provas) que, pra quem está
logado, ganham uma sugestão contextual gerada por IA a partir de perfil +
histórico. O chat migra para `/chat` e `/chat/:id`.

**Architecture:** Segue a Clean Architecture já usada no projeto
(`domain` → `application` → `ui`; `infrastructure` implementa portas). O
motor de insight é um caso de uso novo (`application/homeInsights.ts`) que
usa a mesma porta `AIProvider` do resto do app, com o mesmo padrão de
validação/retry do `buildStudy`. O cache é uma porta nova
(`HomeInsightsRepository`) com adaptador `localStorage`, espelhando
`SettingsRepository`/`StudyRepository`.

**Tech Stack:** React 19 + TypeScript + React Router 7 + Vitest (mesma stack
do resto do app; sem biblioteca de testes de componente — este projeto não
tem `@testing-library`/jsdom configurado, então telas React são verificadas
por `tsc`/build/checagem manual, igual já acontece com `Sidebar.tsx`,
`StudySession.tsx` etc. hoje).

## Global Constraints

- Cache dos insights do Painel vale por até **5 horas** por usuário logado.
- O cache é invalidado **antes** das 5h se um estudo/prova foi salvo depois
  da última geração.
- A amostra de temas de chat usa **só a 1ª mensagem** de até **5 chats**
  criados nas últimas 5 horas (não a conversa inteira).
- Usuário **anônimo nunca dispara a chamada de IA** — sempre vê o texto
  genérico fixo nos 4 atalhos.
- Erro/429 na geração cai pro texto genérico (igual anônimo); nunca trava a
  tela, nunca mostra erro feio.
- Título do Painel: ao carregar um novo lote de sugestões, sorteia um dos
  títulos gerados; se ficar parado na tela, troca pra o próximo a cada 50
  segundos (não um timer curto — compete com a leitura).
- "Trabalhos" e "Provas" continuam **clicáveis** nesta versão (não ficam
  bloqueados/acinzentados); abrem um modal "em breve" com o que está
  planejado pra cada função.
- Fora de escopo nesta v1: funcionalidade real de Trabalhos/Provas, dado de
  calendário/cronograma no prompt, sincronizar o cache entre dispositivos.
- Spec completa: `docs/superpowers/specs/2026-10-05-painel-home-design.md`.

---

### Task 1: `criadoEm` no Chat (base pra amostragem de temas recentes)

**Files:**
- Modify: `src/domain/chat.ts`
- Modify: `src/ui/chats.tsx:100-108` (função `criarChat`)

**Interfaces:**
- Produces: `Chat.criadoEm?: number` (epoch ms) — consumida pela Task 2
  (`amostrarMensagensDeAbertura`).

- [ ] **Step 1: Adicionar o campo ao tipo `Chat`**

Em `src/domain/chat.ts`, troque:

```ts
export type Chat = { id: string; titulo: string; mensagens: Mensagem[]; fixado?: boolean }
```

por:

```ts
// `criadoEm?` é OPCIONAL de propósito, igual `fixado?`: chats já salvos no
// localStorage antes dessa feature existir não têm esse campo — undefined
// significa "não sabemos quando foi criado" (fica de fora da amostra de
// temas recentes do Painel, ver application/amostraChats.ts).
export type Chat = { id: string; titulo: string; mensagens: Mensagem[]; fixado?: boolean; criadoEm?: number }
```

- [ ] **Step 2: Carimbar `criadoEm` ao criar um chat**

Em `src/ui/chats.tsx`, dentro de `criarChat`, troque:

```ts
  function criarChat(primeiraMensagem: string): string {
    const id = novoId()
    const titulo = primeiraMensagem.trim().slice(0, 40) || 'Novo chat'
    const mensagens: Mensagem[] = [{ autor: 'user', texto: primeiraMensagem }]
    setChats((prev) => [{ id, titulo, mensagens }, ...prev]) // mais novo no topo
    setChatAtivo(id) // já abre esse chat na Home
    responderIA(id, mensagens) // dispara a resposta da IA
    return id
  }
```

por:

```ts
  function criarChat(primeiraMensagem: string): string {
    const id = novoId()
    const titulo = primeiraMensagem.trim().slice(0, 40) || 'Novo chat'
    const mensagens: Mensagem[] = [{ autor: 'user', texto: primeiraMensagem }]
    setChats((prev) => [{ id, titulo, mensagens, criadoEm: Date.now() }, ...prev]) // mais novo no topo
    setChatAtivo(id) // já abre esse chat na Home
    responderIA(id, mensagens) // dispara a resposta da IA
    return id
  }
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/domain/chat.ts src/ui/chats.tsx
git commit -m "feat: carimba criadoEm ao criar um chat"
```

---

### Task 2: `amostrarMensagensDeAbertura` (amostra de temas recentes, pura)

**Files:**
- Create: `src/application/amostraChats.ts`
- Test: `src/application/amostraChats.test.ts`

**Interfaces:**
- Consumes: `Chat` de `src/domain/chat.ts` (campo `criadoEm?: number` da Task 1).
- Produces: `amostrarMensagensDeAbertura(chats: Chat[], agora: number): string[]`
  — consumida pela Task 10 (Painel.tsx).

- [ ] **Step 1: Escrever o teste (falhando)**

Crie `src/application/amostraChats.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { amostrarMensagensDeAbertura } from './amostraChats'
import type { Chat } from '../domain/chat'

const HORA = 60 * 60 * 1000

function chat(id: string, criadoEm: number | undefined, primeiraMensagem: string): Chat {
  return {
    id,
    titulo: primeiraMensagem.slice(0, 20),
    mensagens: [{ autor: 'user', texto: primeiraMensagem }],
    criadoEm,
  }
}

describe('amostrarMensagensDeAbertura', () => {
  test('sem chats: lista vazia', () => {
    expect(amostrarMensagensDeAbertura([], Date.now())).toEqual([])
  })

  test('chat sem criadoEm (salvo antes dessa feature existir): ignora', () => {
    const agora = Date.now()
    const chats = [chat('1', undefined, 'oi')]
    expect(amostrarMensagensDeAbertura(chats, agora)).toEqual([])
  })

  test('chat criado há mais de 5h: fica de fora', () => {
    const agora = 10 * HORA
    const chats = [chat('1', agora - 6 * HORA, 'muito antigo')]
    expect(amostrarMensagensDeAbertura(chats, agora)).toEqual([])
  })

  test('chat criado dentro das 5h: entra, só a 1ª mensagem', () => {
    const agora = 10 * HORA
    const chats = [chat('1', agora - 2 * HORA, 'quero estudar concursos')]
    expect(amostrarMensagensDeAbertura(chats, agora)).toEqual(['quero estudar concursos'])
  })

  test('mais de 5 chats recentes: corta no limite, mais recentes primeiro', () => {
    const agora = 10 * HORA
    const chats = [
      chat('1', agora - 4 * HORA, 'msg 1 (mais antiga)'),
      chat('2', agora - 3 * HORA, 'msg 2'),
      chat('3', agora - 2.5 * HORA, 'msg 3'),
      chat('4', agora - 2 * HORA, 'msg 4'),
      chat('5', agora - 1 * HORA, 'msg 5'),
      chat('6', agora - 0.5 * HORA, 'msg 6 (mais nova)'),
    ]
    const r = amostrarMensagensDeAbertura(chats, agora)
    expect(r).toHaveLength(5)
    expect(r[0]).toBe('msg 6 (mais nova)')
    expect(r).not.toContain('msg 1 (mais antiga)')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/application/amostraChats.test.ts`
Expected: FAIL — `Cannot find module './amostraChats'`.

- [ ] **Step 3: Implementar**

Crie `src/application/amostraChats.ts`:

```ts
/*
  CASO DE USO (application) — pure: pega a amostra de mensagens de abertura
  pro motor de insight do Painel. Só a 1ª mensagem de cada chat criado nas
  últimas 5h, até um limite — enriquece o prompt aos poucos sem explodir
  tokens nem ler conversas inteiras.
*/
import type { Chat } from '../domain/chat'

const JANELA_MS = 5 * 60 * 60 * 1000 // 5 horas
const LIMITE = 5

export function amostrarMensagensDeAbertura(chats: Chat[], agora: number): string[] {
  return chats
    .filter((c) => c.criadoEm !== undefined && agora - c.criadoEm <= JANELA_MS)
    .sort((a, b) => (b.criadoEm ?? 0) - (a.criadoEm ?? 0)) // mais recentes primeiro
    .slice(0, LIMITE)
    .map((c) => c.mensagens[0]?.texto)
    .filter((texto): texto is string => !!texto)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/application/amostraChats.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/application/amostraChats.ts src/application/amostraChats.test.ts
git commit -m "feat: amostra de mensagens de abertura pro motor de insight do Painel"
```

---

### Task 3: tipos do Painel + `comoTextoOuNull` + `montarPromptPainel`

**Files:**
- Create: `src/domain/painel.ts`
- Modify: `src/application/validacao.ts`
- Modify: `src/application/prompts.ts`
- Test: `src/application/prompts.test.ts` (adiciona testes a um arquivo existente)

**Interfaces:**
- Produces: `InsightsPainel`, `SugestoesPainel`, `PainelCache` (domain) —
  consumidos pelas Tasks 4, 5, 6, 10.
- Produces: `comoTextoOuNull(v: unknown): string | null` — consumida pela
  Task 4.
- Produces: `montarPromptPainel(perfil: Perfil | null, estudos: StudySalvo[], mensagensAbertura: string[]): string`
  — consumida pela Task 4.

- [ ] **Step 1: Criar os tipos do domínio**

Crie `src/domain/painel.ts`:

```ts
/*
  DOMÍNIO — tipos puros do Painel (a tela inicial com título rotativo + os 4
  atalhos). Não importa nada de fora (nem React, nem IA).
*/

// uma sugestão contextual por atalho — null quando não há sinal suficiente
// (usuário novo, pouco histórico): a tela cai pro texto genérico fixo.
export type SugestoesPainel = {
  novoChat: string | null
  estudar: string | null
  trabalhos: string | null
  provas: string | null
}

// o que o motor de insight devolve: títulos (pra variar, ver Painel.tsx) + as
// 4 sugestões.
export type InsightsPainel = {
  titulos: string[]
  sugestoes: SugestoesPainel
}

// o que fica cacheado (localStorage): os insights + QUANDO foram gerados —
// usado pra decidir se o cache ainda vale (ver application/homeInsightsCache).
export type PainelCache = {
  geradoEm: string // data ISO
  insights: InsightsPainel
}
```

- [ ] **Step 2: Adicionar `comoTextoOuNull` à validação compartilhada**

Em `src/application/validacao.ts`, adicione ao final do arquivo:

```ts

// Igual ao comoTexto, mas NÃO lança: ausente/inválido vira null. Usado nas
// sugestões do Painel, onde "sem sinal" é um resultado VÁLIDO (não um erro) —
// ver application/homeInsights.ts.
export function comoTextoOuNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
```

- [ ] **Step 3: Escrever os testes do prompt (falhando)**

Em `src/application/prompts.test.ts`, adicione ao final do arquivo (depois do
`describe('systemPromptTutor', ...)`):

```ts

describe('montarPromptPainel', () => {
  test('sem perfil e sem estudos: avisa que não há dado, não inventa', () => {
    const p = montarPromptPainel(null, [], [])
    expect(p).toContain('sem dado de perfil ainda')
    expect(p).toContain('nenhum estudo feito ainda')
  })

  test('com curso, nível e matérias: todos aparecem no prompt', () => {
    const p = montarPromptPainel(
      { nome: 'Ana', curso: 'TADS', nivel: 'intermediario', materias: ['Estrutura de Dados'] },
      [],
      [],
    )
    expect(p).toContain('TADS')
    expect(p).toContain('intermediario')
    expect(p).toContain('Estrutura de Dados')
  })

  test('estudos recentes aparecem com nome e desempenho', () => {
    const p = montarPromptPainel(null, [
      {
        id: '1',
        data: '2026-10-01',
        origem: 'aula.pdf',
        estudo: { nome: 'Árvores Binárias', formato: 'multipla_escolha', blocos: [], prova: [] },
        resultado: { acertos: 7, total: 10, porBloco: [], erros: [] },
      },
    ], [])
    expect(p).toContain('Árvores Binárias')
    expect(p).toContain('7/10')
  })

  test('mensagens de abertura recentes aparecem no prompt', () => {
    const p = montarPromptPainel(null, [], ['quero estudar pra um concurso'])
    expect(p).toContain('quero estudar pra um concurso')
  })

  test('pede JSON com as 4 chaves de sugestão', () => {
    const p = montarPromptPainel(null, [], [])
    expect(p).toContain('"novoChat"')
    expect(p).toContain('"estudar"')
    expect(p).toContain('"trabalhos"')
    expect(p).toContain('"provas"')
  })
})
```

E troque o import no topo do arquivo de:

```ts
import { systemPromptTutor } from './prompts'
```

por:

```ts
import { systemPromptTutor, montarPromptPainel } from './prompts'
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run src/application/prompts.test.ts`
Expected: FAIL — `montarPromptPainel` não existe em `./prompts`.

- [ ] **Step 5: Implementar `montarPromptPainel`**

Em `src/application/prompts.ts`, troque o import de `study.ts` (linha 8) de:

```ts
import type { Mode, Formato, QuestionDiscursiva, Study, EstudoConfig } from '../domain/study'
```

por:

```ts
import type { Mode, Formato, QuestionDiscursiva, Study, EstudoConfig, StudySalvo } from '../domain/study'
```

E adicione ao final do arquivo:

```ts

// O prompt do motor de insight do Painel: recebe o que já sabemos do aluno
// (perfil + estudos + temas recentes de chat) e pede, em JSON, títulos
// variados pro topo da tela + 1 sugestão por atalho (ou null, quando não há
// sinal — a regra dura no fim é o que impede a IA de inventar contexto).
export function montarPromptPainel(
  perfil: Perfil | null,
  estudos: StudySalvo[],
  mensagensAbertura: string[],
): string {
  const linhas: string[] = []
  linhas.push('Você é o motor de sugestões da tela inicial do Astrodny (o Painel).')
  linhas.push(
    'Gere, em JSON, títulos e sugestões curtas e naturais pra convidar o aluno a agir — ' +
      'NUNCA invente atividade, curso, matéria ou prova que não esteja nos dados abaixo.',
  )

  linhas.push('')
  linhas.push('# Perfil do aluno')
  if (perfil?.curso) linhas.push(`Curso: ${perfil.curso}`)
  if (perfil?.nivel) linhas.push(`Nível: ${perfil.nivel}`)
  if (perfil?.materias?.length) linhas.push(`Matérias: ${perfil.materias.join(', ')}`)
  if (!perfil?.curso && !perfil?.nivel && !perfil?.materias?.length) {
    linhas.push('(sem dado de perfil ainda)')
  }

  linhas.push('')
  linhas.push('# Estudos recentes (nome: acertos/total, data)')
  if (estudos.length === 0) {
    linhas.push('(nenhum estudo feito ainda)')
  } else {
    estudos
      .slice(0, 10)
      .forEach((e) => linhas.push(`- ${e.estudo.nome}: ${e.resultado.acertos}/${e.resultado.total}, em ${e.data}`))
  }

  linhas.push('')
  linhas.push('# Temas recentes no chat (só a 1ª mensagem de cada conversa nova)')
  if (mensagensAbertura.length === 0) {
    linhas.push('(nenhuma conversa nova recente)')
  } else {
    mensagensAbertura.forEach((m) => linhas.push(`- "${m}"`))
  }

  linhas.push('')
  linhas.push('# O que devolver (só o JSON, sem texto fora dele)')
  linhas.push(`{
  "titulos": ["2 a 3 variações curtas de título/pergunta pro topo da tela, tom convidativo"],
  "sugestoes": {
    "novoChat": "1 frase sugerindo um tema de conversa, OU null se não houver sinal",
    "estudar": "1 frase sugerindo o que estudar, OU null se não houver sinal",
    "trabalhos": "1 frase sugerindo um trabalho (ex.: ABNT), OU null se não houver sinal",
    "provas": "1 frase sugerindo treinar pra uma prova ou concurso, OU null se não houver sinal"
  }
}`)
  linhas.push('')
  linhas.push(
    'Regra dura: sem sinal suficiente pra algum campo, devolva null nele — NÃO force uma ' +
      'sugestão genérica só pra preencher.',
  )

  return linhas.join('\n')
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/application/prompts.test.ts`
Expected: PASS (todos os testes, incluindo os novos 5 de `montarPromptPainel`).

- [ ] **Step 7: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/domain/painel.ts src/application/validacao.ts src/application/prompts.ts src/application/prompts.test.ts
git commit -m "feat: tipos do Painel + prompt do motor de insight (montarPromptPainel)"
```

---

### Task 4: `gerarInsightsPainel` (caso de uso: chama a IA, valida, re-tenta)

**Files:**
- Create: `src/application/homeInsights.ts`
- Test: `src/application/homeInsights.test.ts`

**Interfaces:**
- Consumes: `montarPromptPainel` (Task 3), `comoObjeto/comoLista/comoTexto/comoTextoOuNull`
  (`application/validacao.ts`), `AIProvider` (`application/ports/AIProvider.ts`),
  `IALimiteError`/`ehLimite` (`application/ports/aiErrors.ts`).
- Produces: `gerarInsightsPainel(perfil, estudos, mensagensAbertura, ai): Promise<InsightsPainel>`
  — consumida pela Task 10 (Painel.tsx).

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `src/application/homeInsights.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { gerarInsightsPainel } from './homeInsights'
import type { AIProvider } from './ports/AIProvider'
import { IALimiteError } from './ports/aiErrors'

function fakeAI(respostas: (string | Error)[]): AIProvider {
  let i = 0
  return {
    async generate() {
      const r = respostas[i++]
      if (r instanceof Error) throw r
      return r
    },
    async *generateStream() {
      yield ''
    },
  }
}

const JSON_VALIDO = JSON.stringify({
  titulos: ['Bom dia! Vamos revisar Estrutura de Dados?'],
  sugestoes: {
    novoChat: 'Pergunte sobre o que viu hoje',
    estudar: 'Continue o estudo de Árvores Binárias',
    trabalhos: null,
    provas: null,
  },
})

describe('gerarInsightsPainel', () => {
  test('JSON válido: devolve títulos e sugestões (campos ausentes viram null)', async () => {
    const ai = fakeAI([JSON_VALIDO])
    const r = await gerarInsightsPainel(null, [], [], ai)
    expect(r.titulos).toEqual(['Bom dia! Vamos revisar Estrutura de Dados?'])
    expect(r.sugestoes.estudar).toBe('Continue o estudo de Árvores Binárias')
    expect(r.sugestoes.trabalhos).toBeNull()
  })

  test('1ª resposta vem com JSON quebrado: re-tenta e usa a 2ª', async () => {
    const ai = fakeAI(['isso não é json', JSON_VALIDO])
    const r = await gerarInsightsPainel(null, [], [], ai)
    expect(r.titulos.length).toBeGreaterThan(0)
  })

  test('esgota as tentativas com erro de limite: lança IALimiteError', async () => {
    const ai = fakeAI([new IALimiteError(), new IALimiteError()])
    await expect(gerarInsightsPainel(null, [], [], ai)).rejects.toBeInstanceOf(IALimiteError)
  })

  test('sem nenhum título na resposta: trata como falha (não devolve lista vazia)', async () => {
    const semTitulos = JSON.stringify({
      titulos: [],
      sugestoes: { novoChat: null, estudar: null, trabalhos: null, provas: null },
    })
    const ai = fakeAI([semTitulos, semTitulos])
    await expect(gerarInsightsPainel(null, [], [], ai)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/application/homeInsights.test.ts`
Expected: FAIL — `Cannot find module './homeInsights'`.

- [ ] **Step 3: Implementar**

Crie `src/application/homeInsights.ts`:

```ts
/*
  CASO DE USO (application) — gera os insights do Painel (título + 4
  sugestões) a partir de perfil + estudos + amostra de chats recentes.

  Mesmo padrão do buildStudy: monta o prompt, pede JSON pra porta AIProvider,
  valida em runtime (um modelo pode errar a forma) e RE-TENTA uma vez antes
  de desistir.
*/
import type { AIProvider } from './ports/AIProvider'
import type { Perfil } from '../domain/perfil'
import type { StudySalvo } from '../domain/study'
import type { InsightsPainel, SugestoesPainel } from '../domain/painel'
import { montarPromptPainel } from './prompts'
import { comoObjeto, comoLista, comoTexto, comoTextoOuNull } from './validacao'
import { IALimiteError, ehLimite } from './ports/aiErrors'

const MAX_TENTATIVAS = 2
const PAUSA_ENTRE_TENTATIVAS_MS = 600
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function gerarInsightsPainel(
  perfil: Perfil | null,
  estudos: StudySalvo[],
  mensagensAbertura: string[],
  ai: AIProvider,
): Promise<InsightsPainel> {
  const prompt = montarPromptPainel(perfil, estudos, mensagensAbertura)

  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      const resposta = await ai.generate(prompt, { json: true })
      const bruto = extrairJson(resposta)
      return validarInsights(bruto)
    } catch (e) {
      ultimoErro = e
      console.warn(`gerarInsightsPainel: tentativa ${tentativa}/${MAX_TENTATIVAS} falhou:`, e)
      if (tentativa < MAX_TENTATIVAS) await dormir(PAUSA_ENTRE_TENTATIVAS_MS)
    }
  }

  if (ehLimite(ultimoErro)) throw new IALimiteError()
  throw new Error('Não consegui gerar as sugestões do Painel agora.', { cause: ultimoErro })
}

function extrairJson(resposta: string): unknown {
  const inicio = resposta.indexOf('{')
  const fim = resposta.lastIndexOf('}')
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('a resposta não continha um JSON reconhecível')
  }
  return JSON.parse(resposta.slice(inicio, fim + 1))
}

function validarInsights(valor: unknown): InsightsPainel {
  const o = comoObjeto(valor, 'insights')
  const titulos = comoLista(o.titulos, 'titulos').map((t, i) => comoTexto(t, `titulos[${i}]`))
  if (titulos.length === 0) throw new Error('insights sem nenhum título')

  const s = comoObjeto(o.sugestoes, 'sugestoes')
  const sugestoes: SugestoesPainel = {
    novoChat: comoTextoOuNull(s.novoChat),
    estudar: comoTextoOuNull(s.estudar),
    trabalhos: comoTextoOuNull(s.trabalhos),
    provas: comoTextoOuNull(s.provas),
  }

  return { titulos, sugestoes }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/application/homeInsights.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/application/homeInsights.ts src/application/homeInsights.test.ts
git commit -m "feat: gerarInsightsPainel — caso de uso do motor de insight do Painel"
```

---

### Task 5: `precisaAtualizar` (cache híbrido: 5h OU evento, puro)

**Files:**
- Create: `src/application/homeInsightsCache.ts`
- Test: `src/application/homeInsightsCache.test.ts`

**Interfaces:**
- Consumes: `PainelCache` (Task 3), `StudySalvo` (`domain/study.ts`).
- Produces: `precisaAtualizar(cache: PainelCache | null, estudos: StudySalvo[], agora: number): boolean`
  — consumida pela Task 10 (Painel.tsx).

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `src/application/homeInsightsCache.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { precisaAtualizar } from './homeInsightsCache'
import type { PainelCache } from '../domain/painel'
import type { StudySalvo } from '../domain/study'

const INSIGHTS_VAZIOS = {
  titulos: ['x'],
  sugestoes: { novoChat: null, estudar: null, trabalhos: null, provas: null },
}

function estudoEm(dataISO: string): StudySalvo {
  return {
    id: '1',
    data: dataISO,
    origem: 'teste.pdf',
    estudo: { nome: 'teste', formato: 'multipla_escolha', blocos: [], prova: [] },
    resultado: { acertos: 0, total: 0, porBloco: [], erros: [] },
  }
}

describe('precisaAtualizar', () => {
  test('sem cache: sempre precisa atualizar', () => {
    expect(precisaAtualizar(null, [], Date.now())).toBe(true)
  })

  test('cache recente, sem estudo novo: não precisa atualizar', () => {
    const agora = new Date('2026-10-05T12:00:00Z').getTime()
    const cache: PainelCache = { geradoEm: '2026-10-05T10:00:00Z', insights: INSIGHTS_VAZIOS }
    expect(precisaAtualizar(cache, [], agora)).toBe(false)
  })

  test('cache passou de 5h: precisa atualizar', () => {
    const agora = new Date('2026-10-05T16:01:00Z').getTime()
    const cache: PainelCache = { geradoEm: '2026-10-05T10:00:00Z', insights: INSIGHTS_VAZIOS }
    expect(precisaAtualizar(cache, [], agora)).toBe(true)
  })

  test('estudo salvo DEPOIS do cache: precisa atualizar mesmo antes das 5h', () => {
    const agora = new Date('2026-10-05T11:00:00Z').getTime()
    const cache: PainelCache = { geradoEm: '2026-10-05T10:00:00Z', insights: INSIGHTS_VAZIOS }
    const estudos = [estudoEm('2026-10-05T10:30:00Z')]
    expect(precisaAtualizar(cache, estudos, agora)).toBe(true)
  })

  test('estudo salvo ANTES do cache: não força atualização', () => {
    const agora = new Date('2026-10-05T11:00:00Z').getTime()
    const cache: PainelCache = { geradoEm: '2026-10-05T10:00:00Z', insights: INSIGHTS_VAZIOS }
    const estudos = [estudoEm('2026-10-05T09:00:00Z')]
    expect(precisaAtualizar(cache, estudos, agora)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/application/homeInsightsCache.test.ts`
Expected: FAIL — `Cannot find module './homeInsightsCache'`.

- [ ] **Step 3: Implementar**

Crie `src/application/homeInsightsCache.ts`:

```ts
/*
  CASO DE USO (application) — pure: decide se o cache dos insights do Painel
  ainda vale ou precisa ser regerado.

  Regra híbrida (ver spec): o cache vale por até 5h — MAS é invalidado antes
  se algum estudo foi salvo DEPOIS da última geração (evita ficar com
  sugestão desatualizada logo após uma atividade real).
*/
import type { StudySalvo } from '../domain/study'
import type { PainelCache } from '../domain/painel'

const JANELA_MS = 5 * 60 * 60 * 1000 // 5 horas

export function precisaAtualizar(cache: PainelCache | null, estudos: StudySalvo[], agora: number): boolean {
  if (!cache) return true

  const geradoEmMs = new Date(cache.geradoEm).getTime()
  if (agora - geradoEmMs > JANELA_MS) return true

  return estudos.some((e) => new Date(e.data).getTime() > geradoEmMs)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/application/homeInsightsCache.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/application/homeInsightsCache.ts src/application/homeInsightsCache.test.ts
git commit -m "feat: precisaAtualizar — regra híbrida de cache dos insights do Painel"
```

---

### Task 6: porta + adaptador `HomeInsightsRepository` (cache no localStorage)

**Files:**
- Create: `src/application/ports/HomeInsightsRepository.ts`
- Create: `src/infrastructure/storage/localStorageHomeInsightsRepository.ts`

**Interfaces:**
- Consumes: `PainelCache` (Task 3).
- Produces: `localStorageHomeInsightsRepository: HomeInsightsRepository`
  (`carregar(): PainelCache | null`, `salvar(cache: PainelCache): void`) —
  consumida pela Task 10 (Painel.tsx).

- [ ] **Step 1: Criar a porta**

Crie `src/application/ports/HomeInsightsRepository.ts`:

```ts
/*
  PORTA (application/ports) — onde o cache dos insights do Painel é guardado.
  Mesmo contrato enxuto do SettingsRepository: carregar/salvar.
*/
import type { PainelCache } from '../../domain/painel'

export interface HomeInsightsRepository {
  carregar(): PainelCache | null
  salvar(cache: PainelCache): void
}
```

- [ ] **Step 2: Criar o adaptador localStorage**

Crie `src/infrastructure/storage/localStorageHomeInsightsRepository.ts`:

```ts
/*
  INFRAESTRUTURA (infrastructure/storage) — guarda o cache dos insights do
  Painel no localStorage. Mesmo padrão do localStorageSettingsRepository:
  JSON + try/catch, nunca quebra o app por falta de storage.

  Não sincroniza entre dispositivos nesta v1 (YAGNI — se virar necessidade
  real, migra pra Supabase como o perfil).
*/
import type { HomeInsightsRepository } from '../../application/ports/HomeInsightsRepository'
import type { PainelCache } from '../../domain/painel'

const CHAVE = 'astrodny:painel'

export const localStorageHomeInsightsRepository: HomeInsightsRepository = {
  carregar(): PainelCache | null {
    try {
      const bruto = localStorage.getItem(CHAVE)
      return bruto ? (JSON.parse(bruto) as PainelCache) : null
    } catch {
      return null
    }
  },

  salvar(cache: PainelCache): void {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(cache))
    } catch {
      // sem storage (aba privada, etc.): ignora — só não persiste
    }
  },
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/application/ports/HomeInsightsRepository.ts src/infrastructure/storage/localStorageHomeInsightsRepository.ts
git commit -m "feat: porta e adaptador localStorage do cache de insights do Painel"
```

---

### Task 7: Sidebar — navega em vez de só trocar estado + prop `escondidoNoDesktop`

**Files:**
- Modify: `src/ui/screens/Sidebar.tsx:1-86`

**Interfaces:**
- Produces: prop `escondidoNoDesktop?: boolean` em `Sidebar` — consumida pela
  Task 9 (Painel.tsx passa `escondidoNoDesktop`).
- Muda o comportamento de `abrir()`: antes só trocava `chatAtivoId` no
  Context; agora navega pra `/chat` ou `/chat/:id` (a Task 8 faz a Conversa
  sincronizar o chat ativo a partir da URL).

- [ ] **Step 1: Remover `setChatAtivo` do destructure (não é mais usado aqui)**

Em `src/ui/screens/Sidebar.tsx`, troque:

```tsx
  const { chats, chatAtivoId, setChatAtivo, renomearChat, alternarFixar, excluirChat } = useChats()
```

por:

```tsx
  const { chats, chatAtivoId, renomearChat, alternarFixar, excluirChat } = useChats()
```

- [ ] **Step 2: Adicionar a prop `escondidoNoDesktop`**

Troque a assinatura da função:

```tsx
function Sidebar({
  aoSelecionar,
  apenasDesktop = false,
  aoAuroraHover,
}: {
  aoSelecionar: () => void
  apenasDesktop?: boolean
  // dispara a aurora de fundo da página inteira enquanto o mouse está sobre o CTA
  // "Descubra o Astro!" (Home escuta e revela o fundo-aurora atrás do conteúdo)
  aoAuroraHover?: (ativo: boolean) => void
}) {
```

por:

```tsx
function Sidebar({
  aoSelecionar,
  apenasDesktop = false,
  escondidoNoDesktop = false,
  aoAuroraHover,
}: {
  aoSelecionar: () => void
  apenasDesktop?: boolean
  // true no Painel: a Sidebar vira SÓ o drawer do mobile — no desktop (lg+)
  // não aparece como coluna (o Painel não tem Sidebar fixa; ela volta nas
  // áreas de trabalho, como Chat e Estudar).
  escondidoNoDesktop?: boolean
  // dispara a aurora de fundo da página inteira enquanto o mouse está sobre o CTA
  // "Descubra o Astro!" (Home escuta e revela o fundo-aurora atrás do conteúdo)
  aoAuroraHover?: (ativo: boolean) => void
}) {
```

- [ ] **Step 3: Fazer `abrir` navegar em vez de só trocar o Context**

Troque:

```tsx
  // abre um chat do histórico (ou volta pra saudação) e fecha o menu
  function abrir(id: string | null) {
    setChatAtivo(id)
    aoSelecionar()
  }
```

por:

```tsx
  // abre um chat do histórico (ou um chat em branco) e fecha o menu. Navega
  // em vez de só trocar o estado — a URL (/chat ou /chat/:id) é quem manda;
  // quem está na tela (Conversa) sincroniza o chat ativo a partir dela.
  function abrir(id: string | null) {
    navigate(id ? `/chat/${id}` : '/chat')
    aoSelecionar()
  }
```

- [ ] **Step 4: Usar a prop nova na classe do `<aside>`**

Troque:

```tsx
    <aside
      className={`${apenasDesktop ? 'hidden lg:flex' : 'absolute inset-y-0 left-0 w-[78%] flex'} flex-col bg-black text-white lg:relative lg:inset-auto lg:w-[264px] lg:shrink-0 lg:border-r lg:border-white/10`}
    >
```

por:

```tsx
    <aside
      className={`${apenasDesktop ? 'hidden lg:flex' : 'absolute inset-y-0 left-0 w-[78%] flex'} flex-col bg-black text-white ${
        escondidoNoDesktop
          ? 'lg:hidden'
          : 'lg:relative lg:inset-auto lg:flex lg:w-[264px] lg:shrink-0 lg:border-r lg:border-white/10'
      }`}
    >
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros (ainda não há chamador passando `escondidoNoDesktop` —
isso é opcional e tem default `false`, então `Home.tsx`/`StudySession.tsx`
continuam funcionando sem mudança).

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/Sidebar.tsx
git commit -m "feat: Sidebar navega ao abrir chat + prop escondidoNoDesktop"
```

---

### Task 8: renomear `Home.tsx` → `Conversa.tsx`, sincronizar com a URL

**Files:**
- Rename: `src/ui/screens/Home.tsx` → `src/ui/screens/Conversa.tsx`
- Modify: `src/ui/screens/Conversa.tsx` (depois de renomeado)

**Interfaces:**
- Consumes: `useParams` de `react-router-dom`, `setChatAtivo` de `useChats()`
  (já existe no Context, só não era usado aqui).
- Produces: componente `Conversa` (export default) — consumido pela Task 9
  (`App.tsx` passa a importar `Conversa` em vez de `Home`).

- [ ] **Step 1: Renomear o arquivo**

```bash
git mv src/ui/screens/Home.tsx src/ui/screens/Conversa.tsx
```

- [ ] **Step 2: Atualizar o comentário do topo do arquivo**

Em `src/ui/screens/Conversa.tsx`, troque:

```tsx
/*
  Tela principal (Home) — é TAMBÉM onde a conversa acontece, na MESMA tela.
  - Sem conversa ativa: mostra a saudação (+ chips + campo).
  - Ao enviar: vira um chat novo (entra no histórico) e as mensagens aparecem
    AQUI MESMO, no lugar da saudação. Nada de tela separada.
  Tocar na foto de perfil abre o menu lateral (Sidebar).
*/
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
```

por:

```tsx
/*
  Conversa — onde o chat acontece (rotas /chat e /chat/:id). Já foi a tela
  inicial do app ("Home"); agora quem recebe primeiro é o Painel ("/"), que
  leva pra cá ao clicar em "Novo Chat"/um atalho ou digitar na caixa de lá.
  - Sem conversa ativa (/chat, sem id): mostra a saudação (+ chips + campo).
  - Ao enviar: vira um chat novo (entra no histórico) e as mensagens aparecem
    AQUI MESMO, no lugar da saudação. Nada de tela separada.
  Tocar na foto de perfil abre o menu lateral (Sidebar).
*/
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
```

- [ ] **Step 3: Sincronizar o chat ativo com o `:id` da URL**

Troque:

```tsx
function Home() {
  const navigate = useNavigate()
  const [menuAberto, setMenuAberto] = useState(false)
  // true enquanto o mouse está sobre o CTA "Descubra o Astro!" (visitante, sem
  // login) na Sidebar — revela a aurora de fundo por baixo do véu escuro.
  const [auroraAtiva, setAuroraAtiva] = useState(false)
  const [texto, setTexto] = useState('')
  const [focado, setFocado] = useState(false) // campo em foco? controla a expansão/descida do composer
  const [statusIdx, setStatusIdx] = useState(0)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fimRef = useRef<HTMLDivElement>(null)
  const { criarChat, enviarMensagem, editarMensagem, pararResposta, obterChat, chatAtivoId, pensandoId } = useChats()

  const chatAtivo = chatAtivoId ? obterChat(chatAtivoId) : undefined
```

por:

```tsx
function Conversa() {
  const navigate = useNavigate()
  // :id da rota /chat/:id — ausente em /chat (chat em branco, mostra a saudação)
  const { id } = useParams<{ id: string }>()
  const [menuAberto, setMenuAberto] = useState(false)
  // true enquanto o mouse está sobre o CTA "Descubra o Astro!" (visitante, sem
  // login) na Sidebar — revela a aurora de fundo por baixo do véu escuro.
  const [auroraAtiva, setAuroraAtiva] = useState(false)
  const [texto, setTexto] = useState('')
  const [focado, setFocado] = useState(false) // campo em foco? controla a expansão/descida do composer
  const [statusIdx, setStatusIdx] = useState(0)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fimRef = useRef<HTMLDivElement>(null)
  const { criarChat, enviarMensagem, editarMensagem, pararResposta, obterChat, chatAtivoId, setChatAtivo, pensandoId } =
    useChats()

  // sincroniza o chat ativo com a URL: /chat/:id abre aquele chat, /chat (sem
  // id) volta pra saudação. A URL é quem manda — a Sidebar só navega (Task 7).
  useEffect(() => {
    setChatAtivo(id ?? null)
  }, [id, setChatAtivo])

  const chatAtivo = chatAtivoId ? obterChat(chatAtivoId) : undefined
```

- [ ] **Step 4: Fazer `enviar()` navegar pro novo chat (reflete o id na URL)**

Troque:

```tsx
  function enviar() {
    const limpo = texto.trim()
    if (!limpo) return
    if (chatAtivoId) enviarMensagem(chatAtivoId, limpo) // continua o chat aberto
    else criarChat(limpo) // primeira mensagem: cria chat novo (já vira o ativo)
    setTexto('')
```

por:

```tsx
  function enviar() {
    const limpo = texto.trim()
    if (!limpo) return
    if (chatAtivoId) {
      enviarMensagem(chatAtivoId, limpo) // continua o chat aberto
    } else {
      navigate(`/chat/${criarChat(limpo)}`) // 1ª mensagem: cria o chat e reflete o id na URL
    }
    setTexto('')
```

- [ ] **Step 5: Atualizar o export**

Troque:

```tsx
export default Home
```

por:

```tsx
export default Conversa
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: erro esperado em `src/App.tsx` (ainda importa `./ui/screens/Home`,
que não existe mais) — a Task 9 resolve isso. Confirme que o ÚNICO erro é
esse (nenhum erro dentro de `Conversa.tsx`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: renomeia Home.tsx para Conversa.tsx, sincroniza chat ativo com a URL"
```

---

### Task 9: `Painel.tsx` (skeleton navegável) + rotas em `App.tsx`

**Files:**
- Create: `src/ui/screens/Painel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Sidebar` com `escondidoNoDesktop` (Task 7), `Conversa` (Task 8),
  `useChats().criarChat` (já existe).
- Produces: componente `Painel` (export default) — tela em `/`. Os 4 atalhos
  mostram nome + explicação FIXOS nesta task (sem IA ainda — isso é a Task 10).

- [ ] **Step 1: Criar `Painel.tsx`**

Crie `src/ui/screens/Painel.tsx`:

```tsx
/*
  Painel — tela inicial do app ("/"). Convida o aluno a agir: título +
  campo de chat (digitar = cria um chat novo, igual ao atalho "Novo Chat") +
  4 atalhos pras áreas do app (Novo Chat, Estudar, Trabalhos, Provas).

  Nesta primeira versão os 4 atalhos mostram nome + explicação FIXOS (sem
  personalização ainda — isso entra na task seguinte, que liga o motor de
  insight). Trabalhos e Provas ainda não têm funcionalidade: clicar neles
  abre um aviso "em breve" com o que está planejado.

  Sidebar: no DESKTOP fica escondida aqui (tela cheia, sem coluna lateral) —
  só reaparece ao entrar numa área de trabalho (Chat/Estudar). No MOBILE
  continua sendo o drawer de sempre (avatar no topo abre).
*/
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useChats } from '../chats'

type ChaveAtalho = 'novoChat' | 'estudar' | 'trabalhos' | 'provas'

type Atalho = {
  chave: ChaveAtalho
  nome: string
  explicacao: string
  icone: ReactNode
}

const ATALHOS: Atalho[] = [
  {
    chave: 'novoChat',
    nome: 'Novo Chat',
    explicacao: 'Converse com o Astrodny sobre qualquer matéria, dúvida ou ideia.',
    icone: <IconeChatAtalho />,
  },
  {
    chave: 'estudar',
    nome: 'Estudar',
    explicacao: 'Jogue um PDF ou digite um tema e aprenda em porções, no seu ritmo.',
    icone: <IconeEstudarAtalho />,
  },
  {
    chave: 'trabalhos',
    nome: 'Trabalhos',
    explicacao: 'Monte um trabalho formatado em ABNT, do sumário à entrega.',
    icone: <IconeTrabalhosAtalho />,
  },
  {
    chave: 'provas',
    nome: 'Provas',
    explicacao: 'Treine pra uma prova ou concurso com cronômetro, acertos e erros.',
    icone: <IconeProvasAtalho />,
  },
]

// Conteúdo do modal "em breve" — o que cada função vai fazer quando pronta
// (lista de verdade o que está planejado, não é só um aviso genérico).
const EM_BREVE: Record<'trabalhos' | 'provas', { titulo: string; descricao: string }> = {
  trabalhos: {
    titulo: 'Trabalhos com ABNT — em breve',
    descricao:
      'Você vai poder contar o tema e os requisitos, o Astrodny propõe o sumário, escreve ' +
      'seção por seção com você aprovando ou ajustando cada uma, e entrega o trabalho pronto, ' +
      'formatado em ABNT (.docx/.pdf) — sem perder nota por causa de margem ou citação errada.',
  },
  provas: {
    titulo: 'Provas — em breve',
    descricao:
      'Um modo de treino separado do Estudar: perguntas cronometradas, acertos e erros ' +
      'registrados, várias tentativas e explicação de cada resposta — pra treinar pra prova ' +
      'ou concurso igual quem já sabe o conteúdo, só precisa de ritmo e repertório.',
  },
}

function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function Painel() {
  const navigate = useNavigate()
  const { criarChat } = useChats()
  const [menuAberto, setMenuAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [emBreve, setEmBreve] = useState<'trabalhos' | 'provas' | null>(null)

  function enviar() {
    const limpo = texto.trim()
    if (!limpo) return
    navigate(`/chat/${criarChat(limpo)}`)
  }

  function clicarAtalho(chave: ChaveAtalho) {
    if (chave === 'novoChat') navigate('/chat')
    else if (chave === 'estudar') navigate('/estudar')
    else setEmBreve(chave)
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#1a1a1c] lg:flex">
      <Sidebar aoSelecionar={() => setMenuAberto(false)} escondidoNoDesktop />

      <div
        className={`relative z-10 min-h-dvh transition-all duration-300 lg:flex-1 lg:translate-x-0 lg:blur-none ${
          menuAberto ? 'translate-x-[78%] blur-[2px]' : 'translate-x-0'
        }`}
      >
        <div className="fundo-aurora absolute inset-0 -z-20">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <span className="blob blob-3" />
        </div>
        <div
          className={`absolute inset-0 -z-10 bg-[#2e2f36] transition-opacity duration-300 ${
            menuAberto ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* header mobile: avatar abre o drawer da Sidebar (no desktop ela já
            some de vez — sem header, ver Sidebar escondidoNoDesktop) */}
        <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 lg:hidden">
          <button type="button" aria-label="Abrir menu" onClick={() => setMenuAberto(true)} className="shrink-0">
            <img src="/perfil.png" alt="Foto de perfil" className="h-12 w-12 rounded-full object-cover border-2 border-white" />
          </button>
          <img src="/logo.png" alt="Astrodny" className="h-9 w-auto" />
        </header>

        <main className="relative z-10 flex min-h-dvh flex-col justify-center gap-8 px-6 pt-24 pb-10 text-white lg:flex-row lg:items-center lg:gap-16 lg:px-16">
          {/* título + campo de chat */}
          <div className="flex flex-col lg:flex-1 lg:max-w-xl">
            <p className="text-xl text-white/80">{saudacao()}, Universitário!</p>
            <h1 className="mt-1 text-[28px] font-bold leading-tight lg:text-4xl">O que temos para fazer hoje?</h1>

            <div className="mt-6 flex items-center gap-2 rounded-[26px] border border-white/50 bg-white/5 pl-4 pr-2 py-1.5 backdrop-blur-md">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    enviar()
                  }
                }}
                placeholder="Quer fazer um trabalho rápido em ABNT?"
                className="flex-1 bg-transparent font-sans text-[16px] leading-6 text-white placeholder:text-white/40 outline-none py-1.5"
              />
              <button
                type="button"
                onClick={enviar}
                onMouseDown={(e) => e.preventDefault()}
                disabled={!texto.trim()}
                aria-label="Enviar"
                className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#0a1560] transition-opacity active:opacity-70 disabled:opacity-40"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V6M6 12l6-6 6 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* os 4 atalhos */}
          <div className="flex flex-col gap-3 lg:w-[22rem] lg:shrink-0">
            {ATALHOS.map((a) => (
              <button
                key={a.chave}
                type="button"
                onClick={() => clicarAtalho(a.chave)}
                className="flex items-start gap-3 rounded-xl border border-black/15 bg-white px-4 py-3.5 text-left text-black shadow-sm transition-transform hover:scale-[1.01]"
              >
                <span className="mt-0.5 shrink-0 text-[#0a1560] [&>svg]:h-5 [&>svg]:w-5">{a.icone}</span>
                <span>
                  <span className="block text-[15px] font-semibold">{a.nome}</span>
                  <span className="block text-[13px] leading-snug text-black/60">{a.explicacao}</span>
                </span>
              </button>
            ))}
          </div>
        </main>

        {menuAberto && <div className="absolute inset-0 z-20" onClick={() => setMenuAberto(false)} />}
      </div>

      {emBreve && (
        <ModalEmBreve
          titulo={EM_BREVE[emBreve].titulo}
          descricao={EM_BREVE[emBreve].descricao}
          aoFechar={() => setEmBreve(null)}
        />
      )}
    </div>
  )
}

function ModalEmBreve({ titulo, descricao, aoFechar }: { titulo: string; descricao: string; aoFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center lg:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={aoFechar} />
      <div className="animar-subida relative z-10 w-full border border-white/10 bg-[#141416] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white rounded-t-3xl lg:w-[26rem] lg:rounded-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 lg:hidden" />
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">{descricao}</p>
        <button
          type="button"
          onClick={aoFechar}
          className="mt-5 w-full rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/5"
        >
          Entendi
        </button>
      </div>
    </div>
  )
}

function IconeChatAtalho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-12.1 7.6L3 21l1.9-5.9A8.4 8.4 0 1 1 21 11.5z" />
    </svg>
  )
}

function IconeEstudarAtalho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 22Z" />
      <path d="M4 5.5v14A2.5 2.5 0 0 0 6.5 22" />
    </svg>
  )
}

function IconeTrabalhosAtalho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </svg>
  )
}

function IconeProvasAtalho() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </svg>
  )
}

export default Painel
```

- [ ] **Step 2: Atualizar `App.tsx`**

Em `src/App.tsx`, troque o conteúdo inteiro por:

```tsx
import { Routes, Route } from 'react-router-dom'
import Painel from './ui/screens/Painel'
import Conversa from './ui/screens/Conversa'
import StudySession from './ui/screens/StudySession'
import Settings from './ui/screens/Settings'

/*
  Moldura de celular + rotas.
  "/"         -> Painel (tela inicial: título + sugestões + os 4 atalhos)
  "/chat"     -> Conversa, chat em branco (a conversa acontece aqui, inline)
  "/chat/:id" -> Conversa, abre um chat existente do histórico
  "/estudar"  -> Sessão de Estudo (o fluxo de 5 telas)
  "/config"   -> Configurações (personalidade do tutor, etc.)
*/
function App() {
  return (
    <div className="min-h-dvh w-full flex justify-center bg-[#05060f]">
      {/* moldura de celular SÓ no mobile: em telas grandes (lg+) o teto some e o
          app ocupa a largura toda, pra caber a sidebar fixa + o conteúdo. */}
      <div className="w-full max-w-[440px] lg:max-w-none">
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/chat" element={<Conversa />} />
          <Route path="/chat/:id" element={<Conversa />} />
          <Route path="/estudar" element={<StudySession />} />
          <Route path="/config" element={<Settings />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Checagem manual no navegador**

Run: `npm run dev`

No navegador: abra `/`, confirme que aparece o Painel (título + campo +
4 cards). Clique em "Novo Chat" → vai pra `/chat` e mostra a saudação antiga.
Digite algo no campo do Painel e dê Enter → cria um chat e navega pra
`/chat/<id>` com a mensagem já enviada. Volte pra `/`, clique em "Estudar" →
vai pra `/estudar`. Clique em "Trabalhos" e depois "Provas" → abre o modal
"em breve" certo pra cada um. No mobile (reduza a janela/DevTools), confirme
que o avatar no topo abre a Sidebar como drawer; no desktop (janela larga),
confirme que NÃO existe coluna de Sidebar na tela do Painel, mas ela aparece
assim que você entra em `/chat` ou `/estudar`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/Painel.tsx src/App.tsx
git commit -m "feat: Painel navegável (skeleton, sem IA) + rotas /chat e /chat/:id"
```

---

### Task 10: ligar o motor de insight real ao Painel

**Files:**
- Modify: `src/ui/screens/Painel.tsx`

**Interfaces:**
- Consumes: `useAuth` (`usuario`, `perfil`), `useStudies` (`estudos`),
  `useChats` (`chats`), `localStorageHomeInsightsRepository` (Task 6),
  `precisaAtualizar` (Task 5), `amostrarMensagensDeAbertura` (Task 2),
  `gerarInsightsPainel` (Task 4), `InsightsPainel` (Task 3).

- [ ] **Step 1: Adicionar os imports novos**

Em `src/ui/screens/Painel.tsx`, troque:

```tsx
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useChats } from '../chats'
```

por:

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useChats } from '../chats'
import { useAuth } from '../auth'
import { useStudies } from '../studies'
import { gerarInsightsPainel } from '../../application/homeInsights'
import { precisaAtualizar } from '../../application/homeInsightsCache'
import { amostrarMensagensDeAbertura } from '../../application/amostraChats'
import { localStorageHomeInsightsRepository } from '../../infrastructure/storage/localStorageHomeInsightsRepository'
import type { InsightsPainel } from '../../domain/painel'
import { retryProvider } from '../../infrastructure/ai/retryProvider'
import { proxyProvider } from '../../infrastructure/ai/proxyProvider'
import { fallbackProvider } from '../../infrastructure/ai/fallbackProvider'
import { ollamaProvider } from '../../infrastructure/ai/ollamaProvider'
import { groqProvider, groqConfigurado } from '../../infrastructure/ai/groqProvider'
import { geminiProvider, geminiConfigurado } from '../../infrastructure/ai/geminiProvider'
import { cloudflareProvider, cloudflareConfigurado } from '../../infrastructure/ai/cloudflareProvider'
```

- [ ] **Step 2: Declarar a cadeia de IA no topo do módulo**

Logo depois dos imports e antes de `type ChaveAtalho = ...`, adicione:

```tsx
// Mesma cadeia do chat (ver ui/chats.tsx): em PROD tudo pelo proxy (chaves
// escondidas no servidor); em DEV, Cloudflare/Gemini/Groq de reserva, Ollama
// local por último. retryProvider dá 1 retentativa silenciosa num 429.
const ia = retryProvider(
  import.meta.env.PROD
    ? proxyProvider
    : fallbackProvider([
        ...(cloudflareConfigurado ? [cloudflareProvider] : []),
        ...(geminiConfigurado ? [geminiProvider] : []),
        ...(groqConfigurado ? [groqProvider] : []),
        ollamaProvider,
      ]),
)
```

- [ ] **Step 3: Buscar/gerar os insights dentro do componente**

Dentro de `function Painel() {`, troque:

```tsx
  const navigate = useNavigate()
  const { criarChat } = useChats()
  const [menuAberto, setMenuAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [emBreve, setEmBreve] = useState<'trabalhos' | 'provas' | null>(null)
```

por:

```tsx
  const navigate = useNavigate()
  const { usuario, perfil } = useAuth()
  const { estudos } = useStudies()
  const { chats, criarChat } = useChats()
  const [menuAberto, setMenuAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [emBreve, setEmBreve] = useState<'trabalhos' | 'provas' | null>(null)
  const [insights, setInsights] = useState<InsightsPainel | null>(null)
  const [carregandoInsights, setCarregandoInsights] = useState(false)

  // Busca/gera os insights UMA VEZ por visita ao Painel (ao montar). Visitante
  // (sem usuario) nunca chama a IA — fica sempre no texto genérico dos atalhos.
  useEffect(() => {
    if (!usuario) return

    const cache = localStorageHomeInsightsRepository.carregar()
    if (!precisaAtualizar(cache, estudos, Date.now())) {
      setInsights(cache!.insights)
      return
    }

    let cancelado = false
    setCarregandoInsights(true)
    const amostra = amostrarMensagensDeAbertura(chats, Date.now())
    gerarInsightsPainel(perfil, estudos, amostra, ia)
      .then((novosInsights) => {
        if (cancelado) return
        localStorageHomeInsightsRepository.salvar({ geradoEm: new Date().toISOString(), insights: novosInsights })
        setInsights(novosInsights)
      })
      .catch((e) => {
        // cai pro texto genérico (insights continua null) — nunca trava a tela
        console.warn('Painel: não consegui gerar os insights agora, caindo pro texto genérico', e)
      })
      .finally(() => {
        if (!cancelado) setCarregandoInsights(false)
      })

    return () => {
      cancelado = true
    }
    // perfil/estudos/chats são lidos só na montagem, de propósito — não quero
    // re-chamar a IA a cada mensagem nova enquanto a pessoa está no Painel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id])
```

- [ ] **Step 4: Mostrar a sugestão contextual nos cards (com fallback genérico)**

Troque:

```tsx
            {ATALHOS.map((a) => (
              <button
                key={a.chave}
                type="button"
                onClick={() => clicarAtalho(a.chave)}
                className="flex items-start gap-3 rounded-xl border border-black/15 bg-white px-4 py-3.5 text-left text-black shadow-sm transition-transform hover:scale-[1.01]"
              >
                <span className="mt-0.5 shrink-0 text-[#0a1560] [&>svg]:h-5 [&>svg]:w-5">{a.icone}</span>
                <span>
                  <span className="block text-[15px] font-semibold">{a.nome}</span>
                  <span className="block text-[13px] leading-snug text-black/60">{a.explicacao}</span>
                </span>
              </button>
            ))}
```

por:

```tsx
            {ATALHOS.map((a) => {
              const sugestao = insights?.sugestoes[a.chave]
              return (
                <button
                  key={a.chave}
                  type="button"
                  onClick={() => clicarAtalho(a.chave)}
                  className="flex items-start gap-3 rounded-xl border border-black/15 bg-white px-4 py-3.5 text-left text-black shadow-sm transition-transform hover:scale-[1.01]"
                >
                  <span className="mt-0.5 shrink-0 text-[#0a1560] [&>svg]:h-5 [&>svg]:w-5">{a.icone}</span>
                  <span>
                    <span className="block text-[15px] font-semibold">{a.nome}</span>
                    <span className="block text-[13px] leading-snug text-black/60">{sugestao ?? a.explicacao}</span>
                  </span>
                </button>
              )
            })}
```

- [ ] **Step 5: Spinner enquanto personaliza (só pra quem está logado)**

Troque:

```tsx
            <h1 className="mt-1 text-[28px] font-bold leading-tight lg:text-4xl">O que temos para fazer hoje?</h1>

            <div className="mt-6 flex items-center gap-2 rounded-[26px] border border-white/50 bg-white/5 pl-4 pr-2 py-1.5 backdrop-blur-md">
```

por:

```tsx
            <h1 className="mt-1 text-[28px] font-bold leading-tight lg:text-4xl">O que temos para fazer hoje?</h1>
            {carregandoInsights && (
              <span className="mt-3 inline-flex items-center gap-2 text-sm text-white/50">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/70" />
                Personalizando sugestões…
              </span>
            )}

            <div className="mt-6 flex items-center gap-2 rounded-[26px] border border-white/50 bg-white/5 pl-4 pr-2 py-1.5 backdrop-blur-md">
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Checagem manual no navegador**

Run: `npm run dev`

Logado (Google): abra `/`, confirme que aparece "Personalizando sugestões…"
brevemente e, quando a IA responder, os cards cujo atalho teve sugestão
mostram o texto novo (os sem sinal continuam com a explicação padrão). Saia
da conta: confirme que os 4 cards voltam pro texto genérico e NENHUMA
chamada de IA é feita (checar aba Network do DevTools — sem request ao
`/api/*` ou ao provider de IA ao abrir o Painel anônimo).

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/Painel.tsx
git commit -m "feat: liga o motor de insight real ao Painel (cache 5h + fallback genérico)"
```

---

### Task 11: rotação do título

**Files:**
- Modify: `src/ui/screens/Painel.tsx`

**Interfaces:**
- Consumes: `insights` (estado já existente da Task 10).

- [ ] **Step 1: Sortear e rotacionar o título**

Dentro de `function Painel() {`, logo depois do bloco `useEffect` de buscar
insights (Task 10, Step 3), adicione:

```tsx

  const [tituloIdx, setTituloIdx] = useState(0)

  // ao chegar um novo lote de títulos (entrou na tela / terminou de gerar),
  // começa por um sorteado — não sempre o primeiro, pra não repetir toda vez
  // a mesma abertura.
  useEffect(() => {
    if (insights && insights.titulos.length > 0) {
      setTituloIdx(Math.floor(Math.random() * insights.titulos.length))
    }
  }, [insights])

  // parado no Painel, troca de título devagar — não é um carrossel rápido,
  // isso competiria com a leitura.
  useEffect(() => {
    if (!insights || insights.titulos.length < 2) return
    const t = setInterval(() => {
      setTituloIdx((i) => (i + 1) % insights.titulos.length)
    }, 50_000)
    return () => clearInterval(t)
  }, [insights])

  const titulo = insights?.titulos[tituloIdx] ?? 'O que temos para fazer hoje?'
```

- [ ] **Step 2: Usar o título dinâmico no `<h1>`**

Troque:

```tsx
            <h1 className="mt-1 text-[28px] font-bold leading-tight lg:text-4xl">O que temos para fazer hoje?</h1>
```

por:

```tsx
            <h1 key={tituloIdx} className="animar-subida mt-1 text-[28px] font-bold leading-tight lg:text-4xl">
              {titulo}
            </h1>
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Checagem manual no navegador**

Run: `npm run dev`

Logado, com insights carregados: confirme que o título muda (com uma
animação sutil de entrada) toda vez que você sai do Painel e volta. Pra
testar o ciclo automático sem esperar 50s, abra o DevTools console e rode
`setInterval` manualmente não é necessário — baixe temporariamente o valor
`50_000` pra `5_000` no código, confirme que troca sozinho, e DEVOLVA pra
`50_000` antes de commitar.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/Painel.tsx
git commit -m "feat: rotação do título do Painel (sorteio + ciclo lento de 50s)"
```

---

## Self-Review

**Cobertura da spec:**
- Navegação (`/` = Painel, `/chat`+`/chat/:id` = Conversa, Sidebar
  escondida/reaparece) → Tasks 7, 8, 9. ✅
- Layout desktop/mobile, estilo dos cards → Task 9. ✅
- Dois caminhos independentes (digitar vs. clicar) → Task 9 Step 1
  (`enviar()` vs. `clicarAtalho()`). ✅
- Blocos Trabalhos/Provas clicáveis com modal "em breve" detalhado → Task 9
  (`ModalEmBreve` + `EM_BREVE`). ✅
- Motor de insight (perfil + estudos + amostra de chat, IA decide tudo, JSON)
  → Tasks 2, 3, 4. ✅
- Anônimo nunca chama IA → Task 10 Step 3 (`if (!usuario) return`). ✅
- Cache 5h + furo por evento → Tasks 5, 6, 10. ✅
- Rotação do título (sorteio + 45-60s) → Task 11 (fixei 50s, dentro da
  faixa). ✅
- Loading/erro (spinner, fallback genérico, nunca trava) → Task 10 Steps
  3 e 5. ✅
- Fora de escopo (Trabalhos/Provas reais, calendário, sync entre
  dispositivos) → intencionalmente NÃO implementado em nenhuma task. ✅

**Placeholders:** nenhum "TBD"/"TODO" — todo código e todo texto (inclusive
o conteúdo do modal "em breve") está escrito por completo.

**Consistência de tipos:** `ChaveAtalho` (Painel.tsx) e os campos de
`SugestoesPainel` (domain/painel.ts) usam exatamente os mesmos 4 nomes
(`novoChat`/`estudar`/`trabalhos`/`provas`), o que permite `insights?.sugestoes[a.chave]`
sem conversão — conferido nas Tasks 3 e 10.

**Escopo:** 11 tasks, cada uma com entregável próprio e testável. Como
nenhuma ferramenta de teste de componente React existe no projeto hoje
(`@testing-library`/jsdom não estão instalados), as tasks que tocam telas
(7, 8, 9, 10, 11) são verificadas por `tsc --noEmit` + checagem manual no
navegador; as tasks de lógica pura (1 a 6) têm TDD completo com Vitest,
seguindo o padrão já usado no projeto (`buildStudy`, `gradeExam`,
`montarPrompt...`).
