# Astrodny — Visão de Infraestrutura e Distribuição

**Data:** 2026-10-03
**Objetivo desta fase:** colocar o Astrodny na mão de **pessoas reais** (começando pela amiga de quem a dor nasceu), a **custo ~R$ 0**, sem depender de nenhum PC ligado — e, já de saída, começar a coletar a matéria-prima do futuro modelo próprio (**Astro Core**).

---

## 1. Contexto e restrições (as regras do jogo)

- **Orçamento ZERO** para IA/infra paga. Toda decisão respeita isso.
- **Sem servidor confiável próprio:** o PC Gamer (RTX 3060) é do irmão, uso imprevisível; o notebook é lento demais para servir. → O "cérebro" **não** pode depender de PC local em produção.
- **Público inclui menores de idade** → coleta de dados precisa ser **anônima** (sem PII) e com aviso de privacidade.
- **Estratégia de lançamento:** polir bastante antes de abrir ao público, mas com **a amiga usando desde cedo** (bússola de feedback, não "vácuo"). A infra é construída **em paralelo** ao polimento.

## 2. Decisões de arquitetura

### 2.1 Cérebro 100% na nuvem grátis, com hierarquia de custo
- **Tarefas pequenas** (chat, correção, tira-dúvidas, aula *objetiva*) → modelo **pequeno/barato**: Groq `llama-3.1-8b-instant` (cota folgada).
- **Tarefas grandes** (aula *completa*, prova) → modelo **forte**: Groq `gpt-oss-120b`.
- **Gemini `gemini-3.8-flash`** entra como reforço/overflow (free tier generoso; já plugado na cadeia do chat, na frente do Groq, poupando a cota do Groq).
- **Ollama local** permanece **só para desenvolvimento** (grátis, offline, iteração rápida na máquina do dev). Sai do caminho crítico dos usuários.
- Princípio preservado do usuário ("poupar tokens"): mandar **tarefa pequena para modelo pequeno** — é o que faz caber ~3x mais usuários na mesma cota grátis.

### 2.2 Serving: front estático + proxy serverless
- **Front (PWA Vite):** hospedado no **Vercel** (deploy automático a cada push no GitHub; PWA com `autoUpdate` → atualiza sozinho no aparelho do usuário).
- **Proxy:** função **serverless no Vercel** (`/api/generate`, `/api/stream`). É a peça central e faz **três trabalhos**: (a) esconde as chaves, (b) roteia com fallback entre provedores, (c) aplica rate-limit e (d) registra o evento anônimo.

### 2.3 O `proxyProvider` — mais um adaptador da porta `AIProvider`
- Nasce `src/infrastructure/ai/proxyProvider.ts`: implementa a porta `AIProvider`, mas fala com o **próprio proxy** (`/api/*`) em vez do modelo direto.
- A **lógica de negócio não muda** (`buildStudy`, `buildExam`, `chat`, correção): só muda *quem* implementa a porta.
- Seleção por ambiente na composição (`chats.tsx`, `StudySession.tsx`):
  - **DEV:** cadeia atual (Ollama local + providers diretos).
  - **PROD** (`import.meta.env.PROD`): `proxyProvider`.
- A cadeia **real** (`fallbackProvider([gemini, groq])`) migra para **dentro do servidor** (a função serverless), onde as chaves são lidas.

### 2.4 Chaves e segurança
- As chaves saem de `VITE_GROQ_API_KEY` / `VITE_GEMINI_API_KEY` (que vão para o bundle do cliente) e viram **`GROQ_API_KEY` / `GEMINI_API_KEY` sem o prefixo `VITE_`**, configuradas como **variáveis de ambiente do servidor** no Vercel.
- Resultado: a chave **nunca** chega ao navegador do usuário.
- Lição registrada: **nunca** colar chave em chat/repositório; rotacionar qualquer chave exposta.

### 2.5 Dados: sem login + coleta anônima (Supabase / Postgres)
- **Sem contas** no MVP (dados de estudo no `localStorage` do aparelho). Zero fricção para a amiga; zero PII para proteger.
- **"Sem login" ≠ "sem dados":** o proxy registra cada interação de forma **anônima** no **Supabase** (Postgres gerenciado; free tier de 500 MB — folgado para eventos anônimos; pausa só após ~1 semana *sem nenhum* uso, o que o uso real evita). Dev já conhece do FinancesPRO.
- Cada linha é um par **(entrada → saída)** — exatamente o formato de um exemplo de fine-tuning do Astro Core.
- `device_anon` = id aleatório gerado no 1º acesso (conta usuários distintos **sem** identificar ninguém).

Tabela (SQL do usuário; Postgres padrão — roda igual no Supabase):

```sql
create table astrocore_dataset (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    type text not null check (type in ('study_session', 'correction', 'chat')),
    subject text,
    input text,
    output text,
    device_anon uuid not null
);
create index idx_astrocore_dataset_device_anon on astrocore_dataset(device_anon);
create index idx_astrocore_dataset_subject on astrocore_dataset(subject);
create index idx_astrocore_dataset_created_at on astrocore_dataset(created_at);
```

### 2.6 Acesso restrito (piloto com a amiga)
- O "ambiente de teste da amiga" **é o deploy de produção**, apenas **não divulgado**.
- Para trancar de verdade, opcional: um **PIN** simples combinado (grátis, trivial).
- Ciclo de feedback: dev dá push → Vercel publica em ~1 min → amiga recarrega / PWA atualiza sozinho.

## 3. Orçamento de capacidade (free tiers, medido em 2026-10)

- Groq `gpt-oss-120b` (forte): 1.000 req/dia, **200k tokens/dia**.
- Groq `llama-3.1-8b-instant` (pequeno): 14.400 req/dia, **500k tokens/dia**.
- Gemini 2.x/3.x Flash: ~1.500 req/dia, TPM altíssimo.
- Custo real medido por ação: aula completa ~3.7k tok, prova ~2k tok, correção/chat ~0.7–1k tok.
- **Resultado:** ~30 a ~100 "estudos com prova" por dia só no Groq, + reforço do Gemini → **folgado para dezenas de usuários ativos**. Teto só aperta com tração real (problema bom; migração para GPU paga só com receita).

## 4. Visão de futuro: o Astro Core

- **Meta:** um modelo **especializado** na metodologia Astrodny (não um generalista). Vantagem de nicho — um modelo pequeno treinado no método pode superar um gigante "emprestando" o método via prompt.
- **Caminho:** **fine-tuning** (ex.: LoRA) de um open source já bom (Llama/Qwen 7–8B) com os dados coletados — **não** treinar do zero.
- **Divisão-chave:** CONHECIMENTO vem do modelo base + do material do aluno; **MÉTODO** vem do fine-tuning (o diferencial). Por isso não precisa "saber tudo".
- Cura definitiva dos problemas de consistência que hoje remediamos via prompt (omitir prova, perder forma): um modelo treinado no método não vacila na forma.
- Pré-requisito: acumular um "dataset dourado" (`astrocore_dataset`) — já começa no dia 1 do piloto.

## 5. Fora do escopo agora (depois)

- Contas de usuário / sincronização entre dispositivos (só quando usuários pedirem).
- Fine-tuning do Astro Core (só com dados + tração).
- GPU paga / cloud GPU (só com receita).
- Escala para milhares de usuários simultâneos (otimizar só após validar).

## 6. Riscos e tetos honestos

- Free tier é "quatro tetos correndo" (req/min, req/dia, tokens/min, tokens/dia) — o primeiro que estourar limita. Mitigação: hierarquia de modelos + fallback Gemini + rate-limit no proxy.
- Dependência de provedores de terceiros (free tier pode mudar regras) — mitigado pela arquitetura de portas (trocar provedor = trocar adaptador) e, no longo prazo, pelo Astro Core.
- **Pré-requisito operacional:** o deploy automático do Vercel exige o projeto no **GitHub** → será preciso `git init` + repositório (o projeto ainda não é um repo git).

## 7. Próximos passos de implementação (vai para o plano)

1. `proxyProvider.ts` (adaptador cliente) + seleção dev/prod na composição.
2. Função serverless `/api/generate` e `/api/stream` (cadeia real + chaves server-side + rate-limit).
3. Registro anônimo em `astrocore_dataset` (Neon) a partir do proxy.
4. Migração das chaves `VITE_*` → env server-side.
5. `git init` + repositório no GitHub + projeto no Vercel + Supabase conectado.
6. (Opcional) PIN de acesso para o piloto da amiga.
