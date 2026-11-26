// A message to the room drawn at once, before the server answers (docs/plans/chat-pace.md): dimmed while it goes,
// offered again where its reply was lost, gone the moment the discussion holds it, so it is never drawn twice. A
// message refused while the bar held other words keeps a row of its own until its own Try again lands.

/** What the row says of a message on its way. */
export type PendingStatus = 'sending' | 'unknown' | 'sent' | 'failed'

export interface Pending {
  text: string
  status: PendingStatus
  /** The contribution the receipt names, once sent: the row goes when the discussion holds it. */
  id: string | null
}

/** The admission's state as the row reads it (useAdmission). */
type Admission =
  | { status: 'idle' }
  | { status: 'sending'; args: { text: string } }
  | { status: 'unknown'; args: { text: string } }
  | { status: 'done'; args: { text: string }; result: { contributionId: string } }
  | { status: 'rejected'; args: { text: string } }

/** What the discussion says of this person's messages, for the row to give way to them. */
export interface Held {
  /** Every entry id the discussion holds now. */
  ids: ReadonlySet<string>
  /** A receipt's message the discussion has held once: withdrawn or scrolled out of its 50 since, it stays gone. */
  landed: string | null
  /** The discussion holds a new message of this person's with these words, one it didn't hold when the send began. */
  saidSince: (text: string) => boolean
}

/** The row for the message on its way, or none: a message the discussion holds, or held once, is drawn there alone. */
export function pendingOf(admission: Admission, held: Held): Pending | null {
  // While it goes, the feed may bring it before the reply: it is drawn there alone.
  if (admission.status === 'sending') {
    return held.saidSince(admission.args.text) ? null : { text: admission.args.text, status: 'sending', id: null }
  }
  // Its reply lost, it keeps its row and Try again (the same key: a message in already is replayed, never doubled).
  if (admission.status === 'unknown') return { text: admission.args.text, status: 'unknown', id: null }
  if (admission.status === 'done') {
    const id = admission.result.contributionId
    return held.ids.has(id) || held.landed === id ? null : { text: admission.args.text, status: 'sent', id }
  }
  return null
}

/** The receipt's message once the discussion holds it: kept as landed, so the row never comes back. */
export function landedNow(admission: Admission, held: Pick<Held, 'ids' | 'landed'>): string | null {
  if (admission.status !== 'done') return held.landed
  const id = admission.result.contributionId
  return held.ids.has(id) ? id : held.landed
}

/** What the row says under the words, by its status; nothing once sent (it reads as a message). */
export const PENDING_WORDS: Readonly<Record<PendingStatus, string | null>> = {
  sending: 'Sending…',
  unknown: 'Not confirmed.',
  sent: null,
  failed: 'Not sent.',
}
