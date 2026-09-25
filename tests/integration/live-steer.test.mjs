/**
 * The live steer check (scripts/live-steer.mjs) tested without a key: its
 * rehearsal runs the same steps against the keyless mock and must pass, and
 * the script must refuse to produce anything that could pass for live evidence
 * when it has no credential or is rehearsing.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'

const script = 'scripts/live-steer.mjs'
const run = (args, env = {}) => {
  const { OPENAI_API_KEY: _drop, ...base } = process.env
  return spawnSync(process.execPath, [script, ...args], { cwd: REPO_ROOT, env: { ...base, ...env }, encoding: 'utf8', timeout: 170000 })
}

test('live:steer without the route credential exits 2 and makes no call', () => {
  const result = run([])
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /needs OPENAI_API_KEY/)
})

test('live:steer --rehearse refuses to write evidence', () => {
  const result = run(['--rehearse', '--evidence', 'unused.json'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /never writes evidence/)
})

test('live:steer --rehearse: the steer lands mid-work, and delivery precedes incorporation', () => {
  const result = run(['--rehearse'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.live, false, 'a rehearsal is never labelled live')
  assert.equal(report.midWork, true)
  assert.ok(report.incorporated.nativeSequence > report.delivered.nativeSequence)
  assert.equal(report.turnEnd.reason.kind, 'completed')
  assert.equal(report.lastReply, 'REDIRECTED')
})
