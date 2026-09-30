/**
 * SMC-M02 M02-T12/T13: copied native logs and bridge journals across runtime
 * units. It needs two units, so it runs only on request, one direction per
 * invocation, and is skipped by `pnpm check`:
 *
 *   SOPHIA_LOG_COMPAT_EXPORT=<dir>   run a recorded episode on THIS unit, stop it,
 *                                    and copy its sessions, storages and bridge
 *                                    journal to <dir> (with a manifest)
 *   SOPHIA_LOG_COMPAT_IMPORT=<dir>   copy <dir> into a fresh disposable home of
 *                                    THIS unit, bind the exported attempt, boot,
 *                                    and record whether the unit resumes and
 *                                    continues it or refuses it explicitly
 *   SOPHIA_LOG_COMPAT_OUT=<file>     write the observation (evidence)
 *   SOPHIA_LOG_COMPAT_EPISODE=plain  export a healthy episode instead (default:
 *                                    failed-step)
 *
 * The exporting runtime is stopped before the copy is taken, and the
 * importing unit writes only to its own copy, so no two units ever write one
 * home. The episode is M02-T10's (a failed step with tool calls pending, then
 * a completed turn), followed by a Hold, so the copy carries recovery results,
 * reasoning-free tool history and a held fence.
 */

import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { command } from '../support/fixture-service.mjs'
import { MOCK_MODEL, sleep, suite, unit } from '../support/harness.mjs'
import { sessionEvents } from '../support/native-log.mjs'

const EXPORT = process.env.SOPHIA_LOG_COMPAT_EXPORT
const IMPORT = process.env.SOPHIA_LOG_COMPAT_IMPORT
const OUT = process.env.SOPHIA_LOG_COMPAT_OUT
const COPIED = ['sessions', 'storages', 'sophia-bridge']
const EPISODE = process.env.SOPHIA_LOG_COMPAT_EPISODE ?? 'failed-step'
const MARKER = 'FAULT-MARK'
const faultRow = `
- insert:
    - id: sophia-test-fault-tool-mode
      name: '@sophia-test/fault-tool-mode'
      config:
        marker: ${MARKER}
`
const exporting = { ...MOCK_MODEL, overlay: (baseURL) => MOCK_MODEL.overlay(baseURL) + faultRow }
const { world, cleanup } = suite('sophia-log-compat', { model: EXPORT ? exporting : MOCK_MODEL })
after(cleanup)
const write = (value) => { if (OUT) writeFileSync(OUT, `${JSON.stringify(value, null, 2)}\n`) }

test('export: a recorded episode, stopped, copied out of this unit\'s home', { skip: EXPORT ? false : 'set SOPHIA_LOG_COMPAT_EXPORT (needs a second runtime unit to import it)' }, async (t) => {
  const w = await world(t)
  cpSync(new URL('../support/fault-tool-mode', import.meta.url), join(w.layout.dshHome, 'profiles', unit.dsh.profile, 'node_modules', '@sophia-test', 'fault-tool-mode'), { recursive: true })
  await w.start()
  // failed-step: the scheduler fails at c2 (M02-T10); plain: every call completes.
  const second = EPISODE === 'plain' ? '*.txt' : `${MARKER}-*`
  w.llm.script(
    { toolCalls: [{ id: 'c1', name: 'glob', arguments: { pattern: '*.md' } }, { id: 'c2', name: 'glob', arguments: { pattern: second } }, { id: 'c3', name: 'grep', arguments: { pattern: 'x' } }] },
    { text: 'first turn done' },
    { text: 'continued' },
  )
  w.send(w.cmd('create', { text: 'go', role: 'sophia-review-v1' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the first turn')
  w.send(w.cmd('input', { text: 'continue' }))
  await w.service.waitFor(() => w.turnEnds().length >= 2, 60000, 'the next turn')
  const hold = w.send(w.cmd('hold'))
  assert.equal((await w.service.waitForReceipt(hold.commandId)).stage, 'checked')
  await w.stop()
  mkdirSync(EXPORT, { recursive: true })
  for (const dir of COPIED) if (existsSync(join(w.layout.dshHome, dir))) cpSync(join(w.layout.dshHome, dir), join(EXPORT, dir), { recursive: true })
  const events = sessionEvents(w.layout.dshHome, `sophia-${w.attemptId}`)
  const manifest = { writtenBy: unit.id, dsh: unit.dsh.package_version, episode: EPISODE, attemptId: w.attemptId, role: 'sophia-review-v1', fence: 'held', events: events.length, types: [...new Set(events.map((e) => e.type))].sort() }
  writeFileSync(join(EXPORT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  write({ direction: 'export', ...manifest })
})

test('import: a copied home from another unit is resumed and continued, or refused explicitly', { skip: IMPORT ? false : 'set SOPHIA_LOG_COMPAT_IMPORT to a directory another unit exported' }, async (t) => {
  const manifest = JSON.parse(readFileSync(join(IMPORT, 'manifest.json'), 'utf8'))
  const w = await world(t)
  for (const dir of COPIED) if (existsSync(join(IMPORT, dir))) cpSync(join(IMPORT, dir), join(w.layout.dshHome, dir), { recursive: true })
  const attemptId = manifest.attemptId
  const cmd = (kind, options = {}) => command(kind, { attemptId, runtimeUnitId: unit.id, ...options })
  w.service.setBindings([{ attemptId, nativeSessionId: `sophia-${attemptId}`, authorityEpoch: 1, state: manifest.fence }])
  await w.start()
  const report = w.service.readiness.find((r) => r.state === 'ready')
  const unrecovered = report.unrecovered.find((u) => u.attemptId === attemptId) ?? null
  const observation = { direction: 'import', readBy: unit.id, dsh: unit.dsh.package_version, writtenBy: manifest.writtenBy, writtenDsh: manifest.dsh, episode: manifest.episode, readiness: report.state, unrecovered, stderr: w.stderr().split('\n').filter((line) => /reconciled|unrecovered|error|refus|incompatible|corrupt|unknown event/i.test(line)).map((line) => line.replace(w.layout.root, '<home>')) }
  if (unrecovered) {
    // An explicit refusal: its commands are refused, nothing reaches the model.
    const input = w.send(cmd('input', { text: 'AFTER-COPY' }))
    observation.inputReceipt = (await w.service.waitForReceipt(input.commandId)).reason
    await sleep(1000)
    observation.modelRequests = w.llm.requests.length
    write({ ...observation, outcome: 'refused_explicitly' })
    assert.equal(w.llm.requests.length, 0, 'a refused copy reaches no model')
    return
  }
  const inspect = w.send(cmd('inspect'))
  observation.inspect = JSON.parse((await w.service.waitForReceipt(inspect.commandId)).reason)
  const resume = w.send(cmd('resume'))
  observation.resume = (await w.service.waitForReceipt(resume.commandId)).stage
  const input = w.send(cmd('input', { text: 'AFTER-COPY' }))
  await w.service.waitForReceipt(input.commandId, 'incorporation_observed')
  await w.service.waitFor(() => w.service.observations.some((o) => o.type === 'turn/end' && o.attemptId === attemptId), 30000, 'a turn on the copied history')
  const request = w.llm.requests.at(-1)
  observation.continuedRequest = request.messages.map((m) => (m.role === 'tool' ? `result:${m.tool_call_id}` : m.tool_calls ? `calls:${m.tool_calls.map((c) => c.id).join(',')}` : m.role))
  observation.toolResultsInCopiedHistory = request.messages.filter((m) => m.role === 'tool').map((m) => ({ id: m.tool_call_id, text: typeof m.content === 'string' ? m.content.slice(0, 120) : JSON.stringify(m.content).slice(0, 120) }))
  write({ ...observation, outcome: 'resumed_and_continued' })
})
