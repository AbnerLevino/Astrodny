# Painel (nova Home com cards de sugestão) — design

Data: 2026-10-05
Status: aprovado pelo usuário em conversa, aguardando plano de implementação

## Contexto / motivação

Hoje `/` é a própria tela de chat (`Home.tsx`, com Sidebar + saudação + composer).
Não existe uma tela "ponto de partida" que proponha o que fazer — o aluno chega e
precisa saber sozinho se quer conversar, estudar, fazer um trabalho ou treinar
pra uma prova.

A ideia: trocar isso por um **Painel** — tela inicial que, pra quem está logado,
usa perfil + comportamento recente pra **sugerir** o que fazer (não só listar
opções genéricas), e serve de hub pras 4 áreas do app: Novo Chat, Estudar,
Trabalhos (ABNT), Provas. Trabalhos e Provas-standalone ainda não têm
funcionalidade implementada — essa primeira versão já mostra os 4 blocos, mas
só Chat e Estudar funcionam de verdade.

## Navegação

- `/` passa a renderizar `ui/screens/Painel.tsx` (novo).
- O chat (hoje dentro de `Home.tsx`) migra pra `/chat` (novo chat) e `/chat/:id`
  (abre um chat existente do histórico). `Home.tsx` precisa de um nome novo já
  que deixa de ser a tela inicial — evitar `Chat.tsx` puro por colidir
  conceitualmente com `domain/chat.ts` (tipos `Mensagem`/`Chat`); o nome final
  do arquivo é detalhe a decidir no plano de implementação, não trava o design.
- **Sidebar no desktop:** fica **escondida** enquanto o usuário está no Painel
  (tela cheia, sem coluna lateral) e **reaparece** ao entrar em qualquer área
  de trabalho (`/chat`, `/estudar`, e futuramente Trabalhos/Provas). No mobile
  nada muda — a Sidebar já é um drawer escondido por padrão hoje.
- `Estudar` continua indo pra `/estudar` como já funciona.

## Layout

**Desktop:** título grande (rotativo, ver seção "Rotação do título") com um
campo de chat logo abaixo dele, à esquerda. À direita, 4 blocos empilhados
verticalmente — Novo Chat, Estudar, Trabalhos, Provas — estilizados como o
botão "Entrar com Google" do `ModalDescubraAstro` (branco, borda `black/15`,
sombra, `rounded-xl`), pra manter consistência visual já validada no app.

**Mobile:** tudo empilhado verticalmente — título + campo de chat no topo,
os 4 blocos abaixo, um por cima do outro (sem o layout lado a lado).

Cada um dos 4 blocos mostra: nome da funcionalidade (fixo, não gerado pela
IA) + explicação curta do que ela faz + (quando há sinal suficiente) uma
linha de sugestão contextual gerada pela IA. Sem sinal (usuário novo ou
anônimo), mostra só a explicação genérica, nunca inventa contexto.

## Dois caminhos independentes, não convergentes

- Digitar no campo de chat abaixo do título → vai para `/chat` com essa
  mensagem (equivalente a começar um novo chat digitando).
- Clicar em "Trabalhos"/"Estudar"/"Provas" → vai direto pro fluxo dedicado
  daquela função (não passa pelo chat).
- Clicar em "Novo Chat" → abre um chat em branco.
- **Os dois caminhos NÃO se misturam** — digitar não redireciona pro atalho
  e vice-versa. A ideia de "funcionam pros dois contextos" significa que,
  conceitualmente, dá pra pedir a mesma coisa tanto conversando (chat) quanto
  indo direto na função dedicada — não que um caminho leve ao outro.

## Blocos sem funcionalidade ainda (Trabalhos, Provas)

Continuam clicáveis (não ficam acinzentados/bloqueados). Ao clicar, abrem um
modal "em breve" descrevendo tudo que a função vai fazer quando estiver
pronta (não é só um aviso genérico — lista o que está planejado).

## Motor de insight (sugestões + título)

**Decisão de arquitetura:** a IA decide tudo numa única chamada — recebe o
contexto bruto (perfil + histórico) e devolve título(s) + as 4 sugestões já
prontos, em JSON. (Alternativa considerada — sistema filtra o que é elegível
e a IA só escreve o texto — foi descartada pelo usuário em favor de
simplicidade de implementação; aceito o trade-off de ser menos previsível.)

**Dados de entrada do prompt:**
- Perfil (`curso`, `nivel`, `materias`).
- Lista de `estudos` salvos (nome, resultado, data) — já existe via
  `StudyRepository`.
- Amostra de **até 5 mensagens de abertura** de chats **criados nas últimas
  5 horas** (só a primeira mensagem de cada chat, não a conversa inteira) —
  sinal leve sobre temas recorrentes, sem explodir tokens. Cresce aos poucos
  a cada ciclo de 5h.
- **Fora de escopo nesta v1:** calendário/provas agendadas. Essa feature
  (Fase 3+ do roadmap) não existe ainda — quando existir, vira mais uma fonte
  pro prompt.

**Saída (JSON):** array de títulos (pra variar, ver "Rotação do título") +
sugestão por bloco (`novoChat`/`estudar`/`trabalhos`/`provas`), cada uma com
texto contextual OU `null`/ausente quando não há sinal suficiente (cai pro
texto genérico fixo no código).

**Anônimo:** nunca dispara essa chamada. Vê sempre a cópia genérica fixa (os
4 blocos com explicação padrão, sem personalização), mesma saudação
("Bom dia! O que temos pra fazer hoje?"). Serve de vitrine do que o app faz,
reforçando o convite a logar (já existe o CTA "Descubra o Astro!" na
Sidebar).

## Cache e atualização

- 1 chamada de IA por usuário logado a cada **5 horas**, cacheada.
- **Furo de cache antecipado:** terminar um estudo ou uma prova força nova
  geração na próxima vez que o Painel for aberto, mesmo que não tenham
  passado as 5h — evita ficar com sugestão desatualizada logo após uma
  atividade real.
- Armazenamento do cache: segue o padrão de portas já usado no projeto
  (`SettingsRepository`/`ChatRepository`/`StudyRepository` + adaptador
  `localStorage`) — novo port `HomeInsightsRepository` com adaptador
  `localStorageHomeInsightsRepository` (chave `astrodny:painel`, guardando
  `{geradoEm, titulos, sugestoes}`). Não sincroniza entre dispositivos nesta
  v1 (YAGNI — se virar necessidade real, migra pra Supabase como o perfil).

## Rotação do título

- Ao **voltar pro Painel**, mostra o próximo título do array gerado
  (cicla pela lista, não repete o mesmo em sequência se houver mais de um).
- Se o usuário **ficar parado** na tela, troca lentamente a cada **45-60s**
  (não um timer curto tipo 10-15s — isso compete com a leitura e cansa).

## Estados

- **Loading:** spinner enquanto a 1ª chamada do ciclo ainda não respondeu.
  Não há versão "skeleton com fallback imediato" — o usuário espera a
  resposta real.
- **Erro (ex. 429 do free tier, falha de rede):** cai pro mesmo texto
  genérico do anônimo. Nunca trava, nunca mostra erro feio.
- Números reais de latência serão medidos depois que a chamada existir
  (não há dado hoje pra prometer um tempo).

## Fora de escopo desta v1 (anotado, não esquecido)

- Funcionalidade real de Trabalhos e Provas-standalone (só os blocos +
  modal "em breve").
- Dado de calendário/cronograma no prompt do motor de insight.
- Sincronizar o cache do Painel entre dispositivos (fica local por enquanto).
