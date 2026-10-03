/*
  CASO DE USO (application) — extrai o texto de UM ou VÁRIOS arquivos e junta tudo
  num conteúdo só, pronto pra alimentar o buildStudy.

  Fica separado do buildStudy de propósito: extrair arquivo e montar estudo são
  dois trabalhos diferentes. O buildStudy continua puro (recebe texto pronto), e
  esta peça cuida só do "juntar os materiais". Não sabe que é PDF — fala só pela
  porta TextExtractor.
*/
import type { TextExtractor } from './ports/TextExtractor'

export async function extractContent(
  files: File[],
  extractor: TextExtractor,
): Promise<string> {
  // extrai todos em paralelo (mais rápido que um de cada vez)
  const textos = await Promise.all(files.map((f) => extractor.extract(f)))
  // junta com uma linha em branco separando os materiais
  return textos.join('\n\n').trim()
}
