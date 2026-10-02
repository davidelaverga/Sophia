import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const fakeLiveKit = fileURLToPath(new URL('./fixtures/fake-livekit.ts', import.meta.url))

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

// The fixture pages (fixtures/) for the browser checks (e2e/), served on their own port. They are never part of the
// Studio's build: `vite build` reads index.html only, with its own config. Paths are this file's own, so any working
// directory serves them.
export default defineConfig({
  root: fileURLToPath(new URL('./fixtures', import.meta.url)),
  plugins: [noLiveKit, react()],
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
})
