/*
  INFRAESTRUTURA (infrastructure/ai) — um adaptador FALSO da porta AIProvider.

  Ignora o prompt e devolve sempre o mesmo JSON de estudo, simulando o texto que
  um modelo real responderia. Um pequeno atraso finge o "pensar".

  Serve pra construir e testar todo o app de graça, sem IA de verdade. Na Fase 1
  criamos um `ollamaProvider` com esta mesma interface e trocamos um pelo outro.
*/
import type { AIProvider, GenerateOptions, PromptInput } from '../../application/ports/AIProvider'

// Resposta MOCK do CHAT (só pra testar o front). Antes vivia dentro da ui/chats.tsx —
// mudou de casa pra cá, que é o lugar do "detalhe" (o que a IA responde). Quando
// plugarmos o Ollama, este texto some e a resposta vem do modelo de verdade.
const RESPOSTA_MOCK = `Java é uma **linguagem de programação orientada a objetos**, criada pela Sun Microsystems em 1995 (hoje mantida pela Oracle). A ideia central dela é o famoso lema **"escreva uma vez, rode em qualquer lugar"**: o código Java é compilado para um formato intermediário (**bytecode**) que roda dentro da **Máquina Virtual Java (a JVM)**, então o mesmo programa funciona em Windows, Linux ou Mac sem reescrever nada.

Ela é **fortemente tipada** e orientada a objetos, o que significa que você organiza o programa em **classes e objetos** — cada um com seus dados (atributos) e comportamentos (métodos). Isso ajuda a manter projetos grandes organizados e reaproveitáveis, usando pilares como **herança, encapsulamento e polimorfismo**.

Na prática, Java é muito usada em **sistemas corporativos**, **aplicativos Android**, back-end de grandes serviços e sistemas que precisam ser robustos e escaláveis. É uma linguagem madura, com uma comunidade enorme e muitas bibliotecas prontas.

Quer que eu monte um **estudo guiado** sobre algum tópico específico de Java (por exemplo, herança ou classes)?`

const VELOCIDADE_ESCRITA = 55 // ms entre cada palavra (simula a latência de cada token)
const TEMPO_PENSANDO = 1500 // ms que a IA "pensa" antes de começar a cuspir texto

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// O "estudo" que o mock devolve — como se fosse a resposta do modelo, em JSON.
const ESTUDO_JSON = {
  nome: 'Java — Herança',
  blocos: [
    {
      titulo: 'O que é Herança',
      conteudo: [
        'Herança é um dos pilares da Programação Orientada a Objetos. A ideia é simples: uma classe (chamada de filha ou subclasse) pode reaproveitar tudo que já existe em outra classe (a pai ou superclasse), sem precisar reescrever nada.',
        'Imagine uma classe Animal com o método comer(). Se você criar uma classe Cachorro que herda de Animal, o Cachorro já "nasce" sabendo comer() — você não repete esse código. Basta adicionar o que é específico dele, como latir().',
        'Isso deixa o código mais organizado e evita repetição: o que é comum fica num lugar só (a classe pai), e cada filha só cuida das suas próprias diferenças.',
      ],
      pergunta: {
        enunciado: 'O que uma classe filha herda da classe pai?',
        alternativas: ['Apenas os atributos', 'Atributos e métodos', 'Nada, começa do zero', 'Só métodos privados'],
        correta: 1,
      },
    },
    {
      titulo: 'extends e super',
      conteudo: [
        'Em Java, a herança é declarada com a palavra-chave extends. Ao escrever "class Cachorro extends Animal", você diz que Cachorro é um Animal e herda tudo dele.',
        'Dentro da classe filha, a palavra super dá acesso à classe pai. "super()" chama o construtor da pai, e "super.metodo()" chama um método dela — útil quando você quer aproveitar o comportamento original e só complementar.',
        'Assim, a filha não precisa recriar o que a pai já faz: ela apenas se apoia nela e acrescenta o que for necessário.',
      ],
      pergunta: {
        enunciado: 'Qual palavra-chave cria a herança entre duas classes em Java?',
        alternativas: ['implements', 'extends', 'inherits', 'super'],
        correta: 1,
      },
    },
    {
      titulo: 'Sobrescrita (@Override)',
      conteudo: [
        'Às vezes a filha precisa fazer algo diferente do que herdou. Nesse caso, ela pode reescrever o método herdado — isso se chama sobrescrita (override).',
        'Em Java, marcamos a sobrescrita com a anotação @Override, logo acima do método. Ela não é obrigatória, mas ajuda: se você escrever o método errado, o compilador avisa.',
        'Exemplo: Animal tem fazerSom() que imprime "som genérico". Cachorro sobrescreve fazerSom() para imprimir "Au au". Mesmo método, comportamento diferente.',
      ],
      pergunta: {
        enunciado: 'Para que serve a sobrescrita (@Override)?',
        alternativas: ['Criar um novo atributo', 'Mudar o comportamento de um método herdado', 'Apagar a classe pai', 'Impedir a herança'],
        correta: 1,
      },
    },
  ],
  prova: [
    { enunciado: 'Herança serve principalmente para...', alternativas: ['Repetir código', 'Reaproveitar o código comum', 'Deixar o programa mais lento', 'Esconder a classe pai'], correta: 1, blocoIndex: 0 },
    { enunciado: 'Em Java, herdamos de outra classe com...', alternativas: ['extends', 'implements', 'new', 'this'], correta: 0, blocoIndex: 1 },
    { enunciado: '"super" é usado para...', alternativas: ['Criar objetos', 'Acessar a classe pai', 'Encerrar o programa', 'Declarar variáveis'], correta: 1, blocoIndex: 1 },
    { enunciado: '@Override indica que um método...', alternativas: ['É privado', 'Foi sobrescrito da classe pai', 'É estático', 'Não pode ser usado'], correta: 1, blocoIndex: 2 },
  ],
}

export const mockProvider: AIProvider = {
  // `_opcoes` (json) é ignorado aqui: o mock já devolve JSON sempre. Quem realmente
  // usa essa flag é o ollamaProvider, pra ligar o `format:"json"` do modelo real.
  async generate(_prompt: PromptInput, _opcoes?: GenerateOptions): Promise<string> {
    // finge o tempo de "pensar" do modelo
    await new Promise((resolve) => setTimeout(resolve, 400))
    // devolve TEXTO (JSON), igual um modelo real faria
    return JSON.stringify(ESTUDO_JSON)
  },

  // `async function*` = GERADOR ASSÍNCRONO: produz valores ao longo do tempo.
  // Cada `yield` entrega um pedaço e PAUSA até o consumidor (o `for await`) pedir o
  // próximo. É exatamente o que o Ollama faz — só que os pedaços virão da rede.
  async *generateStream(_prompt: PromptInput): AsyncIterable<string> {
    await esperar(TEMPO_PENSANDO) // fase "pensando" antes do primeiro pedaço
    const palavras = RESPOSTA_MOCK.split(' ')
    for (const palavra of palavras) {
      await esperar(VELOCIDADE_ESCRITA)
      yield palavra + ' '
    }
  },
}
