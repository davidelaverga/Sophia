// A message's acts at its corner (docs/plans/conversation-acts.md): copy its words; quote them in the message being
// written, where one can write here; and propose them as a decision (ProposeHere), as before. Shown under the pointer
// or the focus; on a phone, on the message pressed (conversations.css, `.conv-acts`).
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { clipOf, quoteOf } from './message-acts.ts'

interface Props {
  message: { text: string; at: string }
  /** Who said it, by name, for words that leave the thread (the clipboard, a quote): «Lucía», never «You». */
  who: string
  now: number
  /** Puts a quote under the draft; null for those who can't write here. */
  onQuote: ((quote: string) => void) | null
  /** The propose press, or nothing (a viewer; the form open). */
  propose: ReactNode
  /** Beside the bubble, not above it: a message continuing a run, under a pointer (OpenConversation). */
  side?: boolean
}

/** The message's own press (a phone's) is not one of these. */
const own = (e: MouseEvent) => e.stopPropagation()

/** How long what a copy said stays. */
const SAID_MS = 2000

/** What the last copy said: each press says it anew (its own number), so the timer restarts and a reader hears it. */
type Said = { kind: 'copied' | 'failed' | 'waiting' | 'overtaken'; n: number }

const WORDS: Readonly<Record<Said['kind'], string>> = {
  copied: 'Copied',
  failed: 'Not copied: select the words to copy them.',
  waiting: 'Waiting for the browser to allow copying…',
  overtaken: 'An earlier copy landed after this one. Copy again to put these words back.',
}

/** Every message's way to put away what it said: a new copy anywhere clears the others' (Codex on #240). */
const clears = new Set<() => void>()

function useSaid() {
  const [said, setSaid] = useState<Said | null>(null)
  useEffect(() => {
    const clear = () => setSaid(null)
    clears.add(clear)
    return () => {
      clears.delete(clear)
    }
  }, [])
  useEffect(() => {
    // Waiting stays until the write settles, and an overtaken copy until it is pressed again; the rest go after a moment.
    if (!said || said.kind === 'waiting' || said.kind === 'overtaken') return undefined
    const timer = setTimeout(() => setSaid(null), SAID_MS)
    return () => clearTimeout(timer)
  }, [said])
  return {
    said,
    say: (kind: Said['kind']) => setSaid((was) => ({ kind, n: (was?.n ?? 0) + 1 })),
    /** Puts away what every message said, as a new copy begins (this one's says its own after). */
    clearAll: () => {
      for (const clear of clears) clear()
    },
  }
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

/**
 * One clipboard for the page: the presses count across every message; the latest press's words are what it should hold,
 * and the latest press can be told when an earlier write lands over its own (Codex on #240).
 */
let presses = 0
let latest = { text: '', settled: false, overtaken: () => undefined as void }
/** How long a write may take before it is given up as not copied (a permission request left pending in a webview never
 * settles). */
export const COPY_WAIT_MS = 4000

/** The write, or «late» once it has taken long: it is not given up (a write still on its way may yet land), only said. */
const bounded = (write: Promise<boolean>) =>
  Promise.race([write, new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), COPY_WAIT_MS))])

/**
 * An earlier write that went through after the latest one landed: the clipboard holds the earlier words. It is not
 * written again from here (a promise after the gesture: Safari refuses it, Codex on #240); the latest message says so,
 * and its own Copy, a gesture, puts its words back.
 */
function landed(text: string): void {
  // The latest settled, through or refused (its words then perhaps selected by hand): an earlier write over it is said
  // (Codex P2 on #240).
  if (text !== latest.text && latest.settled) latest.overtaken()
}

export function MessageActs({ message, who, now, onQuote, propose, side = false }: Props) {
  const { said, say, clearAll } = useSaid()
  // Each write starts in its own press (Safari grants the clipboard to the gesture, not to a promise after it). Only the
  // latest press's outcome is said, on any message; an earlier write that goes through late, even one given up, is
  // written over with the latest words, so the clipboard holds what the last press put there.
  const copy = () => {
    const press = ++presses
    const text = clipOf(message, who, now)
    latest = { text, settled: false, overtaken: () => say('overtaken') }
    const write = toClipboard(text)
    void write.then((ok) => {
      if (press === presses) latest.settled = true
      else if (ok) landed(text)
    })
    // Only this message says anything now: another's «Copied» from a moment ago goes (Codex on #240).
    clearAll()
    void bounded(write).then((ok) => {
      if (press !== presses) return
      if (ok !== 'late') {
        say(ok ? 'copied' : 'failed')
        return
      }
      // Long on its way (a permission asked): said waiting, not failed, and said again when it lands (Codex on #240).
      say('waiting')
      void write.then((done) => {
        if (press === presses) say(done ? 'copied' : 'failed')
      })
    })
  }
  return (
    <span className={side ? 'conv-acts side' : 'conv-acts'} onClick={own}>
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
