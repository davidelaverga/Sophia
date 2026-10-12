import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

// The Studio runs in the browser. @sophia/contracts' root reads files as it loads (node:fs), so the Studio may take only
// types from it; values come from its browser-safe entries (/validate, /sse, /room-chat). A value imported from the root
// left the whole Studio blank at 7ff0eac9 while every unit, typecheck and contract check passed.
const SRC = new URL('../../', import.meta.url).pathname

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sources(path)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : []
  })

/** Each import from the package root that brings in a value: not `import type`, and some specifier not marked type. */
function valuesFromRoot(text: string): string[] {
  // One clause per statement (braces, a namespace or a default name), so no match runs across another import.
  const imports = text.matchAll(/import\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+'@sophia\/contracts'/g)
  return [...imports]
    .filter(([, typeOnly, what = '']) => {
      if (typeOnly) return false
      const braced = /^\{([^}]*)\}$/.exec(what.trim())
      if (!braced) return true
      const names = (braced[1] ?? '').split(',').map((n) => n.trim())
      return names.some((n) => n !== '' && !n.startsWith('type '))
    })
    .map(([statement]) => statement.replace(/\s+/g, ' '))
}

describe('the Studio takes only types from @sophia/contracts’ server-only root', () => {
  it('no source file imports a value from it', () => {
    const found = sources(SRC).flatMap((file) =>
      valuesFromRoot(readFileSync(file, 'utf8')).map((statement) => `${file.slice(SRC.length)}: ${statement}`),
    )
    assert.deepEqual(found, [])
  })

  it('a value import is found; a type-only one is not (control)', () => {
    assert.equal(valuesFromRoot("import { CURSOR_PATTERN } from '@sophia/contracts'").length, 1)
    assert.equal(valuesFromRoot("import { type A, B } from '@sophia/contracts'").length, 1)
    assert.equal(valuesFromRoot("import type { A, B } from '@sophia/contracts'").length, 0)
    assert.equal(valuesFromRoot("import {\n  type A,\n  type B,\n} from '@sophia/contracts'").length, 0)
    assert.equal(valuesFromRoot("import { parse } from '@sophia/contracts/validate'").length, 0)
  })
})
