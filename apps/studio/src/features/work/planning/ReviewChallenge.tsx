// Challenge, at the foot of the card of a review that proposes a change (LFE-07.2, slice 3): why the proposal doesn't
// hold, in one line, sent to the lead for its next review (challenges.ts). Pressed, it opens the line and its Send, in
// the guidance field's style; Escape closes the line, back to Challenge, and keeps the card. Its receipt is said where
// it was asked, by one status kept from the start, open line or not; once settled (recorded, or refused), only the words
// stay, quoted over it. The focus never falls to the page: it stays in the line while sending, and moves to the receipt
// once settled. Only for whoever can act on the work, on a review of this revision. With nowhere to send it now (the
// board's live state can't be read), one already sent stays said, its words quoted, and its receipt still lands; nothing
// is offered to send, or to send again (Codex F-024).
import { useEffect, useRef, useState } from 'react'
import {
  challengeKey,
  challengeOf,
  editable,
  keyFor,
  SAID,
  sendable,
  setChallenge,
  useChallenge,
  type Challenge,
  type Challenged,
} from './challenges.ts'
import type { LastReview } from './review.ts'

interface Props {
  review: LastReview
  viewerId: string | null
  /** Where it goes; absent, nothing can be sent from here now. */
  onChallenge?: Challenge | undefined
}

/** Why one not confirmed isn't offered again: nowhere to send it now. */
const NOT_NOW = 'It can’t be sent again from here now; it is kept as it was.'

/** Sends the challenge as the page memory holds it now: a new key for a draft, the same one for one not confirmed. */
function sender(review: LastReview, key: string, onChallenge: Challenge) {
  return () => {
    const c = challengeOf(key)
    if (!c || !sendable(c)) return
    const idempotencyKey = keyFor(c, () => crypto.randomUUID())
    setChallenge(key, { ...c, key: idempotencyKey, state: 'sending' })
    onChallenge(review, c.text.trim(), idempotencyKey).then(
      (state) => setChallenge(key, { ...c, key: idempotencyKey, state }),
      () => setChallenge(key, { ...c, key: idempotencyKey, state: 'unknown' }),
    )
  }
}

/** The line and its Send; the focus stays in the line. */
function Field({ c, at, send, onClose }: { c: Challenged | null; at: string; send: () => void; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null)
  // Opened, the line takes the focus: the reason is what comes next.
  useEffect(() => field.current?.focus(), [])
  return (
    <form
      className="act-guide"
      onSubmit={(e) => {
        e.preventDefault()
        send()
        // Send turns disabled while it goes: the focus stays in the line, not on the page.
        field.current?.focus()
      }}
    >
      <input
        ref={field}
        aria-label="Why the proposal doesn’t hold"
        placeholder="Why doesn’t this hold?"
        value={c?.text ?? ''}
        readOnly={!editable(c)}
        onChange={(e) => setChallenge(at, { text: e.target.value, key: '', state: 'draft' })}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          onClose()
        }}
      />
      <button type="submit" className="pill" disabled={!sendable(c)}>
        {c?.state === 'unknown' ? 'Send again' : 'Send'}
      </button>
    </form>
  )
}

/** Settled, recorded or refused: only its words stay, over its receipt. */
const settled = (c: Challenged | null): c is Challenged & { state: 'recorded' | 'denied' } =>
  c?.state === 'recorded' || c?.state === 'denied'

/** Challenge's own state: open or not, and the focus put back where it belongs as it changes. */
function useChallengeFocus(c: Challenged | null) {
  // Open by itself when something is written or sent: a draft kept, or a receipt to read.
  const [open, setOpen] = useState(c !== null && c.text !== '')
  const [closed, setClosed] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const done = settled(c)
  // Closed with Escape, the focus goes back to Challenge; settled, to the receipt, never left on the page.
  useEffect(() => {
    if (closed) opener.current?.focus()
  }, [closed])
  useEffect(() => {
    if (done && document.activeElement === document.body) box.current?.focus()
  }, [done])
  return {
    open,
    opener,
    box,
    done,
    openLine: () => {
      setClosed(false)
      setOpen(true)
    },
    closeLine: () => {
      setOpen(false)
      setClosed(true)
    },
  }
}

/** Sent and not settled, with nowhere to send now: its words, and why it isn't offered again. */
function Kept({ c }: { c: Challenged | null }) {
  if (!c || c.state === 'draft') return null
  return (
    <>
      <q className="review-challenge-quote">{c.text}</q>
      {c.state === 'unknown' && <p className="act-note muted">{NOT_NOW}</p>}
    </>
  )
}

export function ReviewChallenge({ review, viewerId, onChallenge }: Props) {
  const at = challengeKey(review.review_id, viewerId)
  const c = useChallenge(at)
  const focus = useChallengeFocus(c)
  const body = settled(c) ? (
    <q className="review-challenge-quote">{c.text}</q>
  ) : !onChallenge ? (
    <Kept c={c} />
  ) : focus.open ? (
    <Field c={c} at={at} send={sender(review, at, onChallenge)} onClose={focus.closeLine} />
  ) : (
    <button ref={focus.opener} type="button" className="text-button review-challenge-open" onClick={focus.openLine}>
      Challenge
    </button>
  )
  return (
    <div ref={focus.box} className="review-challenge" tabIndex={focus.done ? -1 : undefined}>
      {body}
      {/* One status from the start, its words changed in place: a screen reader hears each step, the last too. */}
      <p className="review-challenge-said" role="status" data-state={c?.state}>
        {c && c.state !== 'draft' ? SAID[c.state] : ''}
      </p>
    </div>
  )
}
