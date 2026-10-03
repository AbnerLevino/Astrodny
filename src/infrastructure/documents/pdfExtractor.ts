/*
  INFRAESTRUTURA (infrastructure/documents) — adaptador da porta TextExtractor
  que lê o TEXTO de um PDF usando a biblioteca pdf.js (pdfjs-dist).

  Toda a chatice do pdf.js está PRESA aqui dentro: quem usa (a tela) só chama
  extract(file) e recebe texto. Se um dia trocarmos de biblioteca, só este arquivo
  muda.
*/
// Build "legacy" do pdf.js: mesmo motor, mas transpilado + com polyfills pra
// navegadores mais antigos (ex.: Safari do iOS < 17.4, que não tem iteração
// assíncrona de ReadableStream). Essencial num PWA mobile-first.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextExtractor } from '../../application/ports/TextExtractor'
// O pdf.js processa o PDF numa thread separada (um "Worker"), pra não travar a
// tela. O Vite precisa saber ONDE está esse worker: o sufixo "?url" faz o Vite
// devolver o endereço do arquivo, que entregamos ao pdf.js abaixo.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const pdfExtractor: TextExtractor = {
  async extract(file: File): Promise<string> {
    // 1. lê os bytes crus do arquivo
    const bytes = await file.arrayBuffer()

    // 2. abre o documento PDF a partir desses bytes
    const documento = await pdfjs.getDocument({ data: bytes }).promise

    // 3. percorre página por página, juntando o texto de cada uma
    const paginas: string[] = []
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n)
      const conteudo = await pagina.getTextContent()
      // cada "item" é um pedacinho de texto com posição; só queremos o .str
      const texto = conteudo.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
      paginas.push(texto)
    }

    // 4. junta as páginas (linha em branco entre elas) e limpa as pontas
    return paginas.join('\n\n').trim()
  },
}

// Conta só o NÚMERO DE PÁGINAS de um PDF (sem extrair o texto todo) — barato,
// usado na tela de anexo pra mostrar "N págs" e estimar a duração do estudo.
// Abre o documento e lê documento.numPages; nada mais.
export async function contarPaginasPdf(file: File): Promise<number> {
  const bytes = await file.arrayBuffer()
  const documento = await pdfjs.getDocument({ data: bytes }).promise
  return documento.numPages
}
