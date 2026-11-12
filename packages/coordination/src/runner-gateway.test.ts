import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { hostname, tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { FakeT3 } from './runner-fake-t3.ts'
import * as gatewayModule from './runner-gateway.ts'
import { RunnerGateway, type GatewayProfile } from './runner-gateway.ts'
import { RunnerJournal } from './runner-journal.ts'
import { canonicalJson } from './canonical.ts'
import {
  checkPayload,
  digestOf,
  sha256Hex,
  type RunnerAnswer,
  type RunnerEnvelope,
  type RunnerEnvelopeV2,
  type RunnerSourcePolicy,
} from './runner-port.ts'
import { deriveIdentity, stableMessageId, type T3Call, type T3Reply, type T3Transport } from './t3-port-mapping.ts'

const root = mkdtempSync(join(tmpdir(), 'sophia-runner-gateway-'))
after(() => rmSync(root, { recursive: true, force: true }))
let n = 0
const journalFile = () => join(root, `journal-${(n += 1)}.jsonl`)

const OWNER = '00000000-0000-4000-8000-0000000000b1'
const BINDING = '00000000-0000-4000-8000-0000000000d1'
const opId = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`

const profile: GatewayProfile = {
  ownerId: OWNER,
  environmentRef: 'env-owner-1',
  adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
  nativeProjectRefs: new Set(['project-sophia']),
  accountKey: 'claude:acct-1',
  profileId: 'read-only-v1',
  profileRevision: 1,
  operations: new Set(['create', 'input', 'stop'] as const),
}

const create = (i: number, over: Partial<RunnerEnvelope> = {}): RunnerEnvelope => ({
  v: 1,
  operationId: opId(i),
  kind: 'create',
  projectId: '00000000-0000-4000-8000-0000000000a1',
  ownerId: OWNER,
  resourceId: '00000000-0000-4000-8000-0000000000c1',
  bindingId: BINDING,
  goalId: '00000000-0000-4000-8000-0000000000e1',
  qualificationId: '00000000-0000-4000-8000-0000000000f1',
  qualificationRevision: 1,
  adapterPin: profile.adapterPin,
  environmentRef: profile.environmentRef,
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

const follow = (
  i: number,
  target: number,
  threadId: string,
  kind: 'input' | 'stop' = 'input',
  over: Partial<RunnerEnvelope> = {},
) =>
  create(i, {
    kind,
    title: null,
    message: kind === 'input' ? 'And the outbox boundary?' : null,
    targetOperationId: opId(target),
    nativeThreadId: threadId,
    ...over,
  })

function setup(
  { file = journalFile(), t3 = new FakeT3(), maxReadPages, hostProfile = profile } = {} as {
    file?: string
    t3?: FakeT3
    maxReadPages?: number
    hostProfile?: GatewayProfile
  },
) {
  const gateway = new RunnerGateway({
    journal: new RunnerJournal(file),
    transport: t3,
    profile: hostProfile,
    ...(maxReadPages ? { maxReadPages } : {}),
  })
  const id = (e: RunnerEnvelope) => ({ envelope: e, digest: digestOf(e), journalId: gateway.journalId })
  return {
    gateway,
    t3,
    file,
    send: (e: RunnerEnvelope) => gateway.send(e, digestOf(e), gateway.journalId),
    rec: (e: RunnerEnvelope) => gateway.reconcile(id(e)),
    obs: (e: RunnerEnvelope) => gateway.observe(id(e)),
  }
}

const threadOf = (a: RunnerAnswer): string => {
  assert.equal(a.kind, 'received')
  return a.kind === 'received' ? a.identity.threadId : ''
}
const runOf = (a: RunnerAnswer): string => (a.kind === 'received' && a.runId ? a.runId : '')

describe('the owner gateway sends once', () => {
  it('launches a create once; a replay answers from the journal without a call', async () => {
    const { send, t3 } = setup()
    const first = await send(create(1))
    assert.equal(first.kind, 'received')
    assert.deepEqual(await send(create(1)), first)
    assert.equal(t3.count('t3_thread_launch'), 1)
    assert.equal(t3.effects.launches, 1)
  })

  it('conflicts on the same id with another digest, and sends nothing', async () => {
    const { send, gateway, t3 } = setup()
    await send(create(2))
    const changed = create(2, { message: 'Something else.' })
    assert.equal((await gateway.send(changed, digestOf(changed), gateway.journalId)).kind, 'conflict')
    assert.equal(t3.calls.length, 1)
  })

  it('refuses a digest that does not bind the envelope', async () => {
    const { gateway, t3 } = setup()
    assert.equal((await gateway.send(create(3), 'f'.repeat(64), gateway.journalId)).kind, 'refused')
    assert.equal(t3.calls.length, 0)
  })

  it('refuses another owner, environment, pin, native project, account or profile before any call', async () => {
    const { send, t3 } = setup()
    const others: Partial<RunnerEnvelope>[] = [
      { ownerId: '00000000-0000-4000-8000-0000000000b2' },
      { environmentRef: 'env-other' },
      { adapterPin: '0'.repeat(40) },
      { nativeProjectRef: 'project-other' },
      { accountKey: 'claude:acct-2' },
      { profileId: 'read-only-v2' },
      { profileRevision: 2 },
    ]
    for (const [i, over] of others.entries())
      assert.equal((await send(create(10 + i, over))).kind, 'refused', JSON.stringify(over))
    const narrow = setup({ t3, hostProfile: { ...profile, operations: new Set(['create'] as const) } })
    assert.equal((await narrow.send(follow(19, 1, 'thread-x', 'stop'))).kind, 'refused')
    assert.equal(t3.calls.length, 0)
  })

  it('refuses a follow-up on a thread it did not create for this binding and lineage (R1-F07)', async () => {
    const { send, t3 } = setup()
    const thread = threadOf(await send(create(20)))
    assert.equal((await send(follow(21, 99, thread))).kind, 'refused', 'an unknown target operation')
    assert.equal((await send(follow(22, 20, 'some-other-thread'))).kind, 'refused', 'another thread')
    const lineage: Partial<RunnerEnvelope>[] = [
      { bindingId: '00000000-0000-4000-8000-0000000000d2' },
      { qualificationId: '00000000-0000-4000-8000-0000000000f2' },
      { qualificationRevision: 2 },
      { resourceId: '00000000-0000-4000-8000-0000000000c2' },
    ]
    for (const [i, over] of lineage.entries()) {
      assert.equal((await send(follow(23 + i, 20, thread, 'input', over))).kind, 'refused', JSON.stringify(over))
    }
    assert.equal(t3.count('t3_thread_send'), 0)
  })

  it('queues an input behind a busy run, and starts one on an idle thread', async () => {
    const { send, t3 } = setup()
    const thread = threadOf(await send(create(30)))
    const busy = await send(follow(31, 30, thread))
    assert.equal(busy.kind === 'received' && busy.delivery, 'queued')
    assert.equal(t3.calls.at(-1)?.args.mode, 'queue')
    for (const r of t3.threads.get(thread)?.runs ?? []) t3.finishRun(r.runId)
    const idle = await send(follow(32, 30, thread))
    assert.equal(idle.kind === 'received' && idle.delivery, 'started')
    assert.equal(t3.effects.messages, 2)
  })

  it('keeps a steered delivery unknown, even after a reconcile finds the message', async () => {
    const { send, rec, t3 } = setup()
    const thread = threadOf(await send(create(40)))
    t3.inject('t3_thread_send', { kind: 'deliver_as', delivery: 'steered' })
    const e = follow(41, 40, thread)
    const a = await send(e)
    assert.equal(a.kind, 'unknown')
    assert.deepEqual(await rec(e), a, 'a later read never turns the violation into a receipt')
  })

  it('rejects a typed pre-dispatch refusal; an internal error stays unknown', async () => {
    const { send, t3 } = setup()
    const thread = threadOf(await send(create(50)))
    t3.inject('t3_thread_send', { kind: 'failure', code: 'thread_not_sendable' })
    assert.equal((await send(follow(51, 50, thread))).kind, 'rejected')
    t3.inject('t3_thread_send', { kind: 'failure', code: 'orchestration_error' })
    assert.equal((await send(follow(52, 50, thread))).kind, 'unknown')
  })
})

describe('only the bound journal speaks, and it never proves no send (R1-F01, R2-F01)', () => {
  it('reconciles an accept whose answer was lost by its original identity, without a second send', async () => {
    const { send, rec, t3 } = setup()
    const thread = threadOf(await send(create(60)))
    t3.inject('t3_thread_send', { kind: 'lose_after_effect' })
    const e = follow(61, 60, thread)
    assert.equal((await send(e)).kind, 'unknown')
    assert.equal((await rec(e)).kind, 'received')
    assert.equal((await send(e)).kind, 'received', 'a replay answers from the journal')
    assert.equal(t3.count('t3_thread_send'), 1)
    assert.equal(t3.effects.messages, 1)
  })

  it('keeps one lost before any effect unknown and never sends it again', async () => {
    const { send, rec, t3 } = setup()
    const thread = threadOf(await send(create(70)))
    t3.inject('t3_thread_send', { kind: 'lose_before_effect' })
    const e = follow(71, 70, thread)
    await send(e)
    assert.equal((await rec(e)).kind, 'unknown')
    assert.equal((await send(e)).kind, 'unknown')
    assert.equal(t3.count('t3_thread_send'), 1)
    assert.equal(t3.effects.messages, 0)
  })

  it('answers unknown from a replacement journal of the same profile, and never sends again', async () => {
    const t3 = new FakeT3()
    const original = setup({ t3 })
    t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    const e = create(72)
    assert.equal((await original.send(e)).kind, 'unknown')
    const boundTo = original.gateway.journalId
    original.gateway.close()
    // A fresh, empty journal: same owner, environment, account and profile. It proves nothing about the original.
    const replacement = setup({ t3 })
    const asked = { envelope: e, digest: digestOf(e), journalId: boundTo }
    assert.equal((await replacement.gateway.reconcile(asked)).kind, 'unknown')
    assert.equal((await replacement.gateway.observe(asked)).kind, 'unknown')
    assert.equal((await replacement.gateway.send(e, digestOf(e), boundTo)).kind, 'unknown', 'bound to another journal')
    t3.renewSession('client:fake-session-2')
    assert.equal(
      (await replacement.gateway.send(e, digestOf(e), boundTo)).kind,
      'unknown',
      'not after a namespace change either',
    )
    assert.equal(t3.count('t3_thread_launch'), 1)
    assert.equal(t3.effects.launches, 1)
    replacement.gateway.close()
  })

  it('answers unknown from the same file emptied and recreated: a new journal id', async () => {
    const t3 = new FakeT3()
    const file = journalFile()
    const original = setup({ file, t3 })
    t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    const e = create(73)
    await original.send(e)
    const boundTo = original.gateway.journalId
    original.gateway.close()
    rmSync(file)
    const recreated = setup({ file, t3 })
    assert.notEqual(recreated.gateway.journalId, boundTo)
    assert.equal(
      (await recreated.gateway.reconcile({ envelope: e, digest: digestOf(e), journalId: boundTo })).kind,
      'unknown',
    )
    assert.equal(t3.effects.launches, 1)
    recreated.gateway.close()
  })

  it('never proves no send: no record, or an intent without its possible send, stays unknown and unsent (r3)', async () => {
    const file = journalFile()
    const journal = new RunnerJournal(file)
    const e = create(74)
    journal.append('intent', e.operationId, {
      digest: digestOf(e),
      envelope: e,
      identity: deriveIdentity(e, 'client:fake-session-1'),
    })
    const t3 = new FakeT3()
    const g = new RunnerGateway({ journal, transport: t3, profile })
    assert.equal((await g.reconcile({ envelope: e, digest: digestOf(e), journalId: g.journalId })).kind, 'unknown')
    const never = create(75)
    assert.equal(
      (await g.reconcile({ envelope: never, digest: digestOf(never), journalId: g.journalId })).kind,
      'unknown',
      'absence from the bound journal proves nothing',
    )
    assert.equal((await g.send(e, digestOf(e), g.journalId)).kind, 'unknown', 'an intent alone is never sent again')
    assert.equal(t3.calls.length, 0)
    g.close()
  })

  for (const [prefix, keep] of [
    ['header only', 1],
    ['intent only', 2],
  ] as const) {
    it(`stays unknown, never sent again under any namespace, from a restored ${prefix} prefix (r3, R2-F01)`, async () => {
      const t3 = new FakeT3()
      const file = journalFile()
      const original = setup({ file, t3 })
      t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
      const e = create(77)
      assert.equal((await original.send(e)).kind, 'unknown')
      const boundTo = original.gateway.journalId
      original.gateway.close()
      // The same file, restored to a valid earlier prefix of itself: same header, same journal id, every record valid.
      const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
      assert.equal(lines.length, 4, 'header, intent, possible send, unknown note')
      writeFileSync(file, `${lines.slice(0, keep).join('\n')}\n`)
      t3.renewSession('client:fake-session-2')
      const restored = setup({ file, t3 })
      assert.equal(restored.gateway.journalId, boundTo, 'the journal id survives the rollback')
      assert.equal((await restored.rec(e)).kind, 'unknown')
      assert.equal((await restored.obs(e)).kind, 'unknown')
      // Asked to SEND an operation it holds no record of, a gateway cannot tell a first send from a forgotten one. That
      // is never asked: Sophia's possible send is one-way (the worker DB test proves one launch through the service).
      // An intent alone is a record, so it is reconciled, never sent.
      if (keep === 2) assert.equal((await restored.send(e)).kind, 'unknown')
      assert.equal(t3.count('t3_thread_launch'), 1)
      assert.equal(t3.effects.launches, 1)
      restored.gateway.close()
    })
  }

  it('never resends after a restart with a possible send journaled', async () => {
    const file = journalFile()
    const journal = new RunnerJournal(file)
    const e = create(76)
    journal.append('intent', e.operationId, {
      digest: digestOf(e),
      envelope: e,
      identity: deriveIdentity(e, 'client:fake-session-1'),
    })
    journal.append('possible_send', e.operationId, {})
    journal.close()
    const { send, t3, gateway } = setup({ file })
    assert.equal((await send(e)).kind, 'unknown')
    assert.equal(t3.count('t3_thread_launch'), 0)
    gateway.close()
  })

  it('reads back by the original namespace after the session is renewed', async () => {
    const { send, rec, t3 } = setup()
    const thread = threadOf(await send(create(80)))
    t3.inject('t3_thread_send', { kind: 'lose_after_effect' })
    const e = follow(81, 80, thread)
    await send(e)
    t3.renewSession('client:fake-session-2')
    const r = await rec(e)
    assert.equal(r.kind === 'received' && r.identity.namespace, 'client:fake-session-1')
    assert.equal(t3.effects.messages, 1)
  })

  it('stays unknown when the message is past the bounded pages', async () => {
    const { send, rec, t3 } = setup({ maxReadPages: 1 })
    const thread = threadOf(await send(create(90)))
    for (let i = 0; i < 3; i++) await send(follow(91 + i, 90, thread))
    t3.pageSize = 2
    t3.inject('t3_thread_send', { kind: 'lose_after_effect' })
    const e = follow(95, 90, thread)
    await send(e)
    assert.equal((await rec(e)).kind, 'unknown')
  })

  it('answers a received operation from disk after a restart, with no call', async () => {
    const first = setup()
    const e = create(110)
    const a = await first.send(e)
    first.gateway.close()
    const again = setup({ file: first.file })
    assert.deepEqual(await again.send(e), a)
    assert.equal(again.t3.calls.length, 0)
    again.gateway.close()
  })
})

describe('settlement is proven, never inferred (R1-F04)', () => {
  async function stoppedWorld() {
    const w = setup()
    const created = await w.send(create(120))
    const thread = threadOf(created)
    const stop = follow(121, 120, thread, 'stop')
    return { ...w, thread, stop, created }
  }

  it('keeps a stop acknowledgement apart from settlement while the run still runs', async () => {
    const w = await stoppedWorld()
    const ack = await w.send(w.stop)
    assert.equal(ack.kind === 'received' && ack.delivery, 'stop_requested')
    assert.equal((await w.obs(w.stop)).kind, 'unknown', "T3's settled flag is set by the fake, and ignored")
    for (const r of w.t3.threads.get(w.thread)?.runs ?? []) w.t3.finishRun(r.runId, 'interrupted')
    assert.equal((await w.obs(w.stop)).kind, 'no_active_run')
  })

  it('never settles a lost stop from a malformed or a foreign read', async () => {
    const w = await stoppedWorld()
    w.t3.inject('t3_thread_interrupt', { kind: 'lose_after_effect' })
    assert.equal((await w.send(w.stop)).kind, 'unknown')
    for (const r of w.t3.threads.get(w.thread)?.runs ?? []) w.t3.finishRun(r.runId, 'interrupted')
    w.t3.inject('t3_thread_read', { kind: 'malformed_read' })
    assert.equal((await w.rec(w.stop)).kind, 'unknown', 'ok:{} is no evidence')
    w.t3.inject('t3_thread_read', { kind: 'foreign_read' })
    assert.equal((await w.rec(w.stop)).kind, 'unknown', 'another thread is no evidence')
    assert.equal((await w.rec(w.stop)).kind, 'settled', 'a complete read of the exact thread is')
  })

  it('never settles a lost stop while a run is active, or queued and held', async () => {
    const w = await stoppedWorld()
    await w.send(follow(122, 120, w.thread))
    w.t3.inject('t3_thread_interrupt', { kind: 'lose_after_effect' })
    await w.send(w.stop)
    assert.equal((await w.rec(w.stop)).kind, 'unknown', 'running')
    const runs = w.t3.threads.get(w.thread)?.runs ?? []
    w.t3.finishRun(runs[0]?.runId ?? '', 'interrupted')
    for (const r of runs.slice(1)) r.status = 'queued'
    assert.equal((await w.rec(w.stop)).kind, 'unknown', 'a held queued run is unsettled, though T3 says no active run')
  })

  it('never settles from a run list cut off by runLimit, nor from an unknown status', async () => {
    const w = await stoppedWorld()
    for (let i = 0; i < 55; i++) await w.send(follow(130 + i, 120, w.thread))
    for (const r of w.t3.threads.get(w.thread)?.runs ?? []) w.t3.finishRun(r.runId, 'completed')
    assert.equal((await w.send(w.stop)).kind, 'received')
    assert.equal((await w.obs(w.stop)).kind, 'unknown', '56 runs, at most 50 in the read: not every run is visible')
    const second = await stoppedWorld()
    await second.send(second.stop)
    for (const r of second.t3.threads.get(second.thread)?.runs ?? []) r.status = 'paused_by_operator'
    assert.equal((await second.obs(second.stop)).kind, 'unknown', 'a status this mapping does not know')
  })

  it("observes a create's own run terminal only from a read that shows it", async () => {
    const w = setup()
    const e = create(190)
    const a = await w.send(e)
    assert.deepEqual(await w.obs(e), { kind: 'run', status: 'running', terminal: false })
    w.t3.inject('t3_thread_read', { kind: 'malformed_read' })
    assert.equal((await w.obs(e)).kind, 'unknown')
    w.t3.finishRun(runOf(a))
    assert.deepEqual(await w.obs(e), { kind: 'run', status: 'completed', terminal: true })
  })
})

/** A run identity that is none at the pin; `missing` omits the key. */
const BAD_RUNS: readonly [string, Record<string, unknown>][] = [
  ['missing', {}],
  ['null', { runId: null }],
  ['a number', { runId: 19 }],
  ['an object', { runId: {} }],
  ['empty', { runId: '' }],
  ['blank', { runId: '   ' }],
]

/**
 * A transport that holds one send in transit (it lands only on release, exactly once) and, meanwhile, forges either
 * the send's own reply or a read item naming the held message, with a given run field. Integrated r3, F01.
 */
class ForgingT3 implements T3Transport {
  holdNextSend = false
  forgedSendRun: Record<string, unknown> | null = null
  forgedReadRun: Record<string, unknown> | null = null
  private readonly held: { call: T3Call; messageId: string }[] = []
  readonly fake: FakeT3
  constructor(fake: FakeT3) {
    this.fake = fake
  }
  namespace(): string {
    return this.fake.namespace()
  }
  async call(call: T3Call): Promise<T3Reply> {
    if (call.tool === 't3_thread_send' && this.holdNextSend) {
      this.holdNextSend = false
      const messageId = stableMessageId(this.fake.namespace(), 'thread-send', String(call.args.clientRequestId))
      this.held.push({ call, messageId })
      if (!this.forgedSendRun) return { kind: 'transport_error', reason: 'fake: still in transit' }
      return {
        kind: 'ok',
        body: {
          threadId: call.args.threadId,
          messageId,
          status: 'running',
          delivery: 'started',
          ...this.forgedSendRun,
        },
      }
    }
    const reply = await this.fake.call(call)
    const held = this.held[0]
    if (call.tool !== 't3_thread_read' || !this.forgedReadRun || !held || reply.kind !== 'ok') return reply
    const body = reply.body as { items: unknown[] }
    return {
      kind: 'ok',
      body: { ...body, items: [...body.items, { position: 900, messageId: held.messageId, ...this.forgedReadRun }] },
    }
  }
  /** Stop forging and deliver the held request now, once. */
  async release(): Promise<number> {
    this.forgedSendRun = null
    this.forgedReadRun = null
    const landing = this.held.splice(0)
    for (const h of landing) await this.fake.call(h.call)
    return landing.length
  }
}

describe('a missing or malformed run identity is never a receipt (integrated r3, F01)', () => {
  async function inTransit(forge: (t: ForgingT3) => void) {
    const fake = new FakeT3()
    const forging = new ForgingT3(fake)
    const g = new RunnerGateway({ journal: new RunnerJournal(journalFile()), transport: forging, profile })
    const thread = threadOf(await g.send(create(300), digestOf(create(300)), g.journalId))
    forging.holdNextSend = true
    forge(forging)
    const e = follow(301, 300, thread)
    return { g, fake, forging, e, first: await g.send(e, digestOf(e), g.journalId) }
  }

  for (const [what, run] of BAD_RUNS) {
    it(`direct: a send reply with its runId ${what} is unknown, journaled as no receipt, and reconciled after it lands`, async () => {
      const t = await inTransit((f) => {
        f.forgedSendRun = run
      })
      assert.equal(t.first.kind, 'unknown')
      assert.equal(t.first.kind === 'unknown' && t.first.violation, undefined)
      const id = { envelope: t.e, digest: digestOf(t.e), journalId: t.g.journalId }
      assert.equal((await t.g.reconcile(id)).kind, 'unknown', 'not landed yet: nothing to find')
      assert.equal(await t.forging.release(), 1)
      const landed = await t.g.reconcile(id)
      assert.equal(landed.kind, 'received')
      assert.ok(landed.kind === 'received' && typeof landed.runId === 'string' && landed.runId.length > 0)
      assert.equal(t.fake.effects.messages, 1)
      t.g.close()
    })

    it(`reconcile: a read naming the exact message with its runId ${what} proves no accepted run`, async () => {
      const t = await inTransit((f) => {
        f.forgedReadRun = run
      })
      assert.equal(t.first.kind, 'unknown')
      const id = { envelope: t.e, digest: digestOf(t.e), journalId: t.g.journalId }
      assert.equal((await t.g.reconcile(id)).kind, 'unknown')
      assert.equal((await t.g.reconcile(id)).kind, 'unknown', 'and nothing was journaled as received')
      assert.equal(await t.forging.release(), 1)
      const landed = await t.g.reconcile(id)
      assert.equal(landed.kind, 'received')
      assert.ok(landed.kind === 'received' && typeof landed.runId === 'string' && landed.runId.trim().length > 0)
      assert.equal(t.fake.effects.messages, 1)
      t.g.close()
    })
  }

  it('checks every receipt itself: a separately constructed answer without a valid run never passes the gateway', () => {
    const check = (gatewayModule as Record<string, unknown>).receiptError
    assert.equal(typeof check, 'function', 'the gateway has its own receipt check')
    const receiptError = check as (kind: string, answer: RunnerAnswer) => string | null
    const identity = deriveIdentity(create(310), 'client:x')
    const received = (runId: unknown, delivery = 'started') =>
      ({ kind: 'received', identity, runId, delivery }) as unknown as RunnerAnswer
    for (const kind of ['create', 'input']) {
      for (const bad of [null, undefined, '', '  ', 19, {}])
        assert.notEqual(receiptError(kind, received(bad)), null, `${kind} ${JSON.stringify(bad) ?? 'undefined'}`)
      assert.equal(receiptError(kind, received('run-1')), null)
    }
    assert.equal(receiptError('stop', received(null, 'no_active_run')), null)
    assert.equal(receiptError('stop', received('run-1', 'stop_requested')), null)
    for (const bad of [undefined, '', '  ', 19, {}])
      assert.notEqual(receiptError('stop', received(bad, 'stop_requested')), null)
    assert.equal(receiptError('input', { kind: 'unknown', identity, reason: 'r' }), null, 'only receipts are checked')
  })

  it('never answers from a journal whose receipt names no run (written before this check): it stays unknown', async () => {
    const file = journalFile()
    const journal = new RunnerJournal(file)
    const e = create(330)
    const identity = deriveIdentity(e, 'client:fake-session-1')
    journal.append('intent', e.operationId, { digest: digestOf(e), envelope: e, identity })
    journal.append('possible_send', e.operationId, {})
    journal.append('answer', e.operationId, {
      answer: { kind: 'received', identity, runId: null, delivery: 'started' },
    })
    const g = new RunnerGateway({ journal, transport: new FakeT3(), profile })
    assert.equal((await g.reconcile({ envelope: e, digest: digestOf(e), journalId: g.journalId })).kind, 'unknown')
    assert.equal((await g.send(e, digestOf(e), g.journalId)).kind, 'unknown')
    g.close()
  })

  it('a create answered with no run is unknown, never a receipt', async () => {
    const fake = new FakeT3()
    const forged: T3Transport = {
      namespace: () => fake.namespace(),
      call: async (call) => {
        if (call.tool !== 't3_thread_launch') return fake.call(call)
        const reply = await fake.call(call)
        return reply.kind === 'ok' ? { kind: 'ok', body: { ...(reply.body as object), runId: null } } : reply
      },
    }
    const g = new RunnerGateway({ journal: new RunnerJournal(journalFile()), transport: forged, profile })
    const e = create(320)
    assert.equal((await g.send(e, digestOf(e), g.journalId)).kind, 'unknown')
    const r = await g.reconcile({ envelope: e, digest: digestOf(e), journalId: g.journalId })
    assert.equal(r.kind, 'received', 'reconciled by its exact message, which the read shows with its run')
    assert.equal(fake.effects.launches, 1)
    g.close()
  })
})

// ---- source authority (INC01-CC-005, 0096): v2 sends with a hash-checked payload ----

const POLICY: RunnerSourcePolicy = {
  v: 1,
  instanceId: 'claudeAgent',
  models: [{ model: 'synthetic-model', options: [{ id: 'effort', values: ['low', 'high'] }] }],
}
const SETTINGS = { instanceId: 'claudeAgent', model: 'synthetic-model', options: [{ id: 'effort', value: 'high' }] }
const BASE = '0123456789abcdef0123456789abcdef01234567'
const sourced: GatewayProfile = { ...profile, sourcePolicy: POLICY }
const bodyOf = (message: string, title: string | null) => canonicalJson({ message, title })

/** A v2 create (or input) and its payload: the content-free envelope and the canonical instruction beside it. */
function v2(i: number, kind: 'create' | 'input', over: Record<string, unknown> = {}, title: string | null = 'A title') {
  const payload = bodyOf(
    kind === 'create' ? 'A private instruction.' : 'A private follow-up.',
    kind === 'create' ? title : null,
  )
  const { message: _m, title: _t, ...common } = create(i)
  const envelope = {
    ...common,
    v: 2,
    kind,
    payloadSha256: sha256Hex(payload),
    manifestSha256: 'c'.repeat(64),
    baseCommit: BASE,
    writeScope: 'read_only',
    settings: SETTINGS,
    ...over,
  } as unknown as RunnerEnvelope
  return { envelope, payload }
}
const sendV2 = (g: RunnerGateway, e: RunnerEnvelope, payload?: string) => g.send(e, digestOf(e), g.journalId, payload)

describe('source authority at the gateway (0096)', () => {
  it('sends a v2 create with its payload, base and settings, journals no body, and answers a replay without one', async () => {
    const { gateway, t3, file } = setup({ hostProfile: sourced })
    const { envelope, payload } = v2(1, 'create')
    const first = await sendV2(gateway, envelope, payload)
    assert.equal(first.kind, 'received')
    const launch = t3.calls.find((c) => c.tool === 't3_thread_launch')
    assert.deepEqual(
      [launch?.args.message, launch?.args.title, launch?.args.workspaceStrategy, launch?.args.modelSelection],
      ['A private instruction.', 'A title', { type: 'worktree', baseRef: BASE }, SETTINGS],
    )
    assert.equal(readFileSync(file, 'utf8').includes('A private instruction'), false)
    assert.deepEqual(await sendV2(gateway, envelope), first, 'a replay needs no payload and sends nothing')
    assert.equal(t3.count('t3_thread_launch'), 1)
    // An input of the same lineage, with its own payload.
    const input = v2(2, 'input', { targetOperationId: opId(1), nativeThreadId: threadOf(first) })
    assert.equal((await sendV2(gateway, input.envelope, input.payload)).kind, 'received')
    assert.equal(t3.calls.find((c) => c.tool === 't3_thread_send')?.args.message, 'A private follow-up.')
  })

  it('refuses before intent: no payload, an altered one, no declared policy, settings outside it', async () => {
    const cases: [GatewayProfile, (e: RunnerEnvelope, p: string) => [RunnerEnvelope, string | undefined], RegExp][] = [
      [sourced, (e) => [e, undefined], /needs its payload/],
      [sourced, (e, p) => [e, p.replace('private', 'public')], /does not match its digest/],
      [profile, (e, p) => [e, p], /no source policy/],
      [
        {
          ...sourced,
          sourcePolicy: {
            ...POLICY,
            models: [{ model: 'synthetic-model', options: [{ id: 'effort', values: ['low'] }] }],
          },
        },
        (e, p) => [e, p],
        /not declared/,
      ],
    ]
    for (const [hostProfile, alter, reason] of cases) {
      const { gateway, t3, file } = setup({ hostProfile })
      const { envelope, payload } = v2(1, 'create')
      const [e, p] = alter(envelope, payload)
      const answer = await sendV2(gateway, e, p)
      assert.equal(answer.kind, 'refused')
      assert.match(answer.kind === 'refused' ? answer.reason : '', reason)
      assert.equal(t3.calls.length, 0)
      const types = readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => (JSON.parse(l) as { type: string }).type)
      assert.deepEqual(types, ['header', 'refused'], 'nothing journaled as possibly sent')
    }
  })

  it('never lets a binding change version, base or settings through a follow-up', async () => {
    // A v1 binding takes no v2 input; a v2 binding takes no v1 input, and no input of another base or settings.
    const legacy = setup({ hostProfile: sourced })
    const t1 = threadOf(await legacy.send(create(1)))
    const onV1 = v2(2, 'input', { targetOperationId: opId(1), nativeThreadId: t1 })
    assert.match(JSON.stringify(await sendV2(legacy.gateway, onV1.envelope, onV1.payload)), /another envelope version/)
    const { gateway, t3 } = setup({ hostProfile: sourced })
    const created = v2(1, 'create')
    const thread = threadOf(await sendV2(gateway, created.envelope, created.payload))
    const v1Input = follow(2, 1, thread)
    assert.match(JSON.stringify(await sendV2(gateway, v1Input)), /another envelope version/)
    const moved = v2(3, 'input', { targetOperationId: opId(1), nativeThreadId: thread, baseCommit: 'f'.repeat(40) })
    assert.match(
      JSON.stringify(await sendV2(gateway, moved.envelope, moved.payload)),
      /another base, scope or settings/,
    )
    assert.equal(t3.count('t3_thread_send'), 0)
    // A Stop stays v1 on either binding.
    assert.equal((await sendV2(gateway, follow(4, 1, thread, 'stop'))).kind, 'received')
  })
})

// ---- repair 1 (CC005-E7-F01): nothing a native runner says becomes a durable diagnostic ----

const SECRET_MESSAGE = 'SECRET-INSTRUCTION-7f3a'
const SECRET_TITLE = 'SECRET-TITLE-9b1c'
type Echo = 'failure' | 'failure_code' | 'transport' | 'throw' | 'delivery' | 'read_failure'

const textOf = (v: unknown) => (typeof v === 'string' ? v : '')

/** A FakeT3 that echoes the call's instruction and title through one untrusted diagnostic field of its reply. */
class EchoT3 extends FakeT3 {
  mode: Echo | null = null
  override async call(call: T3Call): Promise<T3Reply> {
    const echo = `${textOf(call.args.title)} ${textOf(call.args.message)} ${SECRET_MESSAGE}`
    const send = call.tool === 't3_thread_launch' || call.tool === 't3_thread_send'
    if (this.mode === 'read_failure' && call.tool === 't3_thread_read')
      return { kind: 'failure', code: echo, message: echo }
    if (!send || this.mode === null || this.mode === 'read_failure') return super.call(call)
    if (this.mode === 'failure') return { kind: 'failure', code: 'invalid_request', message: echo }
    if (this.mode === 'failure_code') return { kind: 'failure', code: echo, message: echo }
    if (this.mode === 'transport') return { kind: 'transport_error', reason: echo }
    if (this.mode === 'throw') throw new Error(echo)
    const reply = await super.call(call)
    return reply.kind === 'ok'
      ? { kind: 'ok', body: { ...(reply.body as object), delivery: echo, status: echo } }
      : reply
  }
}

const leaks = (text: string) => text.includes(SECRET_MESSAGE) || text.includes(SECRET_TITLE)

describe('diagnostics are fixed and content-free (repair 1, CC005-E7-F01)', () => {
  const secretV2 = (i: number, kind: 'create' | 'input', over: Record<string, unknown> = {}) => {
    const payload = bodyOf(SECRET_MESSAGE, kind === 'create' ? SECRET_TITLE : null)
    const { message: _m, title: _t, ...common } = create(i)
    const envelope = {
      ...common,
      v: 2,
      kind,
      payloadSha256: sha256Hex(payload),
      manifestSha256: 'c'.repeat(64),
      baseCommit: BASE,
      writeScope: 'read_only',
      settings: SETTINGS,
      ...over,
    } as unknown as RunnerEnvelope
    return { envelope, payload }
  }

  for (const mode of ['failure', 'failure_code', 'transport', 'throw'] as const) {
    it(`keeps a ${mode} that echoes the instruction out of the answer, the journal and a restart's reconcile`, async () => {
      const t3 = new EchoT3()
      t3.mode = mode
      const file = journalFile()
      const { gateway } = setup({ hostProfile: sourced, t3, file })
      const { envelope, payload } = secretV2(1, 'create')
      const answer = await sendV2(gateway, envelope, payload)
      assert.notEqual(answer.kind, 'received')
      assert.equal(leaks(JSON.stringify(answer)), false, JSON.stringify(answer))
      gateway.close()
      const restarted = setup({ hostProfile: sourced, t3, file }).gateway
      const again = await restarted.reconcile({ envelope, digest: digestOf(envelope), journalId: restarted.journalId })
      assert.equal(leaks(JSON.stringify(again)), false, JSON.stringify(again))
      restarted.close()
      assert.equal(leaks(readFileSync(file, 'utf8')), false, 'nothing of it in the journal')
    })
  }

  it('keeps an echoed delivery, and a read failure that echoes it, out of every answer and the journal', async () => {
    const t3 = new EchoT3()
    const file = journalFile()
    const { gateway } = setup({ hostProfile: sourced, t3, file })
    const created = secretV2(1, 'create')
    const thread = threadOf(await sendV2(gateway, created.envelope, created.payload))
    t3.mode = 'delivery'
    const input = secretV2(2, 'input', { targetOperationId: opId(1), nativeThreadId: thread })
    const answer = await sendV2(gateway, input.envelope, input.payload)
    assert.equal(answer.kind, 'unknown')
    assert.equal(leaks(JSON.stringify(answer)), false, JSON.stringify(answer))
    t3.mode = 'read_failure'
    const observed = await gateway.observe({
      envelope: created.envelope,
      digest: digestOf(created.envelope),
      journalId: gateway.journalId,
    })
    assert.equal(leaks(JSON.stringify(observed)), false, JSON.stringify(observed))
    assert.equal(leaks(readFileSync(file, 'utf8')), false)
  })
})

// ---- repair 1 (CC005-E7-F03): a character is a code point, as the admission counts it ----

describe('message and title limits count characters as code points (repair 1, CC005-E7-F03)', () => {
  const rocket = '\u{1F680}'
  const withText = (message: string, title: string | null, kind: 'create' | 'input' = 'create') => {
    const payload = bodyOf(message, kind === 'create' ? title : null)
    const { message: _m, title: _t, ...common } = create(1)
    const envelope = {
      ...common,
      v: 2,
      kind,
      payloadSha256: sha256Hex(payload),
      manifestSha256: 'c'.repeat(64),
      baseCommit: BASE,
      writeScope: 'read_only',
      settings: SETTINGS,
      ...(kind === 'input' ? { targetOperationId: opId(9), nativeThreadId: 't' } : {}),
    } as unknown as RunnerEnvelopeV2
    return { envelope, payload }
  }
  it('admits 8000 supplementary characters and a 120-character title; refuses 8001 and 121', () => {
    for (const [message, title, ok] of [
      [rocket.repeat(8000), rocket.repeat(120), true],
      [`a${rocket}`.repeat(4000), `b${rocket}`.repeat(60), true],
      [rocket.repeat(8001), 'T', false],
      ['m', rocket.repeat(121), false],
    ] as const) {
      const { envelope, payload } = withText(message, title)
      assert.equal(checkPayload(envelope, payload).ok, ok, `${message.length}/${title.length} UTF-16 units`)
    }
    const input = withText(rocket.repeat(8000), null, 'input')
    assert.equal(checkPayload(input.envelope, input.payload).ok, true)
  })
})

// ---- repair 5 (INC01-CC-005-repair4-SOURCE-FINAL-001, NATIVE4-F01): the journal's private path ----
// Temporary synthetic files only, under this file's own mkdtemp root. Every case goes through the actual journal, the
// gateway's send and FakeT3: a refused journal must leave no native call and its target's bytes and mode untouched.

/** A fresh directory of this test's own (mkdtemp: 0700, this uid). */
const place = () => mkdtempSync(join(root, 'path-'))
const modeOf = (p: string) => statSync(p).mode & 0o7777
const bytesOf = (p: string) => (existsSync(p) ? readFileSync(p).toString('base64') : null)
/** A valid journal written and closed at `file` (0600, private). */
function validJournal(file: string): string {
  const j = new RunnerJournal(file)
  const id = j.id
  j.close()
  return id
}
/** Open the journal at `file`, build the gateway over it and send one create: what reaches FakeT3, or the refusal. */
async function sendThrough(file: string, i = 900) {
  const t3 = new FakeT3()
  let journal: RunnerJournal | null = null
  try {
    journal = new RunnerJournal(file)
    const gateway = new RunnerGateway({ journal, transport: t3, profile })
    const e = create(i)
    const answer = await gateway.send(e, digestOf(e), gateway.journalId)
    return { refused: null as unknown, answer, t3 }
  } catch (err) {
    return { refused: err, answer: null, t3 }
  } finally {
    journal?.close()
  }
}
const UNSAFE = /runner journal path is unsafe/

describe("the journal's path is private before anything is read or written (repair 5, NATIVE4-F01)", () => {
  const cases: [string, (dir: string, file: string) => string][] = [
    ...[0o644, 0o640, 0o660, 0o604].map((mode): [string, (dir: string, file: string) => string] => [
      `an existing empty journal of mode ${mode.toString(8)}`,
      (_dir, file) => {
        writeFileSync(file, '', { mode })
        chmodSync(file, mode)
        return file
      },
    ]),
    [
      'an existing valid journal made 0644',
      (_dir, file) => {
        validJournal(file)
        chmodSync(file, 0o644)
        return file
      },
    ],
    [
      'a torn 0640 journal (its torn line must not be cut)',
      (_dir, file) => {
        validJournal(file)
        appendFileSync(file, '{"seq":1,"type":"inte')
        chmodSync(file, 0o640)
        return file
      },
    ],
    [
      'a second hard link to a valid 0600 journal',
      (dir, file) => {
        const other = join(dir, 'other.jsonl')
        validJournal(other)
        linkSync(other, file)
        return other
      },
    ],
    [
      'a symlink to an empty 0600 file',
      (dir, file) => {
        const target = join(dir, 'target')
        writeFileSync(target, '', { mode: 0o600 })
        symlinkSync(target, file)
        return target
      },
    ],
    [
      'a symlink to a valid 0600 journal',
      (dir, file) => {
        const target = join(dir, 'target.jsonl')
        validJournal(target)
        symlinkSync(target, file)
        return target
      },
    ],
    [
      'a symlink to a torn non-JSON 0600 file (never truncated)',
      (dir, file) => {
        const target = join(dir, 'target')
        writeFileSync(target, 'not a journal, no newline', { mode: 0o600 })
        symlinkSync(target, file)
        return target
      },
    ],
    [
      'a dangling symlink (its target is never created)',
      (dir, file) => {
        const target = join(dir, 'missing')
        symlinkSync(target, file)
        return target
      },
    ],
  ]
  for (const [name, make] of cases) {
    it(`refuses ${name}: no native call, the target unchanged, the lock released`, async () => {
      const dir = place()
      const file = join(dir, 'journal.jsonl')
      const target = make(dir, file)
      const before = { bytes: bytesOf(target), mode: existsSync(target) ? modeOf(target) : null }
      const r = await sendThrough(file)
      assert.match(String(r.refused), UNSAFE)
      assert.equal(r.answer, null)
      assert.equal(r.t3.calls.length, 0, 'no native call')
      assert.deepEqual({ bytes: bytesOf(target), mode: existsSync(target) ? modeOf(target) : null }, before)
      assert.equal(existsSync(`${file}.lock`), false, 'the lock is released')
    })
  }

  for (const mode of [0o777, 0o770, 0o757]) {
    it(`refuses a directory others can write (${mode.toString(8)}) before creating anything in it`, async () => {
      const dir = place()
      chmodSync(dir, mode)
      const file = join(dir, 'journal.jsonl')
      const r = await sendThrough(file)
      assert.match(String(r.refused), UNSAFE)
      assert.equal(r.t3.calls.length, 0)
      assert.equal(existsSync(file), false, 'no journal created')
      assert.equal(existsSync(`${file}.lock`), false, 'no lock created')
      assert.equal(modeOf(dir), mode, 'the directory is not chmodded')
    })
  }

  for (const [mode, refused] of [
    [0o777, true],
    [0o1777, false],
  ] as const) {
    it(`${refused ? 'refuses' : 'opens (control)'} a private directory under an ancestor of mode ${mode.toString(8)}`, async () => {
      const outer = place()
      chmodSync(outer, mode)
      const dir = join(outer, 'inner')
      mkdirSync(dir, { mode: 0o700 })
      const file = join(dir, 'journal.jsonl')
      const r = await sendThrough(file)
      if (refused) {
        assert.match(String(r.refused), UNSAFE)
        assert.equal(r.t3.calls.length, 0)
        assert.equal(existsSync(file), false)
        assert.equal(existsSync(`${file}.lock`), false)
      } else {
        assert.equal(r.refused, null)
        assert.equal(r.t3.effects.launches, 1)
      }
    })
  }

  it('refuses a symlinked lock file as unreadable, never presumed stale, and leaves its target alone', async () => {
    const dir = place()
    const file = join(dir, 'journal.jsonl')
    validJournal(file)
    const target = join(dir, 'lock-target')
    // What a stale lock of this host would hold: followed, it would be recovered over.
    writeFileSync(target, JSON.stringify({ pid: 2 ** 22 + 7, host: hostname(), start: null, token: 't' }), {
      mode: 0o600,
    })
    symlinkSync(target, `${file}.lock`)
    const before = bytesOf(target)
    const r = await sendThrough(file)
    assert.match(String(r.refused), /cannot be read/)
    assert.equal(r.t3.calls.length, 0)
    assert.equal(bytesOf(target), before)
    assert.equal(lstatSync(`${file}.lock`).isSymbolicLink(), true, 'not recovered over')
  })

  for (const how of ['a same-length 0644 copy', 'a symlink to a same-length 0644 copy'] as const) {
    it(`fails closed when, after opening, the path is replaced by ${how}: nothing written to either file`, async () => {
      const dir = place()
      const file = join(dir, 'journal.jsonl')
      const t3 = new FakeT3()
      const journal = new RunnerJournal(file)
      const gateway = new RunnerGateway({ journal, transport: t3, profile })
      try {
        const first = create(910)
        assert.equal((await gateway.send(first, digestOf(first), gateway.journalId)).kind, 'received')
        const moved = join(dir, 'moved.jsonl')
        const copy = join(dir, 'copy.jsonl')
        renameSync(file, moved)
        writeFileSync(copy, readFileSync(moved), { mode: 0o644 })
        if (how === 'a same-length 0644 copy') renameSync(copy, file)
        else symlinkSync(copy, file)
        const replacement = how === 'a same-length 0644 copy' ? file : copy
        const before = { moved: bytesOf(moved), replacement: bytesOf(replacement) }
        const second = create(911)
        await assert.rejects(gateway.send(second, digestOf(second), gateway.journalId), UNSAFE)
        assert.equal(t3.effects.launches, 1, 'no second native launch')
        assert.deepEqual({ moved: bytesOf(moved), replacement: bytesOf(replacement) }, before)
      } finally {
        journal.close()
      }
    })
  }

  it('creates a fresh private journal (0700 directory, 0600 file) and sends once (control)', async () => {
    const file = join(place(), 'nested', 'journal.jsonl')
    const r = await sendThrough(file)
    assert.equal(r.refused, null)
    assert.equal(r.answer?.kind, 'received')
    assert.equal(r.t3.effects.launches, 1)
    assert.equal(modeOf(file), 0o600)
    assert.equal(modeOf(join(file, '..')), 0o700)
  })

  it('reopens a valid 0600 journal in a 0755 directory of its owner, and recovers its torn line (control)', async () => {
    const dir = place()
    chmodSync(dir, 0o755)
    const file = join(dir, 'journal.jsonl')
    const id = validJournal(file)
    appendFileSync(file, '{"seq":1,"type":"inte')
    const r = await sendThrough(file)
    assert.equal(r.refused, null)
    assert.equal(r.answer?.kind, 'received')
    assert.equal(r.t3.effects.launches, 1)
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n')
    assert.equal((JSON.parse(lines[0] ?? '{}') as { journalId?: string }).journalId, id, 'the same durable identity')
    assert.equal(
      lines.some((l) => l.includes('"inte"') || l.endsWith('"inte')),
      false,
      'the torn line was cut',
    )
    assert.equal(modeOf(file), 0o600)
  })

  it('still refuses a complete malformed 0600 journal, unchanged (control)', async () => {
    const dir = place()
    const file = join(dir, 'journal.jsonl')
    writeFileSync(file, 'not json\n', { mode: 0o600 })
    const r = await sendThrough(file)
    assert.match(String(r.refused), /corrupt/)
    assert.equal(r.t3.calls.length, 0)
    assert.equal(readFileSync(file, 'utf8'), 'not json\n')
    assert.equal(existsSync(`${file}.lock`), false)
  })

  it('a refused journal keeps its unknown operation: once its owner makes it private, it reconciles by its original identity', async () => {
    const dir = place()
    const file = join(dir, 'journal.jsonl')
    const t3 = new FakeT3()
    t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    const e = create(920)
    const first = new RunnerJournal(file)
    const id = first.id
    const gw = new RunnerGateway({ journal: first, transport: t3, profile })
    assert.equal((await gw.send(e, digestOf(e), gw.journalId)).kind, 'unknown')
    first.close()
    chmodSync(file, 0o644)
    const before = bytesOf(file)
    assert.throws(() => new RunnerJournal(file), UNSAFE)
    assert.equal(bytesOf(file), before, 'not reset, not given a new identity')
    chmodSync(file, 0o600)
    const again = new RunnerJournal(file)
    try {
      assert.equal(again.id, id)
      const back = new RunnerGateway({ journal: again, transport: t3, profile })
      const r = await back.reconcile({ envelope: e, digest: digestOf(e), journalId: id })
      assert.equal(r.kind, 'received')
      assert.equal(t3.effects.launches, 1, 'reconciled, never relaunched')
    } finally {
      again.close()
    }
  })
})

// ---- repair 6 (INC01-CC-005-repair5-SOURCE-PRE-PUSH-001, NATIVE5-F01): a non-regular lock path is refused promptly ----
// A FIFO at the lock path used to hang the process in its synchronous open, where no in-process timer can reach. So each
// case runs in a real child process through the actual journal, gateway and FakeT3, under an independent parent
// deadline. A child killed at that deadline is a FAILED case, never a pass. Synthetic temporary files only (mkfifo).

const CHILD = `
const input = JSON.parse(process.env.R6_INPUT)
const { RunnerJournal } = await import(input.urls.journal)
const { RunnerGateway } = await import(input.urls.gateway)
const { FakeT3 } = await import(input.urls.fake)
const { digestOf } = await import(input.urls.port)
const { execFileSync } = await import('node:child_process')
const { renameSync } = await import('node:fs')
const fifo = (p) => execFileSync('mkfifo', ['-m', '600', p])
const profile = { ...input.profile, nativeProjectRefs: new Set(input.profile.nativeProjectRefs), operations: new Set(input.profile.operations) }
const t3 = new FakeT3()
const out = { stage: input.stage }
const file = input.file
try {
  if (input.stage === 'acquire') fifo(file + '.lock')
  if (input.stage === 'journal-fifo') fifo(file)
  const journal = new RunnerJournal(file)
  out.opened = true
  const gateway = new RunnerGateway({ journal, transport: t3, profile })
  if (input.stage === 'append' || input.stage === 'release') {
    renameSync(file + '.lock', file + '.lock.aside')
    fifo(file + '.lock')
  }
  if (input.stage === 'journal-replaced') {
    renameSync(file, file + '.aside')
    fifo(file)
  }
  if (input.stage !== 'release') {
    try {
      await gateway.send(input.envelope, digestOf(input.envelope), gateway.journalId)
      out.sent = true
    } catch (err) {
      out.refused = String(err)
    }
  }
  journal.close()
  out.closed = true
} catch (err) {
  out.refused = String(err)
}
out.t3calls = t3.calls.length
process.stdout.write(JSON.stringify(out))
`
const here = import.meta.dirname
const urls = Object.fromEntries(
  (
    [
      ['journal', 'runner-journal.ts'],
      ['gateway', 'runner-gateway.ts'],
      ['fake', 'runner-fake-t3.ts'],
      ['port', 'runner-port.ts'],
    ] as const
  ).map(([k, f]) => [k, pathToFileURL(join(here, f)).href]),
)
const DEADLINE_MS = 8000
interface ChildOut {
  stage: string
  opened?: boolean
  sent?: boolean
  refused?: string
  closed?: boolean
  t3calls: number
}
/** One bounded child: its own exit (status 0) with its report, or a kill at the parent's deadline (a failure). */
function inChild(stage: string, file: string) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    env: {
      ...process.env,
      R6_INPUT: JSON.stringify({
        stage,
        file,
        urls,
        envelope: create(950),
        profile: { ...profile, nativeProjectRefs: [...profile.nativeProjectRefs], operations: [...profile.operations] },
      }),
    },
    encoding: 'utf8',
    timeout: DEADLINE_MS,
    killSignal: 'SIGKILL',
  })
  const finished = r.signal === null && r.status === 0
  return {
    finished,
    signal: r.signal,
    stderr: r.stderr,
    out: finished ? (JSON.parse(r.stdout) as ChildOut) : null,
  }
}
const isFifo = (p: string) => existsSync(p) && lstatSync(p).isFIFO()
const lineCount = (p: string) => readFileSync(p, 'utf8').trimEnd().split('\n').length

describe('a non-regular lock path is refused promptly, in bounded child processes (repair 6, NATIVE5-F01)', () => {
  it('a FIFO at the lock path before opening: refused at acquisition, nothing created, no native call', () => {
    const file = join(place(), 'journal.jsonl')
    const r = inChild('acquire', file)
    assert.equal(r.finished, true, `the child must end on its own, not be killed (${r.signal ?? ''}) ${r.stderr}`)
    assert.equal(r.out?.opened, undefined)
    assert.match(r.out?.refused ?? '', /cannot be read/)
    assert.equal(r.out?.t3calls, 0)
    assert.equal(existsSync(file), false, 'no journal created')
    assert.equal(isFifo(`${file}.lock`), true, 'the FIFO is left in place')
  })

  it('a FIFO replacing the lock after opening: the gateway send is refused before any native call, and close ends', () => {
    const file = join(place(), 'journal.jsonl')
    const r = inChild('append', file)
    assert.equal(r.finished, true, `the child must end on its own, not be killed (${r.signal ?? ''}) ${r.stderr}`)
    assert.equal(r.out?.opened, true)
    assert.equal(r.out?.sent, undefined)
    assert.match(r.out?.refused ?? '', /no longer ours/)
    assert.equal(r.out?.t3calls, 0, 'no native call')
    assert.equal(r.out?.closed, true)
    assert.equal(lineCount(file), 1, 'nothing appended after the header')
    assert.equal(isFifo(`${file}.lock`), true, 'the FIFO is neither unlinked nor adopted')
    assert.equal(existsSync(`${file}.lock.aside`), true)
  })

  it('a FIFO replacing the lock after opening: close() releases nothing it does not own, and ends', () => {
    const file = join(place(), 'journal.jsonl')
    const r = inChild('release', file)
    assert.equal(r.finished, true, `the child must end on its own, not be killed (${r.signal ?? ''}) ${r.stderr}`)
    assert.equal(r.out?.opened, true)
    assert.equal(r.out?.closed, true)
    assert.equal(r.out?.refused, undefined)
    assert.equal(isFifo(`${file}.lock`), true, 'the FIFO is left in place')
  })

  it('the journal path itself a FIFO, before or after opening, is refused promptly (control)', () => {
    for (const stage of ['journal-fifo', 'journal-replaced']) {
      const file = join(place(), 'journal.jsonl')
      const r = inChild(stage, file)
      assert.equal(r.finished, true, `${stage}: the child must end on its own (${r.signal ?? ''}) ${r.stderr}`)
      assert.match(r.out?.refused ?? '', /runner journal path is unsafe/, stage)
      assert.equal(r.out?.t3calls, 0, stage)
    }
  })

  it('a lock that is a directory is refused as unreadable, and a regular lock still works (controls)', async () => {
    const dir = place()
    const file = join(dir, 'journal.jsonl')
    mkdirSync(`${file}.lock`)
    assert.throws(() => new RunnerJournal(file), /cannot be read/)
    const ok = join(place(), 'journal.jsonl')
    const r = await sendThrough(ok)
    assert.equal(r.refused, null)
    assert.equal(r.t3.effects.launches, 1)
    assert.equal(existsSync(`${ok}.lock`), false, 'released')
  })
})

// Repair 8 (NATIVE7-F01) helpers.
/** Every native effect and every mutating call so far: none may be added by a reconcile or a restart. */
const effects = (t3: FakeT3) => ({
  ...t3.effects,
  launchCalls: t3.count('t3_thread_launch'),
  sendCalls: t3.count('t3_thread_send'),
  interruptCalls: t3.count('t3_thread_interrupt'),
})
/** How many final answers the journal FILE holds for one operation (what a new gateway would replay). */
const finals = (file: string, operationId: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type?: string; operationId?: string })
    .filter((r) => r.type === 'answer' && r.operationId === operationId).length
const statusOf = (t3: FakeT3, thread: string, run: string) =>
  t3.threads.get(thread)?.runs.find((r) => r.runId === run)?.status
const shape = (a: RunnerAnswer) => (a.kind === 'received' ? `received ${a.delivery} ${runOf(a)}` : a.kind)

/** A create whose run runs, then an input queued behind it whose answer was lost after T3 accepted it. */
async function lostQueuedInput(base: number) {
  const w = setup()
  const thread = threadOf(await w.send(create(base)))
  const launchRun = w.t3.threads.get(thread)?.runs[0]?.runId ?? ''
  w.t3.inject('t3_thread_send', { kind: 'lose_after_effect' })
  const e = follow(base + 1, base, thread)
  assert.equal((await w.send(e)).kind, 'unknown')
  const run = w.t3.threads.get(thread)?.runs.at(-1)?.runId ?? ''
  assert.equal(statusOf(w.t3, thread, run), 'queued')
  return { ...w, thread, e, run, launchRun }
}

/** Reconcile, close, reopen the fsynced journal in a new gateway and reconcile again: [first, replay, finals]. */
async function reconcileAcrossRestart(w: Awaited<ReturnType<typeof lostQueuedInput>>) {
  const first = await w.rec(w.e)
  w.gateway.close()
  const again = setup({ file: w.file, t3: w.t3 })
  const replay = await again.rec(w.e)
  return { again, seen: [shape(first), shape(replay), finals(w.file, w.e.operationId)] }
}

describe('an input is received only on positive evidence about its own run (repair 8, NATIVE7-F01)', () => {
  it('keeps an input whose run the 50-run window omits unknown across a restart, until a read shows it started', async () => {
    const w = await lostQueuedInput(8000)
    for (let i = 0; i < 51; i++) await w.send(follow(8002 + i, 8000, w.thread))
    assert.equal(w.t3.threads.get(w.thread)?.runs.length, 53)
    const before = effects(w.t3)
    const { again, seen } = await reconcileAcrossRestart(w)
    assert.deepEqual(seen, ['unknown', 'unknown', 0], 'absent from the window is not started, and nothing final')
    assert.deepEqual(effects(w.t3), before, 'no native effect during reconcile or restart')
    // Later the queue moves on: the launch ends and the original run is T3's active run, still outside the window.
    w.t3.finishRun(w.launchRun)
    w.t3.finishRun(w.run, 'running')
    const late = await again.rec(w.e)
    assert.equal(shape(late), `received started ${w.run}`, 'the same run, positively started')
    assert.equal(finals(w.file, w.e.operationId), 1)
    assert.deepEqual(effects(w.t3), before)
    again.gateway.close()
    const third = setup({ file: w.file, t3: w.t3 })
    const calls = w.t3.calls.length
    assert.deepEqual(await third.rec(w.e), late, 'answered from the journal')
    assert.equal(w.t3.calls.length, calls, 'with no call')
    third.gateway.close()
  })

  it('keeps a queued input later cancelled by an interrupt unknown across a restart: it may never have started', async () => {
    const w = await lostQueuedInput(8100)
    assert.equal((await w.send(follow(8102, 8100, w.thread, 'stop'))).kind, 'received')
    assert.equal(statusOf(w.t3, w.thread, w.run), 'cancelled')
    const before = effects(w.t3)
    const { again, seen } = await reconcileAcrossRestart(w)
    assert.deepEqual(seen, ['unknown', 'unknown', 0])
    assert.deepEqual(effects(w.t3), before)
    again.gateway.close()
  })

  it('keeps an unrecognized status unknown across a restart, and resolves on a later read that shows it running', async () => {
    const w = await lostQueuedInput(8200)
    w.t3.finishRun(w.run, 'held_by_vendor')
    const before = effects(w.t3)
    const { again, seen } = await reconcileAcrossRestart(w)
    assert.deepEqual(seen, ['unknown', 'unknown', 0])
    w.t3.finishRun(w.launchRun)
    w.t3.finishRun(w.run, 'running')
    assert.equal(shape(await again.rec(w.e)), `received started ${w.run}`)
    assert.deepEqual(effects(w.t3), before)
    again.gateway.close()
  })

  it('receives a visible queued or active run as such, and keeps every terminal status unknown (controls)', async () => {
    const cases: [string, string][] = [
      ['queued', 'received queued'],
      ['preparing', 'received started'],
      ['starting', 'received started'],
      ['running', 'received started'],
      ['waiting', 'received started'],
      ['completed', 'unknown'],
      ['interrupted', 'unknown'],
      ['failed', 'unknown'],
      ['cancelled', 'unknown'],
      ['rolled_back', 'unknown'],
    ]
    const seen: string[][] = []
    for (const [i, [status]] of cases.entries()) {
      const w = await lostQueuedInput(8300 + 10 * i)
      w.t3.finishRun(w.run, status)
      const before = effects(w.t3)
      const { again, seen: s } = await reconcileAcrossRestart(w)
      assert.deepEqual(effects(w.t3), before, status)
      seen.push([status, String(s[0]).replace(` ${w.run}`, ''), String(s[1]).replace(` ${w.run}`, ''), String(s[2])])
      again.gateway.close()
    }
    assert.deepEqual(
      seen,
      cases.map(([status, read]) => [status, read, read, read === 'unknown' ? '0' : '1']),
    )
  })

  it('keeps a read that contradicts itself (its run listed queued, yet named the active run) unknown', async () => {
    const fake = new FakeT3()
    let forgeActive: string | null = null
    const t3: T3Transport = {
      namespace: () => fake.namespace(),
      call: async (call) => {
        const reply = await fake.call(call)
        if (call.tool !== 't3_thread_read' || forgeActive === null || reply.kind !== 'ok') return reply
        const body = reply.body as { thread: Record<string, unknown> }
        return { kind: 'ok', body: { ...body, thread: { ...body.thread, activeRunId: forgeActive } } }
      },
    }
    const file = journalFile()
    const g = new RunnerGateway({ journal: new RunnerJournal(file), transport: t3, profile })
    const thread = threadOf(await g.send(create(8500), digestOf(create(8500)), g.journalId))
    fake.inject('t3_thread_send', { kind: 'lose_after_effect' })
    const e = follow(8501, 8500, thread)
    assert.equal((await g.send(e, digestOf(e), g.journalId)).kind, 'unknown')
    forgeActive = fake.threads.get(thread)?.runs.at(-1)?.runId ?? ''
    assert.equal(statusOf(fake, thread, forgeActive), 'queued')
    const r = await g.reconcile({ envelope: e, digest: digestOf(e), journalId: g.journalId })
    assert.deepEqual([shape(r), finals(file, e.operationId)], ['unknown', 0])
    g.close()
  })
})

/**
 * Repair 9 (NATIVE8-F01): passes every call to the actual FakeT3, and while `recent` or `active` is set rewrites only a
 * read's run identities (each recent run renamed `recent` and called completed; the active run `active`). The fake's
 * own runs, effects and calls are untouched.
 */
class RenamingRunsT3 implements T3Transport {
  recent: string | null = null
  active: string | null | undefined = undefined
  readonly fake: FakeT3
  constructor(fake: FakeT3) {
    this.fake = fake
  }
  namespace(): string {
    return this.fake.namespace()
  }
  async call(call: T3Call): Promise<T3Reply> {
    const reply = await this.fake.call(call)
    if (call.tool !== 't3_thread_read' || reply.kind !== 'ok') return reply
    if (this.recent === null && this.active === undefined) return reply
    const body = reply.body as { thread: Record<string, unknown>; recentRuns: { runId: string; status: string }[] }
    const recentRuns =
      this.recent === null ? body.recentRuns : body.recentRuns.map(() => ({ runId: this.recent, status: 'completed' }))
    const activeRunId = this.active === undefined ? null : this.active
    return { kind: 'ok', body: { ...body, thread: { ...body.thread, activeRunId }, recentRuns } }
  }
}

describe('a read naming runs by malformed ids never settles a Stop (repair 9, NATIVE8-F01)', () => {
  it('keeps a lost Stop unknown on blank recent run ids, across a reopen, until a genuine read settles it', async () => {
    const blanks: [string, string][] = [
      ['space', ' '],
      ['tab', '\t'],
      ['CRLF', '\r\n'],
      ['NBSP', ' '],
    ]
    const seen: unknown[] = []
    for (const [i, [what, blank]] of blanks.entries()) {
      const fake = new FakeT3()
      const t3 = new RenamingRunsT3(fake)
      const file = journalFile()
      const g = new RunnerGateway({ journal: new RunnerJournal(file), transport: t3, profile })
      const c = create(8600 + 10 * i)
      const created = await g.send(c, digestOf(c), g.journalId)
      fake.inject('t3_thread_interrupt', { kind: 'lose_before_effect' })
      const stop = follow(8601 + 10 * i, 8600 + 10 * i, threadOf(created), 'stop')
      const id = { envelope: stop, digest: digestOf(stop), journalId: g.journalId }
      assert.equal((await g.send(stop, id.digest, id.journalId)).kind, 'unknown')
      t3.recent = blank
      const first = await g.reconcile(id)
      g.close()
      const again = new RunnerGateway({ journal: new RunnerJournal(file), transport: t3, profile })
      const replay = await again.reconcile(id)
      const blankPhase = [first.kind, replay.kind, finals(file, stop.operationId)]
      // The genuine read: the launch's run really ended; nothing is forged.
      t3.recent = null
      fake.finishRun(runOf(created))
      const late = await again.reconcile(id)
      seen.push([
        what,
        ...blankPhase,
        late.kind,
        finals(file, stop.operationId),
        fake.effects.stops,
        fake.count('t3_thread_interrupt'),
      ])
      again.close()
    }
    assert.deepEqual(
      seen,
      blanks.map(([what]) => [what, 'unknown', 'unknown', 0, 'settled', 1, 0, 1]),
    )
  })

  it('keeps a lost Stop unknown on a blank active run id, even with every run terminal and visible', async () => {
    const fake = new FakeT3()
    const t3 = new RenamingRunsT3(fake)
    const file = journalFile()
    const g = new RunnerGateway({ journal: new RunnerJournal(file), transport: t3, profile })
    const c = create(8700)
    const created = await g.send(c, digestOf(c), g.journalId)
    fake.inject('t3_thread_interrupt', { kind: 'lose_before_effect' })
    const stop = follow(8701, 8700, threadOf(created), 'stop')
    const id = { envelope: stop, digest: digestOf(stop), journalId: g.journalId }
    await g.send(stop, id.digest, id.journalId)
    fake.finishRun(runOf(created))
    t3.active = ' '
    assert.deepEqual([(await g.reconcile(id)).kind, finals(file, stop.operationId)], ['unknown', 0])
    t3.active = undefined
    assert.deepEqual([(await g.reconcile(id)).kind, finals(file, stop.operationId)], ['settled', 1], 'the genuine read')
    assert.deepEqual([fake.effects.stops, fake.count('t3_thread_interrupt')], [0, 1])
    g.close()
  })
})
