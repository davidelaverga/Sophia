// The message being written to Sophia, kept on this device as it is written (PersonalComposer), so a reload or a closed
// tab loses nothing. It belongs to the account signed in (accountOf): signing out forgets every draft on this device,
// and erasing the personal space forgets theirs.
const PREFIX = 'sophia.personal.draft.v1.'
const draftKey = (account: string) => `${PREFIX}${account}`

export function readDraft(account: string): string {
  try {
    return localStorage.getItem(draftKey(account)) ?? ''
  } catch {
    return ''
  }
}

export function writeDraft(account: string, text: string): void {
  try {
    if (text) localStorage.setItem(draftKey(account), text)
    else localStorage.removeItem(draftKey(account))
  } catch {
    // storage unavailable: the draft lasts for this page only
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
      if (key?.startsWith(PREFIX)) store.removeItem(key)
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
