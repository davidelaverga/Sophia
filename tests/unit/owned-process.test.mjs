/**
 * The owned-process helper's own lifetime (#493 discussion_r4445573766): `ended(ms)` must not keep its caller alive once
 * the child has ended, so a test worker whose owned child ended and was settled exits promptly instead of waiting out
 * an unused deadline. Each case runs a worker process, itself owned by this test, that uses the helper; the test sees
 * the worker report its child settled, then requires the worker to exit well before the worker's long deadline. Only
 * the returned promise would not show this: the worker's event loop is what a stale deadline holds open.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startOwned } from '../support/owned-process.mjs'

const HELPER = pathToFileURL(fileURLToPath(new URL('../support/owned-process.mjs', import.meta.url))).href
/** The worker's deadline: far longer than this test lets the worker live once its child is settled. */
const UNUSED_MS = 60_000
const EXIT_WITHIN_MS = 10_000

/**
 * Run `body` (module code using `startOwned` and `run`, which reports `{ done }` as JSON) in a worker owned by this
 * test; return what it reported and how long it lived after reporting.
 */
async function worker(body) {
  const code = `import { startOwned } from ${JSON.stringify(HELPER)}
const exists = (target) => { try { process.kill(target, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }
${body}`
  const run = startOwned(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), env: { PATH: process.env.PATH } })
  try {
    await run.until(/^SETTLED /m, 30_000)
    const reported = Date.now()
    const outcome = await run.ended(EXIT_WITHIN_MS)
    const lived = Date.now() - reported
    const report = JSON.parse(/^SETTLED (.*)$/m.exec(run.stdout())[1])
    return { outcome, lived, report, stderr: run.stderr() }
  } finally {
    await run.settle()
  }
}

test('a child that ends at once: its deadline does not keep the worker alive', async (t) => {
  const { outcome, lived, report, stderr } = await worker(`
const child = startOwned(process.execPath, ['-e', ''], { cwd: process.cwd(), env: { PATH: process.env.PATH } })
const outcome = await child.ended(${UNUSED_MS})
await child.settle()
console.log('SETTLED ' + JSON.stringify({ outcome, groupGone: !exists(-child.pid) }))`)
  assert.deepEqual(report, { outcome: { code: 0, signal: null }, groupGone: true }, stderr)
  assert.deepEqual(outcome, { code: 0, signal: null }, stderr)
  t.diagnostic(`the worker exited ${lived} ms after reporting its child settled`)
  assert.ok(lived < EXIT_WITHIN_MS, `the worker lived ${lived} ms after its child was settled`)
})

test('a child that cannot start: the error is the outcome, and its deadline does not keep the worker alive', async (t) => {
  const { outcome, lived, report, stderr } = await worker(`
const child = startOwned(process.execPath, ['-e', ''], { cwd: '/nonexistent-owned-process-cwd', env: { PATH: process.env.PATH } })
const outcome = await child.ended(${UNUSED_MS})
await child.settle()
console.log('SETTLED ' + JSON.stringify({ error: outcome.error?.code ?? null, pid: child.pid ?? null }))`)
  assert.deepEqual(report, { error: 'ENOENT', pid: null }, stderr)
  assert.deepEqual(outcome, { code: 0, signal: null }, stderr)
  t.diagnostic(`the worker exited ${lived} ms after reporting its child settled`)
  assert.ok(lived < EXIT_WITHIN_MS, `the worker lived ${lived} ms after its spawn error`)
})

test('a child that does not end: refused at its deadline, then settled; the worker exits', async (t) => {
  const { outcome, lived, report, stderr } = await worker(`
const child = startOwned(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: process.cwd(), env: { PATH: process.env.PATH } })
let refused = null
const started = Date.now()
try {
  await child.ended(500)
} catch (error) {
  refused = { message: error.message.split('\\n')[0], afterMs: Date.now() - started }
} finally {
  await child.settle()
}
console.log('SETTLED ' + JSON.stringify({ refused, groupGone: !exists(-child.pid), childGone: !exists(child.pid) }))`)
  assert.match(report.refused?.message ?? '', /still running after 500 ms/, stderr)
  assert.ok(report.refused.afterMs >= 500 && report.refused.afterMs < 5_000, JSON.stringify(report))
  assert.equal(report.groupGone, true)
  assert.equal(report.childGone, true)
  assert.deepEqual(outcome, { code: 0, signal: null }, stderr)
  t.diagnostic(`the worker exited ${lived} ms after reporting its child settled`)
  assert.ok(lived < EXIT_WITHIN_MS, `the worker lived ${lived} ms after settling`)
})
