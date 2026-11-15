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
    assert.deepEqual(state.commands.get('c1'), { seq: 0, kind: 'input', messageId: 'm1', target: 'next-turn', content: [{ type: 'text', text: 'x' }], nativeSeq: 12, stage: null, reason: null, settled: true })
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
    journal.append(sid, 'sophia/command', { ...cmd('h1', null), kind: 'hold', target: null, content: null })
    journal.append(sid, 'sophia/settled', { commandId: 'h1', nativeSeq: 9, stage: 'checked', reason: 'held; the native driver is idle' })
    journal.append(sid, 'sophia/receipted', { commandId: 'c1', stage: 'incorporation_observed' })
    journal.append(sid, 'sophia/epoch', { attemptId: 'a2', authorityEpoch: 5 })
    let state = foldLog(journal.read(sid))
    assert.equal(state.commands.get('c1').settled, true)
    assert.equal(state.commands.get('c1').messageId, 'm1')
    assert.equal(state.commands.get('c2').settled, false)
    assert.equal(state.commands.get('c2').messageId, 'm2b')
    assert.equal(state.authorityEpoch, 5, 'an inspect-only epoch raise counts')
    assert.equal(state.commands.get('h1').stage, 'checked', 'a settled Hold keeps the stage it earned')
    assert.deepEqual([...state.incorporationReceipted], ['c1'])
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

test('the first recorded execution identity is the attempt\'s; a later record never replaces it (SMC-M02 G3)', () => {
  const identity = (model, source) => ({ attemptId: 'a1', runtimeUnitId: 'u', preset: { id: 'sophia-review-v1', digest: 'sha256:1' }, route: { provider: 'p', model, reasoningEffort: null }, source, evidence: null })
  assert.equal(foldLog([]).identity, null)
  const journal = [
    { seq: 0, time: 0, type: 'sophia/identity', data: identity('m1', 'create') },
    { seq: 1, time: 0, type: 'sophia/command', data: { commandId: 'c1', kind: 'create', attemptId: 'a1', authorityEpoch: 1, messageId: null, target: null, content: null, nativeSeq: null, role: 'sophia-review-v1' } },
    { seq: 2, time: 0, type: 'sophia/identity', data: identity('m2', 'migrated') },
  ]
  const logged = foldLog(journal)
  assert.equal(logged.identity.route.model, 'm1')
  assert.equal(logged.identity.source, 'create')
  assert.equal(logged.role, 'sophia-review-v1')
})

// C2A REPAIR-001 (F03): the executor resource of an attempt's authenticated commands rides in its existing command
// records and folds back across a restart. SYNTHETIC records and resource ids throughout (no real resource or service).
const cmdRecord = (commandId, attemptId, extra = {}) => ({ commandId, kind: 'input', attemptId, authorityEpoch: 1, messageId: null, target: null, content: null, nativeSeq: null, role: null, ...extra })

test('F03: the resource of an authenticated command is journaled with it and folds back after a restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'journal-'))
  try {
    const sid = 'sophia-r1'
    new Journal(dir).append(sid, 'sophia/command', cmdRecord('c1', 'r1', { kind: 'create', resourceId: 'res-1' }))
    // A restart: a new Journal reads the file back.
    const records = new Journal(dir).read(sid)
    assert.equal(records[0].data.resourceId, 'res-1', 'recorded with the command, before any native action')
    assert.deepEqual(foldLog(records).resource, { state: 'known', resourceId: 'res-1' })
    // The same resource again keeps it known.
    new Journal(dir).append(sid, 'sophia/command', cmdRecord('c2', 'r1', { resourceId: 'res-1' }))
    assert.deepEqual(foldLog(new Journal(dir).read(sid)).resource, { state: 'known', resourceId: 'res-1' })
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('F03: a legacy record without the field is unknown, and a later record without it never erases a known resource', () => {
  assert.deepEqual(foldLog([]).resource, { state: 'unknown' })
  const legacy = [{ seq: 0, time: 0, type: 'sophia/command', data: cmdRecord('c1', 'r1', { kind: 'create', role: 'sophia-review-v1' }) }]
  assert.deepEqual(foldLog(legacy).resource, { state: 'unknown' }, 'a journal written before the field: unknown, never fabricated')
  const known = [...legacy, { seq: 1, time: 0, type: 'sophia/command', data: cmdRecord('c2', 'r1', { resourceId: 'res-1' }) }]
  assert.deepEqual(foldLog(known).resource, { state: 'known', resourceId: 'res-1' }, 'a legitimate authenticated command establishes it')
  const later = [...known, { seq: 2, time: 0, type: 'sophia/command', data: cmdRecord('c3', 'r1') }]
  assert.deepEqual(foldLog(later).resource, { state: 'known', resourceId: 'res-1' }, 'a missing field adds nothing')
  // Nothing else about the fold changes: the role, the epoch and the commands are as before.
  assert.equal(foldLog(later).role, 'sophia-review-v1')
  assert.deepEqual([...foldLog(later).commands.keys()], ['c1', 'c2', 'c3'])
})

test('F03: another resource for the same attempt is ambiguous for good; an invalid value or another attempt never becomes a resource', () => {
  const at = (seq, data) => ({ seq, time: 0, type: 'sophia/command', data })
  const conflict = [at(0, cmdRecord('c1', 'r1', { resourceId: 'res-1' })), at(1, cmdRecord('c2', 'r1', { resourceId: 'res-2' }))]
  assert.deepEqual(foldLog(conflict).resource, { state: 'ambiguous' })
  const back = [...conflict, at(2, cmdRecord('c3', 'r1', { resourceId: 'res-1' })), at(3, cmdRecord('c4', 'r1'))]
  assert.deepEqual(foldLog(back).resource, { state: 'ambiguous' }, 'never cleared, switched or re-adopted')
  for (const bad of [7, '', '../escape', 'x'.repeat(65), null]) {
    assert.deepEqual(foldLog([at(0, cmdRecord('c1', 'r1', { resourceId: bad }))]).resource, { state: 'ambiguous' }, `corrupt ${JSON.stringify(bad)}`)
  }
  const mixed = [at(0, cmdRecord('c1', 'r1', { resourceId: 'res-1' })), at(1, cmdRecord('c2', 'other', { resourceId: 'res-1' }))]
  assert.deepEqual(foldLog(mixed).resource, { state: 'ambiguous' }, "another attempt's record in this session")
})

test('F03: a restarted bridge restores only its own attempt\'s resource, and refuses a tracked call while unknown or ambiguous', async () => {
  const { bindingProblem, ResourceRefused } = await import('../../packages/dsh-bundle/dist/control-bridge.js')
  const dir = mkdtempSync(join(tmpdir(), 'bridge-journal-'))
  try {
    const journal = new Journal(dir)
    journal.append('sophia-known', 'sophia/command', cmdRecord('c1', 'known', { kind: 'create', resourceId: 'res-1' }))
    journal.append('sophia-legacy', 'sophia/command', cmdRecord('c1', 'legacy', { kind: 'create' }))
    journal.append('sophia-twice', 'sophia/command', cmdRecord('c1', 'twice', { resourceId: 'res-1' }))
    journal.append('sophia-twice', 'sophia/command', cmdRecord('c2', 'twice', { resourceId: 'res-2' }))
    // A journal file whose records belong to another attempt (corrupt or misplaced context).
    journal.append('sophia-foreign', 'sophia/command', cmdRecord('c1', 'someone-else', { resourceId: 'res-1' }))
    const bridge = new ControlBridge({}, { protocolVersion: 1, bundle: 'synthetic', dshVersion: 'synthetic', runtimeUnitId: 'u',
      service: { baseUrl: 'http://127.0.0.1:9', token: 'synthetic-only' }, workspace: dir, journalDir: dir, pollWaitMs: 1, settleTimeoutMs: 1,
      routes: {}, roleRoutes: {}, research: null, log: () => {} })
    const restored = (attemptId) => bridge.newAttempt(attemptId, 1)
    assert.deepEqual(restored('known').resource, { state: 'known', resourceId: 'res-1' })
    assert.deepEqual(restored('legacy').resource, { state: 'unknown' })
    assert.deepEqual(restored('twice').resource, { state: 'ambiguous' })
    assert.deepEqual(restored('foreign').resource, { state: 'ambiguous' })
    assert.deepEqual(restored('fresh').resource, { state: 'unknown' })
    assert.doesNotThrow(() => bridge.resourceReady(bridge.attempts.get('known')))
    for (const id of ['legacy', 'twice', 'foreign', 'fresh']) assert.throws(() => bridge.resourceReady(bridge.attempts.get(id)), ResourceRefused, id)
    // The ACK must name exactly the known resource.
    const sent = { attemptId: 'known', nativeSessionId: 'sophia-known', callId: 'llm-1', kind: 'model', provider: 'p', amountUsd: 0.1, purpose: 'call', mode: 'tracked_v1', contract: 'legacy_report' }
    const reply = (resourceId) => ({ reservationId: 'r', state: 'reserved', kind: 'model', purpose: 'call', amountUsd: 0.1, target: null,
      binding: { mode: 'tracked_v1', contract: 'legacy_report', evidenceId: '00000000-0000-4000-8000-000000000001', callId: 'llm-1', attemptId: 'known',
        nativeSessionId: 'sophia-known', projectId: 'p', runtimeUnitId: 'u', ...(resourceId === undefined ? {} : { resourceId }) } })
    const context = (resource) => ({ projectId: 'p', runtimeUnitId: 'u', resource })
    const KNOWN = { state: 'known', resourceId: 'res-1' }
    assert.equal(bindingProblem(reply('res-1'), sent, context(KNOWN)), null)
    assert.equal(bindingProblem(reply(undefined), sent, context(KNOWN)), 'resource')
    assert.equal(bindingProblem(reply('res-2'), sent, context(KNOWN)), 'resource')
    assert.equal(bindingProblem(reply('res-1'), sent, context({ state: 'unknown' })), 'resource')
    assert.equal(bindingProblem(reply('res-1'), sent, context({ state: 'ambiguous' })), 'resource')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

// REPAIR-001 R1 (C2A-REPAIR-F04): a recovered resource keeps the provenance of the attempt whose command carried it,
// independently of the last journal row's attemptId. SYNTHETIC malformed/misplaced journals; no live exploit is claimed.
const synthBridge = (dir) => new ControlBridge({}, { protocolVersion: 1, bundle: 'synthetic', dshVersion: 'synthetic', runtimeUnitId: 'u',
  service: { baseUrl: 'http://127.0.0.1:9', token: 'synthetic-only' }, workspace: dir, journalDir: dir, pollWaitMs: 1, settleTimeoutMs: 1,
  routes: {}, roleRoutes: {}, research: null, log: () => {} })

test('F04: a foreign resource followed by a local legacy command, fence or epoch row is ambiguous for the local attempt, after a real restart', async () => {
  const { ResourceRefused } = await import('../../packages/dsh-bundle/dist/control-bridge.js')
  const dir = mkdtempSync(join(tmpdir(), 'bridge-f04-'))
  try {
    const journal = new Journal(dir)
    const foreign = (sid) => journal.append(sid, 'sophia/command', cmdRecord('foreign', 'B', { kind: 'create', resourceId: 'res-B' }))
    // (1) B's resource-bearing command, then A's command with no resource (legacy shape).
    foreign('sophia-A1')
    journal.append('sophia-A1', 'sophia/command', cmdRecord('legacy-local', 'A1'))
    // (2) B's resource, then A's fence.
    foreign('sophia-A2')
    journal.append('sophia-A2', 'sophia/fence', { attemptId: 'A2', authorityEpoch: 2, state: 'active', commandId: 'f' })
    // (3) B's resource, then A's epoch.
    foreign('sophia-A3')
    journal.append('sophia-A3', 'sophia/epoch', { attemptId: 'A3', authorityEpoch: 3 })
    // (4) B's resource, then a later local command that does carry a resource: still never A's own context.
    foreign('sophia-A4')
    journal.append('sophia-A4', 'sophia/command', cmdRecord('local', 'A4', { resourceId: 'res-A' }))
    for (const sid of ['sophia-A1', 'sophia-A2', 'sophia-A3', 'sophia-A4']) {
      const folded = foldLog(new Journal(dir).read(sid))
      assert.deepEqual(folded.resource, { state: 'ambiguous' }, `${sid}: the fold never relabels B's resource`)
      assert.deepEqual([folded.owner, folded.ownerMismatch], ['B', true], `${sid}: the first owner and a sticky mismatch`)
    }
    // A real restart: a new bridge restores each attempt from its own journal file.
    const bridge = synthBridge(dir)
    for (const id of ['A1', 'A2', 'A3', 'A4']) {
      const attempt = bridge.newAttempt(id, 1)
      assert.deepEqual(attempt.resource, { state: 'ambiguous' }, `${id}: never adopts res-B`)
      assert.throws(() => bridge.resourceReady(attempt), ResourceRefused, `${id}: no tracked call reserves`)
    }
    // Sticky: a later legitimate-looking command for A names a resource; the context stays ambiguous.
    const a1 = bridge.attempts.get('A1')
    bridge.append(a1, { schema: 'sophia.runtime-command.v1', commandId: 'later', kind: 'input', expectedNativeSessionId: null, contextPacketId: null, payload: {},
      binding: { projectId: 'p', goalId: 'g', goalRevision: 1, attemptId: 'A1', resourceId: 'res-A', authorityEpoch: 4, runtimeUnitId: 'u' } }, null, null)
    assert.deepEqual(a1.resource, { state: 'ambiguous' })
    assert.deepEqual(synthBridge(dir).newAttempt('A1', 1).resource, { state: 'ambiguous' }, 'and after another restart')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('F04 (restart path only): a restarted ControlBridge never adopts a foreign resource behind a local command, fence or epoch row', async () => {
  const { ResourceRefused } = await import('../../packages/dsh-bundle/dist/control-bridge.js')
  const dir = mkdtempSync(join(tmpdir(), 'bridge-f04-restart-'))
  try {
    const journal = new Journal(dir)
    const later = {
      A1: () => journal.append('sophia-A1', 'sophia/command', cmdRecord('legacy-local', 'A1')),
      A2: () => journal.append('sophia-A2', 'sophia/fence', { attemptId: 'A2', authorityEpoch: 2, state: 'active', commandId: 'f' }),
      A3: () => journal.append('sophia-A3', 'sophia/epoch', { attemptId: 'A3', authorityEpoch: 3 }),
    }
    for (const [id, local] of Object.entries(later)) {
      journal.append(`sophia-${id}`, 'sophia/command', cmdRecord('foreign', 'B', { kind: 'create', resourceId: 'res-B' }))
      local()
    }
    const bridge = synthBridge(dir)
    for (const id of Object.keys(later)) {
      const attempt = bridge.newAttempt(id, 1)
      assert.deepEqual(attempt.resource, { state: 'ambiguous' }, `${id}: a restart never adopts res-B`)
      assert.throws(() => bridge.resourceReady(attempt), ResourceRefused, `${id}: no tracked call reserves`)
    }
  } finally {
    rmSync(dir, { recursive: true })
  }
})

// REPAIR-001 R2 (C2A-REPAIR-F04-R1-NULL-OWNER): an owner-typed record whose attemptId is not a string (explicit null) is
// an invalid owner. SYNTHETIC malformed private journals only; normal writers never emit this, and no exploit is claimed.
const NULL_OWNER_CASES = {
  N0: null, // the null-owner resource row alone
  N1: (journal) => journal.append('sophia-N1', 'sophia/command', cmdRecord('legacy-local', 'N1')),
  N2: (journal) => journal.append('sophia-N2', 'sophia/fence', { attemptId: 'N2', authorityEpoch: 2, state: 'active', commandId: 'f' }),
  N3: (journal) => journal.append('sophia-N3', 'sophia/epoch', { attemptId: 'N3', authorityEpoch: 3 }),
}
const NULL_OWNER_LABEL = { N0: 'alone', N1: 'then a valid local legacy command', N2: 'then a valid local fence', N3: 'then a valid local epoch' }
for (const [id, local] of Object.entries(NULL_OWNER_CASES)) {
  test(`F04 null owner (${id}): a null-owner resource row ${NULL_OWNER_LABEL[id]} never restores res-B for ${id}, after a real restart`, async () => {
    const { ResourceRefused } = await import('../../packages/dsh-bundle/dist/control-bridge.js')
    const dir = mkdtempSync(join(tmpdir(), `bridge-f04-null-${id}-`))
    try {
      const journal = new Journal(dir)
      journal.append(`sophia-${id}`, 'sophia/command', cmdRecord('malformed', null, { kind: 'create', resourceId: 'res-B' }))
      if (local) local(journal)
      const attempt = synthBridge(dir).newAttempt(id, 1)
      assert.deepEqual(attempt.resource, { state: 'ambiguous' }, `${id}: never adopts res-B from an invalid owner`)
      assert.throws(() => synthBridge(dir).resourceReady(attempt), ResourceRefused, `${id}: no tracked call reserves`)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
}

test('F04 null owner (sticky): later legitimate-looking commands and another restart never clear an invalid owner', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-f04-null-sticky-'))
  try {
    const journal = new Journal(dir)
    journal.append('sophia-N1', 'sophia/command', cmdRecord('malformed', null, { kind: 'create', resourceId: 'res-B' }))
    journal.append('sophia-N1', 'sophia/command', cmdRecord('legacy-local', 'N1'))
    const bridge = synthBridge(dir)
    const n1 = bridge.newAttempt('N1', 1)
    bridge.append(n1, { schema: 'sophia.runtime-command.v1', commandId: 'later', kind: 'input', expectedNativeSessionId: null, contextPacketId: null, payload: {},
      binding: { projectId: 'p', goalId: 'g', goalRevision: 1, attemptId: 'N1', resourceId: 'res-N1', authorityEpoch: 4, runtimeUnitId: 'u' } }, null, null)
    assert.deepEqual(n1.resource, { state: 'ambiguous' })
    assert.deepEqual(synthBridge(dir).newAttempt('N1', 1).resource, { state: 'ambiguous' }, 'and after another restart')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('F04 matched controls: same-attempt known + legacy keeps the first known; all-legacy stays unknown until a legitimate command', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-f04-ok-'))
  try {
    const journal = new Journal(dir)
    journal.append('sophia-K', 'sophia/command', cmdRecord('c1', 'K', { kind: 'create', resourceId: 'res-K' }))
    journal.append('sophia-K', 'sophia/command', cmdRecord('c2', 'K'))
    journal.append('sophia-K', 'sophia/fence', { attemptId: 'K', authorityEpoch: 2, state: 'held', commandId: 'c3' })
    journal.append('sophia-K', 'sophia/epoch', { attemptId: 'K', authorityEpoch: 3 })
    // Audit-only text naming another actor never owns the journal (not a mismatch).
    journal.append('sophia-K', 'sophia/spend-refused', { attemptId: 'someone-else', sessionId: 'child-1', reason: 'synthetic audit line' })
    journal.append('sophia-L', 'sophia/command', cmdRecord('c1', 'L', { kind: 'create' }))
    journal.append('sophia-L', 'sophia/fence', { attemptId: 'L', authorityEpoch: 1, state: 'active', commandId: 'c1' })
    const bridge = synthBridge(dir)
    assert.deepEqual(
      bridge.newAttempt('K', 1).resource,
      { state: 'known', resourceId: 'res-K' },
      'its own metadata rows, and an audit line naming another actor, never relabel it',
    )
    const legacy = bridge.newAttempt('L', 1)
    assert.deepEqual(legacy.resource, { state: 'unknown' })
    // The legitimate command: through the bridge's own append (journaled before any native action).
    bridge.append(legacy, { schema: 'sophia.runtime-command.v1', commandId: 'c2', kind: 'input', expectedNativeSessionId: null, contextPacketId: null, payload: {},
      binding: { projectId: 'p', goalId: 'g', goalRevision: 1, attemptId: 'L', resourceId: 'res-L', authorityEpoch: 2, runtimeUnitId: 'u' } }, null, null)
    assert.deepEqual(legacy.resource, { state: 'known', resourceId: 'res-L' })
    assert.deepEqual(synthBridge(dir).newAttempt('L', 1).resource, { state: 'known', resourceId: 'res-L' }, 'restored after a restart')
    assert.equal(new Journal(dir).read('sophia-L').at(-1).data.resourceId, 'res-L', 'recorded with the command')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

import { createServer } from 'node:http'
import { mkdtemp as mkdtempReplyPoll, rm as rmReplyPoll } from 'node:fs/promises'
import { ControlBridge } from '../../packages/dsh-bundle/dist/control-bridge.js'
const replyPollSettings={routeId:'synthetic',route:{provider:'synthetic',model:'synthetic',reasoningEffort:null},maxTokens:10,
  admissionWaitMs:100,bounds:{deadlineMs:1000,graceMs:2,killMs:5,exitWaitMs:10,settleWaitMs:10},
  retry:{requestWaitMs:10,retryWaitMs:2,maxAttempts:1},receiptWaitMs:100,verification:null,launch:()=>assert.fail('no launch')}
async function replyPollCrossing(mode){
 const scratch=await mkdtempReplyPoll(join(tmpdir(),'independent-poll-refresh-'));let bridge,polls=0,reads=0,timer;const logs=[]
 const server=createServer((req,res)=>{
  res.setHeader('content-type','application/json')
  if(req.url==='/v1/runtime/hello'){res.end(JSON.stringify({projectId:'p',leaseId:'synthetic',authorityEpoch:1,bindings:[],cursor:0}));return}
  if(req.url==='/v1/runtime/ready'){res.statusCode=204;res.end();return}
  polls++;if(polls===2)bridge.stopping.abort();res.statusCode=409;res.end(JSON.stringify({code:'invalid_state',message:'synthetic supersession'}))
 })
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const settings={protocolVersion:1,bundle:'synthetic',dshVersion:'synthetic',runtimeUnitId:'unit',
   service:{baseUrl:`http://127.0.0.1:${server.address().port}`,token:'synthetic-only'},workspace:scratch,journalDir:scratch,pollWaitMs:1,settleTimeoutMs:1,routes:{},roleRoutes:{},research:null,log:x=>logs.push(x)}
  Object.defineProperty(settings,'replies',{get(){reads++;if(mode==='toggle-disabled')return reads===1?null:replyPollSettings;if(mode==='toggle-enabled')return reads===1?replyPollSettings:null;return mode==='enabled'?replyPollSettings:mode==='invalid'?{...replyPollSettings,routeId:3}:null}})
  bridge=new ControlBridge({},settings);bridge.advertisedRoles=async()=>[]
  const goal={handle:{dispose:()=>assert.fail('must not dispose goal')}};bridge.attempts.set('synthetic-goal',goal)
  let timeout=false
  await Promise.race([bridge.connect(),new Promise(r=>{timer=setTimeout(()=>{timeout=true;bridge.stopping.abort();r()},4000)})])
  assert.equal(timeout,false)
  assert.equal(bridge.attempts.get('synthetic-goal'),goal)
  return {mode,polls,reads,controllerEnabled:bridge.replies?.settings!==null,hook:bridge.replySuperseded!==null,readiness:bridge.readiness,logs}
 }finally{clearTimeout(timer);bridge?.stopping.abort();bridge?.replies?.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rmReplyPoll(scratch,{recursive:true,force:true})}
}
for(const mode of ['enabled','disabled','invalid','toggle-disabled','toggle-enabled'])test('refreshed actual connect '+mode,async()=>{
 const r=await replyPollCrossing(mode);process.stdout.write(JSON.stringify(r)+'\n')
 const expected=mode==='enabled'||mode==='toggle-enabled'
 assert.equal(r.hook,expected,'hook must match the exact configuration passed to the captured controller')
 assert.equal(r.polls,expected?1:2,'supersession must fence only the exact enabled controller')
})

// #393 review: a retained receipt whose delivery the service accepts but never answers is retried within its bound,
// so it neither blocks the receipts behind it nor waits forever. The bridge's own queue and transport, over real HTTP.
test('a retained receipt delivery that stalls is bounded and sent again', async () => {
  const scratch = await mkdtempReplyPoll(join(tmpdir(), 'retained-receipt-'))
  const delivered = []
  let attempts = 0
  const open = new Set()
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (req.url !== '/v1/runtime/receipts') return res.writeHead(404).end()
    attempts += 1
    if (attempts === 1) {
      open.add(res)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('{')
      return
    }
    delivered.push(...JSON.parse(raw).receipts)
    res.writeHead(204).end()
  })
  let bridge
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    bridge = new ControlBridge({}, {
      protocolVersion: 1, bundle: 'synthetic', dshVersion: 'synthetic', runtimeUnitId: 'unit',
      service: { baseUrl: `http://127.0.0.1:${server.address().port}`, token: 'synthetic-only' },
      workspace: scratch, journalDir: scratch, pollWaitMs: 1, settleTimeoutMs: 1, receiptWaitMs: 150,
      routes: {}, roleRoutes: {}, research: null, log: () => {},
    })
    const receipt = {
      commandId: 'cmd-retained', attemptId: 'att-retained', stage: 'checked', nativeSessionId: null, nativeSequence: null,
      evidenceRefs: [], observedAt: new Date().toISOString(), reason: null,
    }
    bridge.send(receipt)
    const deadline = Date.now() + 4000
    while (delivered.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25))
    assert.equal(attempts, 2, 'the stalled attempt was abandoned and the batch sent again')
    assert.deepEqual(delivered.map((r) => [r.commandId, r.stage]), [['cmd-retained', 'checked']])
  } finally {
    bridge?.stopping.abort()
    for (const res of open) res.destroy()
    server.closeAllConnections()
    await new Promise((r) => server.close(r))
    await rmReplyPoll(scratch, { recursive: true, force: true })
  }
})

// INC04-R07-C2B-PRODUCER-001: the opt-in, its ACK and the observation capability's lifecycle, on the built bridge.
test('C2B: the answer echoes facts exactly when the request opted in; a missing, extra or other echo refuses before effect', async () => {
  const { bindingProblem } = await import('../../packages/dsh-bundle/dist/control-bridge.js')
  const base = { attemptId: 'known', nativeSessionId: 'sophia-known', callId: 'llm-1', kind: 'model', provider: 'p', amountUsd: 0.1, purpose: 'call', mode: 'tracked_v1', contract: 'c1p_complete_report' }
  const reply = (facts) => ({ reservationId: 'r', state: 'reserved', kind: 'model', purpose: 'call', amountUsd: 0.1, target: null,
    binding: { mode: 'tracked_v1', contract: 'c1p_complete_report', evidenceId: '00000000-0000-4000-8000-000000000001', callId: 'llm-1', attemptId: 'known',
      nativeSessionId: 'sophia-known', projectId: 'p', runtimeUnitId: 'u', resourceId: 'res-1', ...(facts === undefined ? {} : { facts }) } })
  const context = { projectId: 'p', runtimeUnitId: 'u', resource: { state: 'known', resourceId: 'res-1' } }
  const opted = { ...base, facts: 'observed_v1' }
  assert.equal(bindingProblem(reply('observed_v1'), opted, context), null)
  assert.equal(bindingProblem(reply(undefined), opted, context), 'facts', 'an old or partial service: no silent v1 fallback')
  assert.equal(bindingProblem(reply('observed_v2'), opted, context), 'facts')
  assert.equal(bindingProblem(reply(undefined), base, context), null, 'v1 exactly as before')
  assert.equal(bindingProblem(reply('observed_v1'), base, context), 'facts', 'an echo the request never asked for')
})

test('C2B: only a qualified route opts in; the capability is provided after the stripping listener and withdrawn first', async () => {
  const { ControlBridge: Bridge } = await import('../../packages/dsh-bundle/dist/control-bridge.js')
  const dir = mkdtempSync(join(tmpdir(), 'bridge-c2b-'))
  const events = []
  let streamListener
  const ctx = {
    on: (name, fn, options) => { events.push(`on:${name}${options?.global ? ':global' : ''}${options?.prepend ? ':prepend' : ''}`); if (name === 'llm/stream') streamListener = fn; return () => events.push(`off:${name}`) },
    provide: (name, value) => { events.push(`provide:${name}:${value.version}:${Object.isFrozen(value)}`); return () => events.push(`withdraw:${name}`) },
    tools: { guard: () => () => events.push('off:guard') },
  }
  const route = { provider: 'openai-research', model: 'gpt-6.1-sol', reasoningEffort: 'medium', maxTokens: 16000, prices: { input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 } }
  const settings = (observedRoutes) => ({ protocolVersion: 1, bundle: 'synthetic', dshVersion: 'synthetic', runtimeUnitId: 'u', service: null, workspace: dir, journalDir: dir,
    pollWaitMs: 1, settleTimeoutMs: 1, routes: { 'research-sol-medium-v1': route }, roleRoutes: {}, research: null, log: () => {}, observedRoutes })
  try {
    const bridge = new Bridge(ctx, settings(new Set(['research-sol-medium-v1'])))
    assert.equal(bridge.tracked(route, route.prices).facts, 'observed_v1')
    const stop = bridge.start()
    assert.deepEqual(events.slice(0, 3), ['on:agent/pre-step', 'on:llm/stream:global:prepend', 'provide:sophiaC2bObservation:sophia-c2b-observation-v1:true'])
    // The listener's unbound branch (no session) removes a frame and passes the rest.
    const frame = { type: 'x-sophia-c2b-observation' }
    Object.defineProperty(frame, 'sophiaC2bObservation', { value: { v: 1, frame: 'transport', sent: 'observable_transport_response' }, enumerable: false })
    async function* next() { yield frame; yield { type: 'text-delta', index: 0, text: 'ok' } }
    const seen = []
    for await (const chunk of streamListener({}, next)) seen.push(chunk.type)
    assert.deepEqual(seen, ['text-delta'])
    // The bound but unmetered branch (this test bridge has no service transport) removes it too. LABELLED stub: the
    // session's attempt is given directly, on the route the call names.
    bridge.attemptForSession = () => ({ identity: { route: { provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort } } })
    const unmetered = []
    for await (const chunk of streamListener({ provider: route.provider, model: route.model, sessionId: 's-unmetered' }, next)) unmetered.push(chunk.type)
    assert.deepEqual(unmetered, ['text-delta'])
    events.length = 0
    await stop()
    assert.equal(events[0], 'withdraw:sophiaC2bObservation', 'the capability goes before any listener')
    assert.ok(events.indexOf('off:llm/stream') > 0)
    // Without a qualified route: no opt-in and no capability at all.
    events.length = 0
    const plain = new Bridge(ctx, settings(new Set()))
    assert.equal('facts' in plain.tracked(route, route.prices), false)
    const stopPlain = plain.start()
    assert.equal(events.some((e) => e.startsWith('provide:')), false)
    await stopPlain()
  } finally {
    rmSync(dir, { recursive: true })
  }
})
