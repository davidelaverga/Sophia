// The vision flag (docs/plans/room-present.md): what calls an API proposed in issue #105 but not built yet shows only
// when the build sets VITE_SOPHIA_VISION=1. Only the fixture pages set it, so production never offers a control whose
// request would fail. import.meta.env exists only under Vite; unit tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

export const VISION = env?.VITE_SOPHIA_VISION === '1'

/**
 * Saved project conversations (CON-01, amendment A16), real now: their tab shows where the build sets
 * VITE_SOPHIA_CONVERSATIONS=1 (a Studio built against an API that serves them), or under the vision flag (the fixture
 * pages). Separate from VISION, which production never sets: turning conversations on turns on nothing else proposed.
 */
export const CONVERSATIONS = VISION || env?.VITE_SOPHIA_CONVERSATIONS === '1'
