// The mentions flag (docs/plans/mentions.md, A37): a member names other members on a message to the room, and a
// mentioned member finds it among what needs them, only when the build sets VITE_SOPHIA_MENTIONS=1, after migration
// 0069 and the A37 routes are deployed. Separate from the vision flag. import.meta.env exists only under Vite; unit
// tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

export const MENTIONS = env?.VITE_SOPHIA_MENTIONS === '1'
