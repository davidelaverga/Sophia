import assert from 'node:assert/strict'
import { test } from 'node:test'
import { insertedIds, lintLayer, parsePatch } from '../../scripts/lib/patch-lint.mjs'

const BASE = `
- insert:
    - id: hmr
      name: '@deepseek-ai/dsh-hmr'
      disabled: !!js "!ctx.get('profileContext')"
    - id: session-log-deepseek
      name: '@deepseek-ai/dsh-session-log-deepseek'
    - id: agent-loop
      name: '@deepseek-ai/dsh-agent-loop'
      config:
        agents: []
`
const baseIds = new Set(insertedIds(parsePatch(BASE, 'base').rows))
const codes = (findings) => findings.map((f) => f.code)

test('base ids are collected from insert lists, with !!js kept opaque', () => {
  assert.deepEqual([...baseIds], ['hmr', 'session-log-deepseek', 'agent-loop'])
})

test('a comments-only patch is diagnosed, not treated as an empty layer', () => {
  assert.deepEqual(codes(parsePatch('# nothing here\n# at all\n', 'bundle').findings), ['patch_comments_only'])
  assert.deepEqual(codes(parsePatch('', 'bundle').findings), ['patch_comments_only'])
})

test('a literal [] parses as an intentionally empty layer', () => {
  const { rows, findings } = parsePatch('[]\n', 'profile')
  assert.deepEqual(rows, [])
  assert.deepEqual(findings, [])
  assert.deepEqual(lintLayer(rows, baseIds, { layer: 'profile', requireRows: false }).findings, [])
})

test('an empty bundle layer is rejected because the bundle would compose as absent', () => {
  assert.deepEqual(codes(lintLayer([], baseIds, { layer: 'bundle', requireRows: true }).findings), ['patch_no_rows'])
})

test('a wrong-row patch is diagnosed', () => {
  const { rows } = parsePatch('- id: session-log-deepsek\n  disabled: true\n', 'bundle')
  assert.deepEqual(codes(lintLayer(rows, baseIds, { layer: 'bundle', requireRows: true }).findings), ['patch_unmatched_row'])
})

test('a correct disable plus a new insert lints clean and extends the id set', () => {
  const { rows } = parsePatch('- id: hmr\n  disabled: true\n- insert:\n    - id: sophia-control-bridge\n      name: "@sophia/dsh-bundle"\n', 'bundle')
  const { findings, ids } = lintLayer(rows, baseIds, { layer: 'bundle', requireRows: true })
  assert.deepEqual(findings, [])
  assert.ok(ids.has('sophia-control-bridge'))
})

test('re-inserting an existing id is diagnosed', () => {
  const { rows } = parsePatch('- insert:\n    - id: agent-loop\n      name: x\n', 'bundle')
  assert.deepEqual(codes(lintLayer(rows, baseIds, { layer: 'bundle', requireRows: true }).findings), ['patch_duplicate_insert'])
})

test('non-array and malformed rows are diagnosed', () => {
  assert.deepEqual(codes(parsePatch('id: hmr\n', 'x').findings), ['patch_not_array'])
  assert.deepEqual(codes(parsePatch('- disabled: true\n', 'x').findings), ['patch_row_invalid'])
  assert.deepEqual(codes(parsePatch('- [unclosed\n', 'x').findings), ['patch_unparsable'])
})
