import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseCommand, ProtocolError } from '../../packages/dsh-bundle/dist/protocol.js'
import { foldLog, Journal, strongestFence } from '../../packages/dsh-bundle/dist/session-events.js'

const valid = {
  schema: 'sophia.runtime-command.v1',
  commandId: 'cmd-1',
  binding: { projectId: 'p', goalId: 'g', goalRevision: 1, attemptId: 'a1', resourceId: 'r', authorityEpoch: 2, runtimeUnitId: 'u' },
  kind: 'steer',
  expectedNativeSessionId: null,
  contextPacketId: null,
  payload: { text: 'hi' },
}

test('commands are validated field by field; anything else is a ProtocolError', () => {
  assert.equal(parseCommand(valid).binding.authorityEpoch, 2)
  const bad = [
    { ...valid, schema: 'v0' },
    { ...valid, kind: 'delete' },
    { ...valid, commandId: '' },
    { ...valid, binding: { ...valid.binding, authorityEpoch: -1 } },
    { ...valid, binding: { ...valid.binding, attemptId: 7 } },
    { ...valid, payload: null },
    { ...valid, expectedNativeSessionId: '' },
    null,
  ]
  for (const value of bad) assert.throws(() => parseCommand(value), ProtocolError)
})

test('the journal folds commands, fences, stash and settlement; a stop is terminal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'))
  try {
    const journal = new Journal(dir)
    const sid = 'sophia-a1'
    journal.append(sid, 'sophia/command', { commandId: 'c1', kind: 'input', attemptId: 'a1', authorityEpoch: 1, messageId: 'm1', target: 'next-turn', content: [{ type: 'text', text: 'x' }], nativeSeq: null })
    journal.append(sid, 'sophia/settled', { commandId: 'c1', nativeSeq: 12 })
    journal.append(sid, 'sophia/fence', { attemptId: 'a1', authorityEpoch: 2, state: 'held', commandId: 'c2' })
    journal.append(sid, 'sophia/stash', { attemptId: 'a1', messages: [{ messageId: 'm2', target: 'next-step', content: [] }, { messageId: 'm3', target: 'next-turn', content: [] }] })
    journal.append(sid, 'sophia/unstash', { attemptId: 'a1', commandId: 'c3', messageIds: ['m2'] })
    let state = foldLog(new Journal(dir).read(sid), [{ type: 'user/message', seq: 13, time: 0, data: { id: 'm1' } }])
    assert.equal(state.fence, 'held')
    assert.equal(state.authorityEpoch, 2)
    assert.deepEqual(state.commands.get('c1'), { seq: 0, kind: 'input', messageId: 'm1', target: 'next-turn', content: [{ type: 'text', text: 'x' }], nativeSeq: 12, settled: true })
    assert.deepEqual(state.stash.map((m) => m.messageId), ['m3'])
    assert.ok(state.incorporated.has('m1'))
    journal.append(sid, 'sophia/fence', { attemptId: 'a1', authorityEpoch: 3, state: 'stopped', commandId: 'c4' })
    journal.append(sid, 'sophia/fence', { attemptId: 'a1', authorityEpoch: 3, state: 'active', commandId: 'c5' })
    state = foldLog(new Journal(dir).read(sid))
    assert.equal(state.fence, 'stopped', 'nothing reopens a stopped attempt')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('a torn final journal line (crash mid-write) is cut before the next append; earlier corruption is not tolerated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'))
  const file = join(dir, 's1.jsonl')
  const fence = { attemptId: 'a', authorityEpoch: 1, state: 'held', commandId: 'c' }
  try {
    new Journal(dir).append('s1', 'sophia/fence', fence)
    appendFileSync(file, '{"seq":1,"ty')
    const journal = new Journal(dir)
    assert.equal(journal.read('s1').length, 1)
    assert.ok(readFileSync(file, 'utf8').endsWith('}\n'), 'the torn tail is gone from disk')
    journal.append('s1', 'sophia/fence', fence)
    journal.append('s1', 'sophia/fence', fence)
    assert.deepEqual(new Journal(dir).read('s1').map((r) => r.seq), [0, 1, 2], 'appends after a torn tail stay readable')

    // A complete record whose newline was cut is kept and terminated.
    writeFileSync(file, readFileSync(file, 'utf8').trimEnd())
    const again = new Journal(dir)
    assert.equal(again.read('s1').length, 3)
    again.append('s1', 'sophia/fence', fence)
    assert.equal(new Journal(dir).read('s1').length, 4)

    appendFileSync(file, '{"seq":4,"ty\n{"seq":5,"time":0,"type":"sophia/fence","data":{}}\n')
    assert.throws(() => new Journal(dir).read('s1'), /corrupt/)
    assert.throws(() => journal.read('../escape'), /unsafe journal name/)
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('the journal separates settled from unsettled commands, tracks redelivered held input, and keeps the observation cursor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'))
  try {
    const journal = new Journal(dir)
    const sid = 'sophia-a2'
    const text = (t) => [{ type: 'text', text: t }]
    const cmd = (commandId, messageId, extra = {}) => ({ commandId, kind: 'input', attemptId: 'a2', authorityEpoch: 1, messageId, target: 'next-turn', content: text(commandId), nativeSeq: null, role: null, ...extra })
    journal.append(sid, 'sophia/command', cmd('c1', 'm1'))
    journal.append(sid, 'sophia/settled', { commandId: 'c1', nativeSeq: 4 })
    journal.append(sid, 'sophia/command', cmd('c2', 'm2'))
    // c2 re-executed after a restart with a new message: the re-execution replaces it.
    journal.append(sid, 'sophia/command', cmd('c2', 'm2b', { authorityEpoch: 3 }))
    // A duplicate record never replaces a settled command.
    journal.append(sid, 'sophia/command', cmd('c1', 'm1-dup'))
    journal.append(sid, 'sophia/stash', { attemptId: 'a2', messages: [{ messageId: 'h1', target: 'next-step', content: text('held') }] })
    journal.append(sid, 'sophia/unstash', { attemptId: 'a2', commandId: 'r1', messageIds: ['h1'], messages: [{ messageId: 'h1b', target: 'next-step', content: text('held') }] })
    journal.append(sid, 'sophia/observed', { nativeSeq: 7 })
    journal.append(sid, 'sophia/observed', { nativeSeq: 5 })
    let state = foldLog(journal.read(sid))
    assert.equal(state.commands.get('c1').settled, true)
    assert.equal(state.commands.get('c1').messageId, 'm1')
    assert.equal(state.commands.get('c2').settled, false)
    assert.equal(state.commands.get('c2').messageId, 'm2b')
    assert.equal(state.authorityEpoch, 3)
    assert.deepEqual(state.stash, [])
    assert.deepEqual(state.unstashed.map((m) => m.messageId), ['h1b'])
    assert.equal(state.observedSeq, 7)
    // Claimed again while held: back in the stash, no longer awaiting dsh.
    journal.append(sid, 'sophia/stash', { attemptId: 'a2', messages: [{ messageId: 'h1b', target: 'next-step', content: text('held') }] })
    state = foldLog(journal.read(sid))
    assert.deepEqual(state.stash.map((m) => m.messageId), ['h1b'])
    assert.deepEqual(state.unstashed, [])
    assert.equal(strongestFence('held', 'active'), 'held')
    assert.equal(strongestFence('active', 'stopped'), 'stopped')
    assert.equal(strongestFence('held', 'stopped'), 'stopped')
  } finally {
    rmSync(dir, { recursive: true })
  }
})
