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
