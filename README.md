Astrodny — Documento do Sistema
Assistente acadêmico (PWA mobile-first) que transforma o material do aluno em estudo guiado, com um chat como central de tudo.

Status: IA real integrada (chat + Estudar + prova). Serving: 100% NUVEM (proxy serverless Gemini→Groq). Falta o deploy público e o polimento final da UI. Última atualização: 2026-10-04

1. Visão e propósito
O Astrodny é uma central acadêmica para universitários. O aluno anexa o material da disciplina (PDF), e o sistema o transforma em uma aula guiada em porções: ensina cada bloco, faz perguntas para fixar e aplica uma prova ao final, mostrando o desempenho por tópico e o que precisa revisar.

O chat é a base — todos os fluxos (Estudar, Trabalhos, Provas) partem dele e retornam a ele. A ideia central as ações importantes ficam sempre visíveis, nunca soterradas num menu.

Público
Estudantes universitários que precisam estudar com pouco tempo e querem transformar material bruto (slides, PDFs de aula) em estudo estruturado e verificável.

Princípios de produto
Chat como central — ponto de partida e de retorno de todo fluxo.
Estudo em porções — nada de "leia 40 páginas"; ensina em blocos com verificação.
Verificável — desempenho e erros são reais e guardados, não decorativos.
Mobile-first — pensado para o celular antes do desktop.
2. Arquitetura
O sistema segue Clean Architecture enxuta, com Ports & Adapters. A regra de ouro: as dependências apontam para dentro. O domínio não conhece ninguém; a infraestrutura (detalhes) se encaixa nas portas definidas pela aplicação.

domain  ←  application (+ ports)  ←  infrastructure
                    ↑
                   ui (apresentação)
Camada	Responsabilidade	Conhece...
domain/	Tipos e regras puras (Study, Chat, ResultadoProva…)	ninguém
application/	Casos de uso + portas (contratos)	só o domínio
infrastructure/	Adaptadores (pdf.js, localStorage, IA)	as portas
ui/	React: telas e estado de apresentação	aplicação
Portas (contratos) e seus adaptadores
Porta (application/ports)	Adaptador atual (infrastructure)	Troca futura
AIProvider (generate, generateStream)	PROD: proxyProvider (nuvem) · DEV: ollamaProvider/diretos	—
TextExtractor	pdfExtractor (pdf.js legacy)	OCR, .docx…
ChatRepository	localStorageChatRepository	API/nuvem
StudyRepository	localStorageStudyRepository	API/nuvem
Consequência prática: trocar mock → IA real, ou localStorage → backend, é trocar o adaptador (1 linha const x = ...). Domínio, aplicação e telas não mudam.

2.1 Serving — 100% NUVEM (decisão definitiva)
Todo o produto roda em nuvem. Chat, Estudar (montar aula), prova (estágio 2) e narração passam pela nuvem em produção. Não há componente local no runtime do produto — o Ollama local é apenas conveniência de desenvolvimento (grátis/offline pra codar). O self-host (PC Gamer / RTX 3060) foi descartado: PC de terceiro e não confiável como servidor.

Front: PWA no Vercel (deploy automático do GitHub).
Backend: proxy serverless Edge (api/generate, api/stream) que esconde as chaves e roteia a cadeia Gemini → Groq server-side.
Chaveamento por ambiente (import.meta.env.PROD): PROD → proxyProvider (tudo pela nuvem); DEV → Ollama/diretos. Ver StudySession.tsx (ia/iaProva/iaNarracao) e chats.tsx.
Dados anônimos no Supabase (astrocore_dataset, pares input→output desde o dia 1 — matéria-prima do futuro Astro Core).
Custo: R$ 0 — sustentado pelo free tier (Gemini + Groq 120b/8b-instant), folgado para dezenas de usuários ativos. Migrar só com tração/receita.
Fragilidade conhecida: rate limit 429 em fluxos multi-chamada → tratar com mensagem amigável (degradação graciosa), nunca erro seco.
Estrutura de pastas
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
3. Fluxos principais
Estudo
Preparar (anexa PDFs)
  → Analisando: extractContent (texto real) → buildStudy → Study
  → Aula (ensina bloco + pergunta de fixação, por bloco)
  → Prova (coleta respostas) → gradeExam (nota real + % por bloco + erros)
  → Resultado (desempenho + "Pra revisar")
  → salvo no histórico (StudyRepository) e listado no Sidebar
Chat
Mensagem → chat(historico, AIProvider) → stream de texto (for await)
  → UI desenha token a token (efeito "digitando"), com botão "parar" (AbortController)
  → conversa persistida (ChatRepository)

