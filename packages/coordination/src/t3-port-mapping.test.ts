import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { checkEnvelope, digestOf, type RunnerEnvelope } from './runner-port.ts'
import {
  callFor,
  classifyReply,
  clientRequestIdOf,
  decodeThreadRead,
  deriveIdentity,
  launchCommandId,
  stableCommandId,
  stableMessageId,
  stopSettled,
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

/** A `runId` that is no run identity at the pin (RunId is a trimmed, non-blank string). Absent: the key is missing. */
const BAD_RUN_IDS: readonly [string, Record<string, unknown>][] = [
  ['missing', {}],
  ['a number', { runId: 19 }],
  ['an object', { runId: {} }],
  ['empty', { runId: '' }],
  ['blank', { runId: '   ' }],
]

/** One decodable read page of thread t-1 with these items. */
const page = (items: unknown[]) => ({
  thread: { threadId: 't-1', activeRunId: null, runCount: 0 },
  recentRuns: [],
  items,
  hasMore: false,
  nextPosition: null,
})

describe('a run identity is evidence only when it is one (integrated r3, F01)', () => {
  const input = envelope({ kind: 'input', title: null, targetOperationId: OP, nativeThreadId: 't-1' })
  const inputId = deriveIdentity(input, 'client:x')
  const create = envelope()
  const createId = deriveIdentity(create, 'client:x')
  const stop = envelope({ kind: 'stop', title: null, message: null, targetOperationId: OP, nativeThreadId: 't-1' })
  const stopId = deriveIdentity(stop, 'client:x')

  it("never receives an input whose send reply names no valid run, started or queued (null is not the pin's shape)", () => {
    for (const [what, run] of [...BAD_RUN_IDS, ['null', { runId: null }]] as const) {
      for (const delivery of ['started', 'queued']) {
        const a = classifyReply(input, inputId, ok({ threadId: 't-1', messageId: inputId.messageId, delivery, ...run }))
        assert.equal(a.kind, 'unknown', `${what}, ${delivery}`)
        assert.ok(a.kind === 'unknown' && a.violation === undefined, 'not a violated delivery: nothing proves one')
      }
    }
    const valid = classifyReply(
      input,
      inputId,
      ok({ threadId: 't-1', messageId: inputId.messageId, runId: 'run-7', delivery: 'started' }),
    )
    assert.deepEqual(valid, { kind: 'received', identity: inputId, runId: 'run-7', delivery: 'started' })
  })

  it('never receives a create whose launch reply names no run: Sophia always launches with a message', () => {
    for (const [what, run] of [...BAD_RUN_IDS, ['null', { runId: null }]] as const) {
      assert.equal(classifyReply(create, createId, ok({ threadId: createId.threadId, ...run })).kind, 'unknown', what)
    }
    assert.equal(classifyReply(create, createId, ok({ threadId: createId.threadId, runId: 'run-1' })).kind, 'received')
  })

  it("keeps a Stop's nullable run, but no malformed one", () => {
    const noRun = classifyReply(stop, stopId, ok({ threadId: 't-1', runId: null, status: 'no_active_run' }))
    assert.deepEqual(noRun, { kind: 'received', identity: stopId, runId: null, delivery: 'no_active_run' })
    const interrupted = classifyReply(
      stop,
      stopId,
      ok({ threadId: 't-1', runId: 'run-1', status: 'interrupt_requested' }),
    )
    assert.equal(interrupted.kind, 'received')
    for (const [what, run] of BAD_RUN_IDS) {
      assert.equal(
        classifyReply(stop, stopId, ok({ threadId: 't-1', status: 'interrupt_requested', ...run })).kind,
        'unknown',
        what,
      )
    }
  })

  it('decodes no page with a malformed run identity on any item, instead of turning it into null', () => {
    for (const [what, run] of BAD_RUN_IDS) {
      assert.ok('error' in decodeThreadRead(page([{ position: 0, messageId: 'm-1', ...run }]), 't-1'), what)
    }
    assert.ok(
      'error' in decodeThreadRead(page([{ position: 0, messageId: '  ', runId: null }]), 't-1'),
      'a blank message id',
    )
  })

  it("keeps the pin's nullable item shapes, and a matched null run stays null (no run)", () => {
    const read = decodeThreadRead(
      page([
        { position: 0, messageId: null, runId: null },
        { position: 1, messageId: 'm-1', runId: null },
        { position: 2, messageId: 'm-2', runId: 'run-2' },
      ]),
      't-1',
    )
    assert.ok(!('error' in read))
    assert.equal(read.messages.get('m-1'), null)
    assert.equal(read.messages.get('m-2'), 'run-2')
  })
})

describe('the v2 calls (INC01-CC-005, 0096): the pinned launch shapes, the instruction from the payload only', () => {
  const settings = {
    instanceId: 'codex',
    model: 'synthetic-model',
    options: [{ id: 'reasoningEffort', value: 'high' }],
  }
  const { message: _m, title: _t, ...common } = envelope()
  const v2 = (over: Record<string, unknown> = {}) =>
    ({
      ...common,
      v: 2,
      payloadSha256: 'a'.repeat(64),
      manifestSha256: 'c'.repeat(64),
      baseCommit: '0123456789abcdef0123456789abcdef01234567',
      writeScope: 'read_only',
      settings,
      ...over,
    }) as unknown as RunnerEnvelope

  it('launches with workspaceStrategy {type: worktree, baseRef} and modelSelection {instanceId, model, options}', () => {
    const call = callFor(v2(), 'env-1', { message: 'From the payload.', title: 'Its title' })
    assert.equal(call.tool, 't3_thread_launch')
    assert.deepEqual(call.args, {
      environmentId: 'env-1',
      projectId: 'project-sophia',
      title: 'Its title',
      message: 'From the payload.',
      runtimeMode: 'approval-required',
      workspaceStrategy: { type: 'worktree', baseRef: '0123456789abcdef0123456789abcdef01234567' },
      modelSelection: settings,
      clientRequestId: `sophia:${envelope().operationId}`,
    })
  })

  it('sends an input queued with its payload message only: t3_thread_send takes no selection or workspace', () => {
    const call = callFor(
      v2({ kind: 'input', targetOperationId: envelope().operationId, nativeThreadId: 'thread-1' }),
      'env-1',
      {
        message: 'A follow-up.',
        title: null,
      },
    )
    assert.deepEqual(call, {
      tool: 't3_thread_send',
      args: {
        environmentId: 'env-1',
        threadId: 'thread-1',
        message: 'A follow-up.',
        mode: 'queue',
        clientRequestId: `sophia:${envelope().operationId}`,
      },
    })
  })

  it('builds no v2 call without its checked payload', () => {
    assert.throws(() => callFor(v2(), 'env-1'), /checked payload/)
  })
})

/** A read of thread t-1: idle unless `active` is given, every run in `runs` visible (runCount matches). */
const readOf = (runs: unknown[], active: unknown = null, extra: Record<string, unknown> = {}) => ({
  thread: { threadId: 't-1', activeRunId: active, runCount: runs.length, ...extra },
  recentRuns: runs,
  items: [],
  hasMore: false,
  nextPosition: null,
})
describe('a recent or active run identity is evidence only when it is one (repair 9, NATIVE8-F01)', () => {
  const BLANKS: [string, string][] = [
    ['space', ' '],
    ['tab', '\t'],
    ['CRLF', '\r\n'],
    ['NBSP', '\u00a0'],
    ['em space', '\u2003'],
    ['BOM', '\ufeff'],
    ['empty', ''],
  ]
  const MALFORMED: [string, Record<string, unknown>][] = [
    ...BLANKS.map(([what, id]): [string, Record<string, unknown>] => [what, { runId: id }]),
    ['missing', {}],
    ['null', { runId: null }],
    ['a number', { runId: 7 }],
    ['an object', { runId: { id: 'run-1' } }],
  ]

  it('decodes no page whose recent run is named by anything but a run id, so no Stop settles on it', () => {
    const seen = MALFORMED.map(([what, id]) => {
      const read = decodeThreadRead(readOf([{ ...id, status: 'completed' }]), 't-1')
      return [what, 'error' in read ? 'no evidence' : `decoded; settled=${stopSettled(read)}`]
    })
    assert.deepEqual(
      seen,
      MALFORMED.map(([what]) => [what, 'no evidence']),
    )
  })

  it('decodes no page whose active run is named by anything but a run id; null stays the idle answer', () => {
    const run = { runId: 'run-1', status: 'completed' }
    const seen = [
      ...BLANKS.map(([what, id]) => [what, readOf([run], id)] as const),
      ['a number', readOf([run], 7)] as const,
      ['an object', readOf([run], { id: 'run-1' })] as const,
      ['missing key', { ...readOf([run]), thread: { threadId: 't-1', runCount: 1 } }] as const,
    ].map(([what, body]) => [what, 'error' in decodeThreadRead(body, 't-1') ? 'no evidence' : 'decoded'])
    assert.deepEqual(
      seen,
      seen.map(([what]) => [what, 'no evidence']),
    )
    const idle = decodeThreadRead(readOf([run], null), 't-1')
    assert.ok(!('error' in idle))
    assert.deepEqual(
      [idle.activeRunId, stopSettled(idle)],
      [null, true],
      'a null active run is idle, complete, settled',
    )
  })

  it('keeps legitimate opaque run ids exactly, with no trimming or UUID grammar (controls)', () => {
    const ids = ['opaque/run:\u{10400}', ' padded ', '0', 'run-\u00e9']
    const terminal = decodeThreadRead(readOf(ids.map((runId) => ({ runId, status: 'completed' }))), 't-1')
    assert.ok(!('error' in terminal))
    assert.deepEqual([...terminal.runs.keys()], ids)
    assert.equal(stopSettled(terminal), true, 'a complete, idle, terminal read of opaque ids settles')
    const active = decodeThreadRead(readOf([{ runId: ' padded ', status: 'running' }], ' padded '), 't-1')
    assert.ok(!('error' in active))
    assert.deepEqual([active.activeRunId, stopSettled(active)], [' padded ', false])
  })
})
