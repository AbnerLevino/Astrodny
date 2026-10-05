  # Astrodny — Documento do Sistema

> Assistente acadêmico (PWA mobile-first) que transforma o material do aluno em
> estudo guiado, com um chat como central de tudo.

**Status:** IA real integrada (chat + Estudar + prova). **Serving: 100% NUVEM** (proxy
serverless Gemini→Groq). Falta o deploy público e o polimento final da UI.
**Última atualização:** 2026-10-04

---

## 1. Visão e propósito

O Astrodny é uma **central acadêmica** para universitários. O aluno anexa o material
da disciplina (PDF), e o sistema o transforma em uma **aula guiada em porções**:
ensina cada bloco, faz perguntas para fixar e aplica uma prova ao final, mostrando o
**desempenho por tópico** e o que precisa revisar.

O **chat é a base** — todos os fluxos (Estudar, Trabalhos, Provas) partem dele e
**retornam** a ele. A ideia central as ações importantes ficam sempre visíveis, 
nunca soterradas num menu.

### Público
Estudantes universitários que precisam estudar com pouco tempo e querem transformar
material bruto (slides, PDFs de aula) em estudo estruturado e verificável.

### Princípios de produto
- **Chat como central** — ponto de partida e de retorno de todo fluxo.
- **Estudo em porções** — nada de "leia 40 páginas"; ensina em blocos com verificação.
- **Verificável** — desempenho e erros são reais e guardados, não decorativos.
- **Mobile-first** — pensado para o celular antes do desktop.

---

## 2. Arquitetura

O sistema segue **Clean Architecture** enxuta, com **Ports & Adapters**. A regra de
ouro: as dependências apontam **para dentro**. O domínio não conhece ninguém; a
infraestrutura (detalhes) se encaixa nas portas definidas pela aplicação.

```
domain  ←  application (+ ports)  ←  infrastructure
                    ↑
                   ui (apresentação)
```

| Camada | Responsabilidade | Conhece... |
|--------|------------------|------------|
| `domain/` | Tipos e regras puras (Study, Chat, ResultadoProva…) | ninguém |
| `application/` | Casos de uso + **portas** (contratos) | só o domínio |
| `infrastructure/` | Adaptadores (pdf.js, localStorage, IA) | as portas |
| `ui/` | React: telas e estado de apresentação | aplicação |

### Portas (contratos) e seus adaptadores

| Porta (`application/ports`) | Adaptador atual (`infrastructure`) | Troca futura |
|---|---|---|
| `AIProvider` (`generate`, `generateStream`) | **PROD:** `proxyProvider` (nuvem) · **DEV:** `ollamaProvider`/diretos | — |
| `TextExtractor` | `pdfExtractor` (pdf.js legacy) | OCR, .docx… |
| `ChatRepository` | `localStorageChatRepository` | API/nuvem |
| `StudyRepository` | `localStorageStudyRepository` | API/nuvem |

**Consequência prática:** trocar mock → IA real, ou localStorage → backend, é trocar
o adaptador (1 linha `const x = ...`). Domínio, aplicação e telas não mudam.

### 2.1 Serving — 100% NUVEM (decisão definitiva)

**Todo o produto roda em nuvem.** Chat, Estudar (montar aula), prova (estágio 2) e narração
passam pela nuvem em produção. Não há componente local no runtime do produto — o Ollama local
é **apenas conveniência de desenvolvimento** (grátis/offline pra codar). O self-host (PC Gamer /
RTX 3060) foi **descartado**: PC de terceiro e não confiável como servidor.

- **Front:** PWA no **Vercel** (deploy automático do GitHub).
- **Backend:** **proxy serverless Edge** (`api/generate`, `api/stream`) que **esconde as chaves**
  e roteia a cadeia **Gemini → Groq** server-side.
- **Chaveamento por ambiente** (`import.meta.env.PROD`): `PROD → proxyProvider` (tudo pela nuvem);
  `DEV → Ollama/diretos`. Ver `StudySession.tsx` (`ia`/`iaProva`/`iaNarracao`) e `chats.tsx`.
- **Dados anônimos** no **Supabase** (`astrocore_dataset`, pares input→output desde o dia 1 —
  matéria-prima do futuro *Astro Core*).
- **Custo:** R$ 0 — sustentado pelo **free tier** (Gemini + Groq 120b/8b-instant), folgado para
  dezenas de usuários ativos. Migrar só com tração/receita.
- **Fragilidade conhecida:** rate limit **429** em fluxos multi-chamada → tratar com mensagem
  amigável (degradação graciosa), nunca erro seco.

### Estrutura de pastas
```
src/
├── domain/
│   ├── study.ts        # Study, Block, Question, ProvaQuestion,
│   │                   # DesempenhoBloco, ErroProva, ResultadoProva, StudySalvo
│   └── chat.ts         # Mensagem, Chat
├── application/
│   ├── ports/          # AIProvider, TextExtractor, ChatRepository, StudyRepository
│   ├── buildStudy.ts   # conteúdo → prompt → IA → Study
│   ├── chat.ts         # histórico → prompt → stream da IA
│   ├── gradeExam.ts    # respostas → nota + desempenho por bloco + erros (puro)
│   ├── extractContent.ts # vários arquivos → texto único
│   └── prompts.ts      # montagem dos prompts de estudo
├── infrastructure/
│   ├── ai/mockProvider.ts
│   ├── documents/pdfExtractor.ts
│   └── storage/{localStorageChatRepository, localStorageStudyRepository}.ts
└── ui/
    ├── chats.tsx       # Context do chat (+ streaming, parar via AbortController)
    ├── studies.tsx     # Context dos estudos salvos
    └── screens/{Home, Sidebar, StudySession}.tsx
```

---

## 3. Fluxos principais

### Estudo
```
Preparar (anexa PDFs)
  → Analisando: extractContent (texto real) → buildStudy → Study
  → Aula (ensina bloco + pergunta de fixação, por bloco)
  → Prova (coleta respostas) → gradeExam (nota real + % por bloco + erros)
  → Resultado (desempenho + "Pra revisar")
  → salvo no histórico (StudyRepository) e listado no Sidebar
```

### Chat
```
Mensagem → chat(historico, AIProvider) → stream de texto (for await)
  → UI desenha token a token (efeito "digitando"), com botão "parar" (AbortController)
  → conversa persistida (ChatRepository)
```

---

## 4. O que já existe (Fase 0 — concluída)

- ✅ **Chat** com streaming, cancelamento (`AbortController`), negrito e composer unificado.
- ✅ **Fluxo de estudo** completo (5 telas) ligado por caso de uso.
- ✅ **Extração de PDF real** (`pdfExtractor`), com build *legacy* para compatibilidade
  com Safari iOS antigo.
- ✅ **Tratamento de erro** na leitura (não trava mais; volta com aviso).
- ✅ **Desempenho real por bloco** + captura de erros (`gradeExam`, `blocoIndex`).
- ✅ **Persistência** de chats e estudos (localStorage, via portas).
- ✅ **Seção "Estudos"** no Sidebar listando o histórico.
- ✅ **Testes** nas peças puras: `montarPrompt`, `extractContent`, `gradeExam`.

> Ressalva honesta da Fase 0: o conteúdo é **mock** (o mesmo estudo de Java, ignorando
> o PDF). A extração é real; a "inteligência" que dá sentido ao texto chega na Fase 1.

---

## 5. O que terá (roadmap)

### Fase 1 — IA real (próxima)
- `infrastructure/ai/ollamaProvider.ts`: `generate` + `generateStream` reais (HTTP → Ollama).
- Trocar `const ia = mockProvider` → `ollamaProvider` (chat e estudo).
- Afinar `prompts.ts` e o prompt do chat (instrução de sistema do Astrodny).
- Resultado: estudo e chat passam a refletir o material real do aluno; a IA usa os
  **erros salvos** para indicar o que revisar.

### Futuro
- **Perfil** persistido (hoje fixo).
- **Área de Estudos rica**: reabrir estudo, comparar desempenho por matéria/PDF, gráficos.
- **Fluxos de Trabalhos e Provas** (hoje só o botão existe).
- **Onboarding** (primeira vez do usuário).
- **PWA instalável** (manifest + service worker).
- **Backend real** (multi-usuário/nuvem): troca dos adaptadores de `storage` e `ai`
  por chamadas a um servidor + banco de dados; domínio e aplicação permanecem.

---

## 6. Stack técnica

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4.
- **Extração de PDF:** pdfjs-dist (build legacy).
- **IA:** 100% nuvem via proxy serverless (cadeia **Gemini 3.8 Flash → Groq gpt-oss-120b**;
  Groq 8b-instant pra tarefas leves). Ollama local só em DEV.
- **Testes:** Vitest (foco nas funções puras da `application`).
- **Fonte:** Instrument Sans. **Tema:** escuro.

---

## 7. Decisões de arquitetura (resumo)

- **Ports & Adapters** para todo recurso externo (IA, PDF, armazenamento): permite
  trocar o "como" sem tocar no "quê".
- **Streaming como `AsyncIterable`** na porta de IA: o efeito "digitando" mapeia 1:1
  no stream de tokens real do Ollama.
- **Cancelamento com `AbortController`** em vez de matar timers: modelo correto para
  o dia da IA real (interromper uma requisição de rede).
- **Funções puras testáveis** (`gradeExam`, `extractContent`, `montarPrompt`): a lógica
  de negócio é verificável sem UI nem rede.
- **Dois Contexts espelhados** (`chats`, `studies`): estado de apresentação reativo,
  com a persistência isolada atrás de portas.

---

## 8. Qualidade e verificação

- Tipagem estrita conferida com `tsc --noEmit` a cada mudança.
- Testes unitários nas peças puras (`npm test`).
- Lacunas conhecidas (dívida consciente): cobertura de testes ainda focada só no núcleo
  puro; tratamento de erro de rede do chat entra com a Fase 1 (o mock não falha).
```
