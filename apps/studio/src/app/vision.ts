// The vision flag (docs/plans/room-present.md): what calls an API proposed in issue #105 but not built yet shows only
// when the build sets VITE_SOPHIA_VISION=1. Only the fixture pages set it, so production never offers a control whose
// request would fail. import.meta.env exists only under Vite; unit tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

export const VISION = env?.VITE_SOPHIA_VISION === '1'
