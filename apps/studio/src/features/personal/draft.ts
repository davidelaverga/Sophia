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

/**
 * What the device keeps: the draft in the field, and apart from it the words on their way; `at`, the epoch they were
 * kept in, as read.
 */
export interface Kept {
  draft: Draft | null
  sending: OnItsWay | null
  at?: number
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
    return { draft: draftFrom(value), sending: onItsWayFrom(field(value, 'sending')), at }
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

/**
 * The epoch to keep words in: never one older than the device already keeps (another tab read the space since), so a
 * tab behind it never makes newer words look erased.
 */
export function keptEpoch(stored: string | null, epoch: number): number {
  const at = keptIn(stored, 0).at
  return Math.max(epoch, at ?? epoch)
}

/** Keeps `kept` on the device, in `epoch` or the newer one it keeps; the epoch kept in. */
export function writeKept(account: string, kept: Kept, epoch: number): number {
  try {
    const at = keptEpoch(localStorage.getItem(draftKey(account)), epoch)
    const stored = keptAs(kept, at)
    if (stored) localStorage.setItem(draftKey(account), stored)
    else localStorage.removeItem(draftKey(account))
    return at
  } catch {
    return epoch // storage unavailable: the draft lasts for this page only
  }
}

/**
 * The words go, until `until`: out of the draft when it holds them (another tab's newer words, under another key,
 * stay), kept apart until they are sent.
 */
export const goingOut = (kept: Kept, words: Draft, until: number): Kept => ({
  draft: kept.draft?.key === words.key ? null : kept.draft,
  sending: { ...words, until },
})

/** Some tab's words are on their way, still in time. */
export const onItsWayNow = (kept: Kept, now: number): boolean => kept.sending !== null && kept.sending.until > now

/**
 * Whether `words` wait: another tab's are on their way under another key, still in time. The device keeps one message
 * going, so neither is lost and they reach the conversation in the order they were sent.
 */
export const waitsFor = (kept: Kept, words: Draft, now: number): boolean =>
  onItsWayNow(kept, now) && kept.sending?.key !== words.key

/**
 * One message on its way per device and account: the browser's lock (Web Locks, across tabs) is asked for before the
 * words go and held until they have settled, so two presses in two tabs never both go; `taken` says another tab holds
 * it. The stored lease (waitsFor) still keeps the words of a tab that went away. Without Web Locks, the lease alone.
 */
export function oneAtATime<T>(account: string, run: (taken: boolean) => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return run(false)
  return locks.request(`sophia.personal.send.${account}`, { ifAvailable: true }, (lock) => run(lock === null))
}

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
