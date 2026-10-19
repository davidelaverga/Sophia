// Whether the browser is online (navigator.onLine): offline, a message waits in the field and says why.
import { useSyncExternalStore } from 'react'

function subscribe(changed: () => void): () => void {
  window.addEventListener('online', changed)
  window.addEventListener('offline', changed)
  return () => {
    window.removeEventListener('online', changed)
    window.removeEventListener('offline', changed)
  }
}

export const useOnline = (): boolean => useSyncExternalStore(subscribe, () => navigator.onLine)

/** Offline, words wait in the field: Personal's line, and the work side's under an empty field (costuras seam #8). */
export const OFFLINE_WAITS = 'You’re offline. Your words wait here.'

/** Offline, words written on the work side (a project conversation, the room bar): nothing went, before any press. */
export const OFFLINE_UNSENT = 'You’re offline, so this wasn’t sent. It waits here; send it once you’re back.'

/** Offline, a message held with no reply: it may have landed, so it isn't confirmed, and Send sends it under its key. */
const offlineHeld = (words: string) =>
  `You’re offline, so “${words}” isn’t confirmed. Send it again once you’re back; it won’t be written twice.`

/**
 * What a field on the work side says while offline, in place of what it said (costuras seam #8): a message held with
 * no reply (its first words) isn't confirmed, since it may have landed; words written weren't sent; an empty field
 * says, as Personal's does, that words wait. Null while a message is on its way: how it ends is said when it does.
 */
export function offlineWords(field: { going: boolean; held: string | null; written: boolean }): string | null {
  if (field.going) return null
  if (field.held !== null) return offlineHeld(field.held)
  return field.written ? OFFLINE_UNSENT : OFFLINE_WAITS
}
