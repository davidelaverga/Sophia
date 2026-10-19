import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ATTENTION } from './attention.ts'

// The attention flag (app/attention.ts) shows what A15 and A34 serve, Home's needs and a project's Updates (and, on
// Home, what changed since you last looked), without the vision flag; nothing else. Read from the source: which files
// read it, and where.
const src = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${src}${path}`, 'utf8')
/** The places a file reads the flag, its import aside. */
const uses = (path: string) =>
  read(path)
    .split('\n')
    .filter((line) => /\bATTENTION\b/.test(line) && !line.startsWith('import'))
    .map((line) => line.trim())
/** Every file the Studio builds from that imports the flag, tests aside. */
const readers = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return readers(path)
    const built = /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
    return built && /from '[./]*(app\/)?attention\.ts'/.test(readFileSync(path, 'utf8')) ? [relative(src, path)] : []
  })

describe('the attention flag (A15, A34)', () => {
  it('is off unless the build sets it', () => {
    assert.equal(ATTENTION, false)
  })

  it('is read only where Home’s needs, the Updates view and Home’s word of it are shown', () => {
    assert.deepEqual(readers(src).toSorted(), [
      'app/SignedIn.tsx',
      'features/personal/useNeeds.ts',
      'features/personal/useSinceNews.ts',
      'features/studio/ProjectShell.tsx',
      'features/studio/ViewNav.tsx',
    ])
  })

  it('opens Home’s needs, by default beside the vision flag', () => {
    assert.deepEqual(uses('features/personal/useNeeds.ts'), ['const NEEDS_SHOWN = VISION || ATTENTION'])
    assert.match(read('features/personal/useNeeds.ts'), /const \{ enabled = NEEDS_SHOWN, locked = false \} = options/)
  })

  it('reads what changed since you last looked for Home where Updates is shown, by default beside the vision flag', () => {
    assert.deepEqual(uses('features/personal/useSinceNews.ts'), ['const SINCE_SHOWN = VISION || ATTENTION'])
    assert.match(read('features/personal/useSinceNews.ts'), /\{ here, inCall, enabled = SINCE_SHOWN \}: SinceOptions/)
  })

  it('opens the Updates view, in the nav, the commands and the address, and nothing else of the project', () => {
    assert.deepEqual(uses('features/studio/ViewNav.tsx'), [
      'const SHOWN = viewsShown(VISION, CONVERSATIONS, ATTENTION)',
    ])
    assert.deepEqual(uses('app/SignedIn.tsx'), [
      "view={id === route.projectId ? shownView(route.view, VISION, CONVERSATIONS, ATTENTION) : 'studio'}",
    ])
    assert.deepEqual(uses('features/studio/ProjectShell.tsx'), [
      'viewsShown(VISION, CONVERSATIONS, ATTENTION)',
      "if (view === 'updates' && (VISION || ATTENTION)) {",
    ])
  })

  it('keeps the meetings and their recaps (A12) under the vision flag', () => {
    assert.match(read('features/studio/ProjectShell.tsx'), /<UpdatesView \{\.\.\.\{[^}]*\}\} meetings=\{VISION\} \/>/)
    assert.doesNotMatch(read('features/updates/UpdatesView.tsx'), /\b(VISION|ATTENTION)\b/)
  })
})
