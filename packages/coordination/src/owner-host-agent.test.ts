import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HelloConflict, OwnerHostAgent } from './owner-host-agent.ts'
import {
  exchangeRequest,
  type Delivered,
  type GoResult,
  type HelloResult,
  type HostChannel,
  type HostHello,
} from './owner-host-channel.ts'
import { FakeT3 } from './runner-fake-t3.ts'
import { RunnerGateway, type GatewayProfile } from './runner-gateway.ts'
import { RunnerJournal } from './runner-journal.ts'
import { digestOf, type RunnerAnswer, type RunnerEnvelope, type RunObservation } from './runner-port.ts'
import { launchCommandId } from './t3-port-mapping.ts'

const root = mkdtempSync(join(tmpdir(), 'sophia-owner-host-agent-'))
const open: RunnerGateway[] = []
after(() => {
  for (const g of open) g.close()
  rmSync(root, { recursive: true, force: true })
})
let n = 0
const NS = 'client:fake-session-1'
const profile: GatewayProfile = {
  ownerId: '00000000-0000-4000-8000-0000000000b1',
  environmentRef: 'env-owner-1',
  adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
  nativeProjectRefs: new Set(['project-sophia']),
  accountKey: 'claude:acct-1',
  profileId: 'read-only-v1',
  profileRevision: 1,
  operations: new Set(['create', 'input', 'stop'] as const),
}
const env = (over: Partial<RunnerEnvelope> = {}): RunnerEnvelope => ({
  v: 1,
  operationId: '00000000-0000-4000-8000-000000000001',
  kind: 'create',
  projectId: '00000000-0000-4000-8000-0000000000a1',
  ownerId: profile.ownerId,
  resourceId: '00000000-0000-4000-8000-0000000000c1',
  bindingId: '00000000-0000-4000-8000-0000000000d1',
  goalId: '00000000-0000-4000-8000-0000000000e1',
  qualificationId: '00000000-0000-4000-8000-0000000000f1',
  qualificationRevision: 1,
  adapterPin: profile.adapterPin,
  environmentRef: profile.environmentRef,
  nativeProjectRef: 'project-sophia',
  profileId: profile.profileId,
  profileRevision: 1,
  accountKey: profile.accountKey,
  authorityEpoch: 1,
  message: 'Report the Ask admission boundary.',
  title: 'Read-only qualification',
  targetOperationId: null,
  nativeThreadId: null,
  ...over,
})

/** A scripted host channel: delivers what it is given, answers GO as scripted, records every answer. */
class Channel implements HostChannel {
  queue: Delivered[] = []
  goes: GoResult[] = []
  goCalls = 0
  goThrows = false
  answerThrows = 0
  helloResult: HelloResult = { result: 'ok', hostId: 'h1', state: 'active', first: true }
  readonly answers: { exchangeId: string; answer: RunnerAnswer | RunObservation }[] = []
  readonly hellos: HostHello[] = []
  hello(h: HostHello) {
    this.hellos.push(h)
    return Promise.resolve(this.helloResult)
  }
  poll() {
    const out = this.queue
    this.queue = []
    return Promise.resolve(out)
  }
  go(): Promise<GoResult> {
    this.goCalls += 1
    if (this.goThrows) return Promise.reject(new Error('channel unreachable'))
    return Promise.resolve(this.goes.shift() ?? { result: 'denied', reason: 'unscripted', grantedBefore: false })
  }
  answer(exchangeId: string, answer: RunnerAnswer | RunObservation) {
    if (this.answerThrows > 0) {
      this.answerThrows -= 1
      return Promise.reject(new Error('the reply was lost'))
    }
    this.answers.push({ exchangeId, answer })
    return Promise.resolve({ result: 'ok' } as const)
  }
}

function host(file = join(root, `journal-${(n += 1)}.jsonl`), t3 = new FakeT3(NS)) {
  const journal = new RunnerJournal(file)
  const gateway = new RunnerGateway({ journal, transport: t3, profile })
  open.push(gateway)
  const channel = new Channel()
  const hello: HostHello = {
    v: 1,
    journalId: journal.id,
    environmentRef: profile.environmentRef,
    adapterPin: profile.adapterPin,
    profileId: profile.profileId,
    profileRevision: 1,
    accountKey: profile.accountKey,
    t3Namespace: NS,
  }
  const logs: string[] = []
  const agent = new OwnerHostAgent({ channel, gateway, journal, hello, log: (l) => logs.push(l) })
  const deliver = (kind: Delivered['kind'], e = env(), id = `x-${kind}`, journalId = journal.id) =>
    channel.queue.push({ exchangeId: id, kind, request: exchangeRequest(kind, e, journalId), deadlineAt: '' })
  return { journal, gateway, channel, agent, t3, file, deliver, logs }
}

describe('the owner-host agent', () => {
  it("sends only after GO, once, and answers the gateway's receipt", async () => {
    const h = host()
    h.deliver('send')
    h.channel.goes.push({ result: 'go' })
    assert.deepEqual(await h.agent.serveOnce(), ['answered'])
    assert.equal(h.channel.hellos.length, 1)
    assert.equal(h.t3.effects.launches, 1)
    const a = h.channel.answers[0]?.answer
    assert.equal(a?.kind, 'received')
    assert.equal(a?.kind === 'received' ? a.identity.threadId : '', launchCommandId(NS, `sophia:${env().operationId}`))
  })

  it('never calls the gateway without GO: a denial is answered refused, and nothing reaches T3', async () => {
    const h = host()
    h.deliver('send')
    h.channel.goes.push({ result: 'denied', reason: 'the goal changed', grantedBefore: false })
    assert.deepEqual(await h.agent.serveOnce(), ['refused'])
    assert.equal(h.t3.calls.length, 0)
    assert.equal(h.journal.entry(env().operationId), undefined)
    assert.deepEqual(h.channel.answers[0]?.answer, { kind: 'refused', reason: 'no GO: the goal changed' })
  })

  it('fails closed when GO cannot be asked: no send and no answer', async () => {
    const h = host()
    h.deliver('send')
    h.channel.goThrows = true
    assert.deepEqual(await h.agent.serveOnce(), ['skipped'])
    assert.equal(h.t3.calls.length, 0)
    assert.equal(h.channel.answers.length, 0)
  })

  it('answers a redelivered send from its journal after a lost reply: one native effect', async () => {
    const h = host()
    h.deliver('send')
    h.channel.goes.push({ result: 'go' })
    h.channel.answerThrows = 1
    assert.deepEqual(await h.agent.serveOnce(), ['failed'])
    // Redelivered; GO is granted again (rechecked) and the gateway replays from its journal.
    h.deliver('send')
    h.channel.goes.push({ result: 'go' })
    assert.deepEqual(await h.agent.serveOnce(), ['answered'])
    assert.equal(h.t3.effects.launches, 1)
    assert.equal(h.t3.count('t3_thread_launch'), 1)
    assert.equal(h.channel.answers[0]?.answer.kind, 'received')
  })

  it('reconciles, never resends, when GO is refused after an earlier grant', async () => {
    const h = host()
    h.t3.inject('t3_thread_launch', { kind: 'lose_after_effect' })
    h.deliver('send')
    h.channel.goes.push({ result: 'go' })
    await h.agent.serveOnce()
    assert.equal(h.channel.answers[0]?.answer.kind, 'unknown')
    h.deliver('send')
    h.channel.goes.push({ result: 'denied', reason: 'the deadline passed', grantedBefore: true })
    await h.agent.serveOnce()
    assert.equal(h.t3.count('t3_thread_launch'), 1)
    assert.equal(h.channel.answers[1]?.answer.kind, 'received', 'read back by its original identity')
    assert.equal(h.t3.effects.launches, 1)
  })

  it('claims nothing when the journal holds an operation Sophia never granted GO', async () => {
    const h = host()
    h.deliver('send')
    h.channel.goes.push({ result: 'go' })
    await h.agent.serveOnce()
    h.deliver('send', env(), 'x-again')
    h.channel.goes.push({ result: 'denied', reason: 'the exchange is answered', grantedBefore: false })
    assert.deepEqual(await h.agent.serveOnce(), ['skipped'])
    assert.equal(h.channel.answers.length, 1)
    assert.ok(h.logs.some((l) => /no GO recorded/.test(l)))
  })

  it('refuses a malformed or foreign send without GO or the gateway; leaves a malformed read unanswered', async () => {
    const h = host()
    h.channel.queue.push({
      exchangeId: 'x-bad',
      kind: 'send',
      request: { ...exchangeRequest('send', env(), h.journal.id), digest: digestOf(env({ message: 'steered' })) },
      deadlineAt: '',
    })
    h.deliver('send', env(), 'x-foreign', '00000000-0000-4000-8000-0000000000bb')
    h.channel.queue.push({
      exchangeId: 'x-read',
      kind: 'observe',
      request: { ...exchangeRequest('observe', env(), h.journal.id), extra: true },
      deadlineAt: '',
    })
    assert.deepEqual(await h.agent.serveOnce(), ['refused', 'refused', 'skipped'])
    assert.equal(h.channel.goCalls, 0)
    assert.equal(h.t3.calls.length, 0)
    assert.deepEqual(
      h.channel.answers.map((a) => a.exchangeId),
      ['x-bad', 'x-foreign'],
    )
  })

  it('passes reconcile and observe to the gateway: reads that start no turn', async () => {
    const h = host()
    h.deliver('send')
    h.channel.goes.push({ result: 'go' })
    await h.agent.serveOnce()
    h.deliver('reconcile')
    h.deliver('observe')
    assert.deepEqual(await h.agent.serveOnce(), ['answered', 'answered'])
    assert.equal(h.channel.answers[1]?.answer.kind, 'received')
    assert.deepEqual(h.channel.answers[2]?.answer, { kind: 'run', status: 'running', terminal: false })
    assert.equal(h.t3.effects.launches, 1)
    assert.equal(h.channel.goCalls, 1)
  })

  it('resumes the same journal after a restart and serves its operations', async () => {
    const first = host()
    first.deliver('send')
    first.channel.goes.push({ result: 'go' })
    await first.agent.serveOnce()
    const id = first.journal.id
    first.gateway.close()
    const again = host(first.file, first.t3)
    assert.equal(again.journal.id, id)
    again.deliver('send')
    again.channel.goes.push({ result: 'go' })
    await again.agent.serveOnce()
    assert.equal(again.channel.answers[0]?.answer.kind, 'received')
    assert.equal(first.t3.effects.launches, 1)
  })

  it('stops on a hello conflict and serves nothing', async () => {
    const h = host()
    h.channel.helloResult = { result: 'conflict', hostId: 'h1', changed: ['t3Namespace'] }
    h.deliver('send')
    await assert.rejects(h.agent.serveOnce(), HelloConflict)
    await assert.rejects(h.agent.run(new AbortController().signal), HelloConflict)
    assert.equal(h.channel.queue.length, 1)
  })

  it('refuses a hello, gateway and journal that do not name one journal', () => {
    const h = host()
    const other = host()
    assert.throws(
      () =>
        new OwnerHostAgent({
          channel: h.channel,
          gateway: other.gateway,
          journal: h.journal,
          hello: {
            v: 1,
            journalId: h.journal.id,
            environmentRef: 'env-owner-1',
            adapterPin: profile.adapterPin,
            profileId: 'read-only-v1',
            profileRevision: 1,
            accountKey: 'claude:acct-1',
            t3Namespace: NS,
          },
        }),
      /one journal/,
    )
  })

  it('runs until aborted, sleeping when idle', async () => {
    const h = host()
    const ac = new AbortController()
    const sleeps: number[] = []
    const agent = new OwnerHostAgent({
      channel: h.channel,
      gateway: h.gateway,
      journal: h.journal,
      hello: h.channel.hellos[0] ?? {
        v: 1,
        journalId: h.journal.id,
        environmentRef: 'env-owner-1',
        adapterPin: profile.adapterPin,
        profileId: 'read-only-v1',
        profileRevision: 1,
        accountKey: 'claude:acct-1',
        t3Namespace: NS,
      },
      idleMs: 5,
      sleep: (ms) => {
        sleeps.push(ms)
        if (sleeps.length >= 3) ac.abort()
        return Promise.resolve()
      },
    })
    await agent.run(ac.signal)
    assert.deepEqual(sleeps, [5, 5, 5])
  })
})
