import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkExchangeRequest,
  checkReceipt,
  checkObservation,
  checkRunnerAnswer,
  exchangeRequest,
  helloRefusal,
  isSecret,
  newSecret,
  readKey,
  redact,
  secretDigest,
  sendKey,
  type HostHello,
} from './owner-host-channel.ts'
import { digestOf, type RunnerEnvelope } from './runner-port.ts'
import { deriveIdentity } from './t3-port-mapping.ts'

const JOURNAL = '00000000-0000-4000-8000-0000000000aa'
const envelope = (over: Partial<RunnerEnvelope> = {}): RunnerEnvelope => ({
  v: 1,
  operationId: '00000000-0000-4000-8000-000000000001',
  kind: 'create',
  projectId: '00000000-0000-4000-8000-0000000000a1',
  ownerId: '00000000-0000-4000-8000-0000000000b1',
  resourceId: '00000000-0000-4000-8000-0000000000c1',
  bindingId: '00000000-0000-4000-8000-0000000000d1',
  goalId: '00000000-0000-4000-8000-0000000000e1',
  qualificationId: '00000000-0000-4000-8000-0000000000f1',
  qualificationRevision: 1,
  adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
  environmentRef: 'env-owner-1',
  nativeProjectRef: 'project-sophia',
  profileId: 'read-only-v1',
  profileRevision: 1,
  accountKey: 'claude:acct-1',
  authorityEpoch: 1,
  message: 'Report the Ask admission boundary.',
  title: 'Read-only qualification',
  targetOperationId: null,
  nativeThreadId: null,
  ...over,
})
const hello: HostHello = {
  v: 1,
  journalId: JOURNAL,
  environmentRef: 'env-owner-1',
  adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
  profileId: 'read-only-v1',
  profileRevision: 1,
  accountKey: 'claude:acct-1',
  t3Namespace: 'client:auth-session-1',
}

describe('owner-host secrets', () => {
  it('makes 256-bit base64url secrets, distinct, and hashes only well-formed ones', () => {
    const a = newSecret()
    const b = newSecret()
    assert.ok(isSecret(a) && isSecret(b))
    assert.notEqual(a, b)
    assert.equal(Buffer.from(a, 'base64url').length, 32)
    assert.equal(secretDigest(a).length, 32)
    assert.deepEqual(secretDigest(a), secretDigest(a))
    assert.notDeepEqual(secretDigest(a), secretDigest(b))
    for (const bad of ['', 'short', `${a}x`, `${a.slice(0, 42)}!`, ' '.repeat(43)])
      assert.throws(() => secretDigest(bad), /not a well-formed owner-host secret/)
  })
})

describe('the hello', () => {
  it('accepts exactly its fields', () => {
    assert.equal(helloRefusal(hello), null)
  })
  it('refuses an extra or missing field, a wrong version, a string revision or a non-client namespace', () => {
    assert.match(String(helloRefusal({ ...hello, bearer: 'x' })), /exactly its known fields/)
    const { accountKey: _drop, ...missing } = hello
    assert.match(String(helloRefusal(missing)), /exactly its known fields/)
    assert.match(String(helloRefusal({ ...hello, v: 2 })), /version/)
    assert.match(String(helloRefusal({ ...hello, profileRevision: '1' })), /profileRevision/)
    assert.match(String(helloRefusal({ ...hello, profileRevision: 0 })), /profileRevision/)
    // An MCP session id is not T3's request namespace for an outside agent.
    assert.match(String(helloRefusal({ ...hello, t3Namespace: 'mcp-session-abc' })), /client namespace/)
    assert.match(String(helloRefusal({ ...hello, journalId: 'not-an-id' })), /journalId/)
    assert.match(String(helloRefusal({ ...hello, adapterPin: 'main' })), /pin/)
    assert.match(String(helloRefusal(null)), /exactly its known fields/)
  })
})

/** Why a request is refused (it must be). */
function refused(v: unknown): string {
  const c = checkExchangeRequest(v)
  assert.equal(c.ok, false)
  return c.ok ? '' : c.reason
}

describe('an exchange request', () => {
  it('carries the whole identity and is checked by the host', () => {
    const e = envelope()
    const r = exchangeRequest('send', e, JOURNAL)
    assert.deepEqual(r, {
      v: 1,
      kind: 'send',
      journalId: JOURNAL,
      projectId: e.projectId,
      operationId: e.operationId,
      digest: digestOf(e),
      envelope: e,
    })
    const checked = checkExchangeRequest(JSON.parse(JSON.stringify(r)))
    assert.ok(checked.ok)
    assert.equal(sendKey(e.operationId), `send:${e.operationId}`)
    assert.equal(readKey('observe', e.operationId, JOURNAL), `observe:${e.operationId}:${JOURNAL}`)
  })
  it('refuses a digest that does not bind the envelope, another operation, extra fields or a bad envelope', () => {
    const r = exchangeRequest('send', envelope(), JOURNAL)
    assert.match(refused({ ...r, digest: digestOf(envelope({ message: 'other' })) }), /digest does not bind/)
    assert.match(refused({ ...r, envelope: envelope({ message: 'steered' }) }), /digest does not bind/)
    assert.match(refused({ ...r, operationId: '00000000-0000-4000-8000-000000000002' }), /another operation/)
    assert.match(refused({ ...r, shell: 'rm -rf' }), /exactly its known fields/)
    assert.match(refused({ ...r, envelope: { ...envelope(), tool: 'bash' } }), /envelope is refused/)
    assert.match(refused({ ...r, kind: 'hold' }), /unknown exchange kind/)
    assert.match(refused({ ...r, v: 2 }), /version/)
  })
})

describe('answers a host gives', () => {
  const identity = deriveIdentity(envelope(), 'client:auth-session-1')
  it('accepts each kind with exactly its fields', () => {
    const answers = [
      { kind: 'received', identity, runId: 'run-1', delivery: 'started' },
      { kind: 'received', identity, runId: null, delivery: 'queued' },
      { kind: 'rejected', identity, code: 'capability_denied', reason: 'no' },
      { kind: 'refused', reason: 'outside the profile' },
      { kind: 'conflict', reason: 'another digest' },
      { kind: 'unknown', identity: null, reason: 'lost' },
      { kind: 'unknown', identity, reason: 'steered', violation: true },
      { kind: 'settled', identity, reason: 'proven' },
    ]
    for (const a of answers) assert.deepEqual(checkRunnerAnswer(a), a)
  })
  it('refuses anything else', () => {
    for (const a of [
      null,
      { kind: 'not_sent', reason: 'no journal proves this' },
      { kind: 'received', identity, runId: 'run-1', delivery: 'restarted' },
      { kind: 'received', identity: null, runId: 'run-1', delivery: 'started' },
      { kind: 'received', identity, runId: 'run-1', delivery: 'started', extra: 1 },
      { kind: 'refused', reason: 'x', identity },
      { kind: 'unknown', identity: null, reason: 'lost', violation: false },
      { kind: 'rejected', identity: { ...identity, extra: 1 }, code: 'x', reason: 'y' },
      { kind: 'refused', reason: 'x'.repeat(501) },
    ])
      assert.equal(checkRunnerAnswer(a), null, JSON.stringify(a))
  })
  it('checks observations for their own operation (r5, HOST-S1A-R4-F01)', () => {
    const unknown = { kind: 'unknown', reason: 'not read' } as const
    for (const kind of ['create', 'input', 'stop'] as const) assert.deepEqual(checkObservation(unknown, kind), unknown)
    // A Stop: only the complete exact-thread proof, never a run summary of any status.
    assert.deepEqual(checkObservation({ kind: 'no_active_run' }, 'stop'), { kind: 'no_active_run' })
    for (const run of [
      { kind: 'run', status: 'running', terminal: true },
      { kind: 'run', status: 'completed', terminal: true },
      { kind: 'run', status: 'running', terminal: false },
      { kind: 'run', status: 'mystery', terminal: true },
    ])
      assert.equal(checkObservation(run, 'stop'), null, JSON.stringify(run))
    // A Create or Input: its own run, a status the mapping knows, terminal exactly as the mapping reads it.
    for (const kind of ['create', 'input'] as const) {
      assert.equal(checkObservation({ kind: 'no_active_run' }, kind), null, `${kind}: thread absence is not its run`)
      for (const [status, terminal] of [
        ['running', false],
        ['queued', false],
        ['waiting', false],
        ['completed', true],
        ['interrupted', true],
        ['failed', true],
      ] as const)
        assert.deepEqual(checkObservation({ kind: 'run', status, terminal }, kind), { kind: 'run', status, terminal })
      for (const bad of [
        { kind: 'run', status: 'running', terminal: true },
        { kind: 'run', status: 'completed', terminal: false },
        { kind: 'run', status: 'mystery', terminal: true },
        { kind: 'run', status: 'mystery', terminal: false },
        { kind: 'run', status: '', terminal: true },
        { kind: 'run', status: 'running' },
        { kind: 'run', status: 'running', terminal: 'false' },
        { kind: 'run', status: 'running', terminal: false, extra: 1 },
        { kind: 'unknown' },
        { kind: 'settled' },
      ])
        assert.equal(checkObservation(bad, kind), null, `${kind}: ${JSON.stringify(bad)}`)
    }
  })
})

describe('redaction', () => {
  it('masks bearer tokens and long opaque runs, and bounds the length', () => {
    const secret = newSecret()
    const out = redact(`failed with Bearer ${secret} and ${secret} at host`)
    assert.ok(!out.includes(secret))
    assert.match(out, /bearer \[redacted\]/)
    assert.equal(redact('x'.repeat(1000), 50).length <= 50, true)
  })
})

const THREAD = 'mcp:launch:0000000000000000000000000000000000000000000000000000000000000001'
const follow = (kind: 'input' | 'stop') =>
  envelope({
    kind,
    title: null,
    message: kind === 'input' ? 'And the outbox?' : null,
    targetOperationId: '00000000-0000-4000-8000-000000000009',
    nativeThreadId: THREAD,
  })
const got = (
  e: ReturnType<typeof envelope>,
  runId: string | null,
  delivery: 'started' | 'queued' | 'stop_requested' | 'no_active_run' | 'already_ended',
) => checkReceipt(e, { kind: 'received', identity: deriveIdentity(e, 'client:s'), runId, delivery })

describe('operation-aware receipts (r2, CC003-S1A-STUDY-F01)', () => {
  it('requires an input to name a non-blank run and an input delivery', () => {
    for (const runId of [null, '', ' \t '])
      assert.equal(got(follow('input'), runId, 'started').kind, 'unknown', String(runId))
    assert.equal(got(follow('input'), 'run-1', 'no_active_run').kind, 'unknown')
    assert.equal(got(follow('input'), 'run-1', 'queued').kind, 'received')
    assert.equal(got(follow('input'), 'run-1', 'started').kind, 'received')
  })
  it('keeps the bound identity and says a send may have happened', () => {
    const e = follow('input')
    const a = checkReceipt(e, {
      kind: 'received',
      identity: deriveIdentity(e, 'client:s'),
      runId: null,
      delivery: 'started',
    })
    assert.ok(a.kind === 'unknown')
    assert.deepEqual(a.identity, deriveIdentity(e, 'client:s'))
    assert.match(a.reason, /names no valid run; a send may have happened/)
  })
  it('lets a stop acknowledge with no run, never with a blank one or an input delivery', () => {
    for (const d of ['stop_requested', 'no_active_run', 'already_ended'] as const)
      assert.equal(got(follow('stop'), null, d).kind, 'received')
    assert.equal(got(follow('stop'), '  ', 'stop_requested').kind, 'unknown')
    assert.equal(got(follow('stop'), null, 'started').kind, 'unknown')
  })
  it('requires a create, which always carries a message, to name a non-blank run and be started (r4, R2-F01)', () => {
    assert.equal(got(envelope(), null, 'started').kind, 'unknown')
    assert.equal(got(envelope(), ' ', 'started').kind, 'unknown')
    assert.equal(got(envelope(), 'run-1', 'started').kind, 'received')
    assert.equal(got(envelope(), '', 'started').kind, 'unknown')
    assert.equal(got(envelope(), 'run-1', 'queued').kind, 'unknown')
  })
  it('passes every other answer through unchanged', () => {
    const e = follow('input')
    for (const a of [
      { kind: 'refused', reason: 'x' },
      { kind: 'conflict', reason: 'x' },
      { kind: 'unknown', identity: null, reason: 'x' },
      { kind: 'settled', identity: deriveIdentity(e, 'client:s'), reason: 'x' },
      { kind: 'rejected', identity: deriveIdentity(e, 'client:s'), code: 'capability_denied', reason: 'x' },
    ] as const)
      assert.deepEqual(checkReceipt(e, a), a)
  })
})

describe("a run observation's reported models (INC04-S03b B2, 0108)", () => {
  const collected = {
    state: 'unavailable',
    threadId: 't-1',
    runId: 'r-1',
    reason: 'provider_turns_load_failed',
    collectedAt: '2026-11-14T00:00:00.000Z',
  }
  it('accepts exactly one more key on a create or input run, checked on its own', () => {
    for (const kind of ['create', 'input'] as const) {
      assert.deepEqual(checkObservation({ kind: 'run', status: 'completed', terminal: true }, kind), {
        kind: 'run',
        status: 'completed',
        terminal: true,
      })
      assert.deepEqual(
        checkObservation({ kind: 'run', status: 'completed', terminal: true, reportedModels: collected }, kind),
        { kind: 'run', status: 'completed', terminal: true, reportedModels: collected },
      )
    }
  })
  it('keeps the checked status when the report is malformed or oversized, and keeps no content', () => {
    for (const bad of [{ state: 'collected', secret: 'model-x' }, null, 'x', { ...collected, reason: 'other' }])
      assert.deepEqual(
        checkObservation({ kind: 'run', status: 'running', terminal: false, reportedModels: bad }, 'create'),
        { kind: 'run', status: 'running', terminal: false, reportedModels: { state: 'malformed', reason: 'invalid' } },
        JSON.stringify(bad),
      )
    const big = { ...collected, collectedAt: 'x'.repeat(40_000) }
    assert.deepEqual(
      checkObservation({ kind: 'run', status: 'running', terminal: false, reportedModels: big }, 'input'),
      { kind: 'run', status: 'running', terminal: false, reportedModels: { state: 'malformed', reason: 'oversize' } },
    )
  })
  it('still voids a status it cannot check, any further key, and a report on a Stop', () => {
    for (const bad of [
      { kind: 'run', status: 'running', terminal: true, reportedModels: collected },
      { kind: 'run', status: 'running', terminal: false, reportedModels: collected, extra: 1 },
    ])
      assert.equal(checkObservation(bad, 'create'), null, JSON.stringify(bad))
    assert.equal(checkObservation({ kind: 'no_active_run', reportedModels: collected }, 'stop'), null)
  })
})
