// The message acts flag (docs/plans/message-acts.md, A36): a member corrects or withdraws their own message in the room's
// chat only when the build sets VITE_SOPHIA_MESSAGE_ACTS=1, after the API and migration 0068 are deployed. With it, the
// Studio reads the discussion with revisions=1, so withdrawn messages come as tombstones. import.meta.env exists only
// under Vite; unit tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

export const MESSAGE_ACTS = env?.VITE_SOPHIA_MESSAGE_ACTS === '1'
