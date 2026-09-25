// React binding for viewer-state.ts. Storage is a per-device convenience: when it is unavailable
// (private mode, blocked site data) the state still works for this page and is simply not kept.
import { useEffect, useReducer } from 'react'
import { readViewerState, viewerKey, viewerReducer, type Lens } from './viewer-state.ts'

function load(key: string) {
  try {
    return readViewerState(localStorage.getItem(key))
  } catch {
    return readViewerState(null)
  }
}

export function useViewerState(viewer: string, projectId: string) {
  const key = viewerKey(viewer, projectId)
  const [state, dispatch] = useReducer(viewerReducer, key, load)

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* storage unavailable: the view lasts for this page only */
    }
  }, [key, state])

  return {
    state,
    setLens: (lens: Lens) => dispatch({ type: 'lens', lens }),
    setDraft: (lens: Lens, text: string) => dispatch({ type: 'draft', lens, text }),
  }
}
