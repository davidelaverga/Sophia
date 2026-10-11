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

/** The state at load: the stored one, the lens the address names winning (a shared link shows what was seen). */
function load(key: string) {
  const was = stored(key)
  const named = lensInAddress(window.location.search)
  return named ? { ...was, lens: named } : was
}

export function useViewerState(viewer: string, projectId: string) {
  const key = viewerKey(viewer, projectId)
  const [state, dispatch] = useReducer(viewerReducer, key, load)

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(storedViewerState(state)))
    } catch {
      /* storage unavailable: the view lasts for this page only */
    }
  }, [key, state])
  // The lens in the address, no history entry: Converse, the default, is said by its absence (docs/plans/studio-lens-address.md).
  useEffect(() => {
    const { pathname, search, hash } = window.location
    const next = withLensInAddress(search, state.lens)
    if (next !== search) window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`)
  }, [state.lens])

  return {
    state,
    setLens: (lens: Lens) => dispatch({ type: 'lens', lens }),
    setDraft: (lens: Lens, text: string) => dispatch({ type: 'draft', lens, text }),
  }
}
