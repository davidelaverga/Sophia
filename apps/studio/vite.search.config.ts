import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import fixtures from './vite.fixtures.config.ts'

// The fixture pages as a build with the search flag and WITHOUT the vision flag (e2e-search/, docs/handoffs/
// FND-C4-PROJECT-SEARCH-attempt-1.md): the Studio searches through A38's served adapter (searchServed, callApi and the
// generated parseSearchPage), and the fixture answers strict A38 pages. The fixtures' config sets the vision flag as it
// is read; this one, read after it, takes it back. Its own port and dependency cache, as the app's server has.
process.env.VITE_SOPHIA_VISION = '0'
process.env.VITE_SOPHIA_SEARCH = '1'

export default mergeConfig(fixtures, {
  server: { port: 5198 },
  cacheDir: fileURLToPath(new URL('./node_modules/.vite-search', import.meta.url)),
})
