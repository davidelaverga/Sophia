// The message being written to Sophia, kept on this device as it is written (PersonalComposer), so a reload or a closed
// tab loses nothing. It belongs to the person signed in: signing out forgets every draft on this device, and erasing
// the personal space forgets theirs.
const PREFIX = 'sophia.personal.draft.v1.'
const draftKey = (identity: string) => `${PREFIX}${identity}`

export function readDraft(identity: string): string {
  try {
    return localStorage.getItem(draftKey(identity)) ?? ''
  } catch {
    return ''
  }
}

export function writeDraft(identity: string, text: string): void {
  try {
    if (text) localStorage.setItem(draftKey(identity), text)
    else localStorage.removeItem(draftKey(identity))
  } catch {
    // storage unavailable: the draft lasts for this page only
  }
}

type Store = Pick<Storage, 'length' | 'key' | 'removeItem'>

/** Signing out: no draft of anyone's stays on this device. */
export function forgetDrafts(store: Store = localStorage): void {
  try {
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i)
      if (key?.startsWith(PREFIX)) store.removeItem(key)
    }
  } catch {
    // storage unavailable: nothing was kept
  }
}

/** Words that didn't go come back ahead of anything written meanwhile, so nothing typed is lost. */
export const restoredDraft = (words: string, current: string): string =>
  current.trim() ? `${words}\n${current}` : words
