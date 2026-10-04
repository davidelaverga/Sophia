// Challenge, at the foot of the card of a review that proposes a change (LFE-07.2, slice 3): why the proposal doesn't
// hold, in one line, sent to the lead for its next review (challenges.ts). Pressed, it opens the line and its Send, in
// the guidance field's style; Escape closes the line, back to Challenge, and keeps the card. Its receipt is said where it
// was asked; once settled (recorded, or refused), only the receipt stays, the words quoted under it. The focus never
// falls to the page: it stays in the line while sending, and moves to the receipt once settled. Only for whoever can act
// on the work, on a review of this revision.
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
  onChallenge: Challenge
}

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

/** The line and its Send, then the receipt under them; the focus stays in the line. */
function Field({ c, at, send, onClose }: { c: Challenged | null; at: string; send: () => void; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null)
  // Opened, the line takes the focus: the reason is what comes next.
  useEffect(() => field.current?.focus(), [])
  return (
    <div className="review-challenge">
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
      {c && c.state !== 'draft' && (
        <p className="review-challenge-said" role="status" data-state={c.state}>
          {SAID[c.state]}
        </p>
      )}
    </div>
  )
}

/** A challenge settled, recorded or refused: its receipt and its words; the focus comes here, not to the page. */
function Settled({ c }: { c: Challenged & { state: 'recorded' | 'denied' } }) {
  const receipt = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (document.activeElement === document.body) receipt.current?.focus()
  }, [])
  return (
    <div ref={receipt} className="review-challenge" tabIndex={-1}>
      <p className="review-challenge-said" role="status" data-state={c.state}>
        {SAID[c.state]}
      </p>
      <q className="review-challenge-quote">{c.text}</q>
    </div>
  )
}

export function ReviewChallenge({ review, viewerId, onChallenge }: Props) {
  const at = challengeKey(review.review_id, viewerId)
  const c = useChallenge(at)
  // Open by itself when something is written or sent: a draft kept, or a receipt to read.
  const [open, setOpen] = useState(c !== null && c.text !== '')
  const opener = useRef<HTMLButtonElement>(null)
  const [closed, setClosed] = useState(false)
  // Closed with Escape, the focus goes back to Challenge.
  useEffect(() => {
    if (closed) opener.current?.focus()
  }, [closed])
  if (c?.state === 'recorded' || c?.state === 'denied') return <Settled c={{ ...c, state: c.state }} />
  if (!open) {
    return (
      <button
        ref={opener}
        type="button"
        className="text-button review-challenge-open"
        onClick={() => {
          setClosed(false)
          setOpen(true)
        }}
      >
        Challenge
      </button>
    )
  }
  const close = () => {
    setOpen(false)
    setClosed(true)
  }
  return <Field c={c} at={at} send={sender(review, at, onChallenge)} onClose={close} />
}
