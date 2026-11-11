import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
