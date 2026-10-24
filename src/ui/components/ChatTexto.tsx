/*
  Pedacinhos de UI do chat compartilhados entre o chat normal (Conversa) e o
  tira-dúvidas da sessão de estudo (StudySession) — garante que as duas telas
  rendeirizem a resposta da IA (markdown, código, tabelas) e o botão de copiar
  exatamente do mesmo jeito, sem duplicar a lógica em dois lugares.
*/
import { useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

// Copia um texto pro clipboard de forma CONFIÁVEL em qualquer contexto.
// navigator.clipboard só existe em contexto seguro (https/localhost); no celular
// via IP da LAN (http) ele não está disponível — por isso o fallback com um
// <textarea> escondido + execCommand('copy'), que funciona no HTTP também.
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch {
    // cai no fallback abaixo
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.setAttribute('readonly', '')
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

// Botãozinho de copiar: mostra um ícone de "copiar" e, por ~1,5s após o clique,
// troca pro "check" como confirmação visual. Usado nas mensagens, blocos de código
// e citações. `className` deixa cada chamador posicionar/estilizar como precisar.
export function BotaoCopiar({
  texto,
  titulo = 'Copiar',
  className = '',
}: {
  texto: string
  titulo?: string
  className?: string
}) {
  const [copiado, setCopiado] = useState(false)
  async function clicar() {
    if (await copiarTexto(texto)) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    }
  }
  return (
    <button
      type="button"
      onClick={clicar}
      aria-label={titulo}
      title={titulo}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-white/50 transition-colors active:text-white ${className}`}
    >
      {copiado ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

// Extrai o texto PURO de uma árvore de elementos React (o que o react-markdown
// monta pra um bloco). Precisamos disso porque o conteúdo de um <pre>/<blockquote>
// chega como elementos (ex.: <code>…</code>), não como string — e o botão de copiar
// precisa do texto cru. Percorre recursivamente strings, arrays e props.children.
function extrairTexto(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extrairTexto).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extrairTexto((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

// Renderiza o texto da IA como MARKDOWN: negrito, títulos, listas, código e tabelas
// (os modelos grandes usam tudo isso). react-markdown reparse a cada token do streaming,
// então markdown ainda "aberto" no meio da digitação não quebra a tela. O `components`
// mapeia cada elemento pro visual do tema escuro, já que não usamos plugin de tipografia.
const componentesMarkdown: Components = {
  // Hierarquia com respiro: h1 (título principal da resposta) é o maior; h2/h3 descem
  // de forma equilibrada. mt generoso separa seções; mb afasta o título do parágrafo.
  // first:mt-0 evita que o 1º título empurre o topo do balão.
  h1: ({ children }) => <h2 className="mb-2.5 mt-1 text-xl font-bold leading-snug text-white first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 className="mb-4 mt-8 text-[19px] font-bold leading-snug text-white first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2.5 mt-6 text-base font-semibold text-white first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-3.5 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3.5 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-300 underline">{children}</a>
  ),
  code: ({ className, children }) => {
    // bloco = tem linguagem (```js) OU é multilinha; senão é código inline (pílula).
    const bloco = /language-/.test(className ?? '') || String(children).includes('\n')
    return bloco ? (
      <code className={`${className ?? ''} font-mono text-[13px]`}>{children}</code>
    ) : (
      <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[13px]">{children}</code>
    )
  },
  // bloco de código: embrulho relativo pra encaixar o botão de copiar no canto.
  // O texto puro vem de extrairTexto (os filhos são elementos React, não string).
  pre: ({ children }) => (
    <div className="relative mb-2">
      <BotaoCopiar
        texto={extrairTexto(children)}
        titulo="Copiar código"
        className="absolute right-2 top-2 bg-black/40 backdrop-blur-sm"
      />
      <pre className="scroll-chat overflow-x-auto rounded-lg bg-black/40 px-4 py-3 pt-9 text-[13px]">{children}</pre>
    </div>
  ),
  // Tabela "limpa": container arredondado com borda fina, cabeçalho sombreado e só
  // DIVISÓRIAS HORIZONTAIS (sem grade vertical pesada). Zebra discreta ajuda a ler
  // linhas largas. overflow-x-auto deixa rolar no celular sem quebrar o layout.
  table: ({ children }) => (
    <div className="scroll-chat my-4 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.06]">{children}</thead>,
  // :nth-child é por elemento-pai, então o even: só pega as linhas pares do tbody —
  // a linha do cabeçalho (sozinha no thead) não é afetada.
  tr: ({ children }) => <tr className="even:bg-white/[0.02]">{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap border-b border-white/15 px-4 py-3 text-left font-semibold text-white">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-white/[0.07] px-4 py-3 align-top leading-relaxed">{children}</td>,
  // citação (>): a IA costuma usar pra ENTREGAR um exemplo / texto pronto pra colar.
  // Em vez da barra lateral (traço grande) + itálico, vira um QUADRO na mesma linguagem
  // das tabelas (borda fina, cantos arredondados, fundo sutil) com o exemplo DENTRO.
  // Botão de copiar no canto; o pr-12 reserva o espaço dele.
  blockquote: ({ children }) => (
    <div className="relative my-4 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <BotaoCopiar
        texto={extrairTexto(children)}
        titulo="Copiar texto"
        className="absolute right-2 top-2 bg-black/30 backdrop-blur-sm"
      />
      {/* neutraliza o mb-4 do <p> interno pra o respiro ficar no padding do quadro:
          parágrafos internos ganham mb-2, e o último zera. */}
      <blockquote className="px-4 py-3 pr-12 leading-relaxed text-white/80 [&>p]:mb-2 [&>p:last-child]:mb-0">
        {children}
      </blockquote>
    </div>
  ),
}

// Variante usada dentro dos cards de "Problema:"/"Exemplo:" da aula (Estudar): fundo
// PRETO sólido (não a camada translúcida do chat, que por cima do card colorido virava
// um cinza-azulado sujo) e mais respiro (padding maior) — pedido explícito do usuário
// pra separar visualmente a tabela do acento colorido do card. font-sans reforça a
// fonte do app (Instrument Sans) mesmo que algum ancestral mude a fonte por engano.
const componentesMarkdownTabelaPreta: Components = {
  ...componentesMarkdown,
  table: ({ children }) => (
    <div className="scroll-chat my-4 overflow-x-auto rounded-xl border border-white/10 bg-black font-sans">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
  tr: ({ children }) => <tr className="even:bg-white/[0.02]">{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap border-b border-white/15 px-5 py-3.5 text-left font-semibold text-white">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-white/[0.07] px-5 py-3.5 align-top leading-relaxed">{children}</td>,
}

export function TextoIA({ texto, tabelaPreta = false }: { texto: string; tabelaPreta?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={tabelaPreta ? componentesMarkdownTabelaPreta : componentesMarkdown}
    >
      {texto}
    </ReactMarkdown>
  )
}
