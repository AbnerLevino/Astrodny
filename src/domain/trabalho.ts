/*
  DOMÍNIO — tipos puros do "trabalho acadêmico" (feature Trabalhos/ABNT).
  Não importa NADA de fora (nem React, nem IA, nem armazenamento) — mesma regra do study.ts.

  A IA (buildTrabalho) só preenche `secoes` e `citacoes` — é o que vem do texto colado
  pelo aluno. Todo o resto (metadados, resumo, dedicatória...) é formulário simples,
  preenchido direto pelo aluno, sem IA nenhuma.
*/

// os 4 "tamanhos" de trabalho que o Astrodny sabe montar, do mais simples ao mais completo.
// Cada um tem uma norma ABNT de referência e um subconjunto de elementos obrigatórios —
// ver ESTRUTURA_POR_TIPO. NÃO adicionar tipo novo sem adicionar a entrada correspondente lá.
export type TipoTrabalho = 'resumo' | 'paper' | 'artigo' | 'tcc'

// uma seção do corpo do trabalho. `nivel` é o que vira numeração (1, 2, 2.1, 2.2, 3...)
// na hora do export — não guardamos número fixo porque ele muda se o aluno reordenar.
export type Secao = {
  id: string
  nivel: 1 | 2 | 3 | 4
  titulo: string
  texto: string
  ordem: number
}

// uma citação ENCONTRADA no texto colado (nunca inventada pela IA — ver buildTrabalho).
// `completa: false` significa que falta dado (ex: só autor+ano, sem título/obra) — o
// aluno precisa completar antes do export, senão a referência sai incompleta no ABNT.
export type Citacao = {
  autor: string
  ano: string
  titulo?: string
  tipo?: 'livro' | 'artigo' | 'site' | 'outro'
  completa: boolean
}

// dados da capa/folha de rosto. `ano` é number (não string) porque entra em cálculo
// de validação depois (ex: "ano não pode ser futuro").
export type Metadados = {
  titulo: string
  subtitulo?: string
  autor: string
  instituicao?: string
  curso?: string
  orientador?: string
  coorientador?: string
  cidade?: string
  ano: number
  naturezaTrabalho?: string // texto da folha de rosto: "TCC apresentado ao curso de X como requisito..."
}

export type Resumo = {
  texto: string
  palavrasChave: string[]
}

// o trabalho inteiro. A maioria dos campos é opcional porque só o TCC usa todos —
// ver ESTRUTURA_POR_TIPO pra saber o que cada `tipo` efetivamente precisa/permite.
export type Trabalho = {
  tipo: TipoTrabalho
  metadados: Metadados

  // pré-textual (opcional — só TCC/monografia usa na prática)
  folhaAprovacao?: { banca: { nome: string; instituicao: string }[] }
  dedicatoria?: string
  agradecimentos?: string
  epigrafe?: { texto: string; autor: string }
  resumo?: Resumo
  abstract?: Resumo
  listaIlustracoes?: { descricao: string }[]
  listaTabelas?: { descricao: string }[]
  listaAbreviaturas?: { sigla: string; significado: string }[]
  // sumário NÃO entra aqui — é derivado de `secoes` na hora do export (título + nível)

  // textual (o que a IA estrutura a partir do texto colado)
  secoes: Secao[]

  // pós-textual
  citacoes: Citacao[] // vira a lista de Referências
  glossario?: { termo: string; definicao: string }[]
  apendices?: { titulo: string; conteudo: string }[]
  anexos?: { titulo: string; conteudo: string }[]
}

/*
  Define, POR TIPO, quais elementos são obrigatórios/permitidos — usado pra (a) renderizar
  só os campos de formulário que fazem sentido pro tipo escolhido e (b) validar antes do
  export (ex: Artigo sem abstract não exporta). Fonte: NBR 14724 (trabalhos acadêmicos)
  e NBR 6022 (artigo), NBR 6028 (resumo).
*/
export type EstruturaTipo = {
  nome: string // nome exibido na UI (seletor de tipo)
  norma: string
  temCapaFormal: boolean // false = cabeçalho simples (autor/instituição no topo), não capa separada
  camposOpcionaisPermitidos: Array<keyof Trabalho>
  resumoObrigatorio: boolean
  abstractObrigatorio: boolean
}

// numera as seções (1, 2, 2.1, 2.2, 3…) a partir do nível+ordem — usado tanto pelo
// preview (Visualizer) quanto pelo export real (exportarAbnt), pra garantir que a
// numeração mostrada na tela seja SEMPRE a mesma que vai pro .docx.
export function numerarSecoes(secoes: Secao[]): { secao: Secao; numero: string }[] {
  const contadores = [0, 0, 0, 0]
  return [...secoes]
    .sort((a, b) => a.ordem - b.ordem)
    .map((secao) => {
      const i = secao.nivel - 1
      contadores[i]++
      for (let j = i + 1; j < contadores.length; j++) contadores[j] = 0
      return { secao, numero: contadores.slice(0, secao.nivel).join('.') }
    })
}

/*
  Configuração de FORMATAÇÃO do export (margens, fonte, espaçamento, recuo). Separada
  da lógica de montagem do documento (exportarAbnt) de propósito: hoje só existe
  CONFIG_ABNT_PADRAO (a norma, sem variação), mas no futuro uma tela de preferências
  pode deixar o aluno editar esses valores e passar um ConfigFormatacao customizado pra
  mesma função de export — sem precisar tocar em como o .docx é montado.
*/
export type ConfigFormatacao = {
  margensCm: { superior: number; inferior: number; esquerda: number; direita: number }
  fonte: string
  tamanhoFontePt: number
  espacamentoLinhas: number // ex.: 1.5
  recuoParagrafoCm: number // recuo da primeira linha do parágrafo
}

export const CONFIG_ABNT_PADRAO: ConfigFormatacao = {
  margensCm: { superior: 3, inferior: 2, esquerda: 3, direita: 2 },
  fonte: 'Times New Roman',
  tamanhoFontePt: 12,
  espacamentoLinhas: 1.5,
  recuoParagrafoCm: 1.25,
}

export const ESTRUTURA_POR_TIPO: Record<TipoTrabalho, EstruturaTipo> = {
  resumo: {
    nome: 'Resumo Acadêmico',
    norma: 'NBR 6028',
    temCapaFormal: false,
    camposOpcionaisPermitidos: [],
    resumoObrigatorio: true,
    abstractObrigatorio: false,
  },
  paper: {
    nome: 'Trabalho Acadêmico',
    norma: 'NBR 14724 (simplificada)',
    temCapaFormal: true,
    camposOpcionaisPermitidos: [],
    resumoObrigatorio: false,
    abstractObrigatorio: false,
  },
  artigo: {
    nome: 'Artigo Científico',
    norma: 'NBR 6022',
    temCapaFormal: false,
    camposOpcionaisPermitidos: ['apendices'],
    resumoObrigatorio: true,
    abstractObrigatorio: true,
  },
  tcc: {
    nome: 'TCC / Monografia',
    norma: 'NBR 14724 (completa)',
    temCapaFormal: true,
    camposOpcionaisPermitidos: [
      'folhaAprovacao',
      'dedicatoria',
      'agradecimentos',
      'epigrafe',
      'listaIlustracoes',
      'listaTabelas',
      'listaAbreviaturas',
      'glossario',
      'apendices',
      'anexos',
    ],
    resumoObrigatorio: true,
    abstractObrigatorio: true,
  },
}
