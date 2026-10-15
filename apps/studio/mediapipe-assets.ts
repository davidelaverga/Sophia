// MediaPipe for camera backgrounds, from the Studio's own origin (docs/plans/call-backgrounds.md): the installed
// @mediapipe/tasks-vision's wasm and the selfie segmenter kept in ./mediapipe, emitted unhashed under MEDIAPIPE_BASE
// (its loader asks for them by name) and served the same way by the dev server. The build stops if the installed
// version isn't the one the path names, so a cached copy is never another version's.
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { MEDIAPIPE_BASE, MEDIAPIPE_VERSION, SEGMENTER_FILE } from './src/features/voice/mediapipe-path.ts'

// Its exports name only its entry (vision_bundle.cjs, at the package's root); the wasm and package.json sit beside it.
const VISION = dirname(createRequire(import.meta.url).resolve('@mediapipe/tasks-vision'))
const WASM = join(VISION, 'wasm')
const MODEL = fileURLToPath(new URL(`./mediapipe/${SEGMENTER_FILE}`, import.meta.url))

/** Each file by the name the loader asks for. */
function files(): Map<string, string> {
  const installed: unknown = JSON.parse(readFileSync(join(VISION, 'package.json'), 'utf8'))
  const version: unknown =
    typeof installed === 'object' && installed !== null ? Reflect.get(installed, 'version') : null
  if (version !== MEDIAPIPE_VERSION)
    throw new Error(`@mediapipe/tasks-vision is ${String(version)}; mediapipe-path.ts names ${MEDIAPIPE_VERSION}`)
  const all = new Map(readdirSync(WASM).map((name) => [name, join(WASM, name)]))
  all.set(SEGMENTER_FILE, MODEL)
  return all
}

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
}
const typeOf = (name: string) => TYPES[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream'

export function mediapipeAssets(): Plugin {
  const served = files()
  return {
    name: 'sophia-mediapipe-assets',
    configureServer: (server) => {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? ''
        const file = path.startsWith(`${MEDIAPIPE_BASE}/`) ? served.get(path.slice(MEDIAPIPE_BASE.length + 1)) : null
        if (!file) return next()
        res.setHeader('Content-Type', typeOf(file))
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [name, file] of served)
        this.emitFile({ type: 'asset', fileName: `${MEDIAPIPE_BASE.slice(1)}/${name}`, source: readFileSync(file) })
    },
  }
}
