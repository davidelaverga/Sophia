// The search flag (docs/handoffs/FND-C4-PROJECT-SEARCH-attempt-1.md, A38): the project's head offers Search, served by
// the API's project search, only when the build sets VITE_SOPHIA_SEARCH=1, after migration 0072 and the A38 route are
// deployed. Separate from the vision flag, whose fixture pages answer the A13 proposal (recaps too). import.meta.env
// exists only under Vite; unit tests import this module under plain Node.
const env = (import.meta as { env?: Partial<ImportMetaEnv> }).env

export const SEARCH = env?.VITE_SOPHIA_SEARCH === '1'
