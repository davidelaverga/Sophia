import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'

const rows = readFileSync(join(REPO_ROOT, 'docs', 'DESTINATION_MAP.md'), 'utf8')
  .split('\n')
  .map((line) => /^\| `([^`]+)` \| (built|partial|unbuilt) \| ([^|]+) \|/.exec(line))
  .filter(Boolean)
  .map(([, path, state, goals]) => ({ path, state, goals: goals.trim() }))

test('the destination map lists paths with a state and an owning goal', () => {
  assert.ok(rows.length >= 40, `parsed only ${rows.length} rows`)
  for (const row of rows) assert.match(row.goals, /S\d-\d\d/, `${row.path} names no goal`)
})

test('built/partial paths exist and unbuilt paths are still absent', () => {
  for (const { path, state } of rows) {
    const exists = existsSync(join(REPO_ROOT, path))
    if (state === 'unbuilt') assert.equal(exists, false, `${path} exists but is labelled unbuilt`)
    else assert.equal(exists, true, `${path} is labelled ${state} but does not exist`)
  }
})

test('every planning.json destination path appears in the map', () => {
  const planning = JSON.parse(readFileSync(join(REPO_ROOT, 'docs', 'pack', 'delivery', 'planning.json'), 'utf8'))
  const mapped = rows.map((r) => r.path)
  for (const goal of planning.goals) {
    for (const path of goal.destination_paths ?? []) {
      const covered = mapped.some((m) => path === m || path.startsWith(m.endsWith('/') ? m : `${m}/`))
      assert.ok(covered, `${goal.id} destination ${path} is not in docs/DESTINATION_MAP.md`)
    }
  }
})
