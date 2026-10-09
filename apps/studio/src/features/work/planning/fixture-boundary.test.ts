import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

// UI-21 (WBC-01): nothing the Studio builds imports a fixture or a test builder, and the app never hands its own shell
// plans. Since WBC-02 the shell reads them itself from the board Sophia serves (ServedWork.tsx, api/work.ts): the only
// plans production Tasks shows are those, read by the board's reader, and none comes from a fixture.
const src = fileURLToPath(new URL('../../../', import.meta.url))

/** A source file's path under `src`, with `/` between its parts on any system (Windows' own is `\`). */
const underSrc = (path: string) => relative(src, path).split(sep).join('/')

/** Every source file the Studio builds from: tests and test builders excluded. */
function production(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return production(path)
    const built = /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
    return built && entry.name !== 'board-samples.ts' ? [path] : []
  })
}

describe('the fixtures’ boundary', () => {
  it('keeps every fixture and test builder out of what the Studio builds', () => {
    const reaching = production(src).filter((path) =>
      /['"][^'"]*(\/fixtures\/|board-samples)/.test(readFileSync(path, 'utf8')),
    )
    assert.deepEqual(reaching.map(underSrc), [])
  })

  it('never hands the app’s own shell a plan: production Tasks shows only the board Sophia serves', () => {
    const app = readFileSync(join(src, 'app/App.tsx'), 'utf8')
    assert.match(app, /<ProjectShell/)
    assert.doesNotMatch(app, /\bplans=/)
    const boardUsers = production(src).filter(
      (path) =>
        !underSrc(path).startsWith('features/work/planning/') &&
        /PlanBoard|readBoardView/.test(readFileSync(path, 'utf8')),
    )
    assert.deepEqual(boardUsers.map(underSrc), [])
    const shell = readFileSync(join(src, 'features/studio/ProjectShell.tsx'), 'utf8')
    assert.match(shell, /useServedWork/, 'the shell reads its plans from the served board')
    const served = readFileSync(join(src, 'features/work/planning/ServedWork.tsx'), 'utf8')
    assert.match(served, /readBoardView\(board\.data\)/, 'through the board’s own reader')
    assert.match(served, /from '..\/..\/..\/api\/work\.ts'/, 'from Sophia’s work routes only')
  })
})
