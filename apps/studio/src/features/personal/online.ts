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

/**
 * What a field on the work side says while offline (a project conversation, the room bar), before any press and in
 * place of «Not confirmed»: nothing went, in Personal's voice (costuras seam #8).
 */
export const OFFLINE_UNSENT = 'You’re offline, so this wasn’t sent. It waits here; send it once you’re back.'
