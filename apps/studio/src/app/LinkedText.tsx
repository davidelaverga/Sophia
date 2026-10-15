// A message's words with its web addresses as links (docs/plans/message-links.md), and what Find marks where it marks
// (Personal). A link opens in a new tab with nothing of this page handed to it: no opener, no referrer.
import { Fragment } from 'react'
import { byLink, linksIn, spans, type MarkPiece, type Span } from './links.ts'

interface Props {
  text: string
  /** What Find marks, as `pieces` cuts it; absent where nothing is found. */
  marks?: readonly MarkPiece[]
  /** The match Find is on, set apart. */
  current?: number | null
}

/** One run: Find's mark where it marks, the words otherwise. */
const Run = ({ span, current }: { span: Span; current: number | null }) =>
  span.n === null ? span.text : <mark className={span.n === current ? 'current' : undefined}>{span.text}</mark>

export function LinkedText({ text, marks, current = null }: Props) {
  const links = linksIn(text)
  if (links.length === 0 && !marks) return text
  return byLink(spans(text, links, marks ?? [{ text, n: null }])).map((group, i) => {
    const runs = group.runs.map((span, k) => <Run key={k} span={span} current={current} />)
    return group.href === null ? (
      <Fragment key={i}>{runs}</Fragment>
    ) : (
      <a key={i} className="msg-link" href={group.href} target="_blank" rel="noopener noreferrer">
        {runs}
      </a>
    )
  })
}
