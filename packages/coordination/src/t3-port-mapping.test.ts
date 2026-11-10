import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { checkEnvelope, digestOf, type RunnerEnvelope } from './runner-port.ts'
import {
  callFor,
  classifyReply,
  clientRequestIdOf,
  deriveIdentity,
  launchCommandId,
  stableCommandId,
  stableMessageId,
  T3_TOOLS,
} from './t3-port-mapping.ts'

const OP = '00000000-0000-4000-8000-000000000001'
const envelope = (over: Partial<RunnerEnvelope> = {}): RunnerEnvelope => ({
  v: 1,
  operationId: OP,
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

describe('the runner envelope', () => {
  it('takes exactly its own fields: a shell command, tool name or URL is refused, not ignored', () => {
    assert.equal(checkEnvelope(envelope()).ok, true)
    for (const extra of ['shell', 'tool', 'url', 'nativeSessionId']) {
      const e = { ...envelope(), [extra]: 'x' }
      const r = checkEnvelope(e)
      assert.equal(r.ok, false, extra)
    }
  })

  it('refuses kinds it does not carry, and each kind without what it needs', () => {
    for (const kind of ['hold', 'resume', 'resolve_permission', 'answer_question', 'steer']) {
      assert.equal(checkEnvelope({ ...envelope(), kind }).ok, false, kind)
    }
    assert.equal(checkEnvelope(envelope({ message: null })).ok, false)
    assert.equal(checkEnvelope(envelope({ kind: 'input', title: null })).ok, false, 'an input needs its target')
    assert.equal(
      checkEnvelope(envelope({ kind: 'stop', title: null, message: 'x', targetOperationId: OP, nativeThreadId: 't' }))
        .ok,
      false,
      'a stop carries no message',
    )
    assert.equal(
      checkEnvelope(envelope({ kind: 'stop', title: null, message: null, targetOperationId: OP, nativeThreadId: 't' }))
        .ok,
      true,
    )
  })

  it('binds its digest to every field', () => {
    assert.notEqual(digestOf(envelope()), digestOf(envelope({ authorityEpoch: 2 })))
    assert.equal(digestOf(envelope()), digestOf({ ...envelope() }))
  })
})

describe('T3 identities at the pin', () => {
  it('derives a launch id from the JSON pair of namespace and key, as T3 launchCommandId does', () => {
    const ns = 'client:abc'
    const key = clientRequestIdOf(OP)
    const expected = `mcp:launch:${createHash('sha256')
      .update(JSON.stringify([ns, key]))
      .digest('hex')}`
    assert.equal(launchCommandId(ns, key), expected)
    const id = deriveIdentity(envelope(), ns)
    assert.deepEqual(id, { namespace: ns, commandId: expected, messageId: expected, threadId: expected })
  })

  it('encodes each segment of a send identity, so a namespace with separators cannot collide', () => {
    const ns = 'client:a/b c'
    const key = clientRequestIdOf(OP)
    assert.equal(stableCommandId(ns, 'thread-send', key), `command:mcp:client%3Aa%2Fb%20c:thread-send:sophia%3A${OP}`)
    assert.equal(stableMessageId(ns, 'thread-send', key), `message:mcp:client%3Aa%2Fb%20c:thread-send:sophia%3A${OP}`)
    assert.notEqual(stableCommandId('a:b', 'c', 'd'), stableCommandId('a', 'b:c', 'd'))
  })

  it('makes a new namespace a different identity: the same key would be new work there', () => {
    const e = envelope({ kind: 'input', title: null, targetOperationId: OP, nativeThreadId: 'thread-1' })
    assert.notEqual(deriveIdentity(e, 'client:one').messageId, deriveIdentity(e, 'client:two').messageId)
  })
})

describe('the calls an operation maps to', () => {
  it('queues every input, and stops with stop:true', () => {
    const input = callFor(envelope({ kind: 'input', title: null, targetOperationId: OP, nativeThreadId: 't-1' }), 'env')
    assert.equal(input.tool, 't3_thread_send')
    assert.equal(input.args.mode, 'queue')
    const stop = callFor(
      envelope({ kind: 'stop', title: null, message: null, targetOperationId: OP, nativeThreadId: 't-1' }),
      'env',
    )
    assert.equal(stop.tool, 't3_thread_interrupt')
    assert.equal(stop.args.stop, true)
    const create = callFor(envelope(), 'env')
    assert.equal(create.args.clientRequestId, `sophia:${OP}`)
    assert.ok(T3_TOOLS.includes(create.tool))
  })
})

const ok = (body: unknown) => ({ kind: 'ok' as const, body })

describe('classifying a reply', () => {
  const e = envelope({ kind: 'input', title: null, targetOperationId: OP, nativeThreadId: 't-1' })
  const id = deriveIdentity(e, 'client:x')

  it('receives queued and started deliveries carrying the derived ids', () => {
    for (const delivery of ['queued', 'started']) {
      const a = classifyReply(e, id, ok({ threadId: 't-1', messageId: id.messageId, runId: 'r', delivery }))
      assert.equal(a.kind, 'received')
    }
  })

  it('keeps a steered or restarted delivery unknown: queue was asked', () => {
    for (const delivery of ['steered', 'restarted']) {
      const a = classifyReply(e, id, ok({ threadId: 't-1', messageId: id.messageId, runId: 'r', delivery }))
      assert.equal(a.kind, 'unknown')
    }
  })

  it('keeps a reply naming another message or thread unknown', () => {
    assert.equal(classifyReply(e, id, ok({ threadId: 't-1', messageId: 'other', delivery: 'queued' })).kind, 'unknown')
    assert.equal(
      classifyReply(e, id, ok({ threadId: 't-2', messageId: id.messageId, delivery: 'queued' })).kind,
      'unknown',
    )
  })

  it('rejects on a pre-dispatch failure code; anything else stays unknown', () => {
    assert.equal(classifyReply(e, id, { kind: 'failure', code: 'thread_not_sendable', message: 'm' }).kind, 'rejected')
    assert.equal(classifyReply(e, id, { kind: 'failure', code: 'orchestration_error', message: 'm' }).kind, 'unknown')
    assert.equal(classifyReply(e, id, { kind: 'failure', code: 'something_new', message: 'm' }).kind, 'unknown')
    assert.equal(classifyReply(e, id, { kind: 'transport_error', reason: 'reset' }).kind, 'unknown')
  })
})
