// Whether a media query holds now, followed as it changes: for what must be mounted in one place or another by
// width (the room's dock: in the header on a wide screen, floating on a narrow one, docs/plans/dock-header.md).
import { useCallback, useSyncExternalStore } from 'react'

export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (listen: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', listen)
      return () => media.removeEventListener('change', listen)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** A screen wide enough for the header to hold the room's dock beside its other controls. */
export const WIDE = '(min-width: 721px)'
