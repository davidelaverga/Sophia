// React binding for viewer-state.ts. Storage is a per-device convenience: when it is unavailable
// (private mode, blocked site data) the state still works for this page and is simply not kept.
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { ADDRESS_MOVED, pathIsFor } from '../../app/route.ts'
import { VISION } from '../../app/vision.ts'
import {
  LENS_FOR_KEY,
  addressLensFor,
  lensAddress,
  readLensWrite,
  readViewerState,
  shownLens,
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

/** Whose lens the address carries: what the tab remembers; none for a link opened fresh (or no storage). */
function wroteFor() {
  try {
    return readLensWrite(sessionStorage.getItem(LENS_FOR_KEY))
  } catch {
    return null
  }
}

/**
 * A count of the address's moves made by the app (`pushState`, Back and Forward): a press of the view already shown
 * pushes its path again, without the lens, under a shell that stays mounted.
 */
function useAddressMoves() {
  const [moves, setMoves] = useState(0)
  useEffect(() => {
    const moved = () => setMoves((n) => n + 1)
    window.addEventListener(ADDRESS_MOVED, moved)
    window.addEventListener('popstate', moved)
    return () => {
      window.removeEventListener(ADDRESS_MOVED, moved)
      window.removeEventListener('popstate', moved)
    }
  }, [])
  return moves
}

/**
 * The state at load: the stored one, the lens the address names winning (a shared link shows what was seen) where
 * the Studio view is the one shown and the lens is this viewer's to read (`addressLensFor`); a shell kept out of
 * sight for its call reads nothing from another view's address.
 */
function load(key: string, inAddress: boolean) {
  const was = stored(key)
  const named = inAddress ? addressLensFor(key, window.location, wroteFor()) : null
  return named ? { ...was, lens: named } : was
}

/** `inAddress`: this Studio view is the one shown, so the address is its to read and write (Codex on #242). */
export function useViewerState(viewer: string, projectId: string, inAddress = true) {
  const key = viewerKey(viewer, projectId)
  const [state, dispatch] = useReducer(viewerReducer, key, (k) => load(k, inAddress))
  // The lens shown: a stored or linked one this Studio doesn't offer opens as Converse, the stored choice kept.
  const shown = shownLens(state.lens, VISION)
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
  // The lens in the address, no history entry, Converse too (docs/plans/studio-lens-address.md). `moves`: the address
  // moved under a mounted shell (the view already shown, pressed again) is written again (Codex on #242).
  const moves = useAddressMoves()
  // A shell kept mounted (a call) that takes the address again, by Back or Forward to its Studio: the lens that address
  // names is read before this shell writes its own over it (Codex on #242).
  const wasInAddress = useRef(inAddress)
  useLayoutEffect(() => {
    if (inAddress && !wasInAddress.current) {
      const named = addressLensFor(key, window.location, wroteFor())
      if (named) dispatch({ type: 'lens', lens: named })
    }
    wasInAddress.current = inAddress
  }, [inAddress, key])
  useEffect(() => {
    if (!inAddress) return
    const { pathname, search, hash } = window.location
    const next = withLensInAddress(search, shown)
    if (next !== search) window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`)
    // Whose lens the address carries, and which address, so another subject at this page does not read it as theirs.
    try {
      sessionStorage.setItem(LENS_FOR_KEY, JSON.stringify({ key, address: lensAddress(pathname, next) }))
    } catch {
      /* no storage: the address's lens is read as any link's */
    }
  }, [shown, inAddress, key, moves])
  // The Studio view gone without a move of the route (the door shut under it: AccessNotice): the address stops
  // naming a lens nothing shows, the rest of it kept (Codex on #242). A move of the route rewrites the address itself.
  useEffect(() => {
    if (!inAddress) return undefined
    return () => {
      const { pathname, search, hash } = window.location
      // The address already another project's (Back or Forward while a call keeps this one on screen): its lens is its
      // own, kept (Codex on #242).
      if (!pathIsFor(pathname, projectId)) return
      const next = withLensInAddress(search, null)
      if (next !== search) window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`)
    }
  }, [inAddress, projectId])

  return {
    state: shown === state.lens ? state : { ...state, lens: shown },
    setLens: (lens: Lens) => dispatch({ type: 'lens', lens }),
    setDraft: (lens: Lens, text: string) => dispatch({ type: 'draft', lens, text }),
  }
}
