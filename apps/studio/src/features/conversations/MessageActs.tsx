// A message's acts at its corner (docs/plans/conversation-acts.md): copy its words; quote them in the message being
// written, where one can write here; and propose them as a decision (ProposeHere), as before. Shown under the pointer
// or the focus; on a phone, on the message pressed (conversations.css, `.conv-acts`).
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { clipOf, quoteOf } from './message-acts.ts'

interface Props {
  message: { text: string; at: string }
  /** Who said it, as the byline says it: «Lucía», «You», «Sophia». */
  who: string
  now: number
  /** Puts a quote under the draft; null for those who can't write here. */
  onQuote: ((quote: string) => void) | null
  /** The propose press, or nothing (a viewer; the form open). */
  propose: ReactNode
}

/** The message's own press (a phone's) is not one of these. */
const own = (e: MouseEvent) => e.stopPropagation()

/** How long «Copied» stays. */
const COPIED_MS = 2000

function useCopied() {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])
  return { copied, said: () => setCopied(true) }
}

export function MessageActs({ message, who, now, onQuote, propose }: Props) {
  const copied = useCopied()
  // The clipboard may refuse (no focus, a private window): then nothing is said, and nothing breaks.
  const copy = () => navigator.clipboard.writeText(clipOf(message, who, now)).then(copied.said, () => undefined)
  return (
    <span className="conv-acts" onClick={own}>
      {copied.copied && (
        <span className="conv-copied" role="status">
          Copied
        </span>
      )}
      <button type="button" className="conv-act has-tip" aria-label="Copy" onClick={() => void copy()}>
        <Icon name="copy" />
        <Tip label="Copy" side="top" align="end" />
      </button>
      {onQuote && (
        <button
          type="button"
          className="conv-act has-tip"
          aria-label="Quote in your message"
          onClick={() => onQuote(quoteOf(message, who))}
        >
          <Icon name="quote" />
          <Tip label="Quote in your message" side="top" align="end" />
        </button>
      )}
      {propose}
    </span>
  )
}
