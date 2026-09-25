/**
 * Crash windows and outages for the control bridge, against the real pinned
 * dsh loop (LABELLED fixture service, keyless mock model). A crash between the
 * bridge's journal write and dsh's flush is reproduced by editing the journal
 * between a stop and a restart: that is exactly the state such a crash leaves.
 */

import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { command } from '../support/fixture-service.mjs'
import { sleep, suite, unit, userTexts } from '../support/harness.mjs'

const { world, cleanup } = suite('sophia-recovery')
after(cleanup)

const journalFile = (w) => join(w.layout.dshHome, 'sophia-bridge', `sophia-${w.attemptId}.jsonl`)
const text = (t) => [{ type: 'text', text: t }]
const active = (w, state = 'active') => w.service.setBindings([{ attemptId: w.attemptId, nativeSessionId: `sophia-${w.attemptId}`, authorityEpoch: 1, state }])
const mentions = (w, marker) => w.llm.requests.filter((r) => userTexts(r).some((t) => t.includes(marker)))

/** Append raw records, as a crash would have left them. */
function appendJournal(w, ...records) {
  let seq = w.journal().at(-1).seq
  for (const record of records) appendFileSync(journalFile(w), `${JSON.stringify({ seq: ++seq, time: Date.now(), ...record })}\n`)
}

async function firstTurn(w) {
  await w.start()
  const create = w.send(w.cmd('create', { text: 'First.' }))
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'first turn')
  return create
}

test('adverse: an accepted newer-epoch command retires the older epoch at once', async (t) => {
  const w = await world(t)
  await firstTurn(w)
  const newer = w.send(w.cmd('input', { epoch: 2, text: 'EPOCH-2' }))
  assert.equal((await w.service.waitForReceipt(newer.commandId)).stage, 'delivered')
  const older = w.send(w.cmd('input', { epoch: 1, text: 'EPOCH-1-LATE' }))
  const receipt = await w.service.waitForReceipt(older.commandId)
  assert.equal(receipt.stage, 'rejected')
  assert.match(receipt.reason, /stale authority epoch 1; current epoch is 2/)
  await sleep(1000)
  assert.equal(mentions(w, 'EPOCH-1-LATE').length, 0)
})

test('adverse: a binding the service holds stays held after restart, although the journal never saw the Hold', async (t) => {
  const w = await world(t)
  await firstTurn(w)
  await w.stop()
  active(w, 'held')
  await w.start()
  assert.match(w.stderr(), new RegExp(`reconciled ${w.attemptId}: fence=held`))
  const inspect = w.send(w.cmd('inspect'))
  assert.equal(JSON.parse((await w.service.waitForReceipt(inspect.commandId)).reason).fence, 'held')
  const refused = w.send(w.cmd('input', { text: 'WHILE-HELD' }))
  assert.match((await w.service.waitForReceipt(refused.commandId)).reason, /held/)
  const resume = w.send(w.cmd('resume'))
  assert.equal((await w.service.waitForReceipt(resume.commandId)).stage, 'delivered')
  const input = w.send(w.cmd('input', { text: 'AFTER-RESUME' }))
  await w.service.waitForReceipt(input.commandId, 'incorporation_observed')
  assert.equal(mentions(w, 'WHILE-HELD').length, 0)
})

test('recovery: a command journaled but never handed to dsh before a crash is re-executed on redelivery, not answered', async (t) => {
  const w = await world(t)
  await firstTurn(w)
  await w.stop()
  const lost = w.cmd('input', { text: 'REPLAY-77' })
  appendJournal(w, { type: 'sophia/command', data: { commandId: lost.commandId, kind: 'input', attemptId: w.attemptId, authorityEpoch: 1, messageId: 'never-reached-dsh', target: 'next-turn', content: text('REPLAY-77'), nativeSeq: null, role: null } })
  active(w)
  await w.start()
  assert.match(w.stderr(), new RegExp(`reconciled ${w.attemptId}: fence=active commands=1 unsettled=1`))
  // No delivered receipt was ever sent for it, so the service redelivers it.
  w.send(lost)
  const delivered = await w.service.waitForReceipt(lost.commandId, 'delivered')
  assert.doesNotMatch(delivered.reason ?? '', /reconstructed/, 'not answered from the journal')
  await w.service.waitForReceipt(lost.commandId, 'incorporation_observed')
  await w.service.waitFor(() => mentions(w, 'REPLAY-77').length >= 1, 20000, 'the replayed input reaching the model')
  assert.equal(userTexts(mentions(w, 'REPLAY-77')[0]).filter((t) => t.includes('REPLAY-77')).length, 1, 'sent once')
})

test('recovery: a command dsh already held when a crash cut its settlement short is not sent twice', async (t) => {
  const w = await world(t)
  await firstTurn(w)
  const input = w.send(w.cmd('input', { text: 'ONCE-88' }))
  await w.service.waitForReceipt(input.commandId, 'delivered')
  await w.service.waitFor(() => w.turnEnds().length >= 2, 20000, 'second turn')
  const calls = w.llm.requests.length
  await w.stop()
  const lines = readFileSync(journalFile(w), 'utf8').trim().split('\n')
  writeFileSync(journalFile(w), `${lines.filter((line) => { const r = JSON.parse(line); return !(r.type === 'sophia/settled' && r.data.commandId === input.commandId) }).join('\n')}\n`)
  active(w)
  await w.start()
  assert.match(w.stderr(), new RegExp(`reconciled ${w.attemptId}: fence=active commands=1 unsettled=1`))
  // The fixture redelivers everything from cursor 0.
  await w.service.waitFor(() => w.service.receiptsFor(input.commandId).filter((r) => r.stage === 'delivered').length >= 2, 20000, 'the re-executed input')
  assert.match(w.service.receiptsFor(input.commandId).filter((r) => r.stage === 'delivered').at(-1).reason, /dsh already held the message/)
  await sleep(1500)
  assert.equal(w.llm.requests.length, calls, 'no second model call for the same input')
})

test('recovery: held input that a Resume sent but dsh never received goes back to the stash and is delivered after restart', async (t) => {
  const w = await world(t)
  await firstTurn(w)
  const hold = w.send(w.cmd('hold'))
  assert.equal((await w.service.waitForReceipt(hold.commandId)).stage, 'checked')
  await w.stop()
  const cut = 'cmd-resume-cut'
  appendJournal(
    w,
    { type: 'sophia/stash', data: { attemptId: w.attemptId, messages: [{ messageId: 'held-1', target: 'next-turn', content: text('UNSTASH-31') }] } },
    { type: 'sophia/command', data: { commandId: cut, kind: 'resume', attemptId: w.attemptId, authorityEpoch: 1, messageId: null, target: null, content: null, nativeSeq: null, role: null } },
    { type: 'sophia/fence', data: { attemptId: w.attemptId, authorityEpoch: 1, state: 'active', commandId: cut } },
    { type: 'sophia/unstash', data: { attemptId: w.attemptId, commandId: cut, messageIds: ['held-1'], messages: [{ messageId: 'sent-but-lost', target: 'next-turn', content: text('UNSTASH-31') }] } },
  )
  active(w)
  await w.start()
  await w.service.waitFor(() => mentions(w, 'UNSTASH-31').length >= 1, 20000, 'the held input reaching the model')
  const inspect = w.send(w.cmd('inspect'))
  const state = JSON.parse((await w.service.waitForReceipt(inspect.commandId)).reason)
  assert.equal(state.fence, 'active')
  assert.equal(state.stash, 0)
})

test('adverse: observations are kept through a service outage and arrive complete and in order', async (t) => {
  const w = await world(t)
  await w.start()
  w.service.refuseObservations()
  const create = w.send(w.cmd('create', { text: 'During the outage.' }))
  await w.service.waitForReceipt(create.commandId, 'incorporation_observed')
  await w.service.waitFor(() => w.llm.requests.length >= 1 && w.llm.active === 0, 20000, 'the model call')
  await sleep(1500)
  assert.equal(w.service.observations.length, 0)
  w.service.refuseObservations(false)
  await w.service.waitFor(() => w.turnEnds().length >= 1, 30000, 'turn/end after the outage')
  const seqs = w.service.observations.filter((o) => o.attemptId === w.attemptId).map((o) => o.nativeSeq)
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'in native order')
  for (let i = 1; i < seqs.length; i += 1) assert.ok(seqs[i] - seqs[i - 1] <= 1, `no gap between ${seqs[i - 1]} and ${seqs[i]}`)
  assert.ok(w.sessionEvents('user/message').length >= 1)
})

test('recovery: observations the service never acknowledged are replayed after a restart', async (t) => {
  const w = await world(t)
  await w.start()
  w.service.refuseObservations()
  const create = w.send(w.cmd('create', { text: 'Before the restart.' }))
  await w.service.waitForReceipt(create.commandId, 'incorporation_observed')
  await w.service.waitFor(() => w.llm.requests.length >= 1 && w.llm.active === 0, 20000, 'the model call')
  await sleep(1000)
  await w.stop()
  assert.equal(w.service.observations.length, 0)
  w.service.refuseObservations(false)
  active(w)
  await w.start()
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'the replayed turn/end')
  assert.ok(w.sessionEvents('user/message').some((o) => o.data?.text === 'Before the restart.'))
  // Acknowledged now: another restart replays nothing already delivered.
  await sleep(500)
  const delivered = w.service.observations.length
  await w.stop()
  await w.start()
  await sleep(1000)
  assert.equal(w.service.observations.length, delivered)
})

test('adverse: a binding that cannot be restored is named in the ready report and its commands are refused', async (t) => {
  const w = await world(t)
  w.service.setBindings([{ attemptId: 'ghost-1', nativeSessionId: 'sophia-ghost-1', authorityEpoch: 1, state: 'active' }])
  await w.start()
  const report = w.service.readiness.find((r) => r.state === 'ready')
  assert.deepEqual(report.unrecovered.map((u) => u.attemptId), ['ghost-1'])
  assert.match(report.unrecovered[0].reason, /not defined in this runtime unit/)
  await w.service.waitFor(() => /readiness=ready unrecovered=ghost-1/.test(w.stderr()), 5000, 'the readiness line')
  const input = w.send(command('input', { attemptId: 'ghost-1', runtimeUnitId: unit.id, text: 'x' }))
  assert.match((await w.service.waitForReceipt(input.commandId)).reason, /not recovered after restart/)
  const create = w.send(w.cmd('create', { text: 'Other attempts are unaffected.' }))
  assert.equal((await w.service.waitForReceipt(create.commandId)).stage, 'delivered')
  // Stop is always honored, and it is durable: the attempt can no longer be resumed.
  const stop = w.send(command('stop', { attemptId: 'ghost-1', runtimeUnitId: unit.id }))
  assert.equal((await w.service.waitForReceipt(stop.commandId)).stage, 'checked')
  const resume = w.send(command('resume', { attemptId: 'ghost-1', runtimeUnitId: unit.id }))
  assert.match((await w.service.waitForReceipt(resume.commandId)).reason, /stopped/)
})

test('adverse: commands in one poll batch keep service order, including the command that creates the attempt', async (t) => {
  const w = await world(t)
  await w.start()
  const create = w.cmd('create', { text: 'First.' })
  const input = w.cmd('input', { text: 'SAME-BATCH' })
  // Enqueued together, so the bridge receives both in one poll.
  w.service.enqueue(create)
  w.service.enqueue(input)
  const receipt = await w.service.waitForReceipt(input.commandId)
  assert.equal(receipt.stage, 'delivered', receipt.reason)
  const order = w.journal().filter((r) => r.type === 'sophia/command').map((r) => r.data.commandId)
  assert.deepEqual(order, [create.commandId, input.commandId], 'journaled in service order')
  await w.service.waitFor(() => w.llm.requests.length >= 1, 20000, 'the first model call')
  assert.equal(userTexts(w.llm.requests[0])[0], 'First.', 'the creating prompt reaches the model first')
})

test('adverse: an accepted newer-epoch inspect retires the older epoch, durably', async (t) => {
  const w = await world(t)
  await firstTurn(w)
  const inspect = w.send(w.cmd('inspect', { epoch: 2 }))
  assert.equal((await w.service.waitForReceipt(inspect.commandId)).stage, 'checked')
  const late = w.send(w.cmd('input', { epoch: 1, text: 'AFTER-INSPECT' }))
  assert.match((await w.service.waitForReceipt(late.commandId)).reason, /stale authority epoch 1; current epoch is 2/)
  await w.stop()
  active(w)
  await w.start()
  const again = w.send(w.cmd('input', { epoch: 1, text: 'AFTER-RESTART' }))
  assert.match((await w.service.waitForReceipt(again.commandId)).reason, /stale authority epoch 1; current epoch is 2/)
})

test('adverse: a binding that names another native session is never resumed here', async (t) => {
  const w = await world(t)
  await firstTurn(w)
  await w.stop()
  w.service.setBindings([{ attemptId: w.attemptId, nativeSessionId: 'sophia-somebody-else', authorityEpoch: 1, state: 'active' }])
  await w.start()
  const report = w.service.readiness.filter((r) => r.state === 'ready').at(-1)
  assert.deepEqual(report.unrecovered.map((u) => u.attemptId), [w.attemptId])
  assert.match(report.unrecovered[0].reason, /names native session sophia-somebody-else/)
  const input = w.send(w.cmd('input', { text: 'WRONG-HISTORY' }))
  assert.match((await w.service.waitForReceipt(input.commandId)).reason, /not recovered after restart/)
  const resume = w.send(w.cmd('resume'))
  assert.match((await w.service.waitForReceipt(resume.commandId)).reason, /not recovered after restart/)
  await sleep(500)
  assert.equal(mentions(w, 'WRONG-HISTORY').length, 0)
})

test('recovery: an incorporation receipt the service never acknowledged is re-sent after a restart', async (t) => {
  const w = await world(t)
  await w.start()
  w.service.refuseReceipts()
  const create = w.send(w.cmd('create', { text: 'Receipt lost.' }))
  // Observations still flow and are acknowledged, so the observation cursor moves past the user message.
  await w.service.waitFor(() => w.turnEnds().length >= 1, 20000, 'the turn, via observations')
  await sleep(500)
  assert.equal(w.service.receiptsFor(create.commandId).length, 0)
  await w.stop()
  w.service.refuseReceipts(false)
  active(w)
  await w.start()
  const receipt = await w.service.waitForReceipt(create.commandId, 'incorporation_observed')
  assert.ok(receipt.nativeSequence >= 0)
})

test('recovery: a settled Hold is answered with its real stage when its receipt was lost in a crash', async (t) => {
  const w = await world(t)
  await firstTurn(w)
  w.service.refuseReceipts()
  const hold = w.send(w.cmd('hold'))
  await w.service.waitFor(() => w.journal().some((r) => r.type === 'sophia/settled' && r.data.commandId === hold.commandId), 20000, 'the Hold settling')
  await w.stop()
  w.service.refuseReceipts(false)
  active(w, 'held')
  await w.start()
  // The fixture redelivers the Hold from cursor 0; the journal answers it.
  const receipt = await w.service.waitForReceipt(hold.commandId)
  assert.equal(receipt.stage, 'checked')
  assert.match(receipt.reason, /held; the native driver is idle/)
})
