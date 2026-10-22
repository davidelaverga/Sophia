// The build's own version (docs/plans/version-probe.md): an id from every file the build wrote (their names carry
// their contents' hashes) and the page's own text, so two builds of one tree share it and any change gives a new one.
// Written into the page's head, where the Studio reads its own version, and beside it as version.json, which a tab
// left open asks the host for (src/app/version-probe.ts). In no script, so no chunk's name ever changes for it: a
// redeploy of the same tree breaks no tab.
import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'
import { VERSION_FILE, VERSION_META } from './src/app/version-probe.ts'

/** The page with its version named in its head, as the Studio reads it (`ownVersion`). */
export const withVersion = (html: string, id: string): string =>
  html.replace('</head>', `  <meta name="${VERSION_META}" content="${id}" />\n  </head>`)

export function buildVersion(): Plugin {
  return {
    name: 'sophia-build-version',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const files = Object.values(bundle).toSorted((a, b) => a.fileName.localeCompare(b.fileName))
        const pages = files.filter((f) => f.type === 'asset' && f.fileName.endsWith('.html'))
        const hash = createHash('sha256')
        for (const file of files) hash.update(`${file.fileName}\n`)
        for (const page of pages) if (page.type === 'asset') hash.update(String(page.source))
        const id = hash.digest('hex').slice(0, 16)
        for (const page of pages) if (page.type === 'asset') page.source = withVersion(String(page.source), id)
        this.emitFile({ type: 'asset', fileName: VERSION_FILE, source: `${JSON.stringify({ version: id })}\n` })
      },
    },
  }
}
