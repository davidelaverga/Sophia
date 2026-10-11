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

/** How long what a copy said stays. */
const SAID_MS = 2000

/** What the last copy said: each press says it anew (its own number), so the timer restarts and a reader hears it. */
type Said = { kind: 'copied' | 'failed'; n: number }

const WORDS: Readonly<Record<Said['kind'], string>> = {
  copied: 'Copied',
  failed: 'Not copied: select the words to copy them.',
}

function useSaid() {
  const [said, setSaid] = useState<Said | null>(null)
  useEffect(() => {
    if (!said) return undefined
    const timer = setTimeout(() => setSaid(null), SAID_MS)
    return () => clearTimeout(timer)
  }, [said])
  return { said, say: (kind: Said['kind']) => setSaid((was) => ({ kind, n: (was?.n ?? 0) + 1 })) }
}

/** The words to the clipboard: refused (no permission, no focus) or absent (an old webview), it says so. */
async function toClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function MessageActs({ message, who, now, onQuote, propose }: Props) {
  const { said, say } = useSaid()
  const copy = async () => say((await toClipboard(clipOf(message, who, now))) ? 'copied' : 'failed')
  return (
    <span className="conv-acts" onClick={own}>
      {said && (
        <span key={said.n} className="conv-copied" role="status" data-kind={said.kind}>
          {WORDS[said.kind]}
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
