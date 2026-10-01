// The message being written to Sophia, kept on this device as it is written (PersonalComposer), so a reload or a closed
// tab loses nothing, with the epoch of the space it was written in: words from before an erasure, wherever it happened
// (another device, while this one was locked), never come back. Each version of the words has the admission key it is
// sent under, kept with it, so every tab sends the same draft under the same key: one message, whichever tab sends it,
// however often. It belongs to the account signed in (accountOf): signing out forgets every draft on this device, and
// erasing the personal space forgets theirs.
const FAMILY = 'sophia.personal.draft.'
const PREFIX = `${FAMILY}v2.`
export const draftKey = (account: string) => `${PREFIX}${account}`

/** A draft: its words, and the key they are sent under (minted for exactly these words). */
export interface Draft {
  text: string
  key: string
}

/** These words as a draft of their own: a key minted for them. */
export const draftOf = (text: string, key: string = crypto.randomUUID()): Draft => ({ text, key })

/**
 * A kept draft as the field shows it in the space's `epoch`: its words and key, or none when it was written before an
 * erasure (or can't be read). One from a later epoch is another tab's that read the space since: it shows.
 */
export function draftIn(kept: string | null, epoch: number): Draft | null {
  if (kept === null) return null
  try {
    const value: unknown = JSON.parse(kept)
    if (typeof value !== 'object' || value === null) return null
    const at: unknown = Reflect.get(value, 'epoch')
    const text: unknown = Reflect.get(value, 'text')
    const key: unknown = Reflect.get(value, 'key')
    const readable = typeof at === 'number' && typeof text === 'string' && typeof key === 'string'
    return readable && at >= epoch && text ? { text, key } : null
  } catch {
    return null
  }
}

/** What the device keeps of a draft written in `epoch`; nothing for an empty field. */
export const draftKept = (draft: Draft | null, epoch: number): string | null =>
  draft?.text ? JSON.stringify({ epoch, text: draft.text, key: draft.key }) : null

/** The draft this device keeps, as the field shows it in `epoch`; one from before an erasure goes from the device. */
export function readDraft(account: string, epoch: number): Draft | null {
  try {
    const kept = localStorage.getItem(draftKey(account))
    const draft = draftIn(kept, epoch)
    if (kept !== null && !draft) localStorage.removeItem(draftKey(account))
    return draft
  } catch {
    return null
  }
}

export function writeDraft(account: string, draft: Draft | null, epoch: number): void {
  try {
    const kept = draftKept(draft, epoch)
    if (kept) localStorage.setItem(draftKey(account), kept)
    else localStorage.removeItem(draftKey(account))
  } catch {
    // storage unavailable: the draft lasts for this page only
  }
}

/**
 * What the device keeps once `sent` went, from what it keeps now (another tab may have written since): nothing when it
 * holds just those words; what was typed after them, as words of their own; another tab's words as they are.
 */
export function afterSent(kept: Draft | null, sent: Draft): Draft | null {
  if (!kept || kept.key === sent.key) return null
  const ahead = `${sent.text}\n`
  return kept.text.startsWith(ahead) ? draftOf(kept.text.slice(ahead.length)) : kept
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

/**
 * What the device keeps of the draft: what is typed, and while a message is on its way (`sending`) those words ahead
 * of it, so closing the page then loses neither.
 */
export const draftToStore = (sending: string | null, typed: string): string =>
  sending === null ? typed : restoredDraft(sending, typed)
