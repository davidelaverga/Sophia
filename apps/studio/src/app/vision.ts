// The vision flag (docs/plans/room-present.md): what calls an API proposed in issue #105 but not built yet shows only
// when the build sets VITE_SOPHIA_VISION=1. Only the fixture pages set it, so production never offers a control whose
// request would fail. import.meta.env exists only under Vite; unit tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

/**
 * On where the build sets it, unless the address says `vision=off`: one fixture page then shows what production offers,
 * so a browser check can measure it (docs/plans/prod-honesty.md). The address can only turn the flag off.
 */
export const visionOn = (flag: string | undefined, search: string | undefined): boolean =>
  flag === '1' && new URLSearchParams(search).get('vision') !== 'off'

export const VISION = visionOn(env?.VITE_SOPHIA_VISION, (globalThis as { location?: Location }).location?.search)

/**
 * Saved project conversations (CON-01, amendment A33), real now: their tab shows where the build sets
 * VITE_SOPHIA_CONVERSATIONS=1 (a Studio built against an API that serves them), or under the vision flag (the fixture
 * pages). Separate from VISION, which production never sets: turning conversations on turns on nothing else proposed.
 */
export const CONVERSATIONS = VISION || env?.VITE_SOPHIA_CONVERSATIONS === '1'
