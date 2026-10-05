import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The vision flag (src/app/vision.ts): the fixture pages answer the APIs proposed in issue #105, so they show them.
// Vite hands VITE_ variables of its own process to import.meta.env.
process.env.VITE_SOPHIA_VISION = '1'

const fakeLiveKit = fileURLToPath(new URL('./fixtures/fake-livekit.ts', import.meta.url))
const studioPage = fileURLToPath(new URL('./index.html', import.meta.url))

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
 * The opening's page (fixtures/opening.tsx): the Studio's own index.html, its opening as it ships, with the app's part
 * played by the fixture instead of src/main.tsx.
 */
const openingPage: Plugin = {
  name: 'sophia-fixture-opening',
  configureServer: (server) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/opening.html')) return next()
      const page = readFileSync(studioPage, 'utf8')
      if (!page.includes('/src/main.tsx')) throw new Error('index.html no longer loads /src/main.tsx')
      void server.transformIndexHtml(req.url, page.replace('/src/main.tsx', '/opening.tsx')).then((html) => {
        res.setHeader('content-type', 'text/html')
        res.end(html)
      }, next)
    })
  },
}

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
