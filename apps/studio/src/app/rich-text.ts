// Bold, code and quotes in a message (docs/plans/message-format.md): a line starting with «> » is a quote; in a line,
// `code` is literal and **bold** is bold; a mark that doesn't close, or holds nothing, is shown as written. Pure: the
// pieces only, drawn by RichText.tsx as elements, never as HTML.
import { linksIn } from './links.ts'

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

function marked(
  text: string,
  pattern: RegExp,
  kind: Piece['kind'],
  rest: (t: string) => Piece[],
  kept: (start: number) => boolean = () => true,
): Piece[] {
  const pieces: Piece[] = []
  let at = 0
  for (const m of text.matchAll(pattern)) {
    const start = m.index
    if (!kept(start)) continue
    if (start > at) pieces.push(...rest(text.slice(at, start)))
    pieces.push({ kind, text: m[1] ?? '' })
    at = start + m[0].length
  }
  if (at < text.length) pieces.push(...rest(text.slice(at)))
  return pieces
}

const plain = (text: string): Piece[] => (text ? [{ kind: 'text', text }] : [])

/**
 * **bold** in words, unless its mark opens inside a web address: `https://example.com/**draft**` stays one link, and
 * **https://example.com/plan** is still a bold one (Codex P2 on #384).
 */
function bolded(text: string): Piece[] {
  const links = linksIn(text)
  return marked(text, BOLD, 'bold', plain, (start) => !links.some((l) => start >= l.start && start < l.end))
}

/** A line's pieces: code, bold, and the words between, next pieces of words joined. */
export function inlinePieces(line: string): Piece[] {
  const pieces = marked(line, CODE, 'code', bolded)
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
