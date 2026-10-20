// The tasks flag (docs/handoffs/FND-C5-HUMAN-TASKS-attempt-1.md, A39): a project's human tasks served by the API, read
// and written through the generated parsers, only when the build sets VITE_SOPHIA_TASKS=1, after migration 0074 and the
// A39 routes are deployed. Separate from the vision flag, whose fixture pages keep the A17 proposal. import.meta.env
// exists only under Vite; unit tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

export const TASKS = env?.VITE_SOPHIA_TASKS === '1'
