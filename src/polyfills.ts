/*
  Polyfills de compatibilidade — carregados ANTES de tudo (primeiro import no main).

  Safari do iOS < 17.4 não tem a "iteração assíncrona de ReadableStream"
  (o `for await ... of stream` / `stream.values()`). O pdf.js usa isso internamente,
  e sem ele dá o erro "undefined is not a function (value of readableStream)".

  Aqui a gente ENSINA o ReadableStream a fazer isso quando o navegador não sabe.
  Só é aplicado se realmente estiver faltando (navegadores modernos ignoram).
*/
type StreamComIterador = {
  getReader(): { read(): Promise<{ done: boolean; value: unknown }>; releaseLock(): void }
}

if (
  typeof ReadableStream !== 'undefined' &&
  !(ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator]
) {
  async function* iterar(this: StreamComIterador) {
    const leitor = this.getReader()
    try {
      while (true) {
        const { done, value } = await leitor.read()
        if (done) return
        yield value
      }
    } finally {
      leitor.releaseLock()
    }
  }

  const proto = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>
  proto[Symbol.asyncIterator] = iterar
  // alguns códigos chamam .values() em vez do for await direto
  if (!proto.values) proto.values = iterar
}
