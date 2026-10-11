// React binding for viewer-state.ts. Storage is a per-device convenience: when it is unavailable
// (private mode, blocked site data) the state still works for this page and is simply not kept.
import { useEffect, useReducer } from 'react'
import {
  lensInAddress,
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

/**
 * The state at load: the stored one, the lens the address names winning (a shared link shows what was seen) where
 * the Studio view is the one shown; a shell kept out of sight for its call reads nothing from another view's address.
 */
function load(key: string, inAddress: boolean) {
  const was = stored(key)
  const named = inAddress ? lensInAddress(window.location.search) : null
  return named ? { ...was, lens: named } : was
}

/** `inAddress`: this Studio view is the one shown, so the address is its to read and write (Codex on #242). */
export function useViewerState(viewer: string, projectId: string, inAddress = true) {
  const key = viewerKey(viewer, projectId)
  const [state, dispatch] = useReducer(viewerReducer, key, (k) => load(k, inAddress))

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
  }, [state.lens, inAddress])

  return {
    state,
    setLens: (lens: Lens) => dispatch({ type: 'lens', lens }),
    setDraft: (lens: Lens, text: string) => dispatch({ type: 'draft', lens, text }),
  }
}
