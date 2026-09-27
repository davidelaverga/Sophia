// Viewer-local state (architecture 04 §2, 13 §3): one person's lens and unsent drafts in one project.
// It never becomes a project mutation, so changing it cannot move another person's view or retask work.
// It is kept per viewer and project on this device and survives resnapshots and reloads.

export const LENSES = ['converse', 'explore', 'build'] as const
export type Lens = (typeof LENSES)[number]

export interface ViewerState {
  lens: Lens
  /** Unsent text per lens. Kept until the viewer clears it; server events never touch it. */
  drafts: Partial<Record<Lens, string>>
}

export type ViewerAction = { type: 'lens'; lens: Lens } | { type: 'draft'; lens: Lens; text: string }

export const INITIAL_VIEWER_STATE: ViewerState = { lens: 'converse', drafts: {} }

const isLens = (value: unknown): value is Lens => LENSES.some((l) => l === value)

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  if (action.type === 'lens') return action.lens === state.lens ? state : { ...state, lens: action.lens }
  const drafts = { ...state.drafts }
  if (action.text === '') delete drafts[action.lens]
  else drafts[action.lens] = action.text
  return { ...state, drafts }
}

/** Storage key: per viewer and project, so two people on one browser never share a view. */
export const viewerKey = (viewer: string, projectId: string) => `sophia.viewer.v1.${viewer}.${projectId}`

function parseObject(raw: string | null): object | null {
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

/** Only known lenses with string text; anything else stored under `drafts` is dropped. */
function readDrafts(value: unknown): ViewerState['drafts'] {
  const drafts: ViewerState['drafts'] = {}
  if (typeof value !== 'object' || value === null) return drafts
  for (const [key, text] of Object.entries(value)) if (isLens(key) && typeof text === 'string') drafts[key] = text
  return drafts
}

/** Whatever was stored, read defensively: a malformed or foreign value yields the initial state. */
export function readViewerState(raw: string | null): ViewerState {
  const parsed = parseObject(raw)
  if (!parsed) return INITIAL_VIEWER_STATE
  return {
    lens: 'lens' in parsed && isLens(parsed.lens) ? parsed.lens : INITIAL_VIEWER_STATE.lens,
    drafts: readDrafts('drafts' in parsed ? parsed.drafts : null),
  }
}
