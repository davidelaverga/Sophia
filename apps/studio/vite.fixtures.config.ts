import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

// The vision flag (src/app/vision.ts): the fixture pages answer the APIs proposed in issue #105, so they show them.
// Vite hands VITE_ variables of its own process to import.meta.env.
process.env.VITE_SOPHIA_VISION = '1'

const fakeLiveKit = fileURLToPath(new URL('./fixtures/fake-livekit.ts', import.meta.url))
const studioPage = fileURLToPath(new URL('./index.html', import.meta.url))
/** index.html's early script (signed-in-load.ts), and the path these servers serve it at: their root is fixtures/. */
const EARLY = '/src/app/signed-in-load.ts'
const early = `/@fs/${fileURLToPath(new URL(`.${EARLY}`, import.meta.url))
  .replaceAll('\\', '/')
  .replace(/^\//, '')}`
const EARLY_TAG = `<script type="module" src="${EARLY}"></script>`

/**
 * LiveKit's place on the fixture pages: the room controller's `import('./livekit-room.ts')` (useProjectRoom) loads
 * fixtures/fake-livekit.ts instead. Only that import from that module; the controller itself runs as it is.
 */
const noLiveKit: Plugin = {
  name: 'sophia-fixture-livekit',
  enforce: 'pre',
  resolveId: (source, importer) =>
    // Vite's ids use forward slashes on every platform.
    source === './livekit-room.ts' && importer?.endsWith('/src/features/voice/useProjectRoom.ts') ? fakeLiveKit : null,
}

/**
 * The Studio's own index.html, as it ships, with the app's part played by `entry` (a fixture) instead of src/main.tsx.
 * Its early script (the signed-in Studio asked for beside the app's start) is the Studio's own when the entry is the app
 * (`withApp`): served (studioPageAs) or built (vite.app-build.config.ts) from `early`; a page that draws parts of it
 * without App leaves it out.
 */
export function studioPageWith(entry: string, withApp = false): string {
  const page = readFileSync(studioPage, 'utf8')
  if (!page.includes('/src/main.tsx')) throw new Error('index.html no longer loads /src/main.tsx')
  if (!page.includes(EARLY_TAG)) throw new Error(`index.html no longer loads ${EARLY}`)
  return page.replace('/src/main.tsx', entry).replace(EARLY_TAG, withApp ? EARLY_TAG.replace(EARLY, early) : '')
}

/** A page that is the Studio's own index.html, as it ships, with `entry` as its app (studioPageWith). */
export const studioPageAs = (path: string, entry: string, withApp = false): Plugin => ({
  name: `sophia-fixture-studio-page${path}`,
  configureServer: (server) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith(path)) return next()
      void server.transformIndexHtml(req.url, studioPageWith(entry, withApp)).then((html) => {
        res.setHeader('content-type', 'text/html')
        res.end(html)
      }, next)
    })
  },
})

/**
 * As the deployment's rewrite (public/vercel.json): an address of the app's own (no file's), opened or reloaded, is its
 * page. The app moves to its own addresses (/ for home) as it starts.
 */
const toAppPage = (req: Connect.IncomingMessage) => {
  const path = new URL(req.url ?? '/', 'http://fixture').pathname
  if (req.method === 'GET' && req.headers['sec-fetch-dest'] === 'document' && !/\.[a-z0-9]+$/iu.test(path)) {
    req.url = '/app.html'
  }
}

/** The app's address rewrite (toAppPage) on its servers, served (vite.app.config.ts) or built (vite.app-build.config.ts). */
export const appAddresses: Plugin = {
  name: 'sophia-fixture-app-addresses',
  configureServer: (server) => {
    server.middlewares.use((req, _res, next) => {
      toAppPage(req)
      next()
    })
  },
  configurePreviewServer: (server) => {
    server.middlewares.use((req, _res, next) => {
      toAppPage(req)
      next()
    })
  },
}

/** The opening's page (fixtures/opening.tsx). */
const openingPage = studioPageAs('/opening.html', '/opening.tsx')

// The fixture pages (fixtures/) for the browser checks (e2e/), served on their own port. They are never part of the
// Studio's build: `vite build` reads index.html only, with its own config. Paths are this file's own, so any working
// directory serves them.
export default defineConfig({
  root: fileURLToPath(new URL('./fixtures', import.meta.url)),
  plugins: [noLiveKit, openingPage, react()],
  // The Studio's own public files (the opening's stylesheet and script, the brand).
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
})
