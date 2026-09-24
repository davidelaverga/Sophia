/**
 * S1-03 acceptance and adverse checks for the control bridge, against the real
 * pinned dsh loop. The Sophia side is the LABELLED fixture service (until
 * S1-02); the model is the keyless mock (tests/support/mock-llm.mjs) on the real
 * pi-ai adapter path. Neither says anything about live provider behavior.
 */

import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { command } from '../support/fixture-service.mjs'
import { sleep, suite, unit, userTexts } from '../support/harness.mjs'

const { world, cleanup } = suite('sophia-bridge')
after(cleanup)

test('bridge: reports ready only after hello, and create delivers then incorporates a prompt', async (t) => {
  const w = await world(t)
  await w.start()
  assert.equal(w.service.hellos.length, 1)
  // The service is told first; the local log line follows it.
  await w.service.waitFor(() => /readiness=ready/.test(w.stderr()), 5000, 'the readiness log line')
  const create = w.send(w.cmd('create', { text: 'Say hello.' }))
  const delivered = await w.service.waitForReceipt(create.commandId, 'delivered')
  assert.equal(delivered.nativeSessionId, `sophia-${w.attemptId}`)
  const incorporated = await w.service.waitForReceipt(create.commandId, 'incorporation_observed')
  assert.ok(incorporated.nativeSequence > delivered.nativeSequence)
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'turn/end')
  assert.equal(w.turnEnds()[0].data.reason.kind, 'completed')
  assert.equal(w.llm.requests.length, 1, 'one model call: no extra session-title request')
})

test('adverse: a service that refuses the ready report leaves the bridge not_ready and polling nothing', async (t) => {
  const w = await world(t)
  w.service.refuseReady()
  await w.start({ waitReady: false })
  await w.service.waitFor(() => /readiness=not_ready reason="Sophia service did not accept the ready report/.test(w.stderr()), 30000, 'the not_ready line')
  assert.equal(w.service.hellos.length, 1)
  assert.doesNotMatch(w.stderr(), /readiness=ready/)
  const create = w.send(w.cmd('create', { text: 'Never runs.' }))
  await sleep(1500)
  assert.equal(w.service.polls, 0, 'no command poll without readiness')
  assert.equal(w.service.receiptsFor(create.commandId).length, 0)
  assert.equal(w.llm.requests.length, 0)
})

test('acceptance: a live worker receives a mid-work steer; delivery and incorporation are distinct evidence', async (t) => {
  const w = await world(t)
  w.llm.script({ text: 'working', chunks: 30, delayMs: 100 }, { text: 'redirected' })
  await w.start()
  w.send(w.cmd('create', { text: 'Start the long task.' }))
  await w.service.waitFor(() => w.llm.active > 0, 20000, 'first model stream')
  const steer = w.send(w.cmd('steer', { text: 'STEER-7F3A: change direction.' }))
  const delivered = await w.service.waitForReceipt(steer.commandId, 'delivered')
  assert.equal(w.llm.requests.length, 1, 'delivered while the first step still streams')
  assert.equal(w.service.receiptsFor(steer.commandId).some((r) => r.stage === 'incorporation_observed'), false, 'delivery is not incorporation')
  const incorporated = await w.service.waitForReceipt(steer.commandId, 'incorporation_observed', 30000)
  assert.ok(incorporated.nativeSequence > delivered.nativeSequence)
  await w.service.waitFor(() => w.llm.requests.length >= 2, 20000, 'the steered step')
  assert.equal(userTexts(w.llm.requests[0]).some((text) => text.includes('STEER-7F3A')), false)
  assert.equal(userTexts(w.llm.requests[1]).some((text) => text.includes('STEER-7F3A')), true, 'the steer reached the model at the next step')
})

test('adverse: duplicate delivery of one command does not repeat its effect', async (t) => {
  const w = await world(t)
  await w.start()
  const create = w.send(w.cmd('create'))
  await w.service.waitForReceipt(create.commandId, 'delivered')
  const input = w.cmd('input', { text: 'DUP-91: do the thing once.' })
  w.send(input)
  w.send(input)
  await w.service.waitFor(() => w.service.receiptsFor(input.commandId).filter((r) => r.stage === 'delivered').length >= 2, 20000, 'two answers for one command')
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'turn/end')
  await sleep(1000)
  const answers = w.service.receiptsFor(input.commandId).filter((r) => r.stage === 'delivered')
  assert.equal(answers[0].nativeSequence, answers[1].nativeSequence, 'the duplicate is answered with the original evidence')
  assert.match(answers[1].reason, /duplicate/)
  assert.equal(w.journal().filter((r) => r.type === 'sophia/command' && r.data.commandId === input.commandId).length, 1, 'journaled once')
  assert.equal(w.llm.requests.length, 1)
  assert.equal(userTexts(w.llm.requests[0]).filter((text) => text.includes('DUP-91')).length, 1)
})

test('acceptance: a real Stop fences the epoch, aborts the work and prevents new dispatch; late input cannot revive it', async (t) => {
  const w = await world(t)
  w.llm.script({ text: 'long', chunks: 60, delayMs: 100 })
  await w.start()
  w.send(w.cmd('create', { text: 'Run until stopped.' }))
  await w.service.waitFor(() => w.llm.active > 0, 20000, 'model stream')
  const stop = w.send(w.cmd('stop'))
  const stopped = await w.service.waitForReceipt(stop.commandId)
  assert.equal(stopped.stage, 'checked', stopped.reason)
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'turn/end')
  assert.equal(w.turnEnds()[0].data.reason.kind, 'aborted')
  const calls = w.llm.requests.length
  const late = [w.send(w.cmd('input', { text: 'LATE-1' })), w.send(w.cmd('steer', { text: 'LATE-2' })), w.send(w.cmd('resume'))]
  for (const c of late) {
    const r = await w.service.waitForReceipt(c.commandId)
    assert.equal(r.stage, 'rejected')
    assert.match(r.reason, /stopped/)
  }
  await sleep(1500)
  assert.equal(w.llm.requests.length, calls, 'no model call after Stop')
})

test('adverse: Hold retains pending context without a native wake until an explicit Resume', async (t) => {
  const w = await world(t)
  w.llm.script({ text: 'long', chunks: 40, delayMs: 100 }, { text: 'after resume' })
  await w.start()
  w.send(w.cmd('create', { text: 'Start work.' }))
  await w.service.waitFor(() => w.llm.active > 0, 20000, 'model stream')
  const context = w.send(w.cmd('steer', { text: 'HOLD-CTX-55: keep this.' }))
  await w.service.waitForReceipt(context.commandId, 'delivered')
  const hold = w.send(w.cmd('hold'))
  assert.equal((await w.service.waitForReceipt(hold.commandId)).stage, 'checked')
  const inspect = w.send(w.cmd('inspect'))
  const state = JSON.parse((await w.service.waitForReceipt(inspect.commandId)).reason)
  assert.equal(state.fence, 'held')
  assert.equal(state.status, 'idle')
  assert.equal((state.inbox?.nextStep ?? 0) + (state.inbox?.nextTurn ?? 0) + state.stash, 1, 'the steered context is retained')
  const calls = w.llm.requests.length
  await sleep(1500)
  assert.equal(w.llm.requests.length, calls, 'no model call while held')
  const refused = w.send(w.cmd('input', { text: 'NEW-WHILE-HELD' }))
  assert.match((await w.service.waitForReceipt(refused.commandId)).reason, /held/)
  const resume = w.send(w.cmd('resume'))
  assert.equal((await w.service.waitForReceipt(resume.commandId)).stage, 'delivered')
  await w.service.waitFor(() => w.llm.requests.some((r) => userTexts(r).some((text) => text.includes('HOLD-CTX-55'))), 20000, 'held context reaching the model after Resume')
  assert.equal(w.llm.requests.some((r) => userTexts(r).some((text) => text.includes('NEW-WHILE-HELD'))), false)
})

test('acceptance: a controlled restart reconstructs command/native correlation and outstanding work', async (t) => {
  const w = await world(t)
  await w.start()
  const create = w.send(w.cmd('create', { text: 'First.' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'first turn')
  const input = w.send(w.cmd('input', { text: 'RESTART-42' }))
  await w.service.waitForReceipt(input.commandId, 'delivered')
  await w.service.waitFor(() => w.turnEnds().length >= 2, 20000, 'second turn')
  const callsBefore = w.llm.requests.length
  assert.equal((await w.stop()).code, 0, 'SIGTERM disposes cleanly')

  // The service still believes the attempt is active and redelivers everything after cursor 0.
  w.service.setBindings([{ attemptId: w.attemptId, nativeSessionId: `sophia-${w.attemptId}`, authorityEpoch: 1, state: 'active' }])
  await w.start()
  assert.match(w.stderr(), new RegExp(`reconciled ${w.attemptId}: fence=active commands=2`))
  for (const c of [create, input]) {
    await w.service.waitFor(() => w.service.receiptsFor(c.commandId).filter((r) => r.stage === 'delivered').length >= 2, 20000, `redelivered ${c.kind}`)
  }
  await sleep(1500)
  assert.equal(w.llm.requests.length, callsBefore, 'redelivery after restart repeats no work')
  const inspect = w.send(w.cmd('inspect'))
  const state = JSON.parse((await w.service.waitForReceipt(inspect.commandId)).reason)
  assert.equal(state.live, true)
  assert.equal(state.fence, 'active')
  const steer = w.send(w.cmd('steer', { text: 'AFTER-RESTART' }))
  await w.service.waitForReceipt(steer.commandId, 'incorporation_observed', 20000)
  // Incorporation is observed when the message enters the step; the model call follows it.
  const request = await w.service.waitFor(() => w.llm.requests.find((r) => userTexts(r).some((text) => text.includes('AFTER-RESTART'))), 20000, 'the post-restart model call')
  assert.ok(userTexts(request).some((text) => text.includes('RESTART-42')), 'the resumed session keeps its history')
})

test('adverse: a stopped attempt stays stopped across restart even when the service binding is stale', async (t) => {
  const w = await world(t)
  await w.start()
  w.send(w.cmd('create', { text: 'Short.' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'turn')
  const stop = w.send(w.cmd('stop'))
  await w.service.waitForReceipt(stop.commandId)
  await w.stop()
  w.service.setBindings([{ attemptId: w.attemptId, nativeSessionId: `sophia-${w.attemptId}`, authorityEpoch: 1, state: 'active' }])
  await w.start()
  assert.match(w.stderr(), new RegExp(`reconciled ${w.attemptId}: fence=stopped`))
  const calls = w.llm.requests.length
  const late = w.send(w.cmd('input', { text: 'REVIVE?' }))
  const receipt = await w.service.waitFor(() => w.service.receiptsFor(late.commandId).at(-1), 20000, 'late input receipt')
  assert.equal(receipt.stage, 'rejected')
  await sleep(1000)
  assert.equal(w.llm.requests.length, calls)
})

test('adverse: malformed, foreign-unit and stale-epoch commands are rejected without effect', async (t) => {
  const w = await world(t)
  await w.start()
  const create = w.send(w.cmd('create', { epoch: 2 }))
  await w.service.waitForReceipt(create.commandId, 'delivered')
  const foreign = w.send(command('input', { attemptId: w.attemptId, runtimeUnitId: 'another-unit', text: 'x' }))
  const stale = w.send(w.cmd('input', { epoch: 1, text: 'stale' }))
  const malformed = w.send({ ...w.cmd('input', { text: 'x' }), kind: 'delete-everything' })
  assert.match((await w.service.waitForReceipt(foreign.commandId)).reason, /runtime unit/)
  assert.match((await w.service.waitForReceipt(stale.commandId)).reason, /stale authority epoch/)
  assert.match((await w.service.waitForReceipt(malformed.commandId)).reason, /unsupported command kind/)
  await sleep(500)
  assert.equal(w.llm.requests.length, 0)
})
