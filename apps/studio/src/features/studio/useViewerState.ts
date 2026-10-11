// React binding for viewer-state.ts. Storage is a per-device convenience: when it is unavailable
// (private mode, blocked site data) the state still works for this page and is simply not kept.
import { useEffect, useReducer, useRef } from 'react'
import {
  LENS_FOR_KEY,
  addressLensFor,
  readViewerState,
  storedViewerState,
  viewerKey,
  viewerReducer,
  withLensInAddress,
  type Lens,
} from './viewer-state.ts'

function stored(key: string) {
  try {
    return readViewerState(localStorage.getItem(key))
  } catch {
    return readViewerState(null)
  }
}

/** Whose lens the address carries: the key the tab remembers; none for a link opened fresh (or no storage). */
function wroteFor(): string | null {
  try {
    return sessionStorage.getItem(LENS_FOR_KEY)
  } catch {
    return null
  }
}

/**
 * The state at load: the stored one, the lens the address names winning (a shared link shows what was seen) where
 * the Studio view is the one shown and the lens is this viewer's to read (`addressLensFor`); a shell kept out of
 * sight for its call reads nothing from another view's address.
 */
function load(key: string, inAddress: boolean) {
  const was = stored(key)
  const named = inAddress ? addressLensFor(key, window.location.search, wroteFor()) : null
  return named ? { ...was, lens: named } : was
}

/** `inAddress`: this Studio view is the one shown, so the address is its to read and write (Codex on #242). */
export function useViewerState(viewer: string, projectId: string, inAddress = true) {
  const key = viewerKey(viewer, projectId)
  const [state, dispatch] = useReducer(viewerReducer, key, (k) => load(k, inAddress))
  // Another subject (or project) at the same page: their own stored state, and not the lens the address kept for the
  // last one (the address is then rewritten from theirs, below).
  const loadedFor = useRef(key)
  useEffect(() => {
    if (loadedFor.current === key) return
    loadedFor.current = key
    dispatch({ type: 'load', state: load(key, false) })
  }, [key])

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(storedViewerState(state)))
    } catch {
      /* storage unavailable: the view lasts for this page only */
    }
  }, [key, state])
  // The lens in the address, no history entry: Converse, the default, is said by its absence (docs/plans/studio-lens-address.md).
  useEffect(() => {
    if (!inAddress) return
    const { pathname, search, hash } = window.location
    const next = withLensInAddress(search, state.lens)
    if (next !== search) window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`)
    // Whose lens the address carries, so another subject at this page does not read it as theirs.
    try {
      sessionStorage.setItem(LENS_FOR_KEY, key)
    } catch {
      /* no storage: the address's lens is read as any link's */
    }
  }, [state.lens, inAddress, key])
  // The Studio view gone without a move of the route (the door shut under it: AccessNotice): the address stops
  // naming a lens nothing shows, the rest of it kept (Codex on #242). A move of the route rewrites the address itself.
  useEffect(() => {
    if (!inAddress) return undefined
    return () => {
      const { pathname, search, hash } = window.location
      const next = withLensInAddress(search, 'converse')
      if (next !== search) window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`)
    }
  }, [inAddress])

  return {
    state,
    setLens: (lens: Lens) => dispatch({ type: 'lens', lens }),
    setDraft: (lens: Lens, text: string) => dispatch({ type: 'draft', lens, text }),
  }
}
