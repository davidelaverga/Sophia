// Viewer-local state (architecture 04 §2, 13 §3): one person's lens and unsent drafts in one project.
// It never becomes a project mutation, so changing it cannot move another person's view or retask work.
// Lens and non-chat drafts are kept per viewer/project on this device. Chat drafts survive resnapshots only.

export const LENSES = ['converse', 'explore', 'build'] as const
export type Lens = (typeof LENSES)[number]

export interface ViewerState {
  lens: Lens
  /** Unsent text per lens. Kept until the viewer clears it; server events never touch it. */
  drafts: Partial<Record<Lens, string>>
}

export type ViewerAction =
  | { type: 'lens'; lens: Lens }
  | { type: 'draft'; lens: Lens; text: string }
  /** Another viewer (or project) at the same page: their stored state, whole. */
  | { type: 'load'; state: ViewerState }

export const INITIAL_VIEWER_STATE: ViewerState = { lens: 'converse', drafts: {} }

const isLens = (value: unknown): value is Lens => LENSES.some((l) => l === value)

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  if (action.type === 'load') return action.state
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
  for (const [key, text] of Object.entries(value))
    if (isLens(key) && key !== 'converse' && typeof text === 'string') drafts[key] = text
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

/** Chat drafts stay in this component session; only the other lens drafts are device conveniences. */
export function storedViewerState(state: ViewerState): ViewerState {
  const { converse: _chat, ...drafts } = state.drafts
  return { ...state, drafts }
}

/** The lens an address names (`?lens=explore`), or null: none, or not a lens. */
export function lensInAddress(search: string): Lens | null {
  const value = new URLSearchParams(search).get('lens')
  return isLens(value) ? value : null
}

/**
 * The address's search with the lens in it, Converse too: an address without one is no claim (the stored lens
 * stands), so a link that shows Converse must say so (Codex on #242). Null takes the lens out: nothing shows one.
 */
export function withLensInAddress(search: string, lens: Lens | null): string {
  const params = new URLSearchParams(search)
  if (lens === null) params.delete('lens')
  else params.set('lens', lens)
  const out = params.toString()
  return out ? `?${out}` : ''
}

/** Whose lens the address carries, kept for the tab (sessionStorage): the viewer's key and the address it wrote. */
export const LENS_FOR_KEY = 'sophia.lens-for.v2'

/** What the tab remembers: the key of the shell that wrote the address, and that address (path and search). */
export interface LensWrite {
  key: string
  address: string
}

/** The remembered write, read defensively: anything else is none (a link opened fresh). */
export function readLensWrite(raw: string | null): LensWrite | null {
  const parsed = parseObject(raw)
  if (!parsed || !('key' in parsed) || !('address' in parsed)) return null
  const { key, address } = parsed
  return typeof key === 'string' && typeof address === 'string' ? { key, address } : null
}

/**
 * The lens the address names, where it is this viewer's to read: a link opened fresh (nothing written in this tab),
 * an address written for this key, or an address other than the one written (a link followed since: another
 * project's, a pasted one; Codex on #242). Another subject at the very address the last one left reads none, and their
 * own stored state stands (app-auth.spec, «resets for another subject»).
 */
export function addressLensFor(
  key: string,
  here: { pathname: string; search: string },
  wrote: LensWrite | null,
): Lens | null {
  const named = lensInAddress(here.search)
  if (!named) return null
  const left = wrote !== null && wrote.key !== key && wrote.address === `${here.pathname}${here.search}`
  return left ? null : named
}
