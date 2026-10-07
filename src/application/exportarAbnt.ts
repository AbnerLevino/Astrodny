/*
  CASO DE USO (application) — exporta um `Trabalho` pra um arquivo .docx formatado em
  ABNT. 100% DETERMINÍSTICO: zero IA aqui. Entrada igual → saída igual, sempre. A IA já
  fez a parte dela (buildTrabalho: estruturar seções + achar citações); formatação é
  regra fixa da norma, não é algo pra um modelo "decidir".

  `config` é opcional e usa CONFIG_ABNT_PADRAO quando omitido — ver domain/trabalho.ts
  pro porquê disso ser um objeto separado (futura tela de preferências de formatação
  passa um ConfigFormatacao customizado pra esta MESMA função, sem tocar na montagem
  do documento abaixo).

  Capa/folha de rosto só saem quando `ESTRUTURA_POR_TIPO[tipo].temCapaFormal` — "resumo"
  e "artigo" usam cabeçalho simples (sem página de capa separada), igual o Visualizer já
  assume (ver tela Trabalho.tsx).
*/
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  TableOfContents,
  Header,
  PageNumber,
  convertMillimetersToTwip,
} from 'docx'
import type { Trabalho, ConfigFormatacao } from '../domain/trabalho'
import { CONFIG_ABNT_PADRAO, ESTRUTURA_POR_TIPO, numerarSecoes } from '../domain/trabalho'

const HEADING_POR_NIVEL = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4]

// linha 1.5 em "auto" é 240 * 1.5 = 360 (240 = espaçamento simples, unidade da lib).
function linhaTwips(espacamentoLinhas: number): number {
  return Math.round(240 * espacamentoLinhas)
}

export async function exportarAbnt(trabalho: Trabalho, config: ConfigFormatacao = CONFIG_ABNT_PADRAO): Promise<Blob> {
  const estrutura = ESTRUTURA_POR_TIPO[trabalho.tipo]
  const tamanhoMeioPonto = config.tamanhoFontePt * 2 // docx usa meio-ponto (12pt = 24)
  const recuo = convertMillimetersToTwip(config.recuoParagrafoCm * 10)
  const espacamento = { line: linhaTwips(config.espacamentoLinhas), lineRule: 'auto' as const }

  const corpoParagrafos: (Paragraph | TableOfContents)[] = []

  if (estrutura.temCapaFormal) {
    corpoParagrafos.push(...montarCapa(trabalho))
    if (trabalho.tipo === 'tcc') corpoParagrafos.push(...montarFolhaDeRosto(trabalho))
  } else {
    corpoParagrafos.push(...montarCabecalhoSimples(trabalho))
  }

  if (trabalho.resumo) corpoParagrafos.push(...montarResumo('RESUMO', trabalho.resumo))
  if (trabalho.abstract) corpoParagrafos.push(...montarResumo('ABSTRACT', trabalho.abstract))

  corpoParagrafos.push(
    new Paragraph({
      pageBreakBefore: true,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'SUMÁRIO', bold: true })],
    }),
    new TableOfContents('Sumário', { hyperlink: true, headingStyleRange: '1-4' }),
  )

  corpoParagrafos.push(...montarCorpo(trabalho, espacamento, recuo))

  if (trabalho.citacoes.length > 0) corpoParagrafos.push(...montarReferencias(trabalho))

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: config.fonte, size: tamanhoMeioPonto },
          paragraph: { spacing: espacamento, alignment: AlignmentType.JUSTIFIED },
        },
      },
      paragraphStyles: HEADING_POR_NIVEL.map((heading, i) => ({
        id: heading,
        name: `Heading ${i + 1}`,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { font: config.fonte, size: tamanhoMeioPonto, bold: true },
        paragraph: {
          spacing: { ...espacamento, before: 240, after: 240 },
          alignment: AlignmentType.JUSTIFIED,
          keepNext: true,
        },
      })),
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(config.margensCm.superior * 10),
              bottom: convertMillimetersToTwip(config.margensCm.inferior * 10),
              left: convertMillimetersToTwip(config.margensCm.esquerda * 10),
              right: convertMillimetersToTwip(config.margensCm.direita * 10),
            },
          },
          titlePage: true, // suprime o header SÓ na capa (1ª página) — o resto mostra a numeração
        },
        headers: { default: montarHeaderComPaginacao() },
        children: corpoParagrafos,
      },
    ],
  })

  return Packer.toBlob(doc)
}

function montarHeaderComPaginacao(): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT] })],
      }),
    ],
  })
}

// capa: instituição (topo) → autor → título (meio da página, maiúsculo, negrito) → natureza
// do trabalho → cidade/ano (rodapé). Empurra o conteúdo pro "meio" com espaços em branco,
// já que o Word não tem "centralizar verticalmente" direto num parágrafo solto.
function montarCapa(trabalho: Trabalho): Paragraph[] {
  const m = trabalho.metadados
  const paragrafos: Paragraph[] = []

  paragrafos.push(...linhasCentralizadas(m.instituicao?.toUpperCase(), m.curso?.toUpperCase()))
  for (let i = 0; i < 5; i++) paragrafos.push(new Paragraph({}))
  paragrafos.push(...linhasCentralizadas(m.autor.toUpperCase()))
  for (let i = 0; i < 6; i++) paragrafos.push(new Paragraph({}))
  paragrafos.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: m.titulo.toUpperCase(), bold: true })],
    }),
  )
  paragrafos.push(...linhasCentralizadas(m.subtitulo))
  for (let i = 0; i < 8; i++) paragrafos.push(new Paragraph({}))
  paragrafos.push(...linhasCentralizadas(m.cidade, String(m.ano)))

  return paragrafos
}

// folha de rosto (só TCC): repete autor/título + a "natureza do trabalho" (texto que
// diz a que o trabalho se destina) + orientador — é o que falta pra capa virar o par
// capa+folha-de-rosto que a NBR 14724 completa exige.
function montarFolhaDeRosto(trabalho: Trabalho): Paragraph[] {
  const m = trabalho.metadados
  const paragrafos: Paragraph[] = []

  paragrafos.push(
    new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, children: [new TextRun(m.autor.toUpperCase())] }),
  )
  for (let i = 0; i < 6; i++) paragrafos.push(new Paragraph({}))
  paragrafos.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: m.titulo.toUpperCase(), bold: true })],
    }),
  )
  for (let i = 0; i < 3; i++) paragrafos.push(new Paragraph({}))

  if (m.naturezaTrabalho) {
    // bloco de texto alinhado à direita, ocupando a metade direita da página — convenção
    // da folha de rosto pra separar a "natureza do trabalho" do resto.
    paragrafos.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        indent: { left: convertMillimetersToTwip(80) },
        children: [new TextRun(m.naturezaTrabalho)],
      }),
    )
  }
  if (m.orientador) {
    paragrafos.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        indent: { left: convertMillimetersToTwip(80) },
        children: [new TextRun(`Orientador: ${m.orientador}`)],
      }),
    )
  }
  if (m.coorientador) {
    paragrafos.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        indent: { left: convertMillimetersToTwip(80) },
        children: [new TextRun(`Coorientador: ${m.coorientador}`)],
      }),
    )
  }

  for (let i = 0; i < 6; i++) paragrafos.push(new Paragraph({}))
  paragrafos.push(...linhasCentralizadas(m.cidade, String(m.ano)))

  return paragrafos
}

// cabeçalho simples (resumo/artigo): sem página de capa própria — título + autor direto
// no topo da 1ª página do texto, como o Visualizer já assume pra `temCapaFormal: false`.
function montarCabecalhoSimples(trabalho: Trabalho): Paragraph[] {
  const m = trabalho.metadados
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: m.titulo.toUpperCase(), bold: true })] }),
    ...linhasCentralizadas(m.subtitulo, m.autor, m.instituicao),
    new Paragraph({}),
  ]
}

function montarResumo(rotulo: string, resumo: { texto: string; palavrasChave: string[] }): Paragraph[] {
  const paragrafos: Paragraph[] = [
    new Paragraph({
      pageBreakBefore: true,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: rotulo, bold: true })],
    }),
    new Paragraph({ indent: { firstLine: 0 }, children: [new TextRun(resumo.texto)] }),
  ]
  if (resumo.palavrasChave.length > 0) {
    paragrafos.push(
      new Paragraph({
        indent: { firstLine: 0 },
        children: [new TextRun({ text: `Palavras-chave: ${resumo.palavrasChave.join('; ')}.`, bold: false })],
      }),
    )
  }
  return paragrafos
}

// o corpo do texto: cada seção vira um heading (nível 1 em MAIÚSCULO, 2+ normal — regra
// da NBR 14724) seguido do texto em parágrafo(s) justificado(s) com recuo na 1ª linha.
function montarCorpo(trabalho: Trabalho, espacamento: { line: number; lineRule: 'auto' }, recuo: number): Paragraph[] {
  const paragrafos: Paragraph[] = []

  numerarSecoes(trabalho.secoes).forEach(({ secao, numero }, i) => {
    const titulo = secao.nivel === 1 ? secao.titulo.toUpperCase() : secao.titulo
    paragrafos.push(
      new Paragraph({
        heading: HEADING_POR_NIVEL[secao.nivel - 1],
        pageBreakBefore: secao.nivel === 1 && i > 0,
        children: [new TextRun({ text: `${numero} ${titulo}`, bold: true })],
      }),
    )

    secao.texto
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((paragrafo) => {
        paragrafos.push(
          new Paragraph({
            indent: { firstLine: recuo },
            alignment: AlignmentType.JUSTIFIED,
            spacing: espacamento,
            children: [new TextRun(paragrafo)],
          }),
        )
      })
  })

  return paragrafos
}

// referências: ordem alfabética por autor, recuo deslocado (2ª linha em diante entra
// pra dentro — convenção de referência da NBR 6023), espaçamento simples, uma linha em
// branco entre cada. Citação marcada `completa: false` ganha um aviso em vermelho —
// o aluno precisa completar o dado que a IA não inventou.
function montarReferencias(trabalho: Trabalho): Paragraph[] {
  const ordenadas = [...trabalho.citacoes].sort((a, b) => a.autor.localeCompare(b.autor, 'pt-BR'))

  const paragrafos: Paragraph[] = [
    new Paragraph({
      pageBreakBefore: true,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'REFERÊNCIAS', bold: true })],
    }),
  ]

  ordenadas.forEach((c) => {
    const runs = [new TextRun(`${c.autor}. ${c.titulo ? `${c.titulo}. ` : ''}${c.ano}.`)]
    if (!c.completa) {
      runs.push(new TextRun({ text: ' [referência incompleta — complete o título/obra]', color: 'C0392B', italics: true }))
    }
    paragrafos.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { line: 240, lineRule: 'auto', after: 240 },
        indent: { left: 0, hanging: 0 },
        children: runs,
      }),
    )
  })

  return paragrafos
}

// monta 1 parágrafo centralizado por texto DEFINIDO (ignora undefined/"") — usado pra
// linhas opcionais da capa/cabeçalho (nem todo Metadados tem instituicao/curso/etc.).
function linhasCentralizadas(...textos: Array<string | undefined>): Paragraph[] {
  return textos
    .filter((t): t is string => Boolean(t))
    .map((t) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(t)] }))
}
