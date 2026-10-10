import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

// What a person reads never names the people who build the Studio (docs/plans/copy-no-team-names.md): a placeholder
// once listed «Davide’s Codex and Claude, Luis’s Claude» to every customer. Read from the code the Studio builds, its
// comments left out (they are for us); tests and test data aside.
const src = fileURLToPath(new URL('../', import.meta.url))

/** The people who build the Studio, by the names the code has used for them. */
const TEAM = /\b(Davide|Luis)\b/

/** Every source file the Studio builds from: tests and test data excluded. */
function production(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return production(path)
    const built = /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
    return built && entry.name !== 'board-samples.ts' ? [path] : []
  })
}

/** The code without its comments: line comments and block comments, JSX's braced ones included. */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

describe('what a person reads', () => {
  it('names nobody who builds the Studio', () => {
    const naming = production(src).flatMap((path) =>
      withoutComments(readFileSync(path, 'utf8'))
        .split('\n')
        .filter((line) => TEAM.test(line))
        .map((line) => `${relative(src, path).split(sep).join('/')}: ${line.trim().slice(0, 80)}`),
    )
    assert.deepEqual(naming, [])
  })
})
