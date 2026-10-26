import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'

// A project's membership changes only through the database's own functions, which lock the project, bump its
// audience_revision and change project_members in one transaction (CON-01 BINDING_MAP, Q5). No script or runtime
// source writes the table directly. Tests set their fixtures up as the owner, so *.test.* files, the test-support
// package and the served browser checks' support are left out.
const WRITES = /\b(insert\s+into|update|delete\s+from)\s+sophia\.project_members\b/i
const ROOTS = ['scripts', 'apps', 'packages']
const SKIP = new Set(['node_modules', 'dist', 'generated', 'coverage', 'test-results', 'playwright-report'])
const FIXTURES = new Set(['packages/test-support', 'apps/studio/e2e', 'apps/studio/e2e-served'])

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (SKIP.has(name) || FIXTURES.has(relative(REPO_ROOT, path).split(sep).join('/'))) return []
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(m?[jt]sx?|sql)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

test('no script or source writes project_members outside the database functions (Q5)', () => {
  const writers = ROOTS.flatMap((root) => sources(join(REPO_ROOT, root)))
    .filter((path) => WRITES.test(readFileSync(path, 'utf8')))
    .map((path) => relative(REPO_ROOT, path).split(sep).join('/'))
  assert.deepEqual(writers, [])
})
