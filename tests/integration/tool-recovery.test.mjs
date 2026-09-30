/**
 * SMC-M02 M02-T10: a step that fails with tool calls pending, on the
 * installed unit (the real pinned dsh loop, keyless mock model, LABELLED
 * fixture service).
 *
 * The model answers one step with three tool calls. A test-only plugin
 * (tests/support/fault-tool-mode) makes the scheduler fail while it classifies
 * the second: the seam upstream's own test uses for this case, since every
 * public tool seam is fail-closed and cannot fail a step. The unit must then:
 * keep the first call's committed result; record the second and third as
 * never started; end the turn with the original failure, not success; and
 * give the next request a validly paired history.
 *
 * Not covered here: a call that started before the failure (its outcome is
 * unknown, `TOOL_OUTCOME_UNKNOWN`) is reachable only through the scheduler's
 * `@internal` phases. That branch stays open until upstream's focused tests
 * run against the published packages (docs/progress/SMC-M02.md).
 *
 * SOPHIA_TOOL_RECOVERY_OUT=<file> also writes the observed events (evidence).
 */

import assert from 'node:assert/strict'
import { cpSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { MOCK_MODEL, suite, unit } from '../support/harness.mjs'
import { sessionEvents } from '../support/native-log.mjs'

const MARKER = 'FAULT-MARK'
const FAULT_PLUGIN = new URL('../support/fault-tool-mode', import.meta.url)
const faultRow = `
- insert:
    - id: sophia-test-fault-tool-mode
      name: '@sophia-test/fault-tool-mode'
      config:
        marker: ${MARKER}
`
const model = { ...MOCK_MODEL, overlay: (baseURL) => MOCK_MODEL.overlay(baseURL) + faultRow }
const { world, cleanup } = suite('sophia-tool-recovery', { model })
after(cleanup)

test('M02-T10: a step failing with tool calls pending keeps committed results, marks the rest not started, keeps the failure and pairs the history', async (t) => {
  const w = await world(t)
  // Disposable composition: the fault plugin is copied into this case's profile only.
  cpSync(FAULT_PLUGIN, join(w.layout.dshHome, 'profiles', unit.dsh.profile, 'node_modules', '@sophia-test', 'fault-tool-mode'), { recursive: true })
  await w.start()
  assert.match(w.stderr(), /\[sophia-test-fault-tool-mode\] armed/)
  w.llm.script(
    { toolCalls: [{ id: 'c1', name: 'glob', arguments: { pattern: '*.md' } }, { id: 'c2', name: 'glob', arguments: { pattern: `${MARKER}-*` } }, { id: 'c3', name: 'grep', arguments: { pattern: 'x' } }] },
    { text: 'continued' },
  )
  w.send(w.cmd('create', { text: 'go', role: 'sophia-review-v1' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 60000, 'the failed turn')
  w.send(w.cmd('input', { text: 'continue' }))
  await w.service.waitFor(() => w.turnEnds().length >= 2, 60000, 'the next turn')

  const events = sessionEvents(w.layout.dshHome, `sophia-${w.attemptId}`)
  // The model's calls live in its assistant message; `tool/call` is logged only when a call starts.
  const requested = events.filter((e) => e.type === 'assistant/message').flatMap((e) => e.data.message.content.filter((b) => b.type === 'tool-call').map((b) => b.id))
  const started = events.filter((e) => e.type === 'tool/call')
  const results = events.filter((e) => e.type === 'tool/result')
  const turnEnds = events.filter((e) => e.type === 'turn/end')
  if (process.env.SOPHIA_TOOL_RECOVERY_OUT) {
    writeFileSync(process.env.SOPHIA_TOOL_RECOVERY_OUT, `${JSON.stringify({
      unit: unit.id,
      dsh: unit.dsh.package_version,
      requestedCalls: requested,
      startedCalls: started.map((e) => ({ seq: e.seq, name: e.data.name ?? null })),
      toolResults: results.map((e) => ({ seq: e.seq, toolCallId: e.data.message?.toolCallId, isError: e.data.message?.isError, errorCode: e.data.error?.code ?? null, sourceEventSeqs: e.sourceEventSeqs ?? null })),
      turnEnds: turnEnds.map((e) => e.data),
      tail: events.slice(-6).map((e) => e.type),
      nextRequest: w.llm.requests[1]?.messages.map((m) => (m.role === 'tool' ? `result:${m.tool_call_id}` : m.tool_calls ? `calls:${m.tool_calls.map((c) => c.id).join(',')}` : m.role)),
    }, null, 2)}\n`)
  }

  // The original failure ends the turn: not reported as success.
  assert.deepEqual(turnEnds.map((e) => e.data.reason.kind), ['error', 'completed'])
  assert.equal(turnEnds[0].data.reason.error.message, 'injected scheduler failure at c2')
  assert.deepEqual(requested.slice(0, 3), ['c1', 'c2', 'c3'])
  assert.equal(started.length, 1, 'only the first call started before the scheduler failed')
  // The durable history is paired: exactly one result per call, in call order.
  assert.deepEqual(results.map((e) => e.data.message.toolCallId), ['c1', 'c2', 'c3'])
  // The committed result survives the failure unchanged, linked to its start.
  assert.equal(results[0].data.message.isError, false)
  assert.deepEqual(results[0].sourceEventSeqs, [started[0].seq])
  assert.deepEqual(results[0].data.message.content, [{ type: 'text', text: 'No files found' }])
  // The calls the scheduler never started are recorded as such, as errors.
  assert.deepEqual(results.slice(1).map((e) => [e.data.message.isError, e.data.error?.code]), [[true, 'TOOL_NOT_STARTED'], [true, 'TOOL_NOT_STARTED']])
  // Results are written before the failed step closes.
  const failedStepEnd = events.findIndex((e) => e.type === 'step/end')
  assert.ok(events.findIndex((e) => e.type === 'tool/result' && e.data.message.toolCallId === 'c3') < failedStepEnd)
  // The next request carries each call with its own result, then the new input.
  const next = w.llm.requests[1].messages.map((m) => (m.role === 'tool' ? `result:${m.tool_call_id}` : m.tool_calls ? `calls:${m.tool_calls.map((c) => c.id).join(',')}` : m.role))
  assert.deepEqual(next.slice(next.indexOf('calls:c1,c2,c3')), ['calls:c1,c2,c3', 'result:c1', 'result:c2', 'result:c3', 'user'])
})
