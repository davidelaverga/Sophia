import assert from 'node:assert/strict'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseCommand, ProtocolError } from '../../packages/dsh-bundle/dist/protocol.js'
import { foldLog, Journal } from '../../packages/dsh-bundle/dist/session-events.js'

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
    assert.deepEqual(state.commands.get('c1'), { seq: 0, kind: 'input', messageId: 'm1', nativeSeq: 12 })
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

test('a torn final journal line (crash mid-write) is tolerated; earlier corruption is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'))
  try {
    const journal = new Journal(dir)
    journal.append('s1', 'sophia/fence', { attemptId: 'a', authorityEpoch: 1, state: 'held', commandId: 'c' })
    appendFileSync(join(dir, 's1.jsonl'), '{"seq":1,"ty')
    assert.equal(new Journal(dir).read('s1').length, 1)
    appendFileSync(join(dir, 's1.jsonl'), '\n{"seq":2,"time":0,"type":"sophia/fence","data":{}}\n')
    assert.throws(() => new Journal(dir).read('s1'), /corrupt/)
    assert.throws(() => journal.read('../escape'), /unsafe journal name/)
  } finally {
    rmSync(dir, { recursive: true })
  }
})
