import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import fixtures, { appAddresses, studioPageAs } from './vite.fixtures.config.ts'

// The Studio app itself on a fixture page (fixtures/app.tsx, e2e/signed-in-later.spec.ts, which needs its modules served
// one by one), signed in with Supabase Auth as a build with VITE_SUPABASE_* is, against a synthetic Auth service on this
// machine: the checks answer its address in the page, so no request leaves it and no project's Auth is used. Its own
// server and port, so these variables are this server's alone: every other fixture page keeps the build without Auth.
// e2e/app-auth.spec.ts has the same page built, on its own server (vite.app-build.config.ts).
const SYNTHETIC_AUTH = 'http://127.0.0.1:5198/synthetic-auth'
process.env.VITE_SUPABASE_URL = SYNTHETIC_AUTH
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'synthetic-publishable-key'

export default mergeConfig(fixtures, {
  plugins: [appAddresses, studioPageAs('/app.html', '/app.tsx')],
  // The signed-in Studio's chunk is prepared as the server starts, as a build's is ready on its host: a check that signs
  // in never waits on its first compile (docs/plans/signed-in-later.md).
  // Named by its own path: the fixtures' root is not the Studio's.
  server: {
    port: 5198,
    warmup: { clientFiles: [fileURLToPath(new URL('./src/app/SignedIn.tsx', import.meta.url))] },
  },
  // Its own dependency cache: the two fixture servers start together, and Vite renews a cache whose config differs from
  // its own, so sharing one, either could replace the files the other is serving. The app's page is served, not a file,
  // so its entry is named for the scan: what App imports is prepared before the first page, never during a check.
  cacheDir: fileURLToPath(new URL('./node_modules/.vite-app', import.meta.url)),
  optimizeDeps: { entries: ['**/*.html', 'app.tsx'] },
})
