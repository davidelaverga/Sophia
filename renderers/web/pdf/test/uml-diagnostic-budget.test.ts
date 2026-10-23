// The QA diagnostic's optional timing probe (#387 review): it starts only when every phase it can spend fits before
// the reserve under the QA host's 240 s watchdog. The diagnostic is a guest script with effects at load, so its
// bounds are read from the source: the named phase bounds are the ones the probe uses, and the admission is their sum.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'

const source = fs.readFileSync(new URL('../uml/diagnostic.mjs', import.meta.url), 'utf8')
const constant = (name: string): number => {
  const match = new RegExp(`^const ${name} = ([0-9_]+)$`, 'm').exec(source)
  assert.ok(match?.[1], `${name} is a literal`)
  return Number(match[1].replaceAll('_', ''))
}
const probeBody = source.slice(source.indexOf('async function timeWidthProbe('))

test('the timing probe is admitted only with its whole budget, and its worst case ends before the reserve', () => {
  const watchdog = constant('WATCHDOG_MS')
  const reserve = constant('RESERVE_MS')
  const phases = ['PROBE_LAUNCH_MS', 'PROBE_LOAD_MS', 'PROBE_MEASURE_MS', 'PROBE_CLOSE_MS'].map(constant)
  assert.deepEqual([watchdog, reserve], [240_000, 60_000], 'the QA host watchdog and the reserve are unchanged')
  assert.deepEqual(phases, [30_000, 30_000, 60_000, 5_000])
  assert.match(
    source,
    /^const PROBE_BUDGET_MS = PROBE_LAUNCH_MS \+ PROBE_LOAD_MS \+ PROBE_MEASURE_MS \+ PROBE_CLOSE_MS$/m,
  )
  assert.match(source, /if \(leftMs\(\) >= PROBE_BUDGET_MS\) await timeWidthProbe\(source\)/)
  assert.doesNotMatch(source, /leftMs\(\) >= 90_000/, 'the old 90 s admission is gone')
  // The probe spends exactly those named bounds, and no other literal wait.
  for (const use of [
    'timeoutMs: PROBE_LAUNCH_MS',
    'timeout: PROBE_LOAD_MS',
    'Date.now() + PROBE_MEASURE_MS',
    'timedBrowser.kill(), PROBE_CLOSE_MS',
  ]) {
    assert.ok(probeBody.includes(use), use)
  }
  assert.doesNotMatch(probeBody, /\b(5000|30000|60000|5_000|30_000|60_000)\b/, 'no unnamed bound in the probe')
  // Admission at the boundary: started with exactly the budget left, the worst case ends at the reserve, not in it.
  const budget = phases.reduce((sum, ms) => sum + ms, 0)
  const latestStart = watchdog - reserve - budget
  assert.equal(latestStart + budget, watchdog - reserve)
  assert.ok(latestStart >= 0)
})
