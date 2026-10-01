// The message being written to Sophia, kept on this device as it is written (PersonalComposer), so a reload or a closed
// tab loses nothing, with the epoch of the space it was written in: words from before an erasure, wherever it happened
// (another device, while this one was locked), never come back. Each version of the words has the admission key it is
// sent under, kept with it, so every tab sends the same draft under the same key: one message, whichever tab sends it,
// however often. Words on their way are kept apart from the draft: no other tab shows them in its field or sends them
// again, and they come back only if the tab that sent them went away. It belongs to the account signed in (accountOf):
// signing out forgets every draft on this device, and erasing the personal space forgets theirs.
const FAMILY = 'sophia.personal.draft.'
const PREFIX = `${FAMILY}v2.`
export const draftKey = (account: string) => `${PREFIX}${account}`

/** A draft: its words, and the key they are sent under (minted for exactly these words). */
export interface Draft {
  text: string
  key: string
}

/** Words a tab has on their way, under their key, and until when that tab waits for them (its write's time limit). */
export interface OnItsWay extends Draft {
  until: number
}

/** What the device keeps: the draft in the field, and apart from it the words on their way. */
export interface Kept {
  draft: Draft | null
  sending: OnItsWay | null
}

export const NOTHING_KEPT: Kept = { draft: null, sending: null }

/** These words as a draft of their own: a key minted for them. */
export const draftOf = (text: string, key: string = crypto.randomUUID()): Draft => ({ text, key })

const field = (value: object, name: string): unknown => Reflect.get(value, name)

function draftFrom(value: object): Draft | null {
  const text = field(value, 'text')
  const key = field(value, 'key')
  return typeof text === 'string' && text && typeof key === 'string' ? { text, key } : null
}

function onItsWayFrom(value: unknown): OnItsWay | null {
  if (typeof value !== 'object' || value === null) return null
  const words = draftFrom(value)
  const until = field(value, 'until')
  return words && typeof until === 'number' ? { ...words, until } : null
}

/**
 * What the device keeps, as the space's `epoch` shows it: nothing when it was written before an erasure (or can't be
 * read). What a later epoch keeps is another tab's that read the space since: it shows.
 */
export function keptIn(kept: string | null, epoch: number): Kept {
  if (kept === null) return NOTHING_KEPT
  try {
    const value: unknown = JSON.parse(kept)
    if (typeof value !== 'object' || value === null) return NOTHING_KEPT
    const at = field(value, 'epoch')
    if (typeof at !== 'number' || at < epoch) return NOTHING_KEPT
    return { draft: draftFrom(value), sending: onItsWayFrom(field(value, 'sending')) }
  } catch {
    return NOTHING_KEPT
  }
}

/** How the device keeps it, in `epoch`; nothing for an empty field with nothing on its way. */
export function keptAs(kept: Kept, epoch: number): string | null {
  const draft = kept.draft?.text ? kept.draft : null
  if (!draft && !kept.sending) return null
  return JSON.stringify({ epoch, ...draft, ...(kept.sending ? { sending: kept.sending } : {}) })
}

/** What this device keeps, as the space's `epoch` shows it; what is from before an erasure goes from the device. */
export function readKept(account: string, epoch: number): Kept {
  try {
    const stored = localStorage.getItem(draftKey(account))
    const kept = keptIn(stored, epoch)
    if (stored !== null && !kept.draft && !kept.sending) localStorage.removeItem(draftKey(account))
    return kept
  } catch {
    return NOTHING_KEPT
  }
}

export function writeKept(account: string, kept: Kept, epoch: number): void {
  try {
    const stored = keptAs(kept, epoch)
    if (stored) localStorage.setItem(draftKey(account), stored)
    else localStorage.removeItem(draftKey(account))
  } catch {
    // storage unavailable: the draft lasts for this page only
  }
}

/** The words go, until `until`: out of the draft, kept apart until they are sent. */
export const goingOut = (words: Draft, until: number): Kept => ({ draft: null, sending: { ...words, until } })

/** Sent: the words on their way are let go, and only they (another tab's stay); the draft stays as it is then. */
export const afterSent = (kept: Kept, sent: Draft): Kept => ({
  draft: kept.draft,
  sending: kept.sending?.key === sent.key ? null : kept.sending,
})

/**
 * The draft a field opens with: what the device keeps, and words on their way the tab that sent them left behind (its
 * time is up), back ahead of it; under their own key when nothing was typed after them.
 */
export function onOpening(kept: Kept, now: number): { draft: Draft | null; back: boolean } {
  const left = kept.sending && kept.sending.until < now ? kept.sending : null
  if (!left) return { draft: kept.draft, back: false }
  const typed = kept.draft?.text ?? ''
  const words = { text: left.text, key: left.key }
  return { draft: typed.trim() ? draftOf(restoredDraft(left.text, typed)) : words, back: true }
}

/** Erasing the space: the device keeps none of its draft. */
export function forgetDraft(account: string): void {
  try {
    localStorage.removeItem(draftKey(account))
  } catch {
    // storage unavailable: nothing was kept
  }
}

type Store = Pick<Storage, 'length' | 'key' | 'removeItem'>

/**
 * Signing out: no draft of anyone's stays on this device. Storage is reached inside the guard: where even reaching it
 * throws (storage blocked), nothing was kept, and signing out goes on.
 */
export function forgetDrafts(given?: Store): void {
  try {
    const store = given ?? localStorage
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i)
      if (key?.startsWith(FAMILY)) store.removeItem(key)
    }
  } catch {
    // storage unavailable: nothing was kept
  }
}

/** Words that didn't go come back ahead of anything written meanwhile, so nothing typed is lost. */
export const restoredDraft = (words: string, current: string): string =>
  current.trim() ? `${words}\n${current}` : words
