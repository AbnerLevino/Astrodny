CONTEXTO DO PROJETO



Astrodny é inicialmente como um projeto pessoal e experimental, um aplicativo mobile-first voltado para estudantes universitários.



Quero desenvolver esse projeto seguindo princípios reais de Engenharia de Software, mas neste momento não quero começar pelo backend nem sair escrevendo código. Quero primeiro pensar no produto, nas necessidades do usuário, na experiência, nos fluxos, nos requisitos e na arquitetura conceitual. Depois disso, a implementação será construída gradualmente.



A ideia surgiu a partir de problemas observados no uso atual de IAs como ChatGPT por estudantes universitários.



O objetivo não é simplesmente criar “mais um chatbot”.



O objetivo é criar uma espécie de assistente acadêmico pessoal, no qual a IA seja uma camada inteligente dentro de um sistema próprio, entendendo o contexto do estudante e ajudando-o a estudar, aprender, se organizar e executar atividades acadêmicas.



⸻



1\. PROBLEMA



Estudantes universitários utilizam IA para estudar e realizar trabalhos, mas existem diversos problemas:



\* respostas excessivamente artificiais ou genéricas;

\* respostas longas quando o aluno precisava de objetividade;

\* dificuldade para adaptar a explicação ao nível real do estudante;

\* dificuldade para fazer a IA compreender o contexto acadêmico do aluno;

\* dificuldade na interpretação de gráficos e imagens;

\* dificuldade para trabalhar corretamente com arquivos;

\* dificuldade para organizar provas, trabalhos, atividades e compromissos;

\* dificuldade para transformar conteúdos em métodos de estudo;

\* dificuldade para manter contexto entre diferentes sessões;

\* o estudante frequentemente recebe uma resposta pronta, mas não necessariamente desenvolve seu próprio raciocínio;

\* o aluno precisa explicar repetidamente para a IA quem ele é, o que estuda e qual é sua dificuldade.



O aplicativo pretende atacar esses problemas através de uma experiência integrada.



⸻



2\. VISÃO DO PRODUTO



O aplicativo existe para:



Ajudar estudantes universitários a estudar utilizando diferentes métodos, desenvolver o próprio raciocínio através de perguntas, exercícios e testes, compreender conteúdos de maneira objetiva e clara, organizar sua vida acadêmica e executar atividades relacionadas aos estudos.



O aplicativo deve conhecer o estudante progressivamente.



Em vez de começar com uma tela vazia dizendo apenas “Digite sua pergunta”, o sistema deve possuir contexto sobre o usuário.



A IA deve saber, dentro dos limites definidos pelo sistema:



\* quem é o estudante;

\* o que ele estuda;

\* quais matérias possui;

\* qual é seu nível de conhecimento;

\* quais são seus objetivos;

\* quais dificuldades enfrenta;

\* como prefere estudar;

\* quais assuntos despertam seu interesse;

\* quais conteúdos já estudou;

\* quais dificuldades já apresentou;

\* quais métodos funcionaram ou não para ele.



A intenção é que a experiência pareça menos como conversar com uma IA genérica e mais como utilizar uma ferramenta construída especificamente para a vida acadêmica daquele estudante.



⸻



3\. PÚBLICO-ALVO



O público inicial são:



Estudantes universitários que possuem dificuldades para estudar, aprender matérias, organizar sua rotina acadêmica e executar trabalhos e atividades.



O produto não deve assumir que todos os estudantes possuem o mesmo nível, rotina ou método de aprendizagem.



A personalização é uma parte central do produto.



⸻



4\. FILOSOFIA DO PRODUTO



Um princípio fundamental do projeto é:



A IA não deve substituir o raciocínio do estudante. Ela deve ajudar o estudante a desenvolver esse raciocínio.



Por exemplo, quando o estudante estiver aprendendo determinado conteúdo, o sistema poderá:



\* fazer perguntas;

\* propor exercícios;

\* criar testes;

\* pedir que o estudante explique algo;

\* identificar lacunas de conhecimento;

\* adaptar a dificuldade;

\* apresentar uma explicação quando necessário;

\* fornecer feedback;

\* sugerir outro método de estudo.



Portanto, o sistema não deve ser pensado apenas como:



Pergunta → resposta.



Pode existir uma relação:



Conteúdo → diagnóstico → método → prática → tentativa → feedback → evolução.



⸻



5\. ONBOARDING



O primeiro contato do usuário com o aplicativo deverá construir seu perfil acadêmico inicial.



O onboarding atualmente pensado possui estas perguntas:



1\. Como podemos te chamar?



Objetivo:



\* conhecer o nome/apelido do usuário;

\* criar proximidade;

\* personalizar a experiência.



2\. Atualmente, você estuda o quê?



Objetivo:



\* identificar curso/faculdade;

\* identificar áreas e matérias;

\* fornecer contexto acadêmico para a IA.



Essa informação deverá futuramente ser estruturada, e não simplesmente armazenada como um texto gigante.



Exemplo conceitual:



Curso:



\* Análise e Desenvolvimento de Sistemas



Matérias:



\* Java

\* Banco de Dados

\* Engenharia de Software



3\. Qual é seu nível de afinidade?



Objetivo:



\* entender o nível de conhecimento do estudante.



Os níveis podem ser:



\* iniciante;

\* básico;

\* intermediário;

\* avançado.



Essa informação pode futuramente ser relacionada a cada matéria ou área, pois um estudante pode ser iniciante em Java e avançado em Banco de Dados.



4\. O que você almeja conseguir?



Objetivo:



\* compreender os objetivos do estudante.



Exemplos:



\* passar em provas;

\* melhorar notas;

\* aprender realmente uma matéria;

\* desenvolver determinada habilidade;

\* fazer trabalhos;

\* organizar os estudos;

\* se preparar para uma avaliação.



5\. O que mais dificulta seus estudos atualmente?



Objetivo:



\* identificar os obstáculos do estudante.



Exemplos:



\* dificuldade de concentração;

\* dificuldade para começar;

\* dificuldade para entender teoria;

\* dificuldade para praticar;

\* dificuldade para memorizar;

\* dificuldade para organizar o tempo;

\* dificuldade em determinadas matérias.



Essa pergunta é importante porque “objetivo” e “problema” são informações diferentes.



6\. Como você gosta de estudar?



Objetivo:



\* entender as preferências de aprendizagem.



Exemplos:



\* vídeos/aulas;

\* resumos;

\* anotações;

\* exercícios;

\* perguntas;

\* testes;

\* explicações;

\* prática;

\* combinação de métodos.



7\. Quais assuntos você mais gosta?



Objetivo:



\* adicionar uma dimensão mais humana ao perfil;

\* entender interesses;

\* permitir que o sistema personalize exemplos e abordagens quando fizer sentido.



⸻



6\. PERFIL DO ESTUDANTE



O onboarding não deve ser entendido apenas como um formulário.



Ele representa a construção inicial do Perfil do Estudante.



Esse perfil poderá conter informações como:



\* identidade;

\* curso;

\* instituição;

\* matérias;

\* nível por matéria;

\* objetivos;

\* dificuldades;

\* preferências de estudo;

\* interesses.



Porém, é importante separar:



Perfil



Informações relativamente estáveis.



Exemplo:



Curso: ADS

Interesse: programação

Objetivo: aprender Java



Memória/contexto



Informações que mudam conforme o estudante utiliza o aplicativo.



Exemplo:



O estudante possui dificuldade com JOINs em SQL.



O estudante teve dificuldade em determinado assunto.



O estudante possui uma prova de Banco de Dados na sexta-feira.



Exercícios práticos funcionaram melhor para determinado conteúdo.



O estudante já estudou determinado material.



Essa distinção deverá ser considerada posteriormente na arquitetura.



⸻



7\. FUNCIONALIDADES POSSÍVEIS



O projeto possui uma visão mais ampla de funcionalidades, mas não significa que todas devem estar no primeiro MVP.



Entre as ideias levantadas estão:



Estudos



\* diferentes métodos de estudo;

\* geração de perguntas;

\* exercícios;

\* testes;

\* explicações adaptadas ao nível;

\* resumos;

\* revisão;

\* acompanhamento da evolução.



IA e conteúdo



\* conversa contextualizada;

\* análise de materiais;

\* leitura de PDFs;

\* interpretação de imagens;

\* interpretação de gráficos;

\* perguntas sobre documentos;

\* geração de exercícios;

\* personalização da explicação.



Trabalhos acadêmicos



\* auxílio na execução de trabalhos;

\* interpretação de arquivos;

\* auxílio com documentos;

\* futuramente, possibilidade de trabalhar com Excel;

\* futuramente, suporte a padrões acadêmicos como ABNT.



Organização



\* calendário;

\* provas;

\* trabalhos;

\* atividades;

\* datas importantes;

\* notificações;

\* organização da rotina acadêmica.



Voz



\* leitura de conteúdos;

\* interação por voz;

\* perguntas sobre conteúdos lidos.



Atividades extracurriculares



O estudante poderá registrar:



\* horas;

\* eventos;

\* atividades;

\* documentos;

\* informações relacionadas às atividades extracurriculares.



Essas informações poderiam permanecer armazenadas durante a graduação.



⸻



8\. PRINCÍPIO IMPORTANTE: IA ≠ SISTEMA INTEIRO



A IA não deve ser responsável por tudo.



O sistema deverá separar claramente:



Responsabilidade da aplicação



\* autenticação;

\* usuários;

\* banco de dados;

\* matérias;

\* calendário;

\* notificações;

\* arquivos;

\* registros;

\* validações;

\* regras de negócio;

\* permissões;

\* histórico.



Responsabilidade da IA



\* interpretar linguagem;

\* compreender intenção;

\* gerar explicações;

\* analisar conteúdo;

\* formular perguntas;

\* sugerir métodos;

\* adaptar explicações;

\* transformar linguagem natural em estruturas que o sistema possa interpretar.



A IA pode interpretar:



“Tenho prova de Banco de Dados sexta às 19h.”



E produzir uma estrutura semelhante conceitualmente a:



tipo: evento

categoria: prova

disciplina: Banco de Dados

data: sexta-feira

horário: 19:00



Mas quem valida, confirma e registra o evento deve ser o sistema.



A regra fundamental é:



A IA interpreta e propõe. O software valida e executa.



⸻



9\. ARQUITETURA FUTURA



A arquitetura ainda não está fechada.



Uma possibilidade futura é:



Aplicativo Mobile / PWA

&#x20;       ↓

Backend

&#x20;       ↓

Serviços da aplicação

&#x20;       ↓

Camada de IA

&#x20;       ↓

Modelo de linguagem



Podendo existir posteriormente:



\* Spring Boot;

\* banco de dados SQL;

\* API REST;

\* serviço de IA;

\* Ollama;

\* modelos open-source;

\* RAG;

\* processamento de documentos;

\* modelos de visão;

\* STT/TTS;

\* sistemas de notificação.



Entretanto, não começar implementando tudo isso.



O projeto deve evoluir conforme as necessidades forem validadas.



⸻



10\. IA LOCAL E CUSTO



O objetivo inicial é desenvolver o projeto com R$0 de investimento.



Foi testada a possibilidade de utilizar modelos grandes localmente através do Ollama em um notebook com aproximadamente 8 GB de RAM.



Modelos grandes apresentaram desempenho inadequado para esse hardware.



Portanto:



\* não assumir que o notebook conseguirá executar modelos grandes;

\* considerar modelos pequenos e quantizados apenas para experimentação;

\* considerar mocks durante o desenvolvimento;

\* criar uma camada de abstração para que o modelo possa ser substituído futuramente;

\* não acoplar toda a aplicação a um único fornecedor de IA.



O objetivo inicial é validar o produto antes de investir dinheiro em infraestrutura.



⸻



11\. ESTRATÉGIA DO MVP



O primeiro MVP deverá ser mobile-first.



A prioridade inicial não é construir toda a infraestrutura de IA.



A prioridade é criar uma experiência que permita que estudantes reais testem o conceito e entendam rapidamente o valor do aplicativo.



Inicialmente, pode-se utilizar:



\* frontend;

\* dados mockados;

\* armazenamento local;

\* funcionalidades simuladas;

\* IA limitada/local quando possível.



Depois que houver validação real do produto, pode-se construir:



\* backend;

\* banco de dados;

\* autenticação;

\* IA;

\* memória;

\* processamento de documentos;

\* infraestrutura.



A ideia é evitar começar um projeto enorme e abandoná-lo por excesso de complexidade.



⸻



12\. PWA E MOBILE



Como o projeto precisa inicialmente custar R$0, uma possibilidade é desenvolver uma experiência mobile-first como PWA.



Isso permitiria:



\* funcionar pelo navegador;

\* ter aparência de aplicativo;

\* ser adicionado à tela inicial do celular;

\* testar com usuários reais sem precisar publicar imediatamente em uma loja.



Posteriormente, caso o produto seja validado, poderá ser considerada uma aplicação mobile mais completa.



⸻



13\. VISÃO DE PRODUTO



O aplicativo não deve parecer:



“ChatGPT para estudantes.”



A visão é mais próxima de:



Um sistema acadêmico pessoal no qual a IA conhece o estudante, entende seu contexto e participa de diferentes partes da sua jornada universitária.



A IA é uma camada do produto.



O produto em si é a combinação entre:



estudante + contexto + conteúdo + estudo + organização + IA + histórico/evolução.



⸻



14\. DESENVOLVIMENTO



O desenvolvimento deverá acontecer de forma incremental.



Não assumir que todas as funcionalidades já estão definidas.



Primeiro:



1\. entender o problema;

2\. definir o usuário;

3\. definir o valor do produto;

4\. construir o onboarding;

5\. definir a primeira experiência após o onboarding;

6\. definir as telas;

7\. definir os fluxos;

8\. definir o MVP;

9\. validar com estudantes;

10\. somente então aprofundar a arquitetura técnica.



As decisões devem ser discutidas antes da implementação.



Não quero que a IA simplesmente invente uma arquitetura completa ou entregue código sem que as decisões de produto e engenharia tenham sido discutidas.



⸻



15\. COMO A IA DEVE ME AJUDAR NO PROJETO



Ao me ajudar neste projeto:



\* pense como um engenheiro de software e também como alguém de produto;

\* questione decisões quando houver problemas;

\* mostre trade-offs;

\* identifique requisitos ocultos;

\* diferencie requisito funcional de requisito não funcional;

\* não transforme automaticamente toda ideia em uma funcionalidade;

\* não aumente o escopo sem necessidade;

\* não entregue código quando eu estiver apenas discutindo uma ideia;

\* não assuma que uma decisão está fechada quando ainda estamos discutindo;

\* ajude a transformar ideias em requisitos claros;

\* mantenha o foco no MVP;

\* seja realista sobre custos, infraestrutura e limitações técnicas;

\* quando houver várias alternativas, explique as diferenças em vez de escolher automaticamente por mim.

q

Quero pensar junto com a IA, e não simplesmente receber um projeto pronto.



⸻



16\. ESTADO ATUAL DO PROJETO



Neste momento:



\* o conceito do produto está sendo definido;

\* o público-alvo já foi definido;

\* a proposta de valor inicial foi definida;

\* o onboarding está sendo estruturado;

\* ainda estamos pensando nas telas e na experiência após o onboarding;

\* o MVP ainda não está fechado;

\* a arquitetura técnica ainda não está fechada;

\* o backend não é prioridade neste primeiro momento;

\* o foco inicial é criar uma experiência mobile-first visualmente boa e testável;

\* o projeto deve começar com custo próximo de R$0;

\* posteriormente, a infraestrutura poderá evoluir conforme a validação do produto.



Próximo ponto de discussão:



Depois que o estudante terminar o onboarding, definir exatamente:



O que ele vê na primeira tela?



E, principalmente:



Quais são as primeiras ações que queremos que ele consiga realizar?



Não avance automaticamente para código. Primeiro ajude a definir essa experiência.



