/*
  PORTA (application/ports) — o contrato pra extrair TEXTO de um arquivo.

  A aplicação (a tela de Preparar) só sabe "me dê um File, te devolvo o texto".
  Não sabe que por baixo é PDF, pdf.js, worker, nada disso. Quem implementa vive
  na infraestrutura (pdfExtractor). Amanhã, pra ler .docx ou imagem (OCR), é só
  outro adaptador com esta mesma interface — a tela não muda.
*/
export interface TextExtractor {
  // recebe o arquivo e devolve o texto puro extraído dele.
  // assíncrono porque ler/decodificar um arquivo leva tempo.
  extract(file: File): Promise<string>
}
