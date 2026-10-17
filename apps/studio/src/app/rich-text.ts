// Bold, code and quotes in a message (docs/plans/message-format.md): a line starting with «> » is a quote; in a line,
// `code` is literal and **bold** is bold; a mark that doesn't close, or holds nothing, is shown as written. Pure: the
// pieces only, drawn by RichText.tsx as elements, never as HTML.

export interface Piece {
  kind: 'text' | 'bold' | 'code'
  text: string
}

export interface RichLine {
  quote: boolean
  pieces: Piece[]
}

/** `code` first, so nothing inside it is read; then **bold** in the text between. */
const CODE = /`([^`\n]+)`/g
const BOLD = /\*\*(?=\S)([^*\n]*?\S)\*\*/g

function marked(text: string, pattern: RegExp, kind: Piece['kind'], rest: (t: string) => Piece[]): Piece[] {
  const pieces: Piece[] = []
  let at = 0
  for (const m of text.matchAll(pattern)) {
    const start = m.index
    if (start > at) pieces.push(...rest(text.slice(at, start)))
    pieces.push({ kind, text: m[1] ?? '' })
    at = start + m[0].length
  }
  if (at < text.length) pieces.push(...rest(text.slice(at)))
  return pieces
}

const plain = (text: string): Piece[] => (text ? [{ kind: 'text', text }] : [])

/** A line's pieces: code, bold, and the words between, next pieces of words joined. */
export function inlinePieces(line: string): Piece[] {
  const pieces = marked(line, CODE, 'code', (t) => marked(t, BOLD, 'bold', plain))
  return pieces.reduce<Piece[]>((all, p) => {
    const last = all.at(-1)
    if (last?.kind === 'text' && p.kind === 'text') last.text += p.text
    else all.push({ ...p })
    return all
  }, [])
}

/** A message's lines, each a quote or not, with its pieces. */
export const richLines = (text: string): RichLine[] =>
  text.split('\n').map((line) => {
    const quote = line.startsWith('> ')
    return { quote, pieces: inlinePieces(quote ? line.slice(2) : line) }
  })
