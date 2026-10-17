// A message's words with its marks (docs/plans/message-format.md): **bold**, `code`, a «> » line as a quote, and its
// web addresses as links (LinkedText). Elements only: what is typed as markup stays words.
import { Fragment } from 'react'
import { LinkedText } from './LinkedText.tsx'
import { richLines, type Piece } from './rich-text.ts'

function PieceOf({ piece }: { piece: Piece }) {
  if (piece.kind === 'code') return <code className="msg-code">{piece.text}</code>
  if (piece.kind === 'bold')
    return (
      <strong>
        <LinkedText text={piece.text} />
      </strong>
    )
  return <LinkedText text={piece.text} />
}

export function RichText({ text }: { text: string }) {
  const lines = richLines(text)
  return lines.map((line, i) => {
    const words = line.pieces.map((p, k) => <PieceOf key={k} piece={p} />)
    // A quote is a block of its own; any other line keeps its break, as pre-wrap draws it.
    if (line.quote)
      return (
        <span key={i} className="msg-quote">
          {words}
        </span>
      )
    const broken = i < lines.length - 1 && !lines[i + 1]?.quote
    return (
      <Fragment key={i}>
        {words}
        {broken && '\n'}
      </Fragment>
    )
  })
}
