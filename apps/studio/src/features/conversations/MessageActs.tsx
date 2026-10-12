// A message's acts at its corner (docs/plans/conversation-acts.md): copy its words; quote them in the message being
// written, where one can write here; and propose them as a decision (ProposeHere), as before. Shown under the pointer
// or the focus; on a phone, on the message pressed (conversations.css, `.conv-acts`).
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react'
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

/** One clipboard for the page: the presses count across every message, and the latest press's words are what it should
 * hold (Codex on #240). */
let presses = 0
let latest = ''
/** How long a write may take before it is given up as not copied (a permission request left pending in a webview never
 * settles). */
export const COPY_WAIT_MS = 4000

/** The write, or false once it has taken too long. */
const bounded = (write: Promise<boolean>) =>
  Promise.race([write, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), COPY_WAIT_MS))])

/** An earlier write that went through after a later press: the latest words go back (and again, should a press come
 * meanwhile). */
function restore(): void {
  const text = latest
  void toClipboard(text).then((ok) => {
    if (ok && text !== latest) restore()
  })
}

export function MessageActs({ message, who, now, onQuote, propose }: Props) {
  const { said, say } = useSaid()
  // Each write starts in its own press (Safari grants the clipboard to the gesture, not to a promise after it). Only the
  // latest press's outcome is said, on any message; an earlier write that goes through late, even one given up, is
  // written over with the latest words, so the clipboard holds what the last press put there.
  const copy = () => {
    const press = ++presses
    const text = clipOf(message, who, now)
    latest = text
    const write = toClipboard(text)
    void write.then((ok) => {
      if (ok && text !== latest) restore()
    })
    void bounded(write).then((ok) => {
      if (press === presses) say(ok ? 'copied' : 'failed')
    })
  }
  return (
    <span className="conv-acts" onClick={own}>
      {said && (
        <span key={said.n} className="conv-copied" role="status" data-kind={said.kind}>
          {WORDS[said.kind]}
        </span>
      )}
      <button type="button" className="conv-act has-tip" aria-label="Copy" onClick={copy}>
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
