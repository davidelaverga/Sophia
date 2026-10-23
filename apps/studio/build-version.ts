// The build's own version (docs/plans/version-probe.md): an id from every file the bundle emits (public/ is copied,
// outside it), its path and its bytes (MediaPipe's model and wasm are emitted by name, so a name alone may hide a
// change), page included, so two builds of one tree share it and any change gives a new one. Written into the page's head, where the Studio reads its
// own version, and beside it as version.json, which a tab left open asks the host for (src/app/version-probe.ts). In
// no script, so no chunk's name ever changes for it: a redeploy of the same tree breaks no tab.
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import { VERSION_FILE, VERSION_META } from './src/app/version-probe.ts'

/** The page with its version named in its head, as the Studio reads it (`ownVersion`). */
export const withVersion = (html: string, id: string): string =>
  html.replace('</head>', `  <meta name="${VERSION_META}" content="${id}" />\n  </head>`)

/** One file the build wrote: its path and its contents. */
interface Written {
  readonly path: string
  readonly bytes: Uint8Array
}

/** The id of these files: the same on every machine for the same files, whatever their order or path separator. */
export function versionOf(files: readonly Written[]): string {
  // By code point, as every machine orders them: the id never depends on a locale's collation.
  const sorted = files
    .map((file) => ({ path: file.path.replaceAll('\\', '/'), bytes: file.bytes }))
    .toSorted((a, b) => (a.path === b.path ? 0 : a.path > b.path ? 1 : -1))
  const hash = createHash('sha256')
  // Each file's length ahead of its bytes, so no two sets of files run together into the same stream.
  for (const file of sorted) hash.update(`${file.path}\n${file.bytes.byteLength}\n`).update(file.bytes)
  return hash.digest('hex').slice(0, 16)
}

const bytesOf = (source: string | Uint8Array): Uint8Array =>
  typeof source === 'string' ? Buffer.from(source, 'utf8') : source

export function buildVersion(): Plugin {
  return {
    name: 'sophia-build-version',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const files = Object.values(bundle)
        const id = versionOf(
          files.map((f) => ({ path: f.fileName, bytes: bytesOf(f.type === 'chunk' ? f.code : f.source) })),
        )
        for (const page of files)
          if (page.type === 'asset' && page.fileName.endsWith('.html'))
            page.source = withVersion(String(page.source), id)
        this.emitFile({ type: 'asset', fileName: VERSION_FILE, source: `${JSON.stringify({ version: id })}\n` })
      },
    },
  }
}
