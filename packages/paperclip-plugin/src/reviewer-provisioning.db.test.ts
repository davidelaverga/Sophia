// The managed source reviewer under concurrency (root's local reproduction on the pinned host and plugin: two first
// commissions of one company at once left two live managed reviewers). Level: sql-run. The plugin's namespace is a real
// PostgreSQL schema reached through a pool, so the statements of concurrent requests run on separate connections; the
// host is synthetic (memory-host.ts), and its managed-agent service reconciles as the pin's does, with no lock between
// its read of the binding and its create (managedAgents). Nothing here is the pinned host itself.
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import pg from 'pg'
import { signEnvelope } from '@sophia/coordination/envelope'
import type { Commission } from '@sophia/coordination/plugin-wire'
import { createEmptyDatabase, type EmptyDatabase } from '@sophia/test-support'
import { UnansweredHostCall, type ApiResponse, type HostProcess } from './host.ts'
import {
  INTEGRATION_USER,
  installNamespace,
  managedAgents,
  memoryPaperclip,
  NAMESPACE,
  type ManagedAgents,
  type ManagedAgentsOptions,
  type MemoryPaperclipOptions,
} from './memory-host.ts'

const sophia = generateKeyPairSync('ed25519')
const COMPANY = 'company-a'
const OTHER_COMPANY = 'company-b'
const PROJECT = 'pc-project-a'
const OTHER_PROJECT = 'pc-project-b'
const SOPHIA_PROJECT = randomUUID()
const OTHER_SOPHIA_PROJECT = randomUUID()
const NOW = 1_800_000_000

let db: EmptyDatabase
let pool: pg.Pool

before(async () => {
  db = await createEmptyDatabase('sophia_pcrev')
  pool = new pg.Pool({ connectionString: db.ownerUrl, max: 8 })
  await installNamespace(pool)
})
after(async () => {
  // pool.end() resolves once the pool let go of its clients, before they closed (pg-pool's _remove ends each after);
  // the database is dropped, terminating what is still connected, only once every one of them closed.
  let open = pool.totalCount
  const closed = new Promise<void>((resolve) => {
    if (open === 0) resolve()
    pool.on('remove', () => {
      open -= 1
      if (open === 0) resolve()
    })
  })
  await pool.end()
  await closed
  await db.drop()
})
beforeEach(async () => {
  await pool.query(
    `TRUNCATE ${NAMESPACE}.controls, ${NAMESPACE}.effects, ${NAMESPACE}.wakes, ${NAMESPACE}.commissions, ${NAMESPACE}.envelope_nonces, ${NAMESPACE}.reviewer_provisioning, public.heartbeat_runs`,
  )
})

const config = {
  signingPublicKey: sophia.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  integrationUserId: INTEGRATION_USER,
  projects: [
    { sophiaProjectId: SOPHIA_PROJECT, companyId: COMPANY, paperclipProjectId: PROJECT },
    { sophiaProjectId: OTHER_SOPHIA_PROJECT, companyId: OTHER_COMPANY, paperclipProjectId: OTHER_PROJECT },
  ],
}

function commissionOf(company = COMPANY, workId = randomUUID()): Commission {
  const other = company === OTHER_COMPANY
  return {
    key: `sophia-wbc02-${workId}`,
    sophiaProjectId: other ? OTHER_SOPHIA_PROJECT : SOPHIA_PROJECT,
    paperclipProjectId: other ? OTHER_PROJECT : PROJECT,
    workId,
    title: 'Source review: launch brief',
    description: 'Review two selected sources against the criteria. Source text stays in Sophia.',
    initialStatus: 'blocked',
    wake: false,
  }
}

/** One delivery of a commission, as Sophia's worker signs it: a fresh envelope for every attempt, the same keys. */
function delivery(c: Commission) {
  const companyId = c.sophiaProjectId === OTHER_SOPHIA_PROJECT ? OTHER_COMPANY : COMPANY
  const envelope = signEnvelope(
    {
      op: 'commission',
      companyId,
      paperclipProjectId: c.paperclipProjectId,
      sophiaProjectId: c.sophiaProjectId,
      workId: c.workId,
      commissionKey: c.key,
      deliveryKey: `commission-${c.workId}`,
      initiator: { kind: 'member', id: randomUUID() },
      nonce: randomUUID(),
      iat: NOW,
      exp: NOW + 120,
    },
    c,
    sophia.privateKey,
  )
  return { routeKey: 'commission', params: {}, companyId, body: { companyId, envelope, commission: c } }
}

const paperclip = (managed: ManagedAgents, over: Partial<MemoryPaperclipOptions> = {}) =>
  memoryPaperclip(pool, { config, now: () => NOW, managed, ...over })

function gate() {
  const { promise: shut, resolve } = Promise.withResolvers<void>()
  return { shut, open: () => resolve() }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(what: string, check: () => boolean) {
  for (let i = 0; i < 400; i += 1) {
    if (check()) return
    await sleep(5)
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** A request's answer if it came within a moment; 'pending' while it waits (on the old plugin, at the host's gate). */
const soon = (answer: Promise<ApiResponse>) => Promise.race([answer, sleep(400).then(() => 'pending' as const)])

const codeOf = (res: ApiResponse | 'pending') =>
  res === 'pending'
    ? 'pending'
    : `${res.status} ${(res.body as { error?: { code?: string } }).error?.code ?? ''}`.trim()

const claimOf = async (company: string) =>
  (
    await pool.query<{ host_process: string | null; ended: boolean; agent_id: string | null; fenced: boolean }>(
      `SELECT host_process, ended_at IS NOT NULL AS ended, agent_id, fenced_at IS NOT NULL AS fenced
         FROM ${NAMESPACE}.reviewer_provisioning WHERE company_id = $1`,
      [company],
    )
  ).rows[0]

/** One fault, then none: `fails` for the managed service's first reconcile only. */
type Fails = NonNullable<ManagedAgentsOptions['fails']>
const once = (fault: ReturnType<Fails>): Fails => {
  let left: typeof fault = fault
  return () => {
    const now = left
    left = null
    return now
  }
}

/**
 * Synthetic redelivery, not Sophia's worker: on a 503 the same commission is sent again directly, with a fresh envelope,
 * every 20 ms and a bounded number of times. The worker's own path after a 503 (unknown, a signed lookup, then a fresh
 * send after its backoff, from the outbox; apps/worker/src/coordination-dispatch.ts) is not run here; only its reading
 * of this 503 as unknown is tested (apps/worker/src/coordination-dispatch.test.ts).
 */
async function resentOn503(p: ReturnType<typeof paperclip>, c: Commission): Promise<ApiResponse> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const answer = await p.request(delivery(c))
    if (answer.status !== 503) return answer
    await sleep(20)
  }
  throw new Error(`only 503 for ${c.key}`)
}

describe('the managed source reviewer, provisioned once per company', () => {
  it('two cold works of one company, each resent on 503 (synthetic): one live reviewer, both assigned to it', async () => {
    const hold = gate()
    const m = managedAgents({ between: () => hold.shut })
    const p = paperclip(m)
    const [first, second] = [commissionOf(), commissionOf()]
    const a = resentOn503(p, first)
    await until('the first reconcile to be in flight', () => m.asked.length === 1)
    const b = resentOn503(p, second)
    await sleep(300)
    hold.open()
    assert.deepEqual([(await a).status, (await b).status], [200, 200])
    const reviewers = m.live(COMPANY).map((agent) => agent.id)
    const assignees = Object.fromEntries([...p.issues.values()].map((issue) => [issue.originId, issue.assigneeAgentId]))
    assert.deepEqual(
      { reviewers: reviewers.length, assignees },
      { reviewers: 1, assignees: { [first.key]: reviewers[0], [second.key]: reviewers[0] } },
      'one live managed reviewer, and each work bound to it',
    )
  })

  it('a bound reviewer terminated: two new works at once provision one live replacement, both bound to it', async () => {
    const hold = gate()
    let holding = false
    const m = managedAgents({ between: () => (holding ? hold.shut : undefined) })
    const p = paperclip(m)
    const earlier = commissionOf()
    assert.equal((await p.request(delivery(earlier))).status, 200)
    const old = m.get(COMPANY)
    const bound = old === null ? undefined : m.agents.get(old)
    assert.ok(bound, 'the first work provisioned and bound a reviewer')
    // A board user terminates it; the binding still names it, and `get` reads it as missing (as the pin's does).
    bound.status = 'terminated'
    const ended = await claimOf(COMPANY)
    holding = true
    const [first, second] = [commissionOf(), commissionOf()]
    // Both at once: each finds the claim ended, and only one may take it again (the claim's UPDATE is the CAS).
    const [a, b] = [resentOn503(p, first), resentOn503(p, second)]
    await until('the replacement reconcile to be in flight', () => m.asked.length >= 2)
    await sleep(300)
    hold.open()
    assert.deepEqual([(await a).status, (await b).status], [200, 200])
    const live = m.live(COMPANY).map((agent) => agent.id)
    const assignees = Object.fromEntries(
      [first, second].map((c) => [c.key, [...p.issues.values()].find((i) => i.originId === c.key)?.assigneeAgentId]),
    )
    assert.deepEqual(
      { live: live.length, replaced: live[0] !== old, assignees },
      { live: 1, replaced: true, assignees: { [first.key]: live[0], [second.key]: live[0] } },
      'one live replacement, and each new work bound to it',
    )
    assert.deepEqual(
      ended,
      { host_process: 'host-1:100', ended: true, agent_id: old, fenced: false },
      'the claim the first work ended, taken again for the replacement',
    )
    assert.equal(m.asked.length, 2, 'one reconcile for the first reviewer, one for its replacement')
    assert.deepEqual(await claimOf(COMPANY), {
      host_process: 'host-1:100',
      ended: true,
      agent_id: live[0] ?? null,
      fenced: false,
    })
  })

  it('two first commissions of one company at once: one reconcile, one reviewer, both issues assigned to it', async () => {
    const hold = gate()
    const m = managedAgents({ between: () => hold.shut })
    const p = paperclip(m)
    const [first, second] = [commissionOf(), commissionOf()]
    const a = p.request(delivery(first))
    await until('the first reconcile to be in flight', () => m.asked.length === 1)
    const b = p.request(delivery(second))
    assert.equal(codeOf(await soon(b)), '503 reviewer_provisioning', 'the second waits for the first; never a refusal')
    hold.open()
    assert.equal((await a).status, 200)
    await b
    assert.equal((await p.request(delivery(second))).status, 200, 'asked again, it is created')
    const reviewers = m.live(COMPANY)
    assert.equal(reviewers.length, 1, 'one live managed reviewer')
    assert.equal(m.asked.length, 1, 'the host reconciled once')
    const issues = [...p.issues.values()]
    assert.deepEqual(issues.map((i) => i.originId).toSorted(), [first.key, second.key].toSorted())
    for (const issue of issues) assert.equal(issue.assigneeAgentId, reviewers[0]?.id, 'both issues assigned to it')
    assert.deepEqual(await claimOf(COMPANY), {
      host_process: 'host-1:100',
      ended: true,
      agent_id: reviewers[0]?.id ?? null,
      fenced: false,
    })
  })

  it('many first commissions of one company at once, on separate connections: one claim, one reviewer', async () => {
    const hold = gate()
    const m = managedAgents({ between: () => hold.shut })
    const p = paperclip(m)
    const works = Array.from({ length: 6 }, () => commissionOf())
    const answers = works.map((c) => p.request(delivery(c)))
    await until('a reconcile to be in flight', () => m.asked.length >= 1)
    const early = await Promise.all(answers.map(soon))
    hold.open()
    const settled = await Promise.all(answers)
    assert.equal(early.filter((r) => r === 'pending').length, 1, 'one request holds the claim and waits at the host')
    assert.equal(early.filter((r) => codeOf(r) === '503 reviewer_provisioning').length, 5)
    assert.equal(settled.filter((r) => r.status === 200).length, 1)
    for (const c of works) assert.equal((await p.request(delivery(c))).status, 200)
    const reviewers = m.live(COMPANY)
    assert.equal(reviewers.length, 1)
    assert.equal(m.asked.length, 1)
    assert.equal(p.issues.size, 6)
    for (const issue of p.issues.values()) assert.equal(issue.assigneeAgentId, reviewers[0]?.id)
  })

  it('a resend of the same commission while it is provisioning answers 503, then the same issue', async () => {
    const hold = gate()
    const m = managedAgents({ between: () => hold.shut })
    const p = paperclip(m)
    const c = commissionOf()
    const a = p.request(delivery(c))
    await until('the reconcile to be in flight', () => m.asked.length === 1)
    const resent = p.request(delivery(c))
    assert.equal(codeOf(await soon(resent)), '503 reviewer_provisioning')
    hold.open()
    const created = await a
    await resent
    const later = await p.request(delivery(c))
    assert.equal(created.status, 200)
    assert.deepEqual(
      [(later.body as { outcome: string }).outcome, (later.body as { issueId: string }).issueId],
      ['existing', (created.body as { issueId: string }).issueId],
    )
    assert.equal(m.live(COMPANY).length, 1)
    assert.equal(p.issues.size, 1)
  })

  it('other companies provision at once, each its own reviewer: the claim is per company', async () => {
    const hold = gate()
    const m = managedAgents({ between: () => hold.shut })
    const p = paperclip(m)
    const a = p.request(delivery(commissionOf(COMPANY)))
    const b = p.request(delivery(commissionOf(OTHER_COMPANY)))
    await until('both reconciles to be in flight', () => m.asked.length === 2)
    hold.open()
    assert.deepEqual([(await a).status, (await b).status], [200, 200])
    const [mine, theirs] = [m.live(COMPANY), m.live(OTHER_COMPANY)]
    assert.deepEqual([mine.length, theirs.length], [1, 1])
    for (const issue of p.issues.values())
      assert.equal(issue.assigneeAgentId, (issue.companyId === COMPANY ? mine : theirs)[0]?.id)
  })

  it('a reviewer the host has bound is read with nothing claimed, written or reconciled', async () => {
    const m = managedAgents()
    const agent = await m.reconcile(COMPANY)
    const p = paperclip(m)
    const answer = await p.request(delivery(commissionOf()))
    assert.equal(answer.status, 200)
    assert.equal(m.asked.length, 1, 'only the reconcile made before')
    assert.equal(await claimOf(COMPANY), undefined)
    assert.equal([...p.issues.values()][0]?.assigneeAgentId, agent)
  })
})

describe('a provisioning whose host call is uncertain, or whose owner is gone', () => {
  it('unanswered while the host goes on: the claim stays, a replacement answers 503, then reads what landed', async () => {
    const hold = gate()
    const m = managedAgents({ between: () => hold.shut, fails: once('unanswered-landing') })
    let serving: HostProcess = { namespace: 'boot-1/pid:[1]', process: 'host-1:100' }
    const p = paperclip(m, { hostProcess: () => serving })
    const first = commissionOf()
    await assert.rejects(p.request(delivery(first)), UnansweredHostCall)
    assert.deepEqual(await claimOf(COMPANY), {
      host_process: 'host-1:100',
      ended: false,
      agent_id: null,
      fenced: false,
    })
    serving = { namespace: 'boot-1/pid:[1]', process: 'host-2:200' }
    const other = p.request(delivery(commissionOf()))
    const same = p.request(delivery(first))
    assert.equal(codeOf(await soon(other)), '503 reviewer_provisioning', 'another work item waits')
    assert.equal(codeOf(await soon(same)), '503 reviewer_provisioning', 'the same commission waits')
    hold.open()
    await until('the host to land the reconcile', () => m.get(COMPANY) !== null)
    await Promise.all([other, same])
    const created = await p.request(delivery(first))
    assert.equal(created.status, 200)
    assert.equal(m.live(COMPANY).length, 1)
    assert.equal(m.asked.length, 1, 'never reconciled again')
    assert.equal([...p.issues.values()][0]?.assigneeAgentId, m.get(COMPANY))
    assert.deepEqual(await claimOf(COMPANY), {
      host_process: 'host-1:100',
      ended: false,
      agent_id: null,
      fenced: false,
    })
  })

  it('unanswered and never landed: 503 until an operator fences it; then one reviewer, relinking the orphan', async () => {
    const m = managedAgents({ fails: once('unanswered') })
    const p = paperclip(m)
    const first = commissionOf()
    await assert.rejects(p.request(delivery(first)), UnansweredHostCall)
    // The instance that served it had created an agent and died before it bound it: an orphan with the marker.
    const orphan = randomUUID()
    m.agents.set(orphan, { id: orphan, companyId: COMPANY, status: 'idle' })
    assert.equal(codeOf(await soon(p.request(delivery(first)))), '503 reviewer_provisioning')
    // The operator's fence-provisioning step (its statement is tested in operator-fence.db.test.ts).
    await pool.query(
      `UPDATE ${NAMESPACE}.reviewer_provisioning SET fenced_at = now(), fence = 'operator test: previous instance stopped'
        WHERE company_id = $1 AND ended_at IS NULL AND fenced_at IS NULL`,
      [COMPANY],
    )
    const created = await p.request(delivery(first))
    assert.equal(created.status, 200)
    assert.deepEqual(
      m.live(COMPANY).map((a) => a.id),
      [orphan],
      'the orphan relinked, no second agent',
    )
    assert.equal([...p.issues.values()][0]?.assigneeAgentId, orphan)
    assert.deepEqual(await claimOf(COMPANY), {
      host_process: 'host-1:100',
      ended: true,
      agent_id: orphan,
      fenced: false,
    })
  })

  it('answered with an error before anything was done: the claim ends, and the next request provisions', async () => {
    const m = managedAgents({ fails: once('before') })
    const p = paperclip(m)
    const c = commissionOf()
    await assert.rejects(p.request(delivery(c)), /injected: reconcile failed/)
    assert.deepEqual(await claimOf(COMPANY), { host_process: 'host-1:100', ended: true, agent_id: null, fenced: false })
    assert.equal((await p.request(delivery(c))).status, 200)
    assert.equal(m.live(COMPANY).length, 1)
    assert.equal(m.asked.length, 2)
  })

  it('answered with an error after the agent was bound: the claim ends, and the next request reads that agent', async () => {
    const m = managedAgents({ fails: once('after') })
    const p = paperclip(m)
    const c = commissionOf()
    await assert.rejects(p.request(delivery(c)), /injected: agent created and bound/)
    assert.equal((await p.request(delivery(c))).status, 200)
    assert.equal(m.live(COMPANY).length, 1)
    assert.equal(m.asked.length, 1, 'read, never reconciled again')
    assert.equal([...p.issues.values()][0]?.assigneeAgentId, m.get(COMPANY))
  })

  it('a reviewer still missing after its reconcile is refused as before (409 reviewer_missing), and the claim ends', async () => {
    const p = memoryPaperclip(pool, { config, now: () => NOW, reviewerAgentId: null })
    const answer = await p.request(delivery(commissionOf()))
    assert.equal(codeOf(answer), '409 reviewer_missing')
    assert.deepEqual(await claimOf(COMPANY), { host_process: 'host-1:100', ended: true, agent_id: null, fenced: false })
  })
})
