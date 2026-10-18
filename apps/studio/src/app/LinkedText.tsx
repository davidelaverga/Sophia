// A message's words with its web addresses as links (docs/plans/message-links.md), and what Find marks where it marks
// (Personal). A link to the project the message is read in is followed here (studio-links-in-place.md); any other opens
// in a new tab with nothing of this page handed to it: no opener, no referrer.
import { Fragment, useContext, type MouseEvent, type ReactNode } from 'react'
import { InPlace } from './in-place.ts'
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

/** A press the browser keeps: another button, or a key held for a new tab or window. */
const pressedApart = (e: MouseEvent) => e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey

/** A link followed here when the project's shell has a way to (InPlace), in a new tab otherwise. */
function MessageLink({ href, children }: { href: string; children: ReactNode }) {
  const follow = useContext(InPlace)?.(href) ?? null
  if (!follow)
    return (
      <a className="msg-link" href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  const onClick = (e: MouseEvent) => {
    if (pressedApart(e)) return
    e.preventDefault()
    follow()
  }
  return (
    <a className="msg-link" href={href} onClick={onClick}>
      {children}
    </a>
  )
}

export function LinkedText({ text, marks, current = null }: Props) {
  const links = linksIn(text)
  if (links.length === 0 && !marks) return text
  return byLink(spans(text, links, marks ?? [{ text, n: null }])).map((group, i) => {
    const runs = group.runs.map((span, k) => <Run key={k} span={span} current={current} />)
    return group.href === null ? (
      <Fragment key={i}>{runs}</Fragment>
    ) : (
      <MessageLink key={i} href={group.href}>
        {runs}
      </MessageLink>
    )
  })
}
