import { fileURLToPath } from 'node:url'
import { mergeConfig, type Plugin } from 'vite'
import fixtures, { studioPageAs } from './vite.fixtures.config.ts'

// The Studio app itself on a fixture page (fixtures/app.tsx, e2e/app-auth.spec.ts), signed in with Supabase Auth as a
// build with VITE_SUPABASE_* is, against a synthetic Auth service on this machine: the checks answer its address in the
// page, so no request leaves it and no project's Auth is used. Its own server and port, so these variables are this
// server's alone: every other fixture page keeps the build without Auth.
const SYNTHETIC_AUTH = 'http://127.0.0.1:5198/synthetic-auth'
process.env.VITE_SUPABASE_URL = SYNTHETIC_AUTH
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'synthetic-publishable-key'

/**
 * As the deployment's rewrite (public/vercel.json): an address of the app's own (no file's), opened or reloaded, is its
 * page. The app moves to its own addresses (/ for home) as it starts.
 */
const appAddresses: Plugin = {
  name: 'sophia-fixture-app-addresses',
  configureServer: (server) => {
    server.middlewares.use((req, _res, next) => {
      const path = new URL(req.url ?? '/', 'http://fixture').pathname
      if (req.method === 'GET' && req.headers['sec-fetch-dest'] === 'document' && !/\.[a-z0-9]+$/iu.test(path)) {
        req.url = '/app.html'
      }
      next()
    })
  },
}

export default mergeConfig(fixtures, {
  plugins: [appAddresses, studioPageAs('/app.html', '/app.tsx', true)],
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
