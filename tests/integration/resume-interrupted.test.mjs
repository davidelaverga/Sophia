/** Regression from the first production pilot; real pinned dsh with a keyless model and fixture service. */
import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { suite, sleep } from '../support/harness.mjs'

const { world, cleanup } = suite('sophia-resume-interrupted')
after(cleanup)

test('Resume continues a held in-flight turn without needing a queued user message', async (t) => {
  const w = await world(t)
  w.llm.script({ text: 'working', chunks: 60, delayMs: 100 }, { text: 'resumed' })
  await w.start()
  w.send(w.cmd('create', { text: 'Complete the original task.' }))
  await w.service.waitFor(() => w.llm.active > 0, 20000, 'first model stream')
  const hold = w.send(w.cmd('hold'))
  assert.equal((await w.service.waitForReceipt(hold.commandId)).stage, 'checked')
  const inspect = w.send(w.cmd('inspect'))
  const held = JSON.parse((await w.service.waitForReceipt(inspect.commandId)).reason)
  assert.equal(held.fence, 'held')
  assert.equal(held.status, 'idle')
  assert.equal(held.inbox.nextTurn + held.inbox.nextStep + held.stash, 0)
  const calls = w.llm.requests.length
  await sleep(100)
  assert.equal(w.llm.requests.length, calls)
  const resume = w.send(w.cmd('resume'))
  assert.equal((await w.service.waitForReceipt(resume.commandId)).stage, 'delivered')
  await w.service.waitFor(() => w.llm.requests.length > calls, 5000, 'interrupted work continuing after Resume')
  await w.service.waitFor(() => w.turnEnds().some((e) => e.data.reason.kind === 'completed'), 10000, 'resumed turn completion')
})

test('Resume after a held restart continues interrupted work once; duplicate delivery stays idempotent', async (t) => {
  const w = await world(t)
  w.llm.script({ text: 'working', chunks: 60, delayMs: 100 }, { text: 'continued after restart' })
  await w.start()
  w.send(w.cmd('create', { text: 'Complete the original task.' }))
  await w.service.waitFor(() => w.llm.active > 0, 20000, 'model stream')
  const hold = w.send(w.cmd('hold'))
  assert.equal((await w.service.waitForReceipt(hold.commandId)).stage, 'checked')
  const calls = w.llm.requests.length
  await w.stop()
  w.service.setBindings([{ attemptId: w.attemptId, nativeSessionId: `sophia-${w.attemptId}`, authorityEpoch: 1, state: 'held' }])
  await w.start()
  await sleep(100)
  assert.equal(w.llm.requests.length, calls, 'restart does not lift Hold')
  const resume = w.send(w.cmd('resume'))
  await w.service.waitForReceipt(resume.commandId, 'delivered')
  await w.service.waitFor(() => w.llm.requests.length === calls + 1, 5000, 'continued work')
  await w.service.waitFor(() => w.turnEnds().some((e) => e.data.reason.kind === 'completed'), 10000, 'completion')
  w.send(resume)
  await w.service.waitFor(() => w.service.receiptsFor(resume.commandId).filter((r) => r.stage === 'delivered').length === 2, 5000, 'duplicate receipt')
  await sleep(200)
  assert.equal(w.llm.requests.length, calls + 1)
  assert.equal(w.journal().filter((e) => e.type === 'sophia/command' && e.data.commandId === resume.commandId).length, 1)
})

test('Holding and resuming a completed idle turn does not commission new model work', async (t) => {
  const w = await world(t)
  await w.start()
  w.send(w.cmd('create', { text: 'Finish this task.' }))
  await w.service.waitFor(() => w.turnEnds().some((e) => e.data.reason.kind === 'completed'), 20000, 'completion')
  const calls = w.llm.requests.length
  const hold = w.send(w.cmd('hold'))
  assert.equal((await w.service.waitForReceipt(hold.commandId)).stage, 'checked')
  const resume = w.send(w.cmd('resume'))
  await w.service.waitForReceipt(resume.commandId, 'delivered')
  await sleep(300)
  assert.equal(w.llm.requests.length, calls)
})


test('A Resume journaled before its wake survives a crash without requiring another Hold', async (t) => {
  const w = await world(t)
  w.llm.script({ text: 'working', chunks: 60, delayMs: 100 }, { text: 'continued' })
  await w.start()
  w.send(w.cmd('create', { text: 'Complete the original task.' }))
  await w.service.waitFor(() => w.llm.active > 0, 20000, 'model stream')
  const hold = w.send(w.cmd('hold'))
  await w.service.waitForReceipt(hold.commandId, 'checked')
  await w.stop()
  const resume = w.cmd('resume')
  const file = join(w.layout.dshHome, 'sophia-bridge', `sophia-${w.attemptId}.jsonl`)
  let seq = w.journal().at(-1).seq
  const records = [
    { type: 'sophia/command', data: { commandId: resume.commandId, kind: 'resume', attemptId: w.attemptId, authorityEpoch: 1, messageId: 'resume-before-native-wake', target: 'next-turn', content: [{ type: 'text', text: 'Continue the held task.' }], nativeSeq: null, role: null } },
    { type: 'sophia/fence', data: { attemptId: w.attemptId, authorityEpoch: 1, state: 'active', commandId: resume.commandId } },
  ]
  for (const record of records) appendFileSync(file, `${JSON.stringify({ seq: ++seq, time: Date.now(), ...record })}\n`)
  w.service.setBindings([{ attemptId: w.attemptId, nativeSessionId: `sophia-${w.attemptId}`, authorityEpoch: 1, state: 'active' }])
  const calls = w.llm.requests.length
  await w.start()
  w.send(resume)
  await w.service.waitForReceipt(resume.commandId, 'delivered')
  await w.service.waitFor(() => w.llm.requests.length === calls + 1, 5000, 'durable resume wake')
  await w.service.waitFor(() => w.turnEnds().some((e) => e.data.reason.kind === 'completed'), 10000, 'completion')
  await w.stop()
  const lines = readFileSync(file, 'utf8').trim().split('\n')
  // The native effect was durable but its settlement was not: replay must not send it twice.
  writeFileSync(file, `${lines.filter((line) => { const r = JSON.parse(line); return !(r.type === 'sophia/settled' && r.data.commandId === resume.commandId) }).join('\n')}\n`)
  await w.start()
  await w.service.waitFor(() => w.service.receiptsFor(resume.commandId).filter((r) => r.stage === 'delivered').length >= 2, 5000, 'replayed resume receipt')
  await sleep(200)
  assert.equal(w.llm.requests.length, calls + 1, 'the already-consumed continuation was not repeated')
})
