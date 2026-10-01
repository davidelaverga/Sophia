// The message being written to Sophia, kept on this device as it is written (PersonalComposer), so a reload or a closed
// tab loses nothing, with the epoch of the space it was written in: words from before an erasure, wherever it happened
// (another device, while this one was locked), never come back. It belongs to the account signed in (accountOf):
// signing out forgets every draft on this device, and erasing the personal space forgets theirs.
const FAMILY = 'sophia.personal.draft.'
const PREFIX = `${FAMILY}v2.`
export const draftKey = (account: string) => `${PREFIX}${account}`

/**
 * A kept draft as the field shows it in the space's `epoch`: its words, or none when it was written before an erasure
 * (or can't be read). One from a later epoch is another tab's that read the space since: it shows.
 */
export function draftIn(kept: string | null, epoch: number): string {
  if (kept === null) return ''
  try {
    const value: unknown = JSON.parse(kept)
    if (typeof value !== 'object' || value === null) return ''
    const at: unknown = Reflect.get(value, 'epoch')
    const text: unknown = Reflect.get(value, 'text')
    return typeof at === 'number' && at >= epoch && typeof text === 'string' ? text : ''
  } catch {
    return ''
  }
}

/** What the device keeps of words written in `epoch`; nothing for an empty field. */
export const draftKept = (text: string, epoch: number): string | null => (text ? JSON.stringify({ epoch, text }) : null)

/** The draft this device keeps, as the field shows it in `epoch`; one from before an erasure goes from the device. */
export function readDraft(account: string, epoch: number): string {
  try {
    const kept = localStorage.getItem(draftKey(account))
    const text = draftIn(kept, epoch)
    if (kept !== null && !text) localStorage.removeItem(draftKey(account))
    return text
  } catch {
    return ''
  }
}

export function writeDraft(account: string, text: string, epoch: number): void {
  try {
    const kept = draftKept(text, epoch)
    if (kept) localStorage.setItem(draftKey(account), kept)
    else localStorage.removeItem(draftKey(account))
  } catch {
    // storage unavailable: the draft lasts for this page only
  }
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
