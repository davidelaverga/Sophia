import { fileURLToPath } from 'node:url'
import { mergeConfig, type Plugin } from 'vite'
import fixtures, { appAddresses, studioPageWith } from './vite.fixtures.config.ts'

// The Studio app itself on its fixture page (fixtures/app.tsx) for e2e/app-auth.spec.ts, built, then served by `vite
// preview` on its own port. Each check opens a fresh browser context, which has no cache: on the dev server
// (vite.app.config.ts) its first load fetched every module one by one (about 376 requests, 18 MB) before "Account"
// was drawn, which took longer than the checks' 5 s on a two-core runner. Built, the same page is 13 requests.
// Everything else is as on the dev server:
// - React's development build: StrictMode still mounts, cleans up and mounts each effect again, and
//   import.meta.env.DEV holds. Vite builds it when NODE_ENV is development (playwright.config.ts sets it for this
//   server) or unset (VITE_USER_NODE_ENV below, as a .env's NODE_ENV=development); an inherited NODE_ENV of anything
//   else would build production React, so the build refuses it (developmentOnly).
// - The page is the Studio's own index.html, as it ships, with fixtures/app.tsx as its entry (studioPageWith).
// - The app's addresses are rewritten to the page, as the deployment's are (appAddresses).
// - Supabase Auth is a synthetic service at this server's own address, which the checks answer in the page. These
//   variables are this server's alone.
const PORT = 5197
process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${String(PORT)}/synthetic-auth`
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'synthetic-publishable-key'
process.env.VITE_USER_NODE_ENV = 'development'

const page = fileURLToPath(new URL('./fixtures/app.html', import.meta.url))

/** This build is React's development build or none: a production one fails here instead of being served. */
const developmentOnly: Plugin = {
  name: 'sophia-fixture-app-development-only',
  apply: 'build',
  configResolved: (config) => {
    if (config.isProduction || config.mode !== 'development') {
      throw new Error(
        `vite.app-build.config.ts builds React's development build only (NODE_ENV ${String(process.env.NODE_ENV)}, mode ${config.mode}): run it with NODE_ENV=development or unset`,
      )
    }
  },
}

/** The page the build starts from (no file of its own: the Studio's index.html with the fixture's entry). */
const appPage: Plugin = {
  name: 'sophia-fixture-app-page-built',
  enforce: 'pre',
  resolveId: (id) => (id === page ? page : null),
  load: (id) => (id === page ? studioPageWith('/app.tsx') : null),
}

export default mergeConfig(fixtures, {
  mode: 'development',
  plugins: [developmentOnly, appAddresses, appPage],
  build: {
    outDir: fileURLToPath(new URL('./node_modules/.app-build', import.meta.url)),
    emptyOutDir: true,
    // Readable, as the dev server's: no minifying; source maps in their own files, which a page never asks for.
    minify: false,
    sourcemap: true,
    rolldownOptions: { input: { app: page } },
  },
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
})
