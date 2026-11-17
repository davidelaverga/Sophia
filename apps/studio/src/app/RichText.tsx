// A message's words with its marks (docs/plans/message-format.md): **bold**, `code`, a «> » line as a quote, and its
// web addresses as links (LinkedText). Elements only: what is typed as markup stays words. What Find marks (Personal)
// is cut over the words as shown and handed to each piece, so a match inside bold stays inside the bold
// (docs/plans/personal-replies-formatted.md).
import { Fragment } from 'react'
import { LinkedText, Run } from './LinkedText.tsx'
import type { MarkPiece } from './links.ts'
import { marksIn, richLines, type Piece } from './rich-text.ts'

/** What Find marks in a piece: its part of the marks, and the match it is on. */
interface Lens {
  marks: readonly MarkPiece[]
  current: number | null
}

function CodeOf({ text, lens }: { text: string; lens: Lens | null }) {
  const runs = lens ? lens.marks.map((m, k) => <Run key={k} span={m} current={lens.current} />) : text
  return <code className="msg-code">{runs}</code>
}

function PieceOf({ piece, lens }: { piece: Piece; lens: Lens | null }) {
  if (piece.kind === 'code') return <CodeOf text={piece.text} lens={lens} />
  const words = lens ? (
    <LinkedText text={piece.text} marks={lens.marks} current={lens.current} />
  ) : (
    <LinkedText text={piece.text} />
  )
  return piece.kind === 'bold' ? <strong>{words}</strong> : words
}

interface Props {
  text: string
  /** What Find marks, as `pieces` cuts the words as shown (`shownOf`); absent where nothing is found. */
  marks?: readonly MarkPiece[]
  /** The match Find is on, set apart. */
  current?: number | null
}

export function RichText({ text, marks, current = null }: Props) {
  const lines = richLines(text)
  // Where each piece starts in the words as shown: a line's pieces, then its break.
  let at = 0
  const lensOf = (length: number): Lens | null => {
    const from = at
    at += length
    return marks ? { marks: marksIn(marks, from, at), current } : null
  }
  return lines.map((line, i) => {
    const words = line.pieces.map((p, k) => <PieceOf key={k} piece={p} lens={lensOf(p.text.length)} />)
    at += 1
    // A quote is a block of its own; any other line keeps its break, as pre-wrap draws it. A line before a quote needs
    // none, its block starting a line anyway, unless the line is empty: that blank line stays (Codex P2 on #384).
    if (line.quote)
      return (
        <span key={i} className="msg-quote">
          {words}
        </span>
      )
    const next = lines[i + 1]
    const broken = next !== undefined && (!next.quote || line.pieces.length === 0)
    return (
      <Fragment key={i}>
        {words}
        {broken && '\n'}
      </Fragment>
    )
  })
}
