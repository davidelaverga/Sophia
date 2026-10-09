// WBC-02 G1/G2: the sophia.coordination plugin's routes over a synthetic Paperclip (memory-host.ts) whose namespace is
// a real PostgreSQL schema with the plugin's migration. Level: sql-run against the plugin's own tables; the pinned
// host's issue services are stood in for, never claimed. INT-02 (forged, expired, replayed, cross-company and
// unmapped requests change nothing), INT-05 (a lost reply is answered by the same issue; a concurrent create is
// serialized) and the control mirror.
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import pg from 'pg'
import { ENVELOPE_SKEW_SECONDS, signEnvelope, type EnvelopeOp } from '@sophia/coordination/envelope'
import {
  COMMISSION_ORIGIN_KIND,
  ROUTES,
  type Commission,
  type Control,
  type Lookup,
} from '@sophia/coordination/plugin-wire'
import { createEmptyDatabase, type EmptyDatabase } from '@sophia/test-support'
import { forgetSpentNonces, handleApiRequest, NONCE_GRACE_SECONDS, settleOpenWrites } from './coordination.ts'
import type { CoordinationHost, HostProcess } from './host.ts'
import {
  INTEGRATION_USER,
  installNamespace,
  memoryPaperclip,
  NAMESPACE,
  type MemoryPaperclip,
  type MemoryPaperclipOptions,
} from './memory-host.ts'

const sophia = generateKeyPairSync('ed25519')
const forger = generateKeyPairSync('ed25519')
const COMPANY = 'company-a'
const OTHER_COMPANY = 'company-b'
const PROJECT = 'pc-project-a'
const SOPHIA_PROJECT = randomUUID()
const NOW = 1_800_000_000

let db: EmptyDatabase
let client: pg.Client

before(async () => {
  db = await createEmptyDatabase('sophia_pc')
  client = new pg.Client({ connectionString: db.ownerUrl })
  await client.connect()
  await installNamespace(client)
})
after(async () => {
  await client.end()
  await db.drop()
})
beforeEach(async () => {
  await client.query(
    `TRUNCATE ${NAMESPACE}.controls, ${NAMESPACE}.effects, ${NAMESPACE}.wakes, ${NAMESPACE}.commissions, ${NAMESPACE}.envelope_nonces, public.heartbeat_runs`,
  )
})

const config = {
  signingPublicKey: sophia.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  integrationUserId: 'user-sophia-integration',
  projects: [{ sophiaProjectId: SOPHIA_PROJECT, companyId: COMPANY, paperclipProjectId: PROJECT }],
}

const paperclip = (over: Partial<MemoryPaperclipOptions> = {}): MemoryPaperclip =>
  memoryPaperclip(client, { config, now: () => NOW, ...over })

function commissionOf(workId = randomUUID()): Commission {
  return {
    key: `sophia-wbc02-${workId}`,
    sophiaProjectId: SOPHIA_PROJECT,
    paperclipProjectId: PROJECT,
    workId,
    title: 'Source review: launch brief',
    description: 'Review two selected sources against the plan’s criteria. Source text stays in Sophia.',
    initialStatus: 'todo',
    wake: true,
  }
}

interface Sign {
  readonly op: EnvelopeOp
  readonly deliveryKey: string
  readonly companyId?: string
  readonly key?: typeof sophia.privateKey
  readonly iat?: number
}

function envelope(c: { workId: string; commissionKey: string }, body: unknown, s: Sign) {
  const iat = s.iat ?? NOW
  return signEnvelope(
    {
      op: s.op,
      companyId: s.companyId ?? COMPANY,
      paperclipProjectId: PROJECT,
      sophiaProjectId: SOPHIA_PROJECT,
      workId: c.workId,
      commissionKey: c.commissionKey,
      deliveryKey: s.deliveryKey,
      initiator: { kind: 'member', id: randomUUID() },
      nonce: randomUUID(),
      iat,
      exp: iat + 120,
    },
    body,
    s.key ?? sophia.privateKey,
  )
}

const commissionRequest = (c: Commission, s: Partial<Sign> = {}) => ({
  routeKey: 'commission',
  params: {},
  companyId: s.companyId ?? COMPANY,
  body: {
    companyId: s.companyId ?? COMPANY,
    envelope: envelope({ workId: c.workId, commissionKey: c.key }, c, {
      op: 'commission',
      deliveryKey: `commission-${c.workId}`,
      ...s,
    }),
    commission: c,
  },
})

const lookupRequest = (c: Commission) => {
  const lookup: Lookup = { key: c.key, sophiaProjectId: SOPHIA_PROJECT, workId: c.workId }
  return {
    routeKey: 'lookup',
    params: {},
    companyId: COMPANY,
    body: {
      companyId: COMPANY,
      envelope: envelope({ workId: c.workId, commissionKey: c.key }, lookup, {
        op: 'lookup',
        deliveryKey: `lookup-${c.workId}`,
      }),
      lookup,
    },
  }
}

const controlRequest = (c: Commission, issueId: string, op: Control['op'], key: string, signedOp: EnvelopeOp = op) => {
  const control: Control = { op, key, commissionKey: c.key, sophiaProjectId: SOPHIA_PROJECT, workId: c.workId }
  return {
    routeKey: 'control',
    params: { issueId },
    companyId: COMPANY,
    body: {
      envelope: envelope({ workId: c.workId, commissionKey: c.key }, control, { op: signedOp, deliveryKey: key }),
      control,
    },
  }
}

const code = (body: unknown): unknown =>
  typeof body === 'object' && body !== null && 'error' in body ? body.error : body

/** The runs the synthetic host queued for an issue: one per wakeup that arrived (the pin does not dedupe by key). */
const runsOf = async (issueId: string): Promise<number> =>
  Number(
    (
      await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.heartbeat_runs WHERE context_snapshot->>'issueId' = $1`,
        [issueId],
      )
    ).rows[0]?.n,
  )

/**
 * Ages a wakeup ask, and the host's answer to it, past the window in which a run may still appear (its first ask, which
 * runs count from, stays).
 */
const ageAsk = async (key: string) =>
  client.query(
    `UPDATE ${NAMESPACE}.wakes SET asked_at = asked_at - interval '2 minutes', answered_at = answered_at - interval '2 minutes'
      WHERE wake_key = $1`,
    [key],
  )

/** Ages an ask by an hour, answered or not: time alone must finish no ask the host never answered. */
const ageAskAnHour = async (key: string) =>
  client.query(
    `UPDATE ${NAMESPACE}.wakes SET asked_at = asked_at - interval '1 hour', first_asked_at = first_asked_at - interval '1 hour'
      WHERE wake_key = $1`,
    [key],
  )

/** A wakeup ask: the host process that serves it, and whether the host answered it. */
const askOf = async (key: string) =>
  (
    await client.query<{ process: string | null; answered: boolean }>(
      `SELECT host_process AS process, answered_at IS NOT NULL AS answered FROM ${NAMESPACE}.wakes WHERE wake_key = $1`,
      [key],
    )
  ).rows[0]

/** A run of the issue, queued by the host for an ask it never answered, landing late. */
const landRun = async (issueId: string) =>
  client.query(`INSERT INTO public.heartbeat_runs (company_id, context_snapshot) VALUES ($1, $2)`, [
    COMPANY,
    { issueId, wakeReason: 'sophia:commission', source: 'sophia.coordination' },
  ])

/** The holder of a commission's effect lease, or null. */
const leaseOf = async (key: string): Promise<string | null> =>
  (
    await client.query<{ holder: string | null }>(
      `SELECT effect_holder AS holder FROM ${NAMESPACE}.commissions WHERE commission_key = $1`,
      [key],
    )
  ).rows[0]?.holder ?? null

/** A commission's status writes that no settlement has read the issue after yet. */
const openWrites = async (key: string): Promise<number> =>
  Number(
    (
      await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${NAMESPACE}.effects WHERE commission_key = $1 AND settled_at IS NULL`,
        [key],
      )
    ).rows[0]?.n,
  )

/** The delivery holding the lease outlived it (its host call is still in flight): another may take it over. */
const expireLease = async (key: string) =>
  client.query(
    `UPDATE ${NAMESPACE}.commissions SET effect_until = now() - interval '1 second' WHERE commission_key = $1`,
    [key],
  )

/** Ages the writes the host never answered by a day: time alone must finish none of them (WBC-02-CX-0017). */
const ageUnended = async (key: string) =>
  client.query(
    `UPDATE ${NAMESPACE}.effects SET started_at = started_at - interval '1 day' WHERE commission_key = $1 AND ended_at IS NULL`,
    [key],
  )

async function waitUntil(check: () => Promise<boolean>) {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('condition not reached')
}

const outcome = (body: unknown) => (body as { outcome?: string; wakeQueued?: boolean } | undefined) ?? {}

/** A create the host never answered, landing late: the issue the host makes for it, as the plugin would have asked. */
const landCreate = async (p: MemoryPaperclip, c: Commission): Promise<string> =>
  (
    await p.host.issues.create({
      companyId: COMPANY,
      projectId: PROJECT,
      title: c.title,
      description: c.description,
      status: c.initialStatus,
      priority: 'medium',
      assigneeAgentId: 'agent-source-reviewer',
      originKind: COMMISSION_ORIGIN_KIND,
      originId: c.key,
      billingCode: `sophia:${c.workId}`,
    })
  ).id

/** The claim of a key: the host process that serves its create, and whether the host answered it. */
const claimOf = async (key: string) =>
  (
    await client.query<{ process: string | null; ended: boolean }>(
      `SELECT create_host_process AS process, create_ended_at IS NOT NULL AS ended
         FROM ${NAMESPACE}.commissions WHERE commission_key = $1`,
      [key],
    )
  ).rows[0]

const IN_PROGRESS = {
  code: 'commission_in_progress',
  message: 'Another request is creating this commission; reconcile by its key',
}

describe('commission', () => {
  it('creates one core issue assigned to the source reviewer, with the commission origin, and wakes it', async () => {
    const p = paperclip()
    const c = commissionOf()
    const res = await p.request(commissionRequest(c))
    assert.equal(res.status, 200)
    const issue = [...p.issues.values()][0]
    assert.ok(issue)
    assert.deepEqual(res.body, { outcome: 'created', issueId: issue.id, status: 'todo', wakeQueued: true })
    assert.equal(issue.assigneeAgentId, 'agent-source-reviewer')
    assert.equal(issue.originKind, COMMISSION_ORIGIN_KIND)
    assert.equal(issue.originId, c.key)
    assert.equal(issue.billingCode, `sophia:${c.workId}`)
    assert.equal(issue.projectId, PROJECT)
    assert.ok(!JSON.stringify(issue).includes('BEGIN PRIVATE KEY'))
    assert.deepEqual(p.wakeups, [{ issueId: issue.id, idempotencyKey: c.key }])
  })

  it('answers a resend whose first reply was lost with the same issue (INT-05)', async () => {
    const p = paperclip()
    const c = commissionOf()
    const first = await p.request(commissionRequest(c))
    const again = await p.request(commissionRequest(c))
    assert.equal(p.issues.size, 1)
    assert.equal(again.status, 200)
    assert.deepEqual(again.body, {
      outcome: 'existing',
      issueId: [...p.issues.keys()][0],
      status: 'todo',
      wakeQueued: false,
    })
    assert.notDeepEqual(first.body, again.body)
  })

  it('does not wake a commission that starts blocked', async () => {
    const p = paperclip()
    await p.request(commissionRequest({ ...commissionOf(), initialStatus: 'blocked' }))
    assert.equal(p.wakeups.length, 0)
  })

  it('a commission wake that never arrived is asked again once its ask is stale, never while in flight (CX-0002/0004)', async () => {
    let fault: 'before' | null = 'before'
    const p = paperclip({ fails: { wake: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)), /before it was durable/)
    const issueId = [...p.issues.keys()][0] ?? ''
    assert.equal(await runsOf(issueId), 0, 'the issue exists, nobody was woken')
    fault = null
    const early = await p.request(commissionRequest(c))
    assert.equal(early.status, 503, 'an ask that may still be in flight is waited for, not repeated')
    assert.equal((code(early.body) as { code: string }).code, 'wake_in_progress')
    await ageAsk(c.key)
    const again = await p.request(commissionRequest(c))
    assert.deepEqual(again.body, { outcome: 'existing', issueId, status: 'todo', wakeQueued: true })
    assert.equal(await runsOf(issueId), 1)
    const third = await p.request(commissionRequest(c))
    assert.equal(outcome(third.body).wakeQueued, false, 'a confirmed wake is not asked again')
    assert.equal(await runsOf(issueId), 1)
  })

  it('a commission wake that was durable but whose reply was lost is reconciled by its run, never asked again (CX-0004)', async () => {
    let fault: 'after' | null = 'after'
    const p = paperclip({ fails: { wake: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)), /durable, then the call failed/)
    const issueId = [...p.issues.keys()][0] ?? ''
    assert.equal(await runsOf(issueId), 1)
    fault = null
    await ageAsk(c.key)
    const again = await p.request(commissionRequest(c))
    assert.deepEqual(again.body, { outcome: 'existing', issueId, status: 'todo', wakeQueued: false })
    assert.equal(await runsOf(issueId), 1, 'the run since the ask confirms it: no second run')
  })

  it('a wakeup held in flight past 60 s, across a restart, is waited for and asked once (Codex on #107)', async () => {
    const gate = Promise.withResolvers<void>()
    let held = true
    let serving: HostProcess = { namespace: 'boot-1/pid:[1]', process: 'host-1:100' }
    const p = paperclip({ beforeWake: () => (held ? gate.promise : Promise.resolve()), hostProcess: () => serving })
    const c = commissionOf()
    const original = p.request(commissionRequest(c))
    await waitUntil(async () => (await askOf(c.key)) !== undefined)
    await ageAskAnHour(c.key)
    serving = { namespace: 'boot-2/pid:[1]', process: 'host-2:200' }
    const resends = await Promise.all([p.request(commissionRequest(c)), p.request(commissionRequest(c))])
    for (const r of resends)
      assert.deepEqual([r.status, (code(r.body) as { code: string }).code], [503, 'wake_in_progress'])
    assert.deepEqual(
      await askOf(c.key),
      { process: 'host-1:100', answered: false },
      'the ask names the process serving it',
    )
    held = false
    gate.resolve()
    assert.equal(outcome((await original).body).wakeQueued, true, 'the original ask completes late')
    const issueId = [...p.issues.keys()][0] ?? ''
    const again = await p.request(commissionRequest(c))
    assert.deepEqual(again.body, { outcome: 'existing', issueId, status: 'todo', wakeQueued: false })
    assert.equal(await runsOf(issueId), 1)
    assert.equal(p.wakeups.length, 1)
  })

  it('a wakeup the host never answered is waited for however long; a run landing late confirms it', async () => {
    let fault: 'unanswered' | null = 'unanswered'
    const p = paperclip({ fails: { wake: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)), { name: 'UnansweredHostCall' })
    const issueId = [...p.issues.keys()][0] ?? ''
    fault = null
    await ageAskAnHour(c.key)
    const waiting = await p.request(commissionRequest(c))
    assert.deepEqual([waiting.status, (code(waiting.body) as { code: string }).code], [503, 'wake_in_progress'])
    assert.equal(await runsOf(issueId), 0, 'never asked again')
    await landRun(issueId)
    const again = await p.request(commissionRequest(c))
    assert.deepEqual(again.body, { outcome: 'existing', issueId, status: 'todo', wakeQueued: false })
    assert.equal(await runsOf(issueId), 1, 'the late run confirms it: no second')
  })

  it('an operator fence ends a wakeup ask the host never answered: it is then asked again, once', async () => {
    let fault: 'unanswered' | null = 'unanswered'
    const p = paperclip({ fails: { wake: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)), { name: 'UnansweredHostCall' })
    const issueId = [...p.issues.keys()][0] ?? ''
    fault = null
    await client.query(`UPDATE ${NAMESPACE}.wakes SET fenced_at = now(), fence = 'test operator' WHERE wake_key = $1`, [
      c.key,
    ])
    const replies = await Promise.all([p.request(commissionRequest(c)), p.request(commissionRequest(c))])
    for (const r of replies) assert.ok([200, 503].includes(r.status), `answered ${r.status}`)
    assert.equal(await runsOf(issueId), 1, 'one resend claimed the fenced ask')
    const third = await p.request(commissionRequest(c))
    assert.equal(outcome(third.body).wakeQueued, false)
    assert.equal(await runsOf(issueId), 1)
  })

  it('concurrent resends of a stale commission wake ask the host once', async () => {
    let fault: 'before' | null = 'before'
    const p = paperclip({ fails: { wake: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)))
    const issueId = [...p.issues.keys()][0] ?? ''
    fault = null
    await ageAsk(c.key)
    const replies = await Promise.all([p.request(commissionRequest(c)), p.request(commissionRequest(c))])
    for (const r of replies) assert.ok([200, 503].includes(r.status), `answered ${r.status}`)
    assert.equal(
      await runsOf(issueId),
      1,
      'one resend claimed the ask; the other was told to wait or found it confirmed',
    )
  })

  it('wakes on the resend a commission that crashed between its create and its first ask', async () => {
    const p = paperclip()
    const c = commissionOf()
    await p.request(commissionRequest(c))
    const issueId = [...p.issues.keys()][0] ?? ''
    // The crash window: the issue and its binding exist, the wake was never asked.
    await client.query(`DELETE FROM ${NAMESPACE}.wakes WHERE wake_key = $1`, [c.key])
    await client.query(`DELETE FROM public.heartbeat_runs WHERE context_snapshot->>'issueId' = $1`, [issueId])
    const again = await p.request(commissionRequest(c))
    assert.equal(outcome(again.body).wakeQueued, true)
    assert.equal(await runsOf(issueId), 1)
  })

  it('does not wake on the resend a commission held since its create', async () => {
    let fault: 'before' | null = 'before'
    const p = paperclip({ fails: { wake: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)))
    const issueId = [...p.issues.keys()][0] ?? ''
    fault = null
    await p.request(controlRequest(c, issueId, 'hold', 'hold-before-resend'))
    await ageAsk(c.key)
    const again = await p.request(commissionRequest(c))
    assert.deepEqual(again.body, { outcome: 'existing', issueId, status: 'blocked', wakeQueued: false })
    assert.equal(await runsOf(issueId), 0)
  })

  it('a commission whose issue someone moved out of todo before its wake was confirmed is not delivered; back in todo, it is woken (Codex on #107)', async () => {
    let fault: 'before' | null = 'before'
    const p = paperclip({ fails: { wake: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)), /before it was durable/)
    const issueId = [...p.issues.keys()][0] ?? ''
    const issue = p.issues.get(issueId)
    assert.ok(issue)
    fault = null
    // A board user moves the issue before Sophia learned it: no control of Sophia's did, and nobody was woken.
    issue.status = 'backlog'
    await ageAsk(c.key)
    const unconfirmed = await p.request(commissionRequest(c))
    assert.deepEqual(
      [unconfirmed.status, (code(unconfirmed.body) as { code: string }).code],
      [503, 'wake_unconfirmed'],
      'not delivered: Sophia asks again',
    )
    assert.equal(await runsOf(issueId), 0, 'not woken against the status someone set')
    issue.status = 'todo'
    const woken = await p.request(commissionRequest(c))
    assert.deepEqual(woken.body, { outcome: 'existing', issueId, status: 'todo', wakeQueued: true })
    assert.equal(await runsOf(issueId), 1)
  })

  it('a commission whose wakeup the host never answered, its issue then moved, is neither delivered nor asked again (Codex on #107)', async () => {
    for (const moved of ['in_progress', 'blocked', 'cancelled']) {
      let fault: 'unanswered' | null = 'unanswered'
      const p = paperclip({ fails: { wake: () => fault } })
      const c = commissionOf()
      await assert.rejects(p.request(commissionRequest(c)), { name: 'UnansweredHostCall' })
      const issueId = [...p.issues.keys()][0] ?? ''
      const issue = p.issues.get(issueId)
      assert.ok(issue)
      fault = null
      const asked = p.wakeups.length
      // A visible status is no proof of a run, nor is someone's Hold or Stop in Paperclip undone.
      issue.status = moved
      const unconfirmed = await p.request(commissionRequest(c))
      assert.deepEqual(
        [unconfirmed.status, (code(unconfirmed.body) as { code: string }).code],
        [503, 'wake_unconfirmed'],
        moved,
      )
      assert.deepEqual(
        [p.wakeups.length, await runsOf(issueId), issue.status],
        [asked, 0, moved],
        `${moved}: nothing asked`,
      )
      // Back in todo, the ask the host never answered is still waited for, never asked again without its proof.
      issue.status = 'todo'
      await ageAskAnHour(c.key)
      const waiting = await p.request(commissionRequest(c))
      assert.deepEqual(
        [waiting.status, (code(waiting.body) as { code: string }).code],
        [503, 'wake_in_progress'],
        moved,
      )
      assert.equal(p.wakeups.length, asked, `${moved}: never asked again`)
      // Its run landing late confirms it, whatever the status then.
      await landRun(issueId)
      issue.status = moved
      const confirmed = await p.request(commissionRequest(c))
      assert.deepEqual(confirmed.body, { outcome: 'existing', issueId, status: moved, wakeQueued: false }, moved)
      assert.equal(await runsOf(issueId), 1, `${moved}: no second run`)
    }
  })

  it('a commission held from its create is delivered on its resend, never woken', async () => {
    const p = paperclip()
    const c = { ...commissionOf(), initialStatus: 'blocked' as const, wake: false }
    const created = await p.request(commissionRequest(c))
    assert.equal(outcome(created.body).outcome, 'created')
    const issueId = [...p.issues.keys()][0] ?? ''
    const again = await p.request(commissionRequest(c))
    assert.deepEqual(again.body, { outcome: 'existing', issueId, status: 'blocked', wakeQueued: false })
    assert.deepEqual([p.wakeups.length, await runsOf(issueId)], [0, 0])
  })

  it('a commission whose wake reached the reviewer, its run having moved the issue, is delivered and not woken again', async () => {
    let fault: 'after' | null = 'after'
    const p = paperclip({ fails: { wake: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)), /durable, then the call failed/)
    const issueId = [...p.issues.keys()][0] ?? ''
    const issue = p.issues.get(issueId)
    assert.ok(issue)
    fault = null
    issue.status = 'in_progress'
    const again = await p.request(commissionRequest(c))
    assert.deepEqual(again.body, { outcome: 'existing', issueId, status: 'in_progress', wakeQueued: false })
    assert.equal(await runsOf(issueId), 1, 'no second run')
    const confirmed = await client.query(
      `SELECT 1 FROM ${NAMESPACE}.wakes WHERE wake_key = $1 AND confirmed_at IS NOT NULL`,
      [c.key],
    )
    assert.equal(confirmed.rowCount, 1, 'its run confirms the wakeup')
  })

  it('serializes concurrent creates of one key: one creates, the other is told to reconcile (503)', async () => {
    const gate = Promise.withResolvers<void>()
    const p = paperclip({ beforeCreate: () => gate.promise })
    const c = commissionOf()
    const first = p.request(commissionRequest(c))
    await new Promise((resolve) => setTimeout(resolve, 50))
    const second = await p.request(commissionRequest(c))
    const pending = await p.request(lookupRequest(c))
    gate.resolve()
    assert.equal(second.status, 503)
    assert.deepEqual(code(second.body), IN_PROGRESS)
    assert.equal(pending.status, 503, 'a create in flight is not proof of absence')
    assert.equal((await first).status, 200)
    assert.equal(p.issues.size, 1)
    const found = await p.request(lookupRequest(c))
    assert.deepEqual(found.body, { outcome: 'found', issueId: [...p.issues.keys()][0], status: 'todo' })
  })

  it('keeps the key claimed while a create the host never answered may land, however long ago (Codex on #107)', async () => {
    let fault: 'unanswered' | null = 'unanswered'
    const p = paperclip({ fails: { create: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)), { name: 'UnansweredHostCall' })
    fault = null
    await client.query(
      `UPDATE ${NAMESPACE}.commissions SET create_started_at = create_started_at - interval '1 day',
              updated_at = updated_at - interval '1 day' WHERE commission_key = $1`,
      [c.key],
    )
    const lookup = await p.request(lookupRequest(c))
    assert.equal(lookup.status, 503, 'a day on, still no proof of absence')
    const again = await p.request(commissionRequest(c))
    assert.deepEqual([again.status, code(again.body)], [503, IN_PROGRESS])
    assert.equal(p.issues.size, 0, 'no second create was begun')
    // The create lands after all: it is the commission's issue, bound and woken by the next delivery.
    const late = await landCreate(p, c)
    assert.deepEqual((await p.request(lookupRequest(c))).body, { outcome: 'found', issueId: late, status: 'todo' })
    const bound = await p.request(commissionRequest(c))
    assert.deepEqual(bound.body, { outcome: 'existing', issueId: late, status: 'todo', wakeQueued: true })
    assert.equal(p.issues.size, 1)
  })

  it('an original create held past 120 s, across a restart, is never proved absent nor created again (Codex on #107)', async () => {
    const gate = Promise.withResolvers<void>()
    let serving: HostProcess = { namespace: 'boot-1/pid:[1]', process: 'host-1:100' }
    const p = paperclip({ beforeCreate: () => gate.promise, hostProcess: () => serving })
    const c = commissionOf()
    const original = p.request(commissionRequest(c))
    await waitUntil(async () => (await claimOf(c.key)) !== undefined)
    // Held at the host for an hour by its row's age (no sleep), within the worker's wait or past it: the host may still
    // commit. Then Paperclip restarts and another process serves: that proves nothing about the create either.
    await client.query(
      `UPDATE ${NAMESPACE}.commissions SET create_started_at = create_started_at - interval '1 hour',
              updated_at = updated_at - interval '1 hour', created_at = created_at - interval '1 hour'
        WHERE commission_key = $1`,
      [c.key],
    )
    serving = { namespace: 'boot-2/pid:[1]', process: 'host-2:200' }
    const [lookup, again] = await Promise.all([p.request(lookupRequest(c)), p.request(commissionRequest(c))])
    assert.deepEqual(
      [lookup.status, code(lookup.body)],
      [503, { code: 'commission_in_progress', message: 'A create of this commission may still be in flight' }],
    )
    assert.deepEqual([again.status, code(again.body)], [503, IN_PROGRESS])
    assert.deepEqual(
      await claimOf(c.key),
      { process: 'host-1:100', ended: false },
      'the claim names the process serving it',
    )
    gate.resolve()
    const late = await original
    assert.equal(outcome(late.body).outcome, 'created', 'the original create completes late')
    const issueId = [...p.issues.keys()][0]
    assert.deepEqual((await p.request(lookupRequest(c))).body, { outcome: 'found', issueId, status: 'todo' })
    const resent = await p.request(commissionRequest(c))
    assert.deepEqual(resent.body, { outcome: 'existing', issueId, status: 'todo', wakeQueued: false })
    assert.equal(p.issues.size, 1, 'one core issue')
    assert.equal(p.wakeups.length, 1, 'one wakeup')
    assert.equal(await runsOf(issueId ?? ''), 1)
  })

  it('an operator fence ends the claim of a create that never landed: the key is then created once', async () => {
    let fault: 'unanswered' | null = 'unanswered'
    const p = paperclip({ fails: { create: () => fault } })
    const c = commissionOf()
    await assert.rejects(p.request(commissionRequest(c)), { name: 'UnansweredHostCall' })
    fault = null
    await client.query(
      `UPDATE ${NAMESPACE}.commissions SET create_fenced_at = now(), create_fence = 'test operator' WHERE commission_key = $1`,
      [c.key],
    )
    assert.deepEqual((await p.request(lookupRequest(c))).body, { outcome: 'absent' })
    const created = await p.request(commissionRequest(c))
    assert.equal(outcome(created.body).outcome, 'created')
    assert.equal(p.issues.size, 1)
    const again = await p.request(commissionRequest(c))
    assert.equal(outcome(again.body).outcome, 'existing')
    assert.equal(p.issues.size, 1)
  })

  it('a create the host answered with an error ends its claim: the issue its origin finds is the whole truth', async () => {
    for (const failure of ['before', 'after'] as const) {
      let fault: 'before' | 'after' | null = failure
      const p = paperclip({ fails: { create: () => fault } })
      const c = commissionOf()
      await assert.rejects(p.request(commissionRequest(c)), /injected: issue create/)
      fault = null
      const lookup = await p.request(lookupRequest(c))
      const resent = await p.request(commissionRequest(c))
      assert.equal(p.issues.size, 1, `${failure}: one issue`)
      const issueId = [...p.issues.keys()][0]
      if (failure === 'before') {
        assert.deepEqual(lookup.body, { outcome: 'absent' })
        assert.equal(outcome(resent.body).outcome, 'created')
      } else {
        assert.deepEqual(lookup.body, { outcome: 'found', issueId, status: 'todo' })
        assert.equal(outcome(resent.body).outcome, 'existing')
      }
    }
  })

  it('proves absence of a key no create ever claimed', async () => {
    const res = await paperclip().request(lookupRequest(commissionOf()))
    assert.deepEqual(res.body, { outcome: 'absent' })
  })

  it('refuses when the reviewer agent is not provisioned, creating nothing', async () => {
    const p = paperclip({ reviewerAgentId: null })
    const res = await p.request(commissionRequest(commissionOf()))
    assert.equal(res.status, 409)
    assert.equal(p.issues.size, 0)
  })
})

describe('refusals change nothing (INT-02)', () => {
  const refused = async (
    p: MemoryPaperclip,
    request: Parameters<MemoryPaperclip['request']>[0],
    status: number,
    errorCode: string,
  ) => {
    const res = await p.request(request)
    assert.equal(res.status, status, JSON.stringify(res.body))
    assert.equal((code(res.body) as { code: string }).code, errorCode)
    assert.equal(p.issues.size, 0)
    assert.equal(p.wakeups.length, 0)
  }

  it('a forged signature', async () => {
    await refused(
      paperclip(),
      commissionRequest(commissionOf(), { key: forger.privateKey }),
      403,
      'envelope_bad_signature',
    )
  })

  it('a body changed after signing', async () => {
    const c = commissionOf()
    const request = commissionRequest(c)
    await refused(
      paperclip(),
      { ...request, body: { ...request.body, commission: { ...c, title: 'Something else' } } },
      403,
      'envelope_digest_mismatch',
    )
  })

  it('an expired envelope', async () => {
    await refused(paperclip(), commissionRequest(commissionOf(), { iat: NOW - 600 }), 401, 'envelope_expired')
  })

  it('a replayed envelope', async () => {
    const p = paperclip()
    const request = commissionRequest(commissionOf())
    assert.equal((await p.request(request)).status, 200)
    const res = await p.request(request)
    assert.equal(res.status, 409)
    assert.equal(p.issues.size, 1)
  })

  it('an envelope for another company', async () => {
    const c = commissionOf()
    const request = commissionRequest(c, { companyId: OTHER_COMPANY })
    await refused(
      paperclip(),
      { ...request, companyId: COMPANY, body: { ...request.body, companyId: COMPANY } },
      403,
      'envelope_wrong_company',
    )
  })

  it('a company the Sophia project is not mapped to', async () => {
    await refused(paperclip(), commissionRequest(commissionOf(), { companyId: OTHER_COMPANY }), 403, 'not_mapped')
  })

  it('an envelope signed for another operation', async () => {
    const c = commissionOf()
    await refused(paperclip(), commissionRequest(c, { op: 'lookup' }), 403, 'envelope_wrong_operation')
  })

  it('an agent or another board user', async () => {
    const request = commissionRequest(commissionOf())
    await refused(
      paperclip(),
      { ...request, actor: { actorType: 'agent', actorId: 'agent-x' } },
      403,
      'not_integration_principal',
    )
    await refused(
      paperclip(),
      { ...request, actor: { actorType: 'user', actorId: 'user-other', userId: 'user-other' } },
      403,
      'not_integration_principal',
    )
  })

  it('a plugin with no configuration', async () => {
    await refused(paperclip({ config: {} }), commissionRequest(commissionOf()), 503, 'not_configured')
  })

  it('a configuration without its integration principal, before any nonce or effect (Codex on #107)', async () => {
    const { integrationUserId: _principal, ...unnamed } = config
    const other = { actorType: 'user', actorId: 'user-other', userId: 'user-other' } as const
    for (const named of [
      {},
      { integrationUserId: '' },
      { integrationUserId: '  ' },
      { integrationUserId: null },
      { integrationUserId: 7 },
    ]) {
      const p = paperclip({ config: { ...unnamed, ...named } })
      const c = commissionOf()
      for (const actor of [undefined, other]) {
        await refused(p, { ...commissionRequest(c), ...(actor ? { actor } : {}) }, 503, 'not_configured')
        const lookup = await p.request({ ...lookupRequest(c), ...(actor ? { actor } : {}) })
        assert.deepEqual([lookup.status, (code(lookup.body) as { code: string }).code], [503, 'not_configured'])
      }
    }
    const nonces = await client.query(`SELECT 1 FROM ${NAMESPACE}.envelope_nonces`)
    assert.equal(nonces.rowCount, 0, 'no nonce was kept')
    const bound = await client.query(`SELECT 1 FROM ${NAMESPACE}.commissions`)
    assert.equal(bound.rowCount, 0, 'nothing was claimed or bound')
  })

  it('a malformed body', async () => {
    await refused(
      paperclip(),
      { routeKey: 'commission', params: {}, companyId: COMPANY, body: { companyId: COMPANY } },
      422,
      'invalid_request',
    )
  })
})

describe('spent nonces (Codex on #107)', () => {
  const nonces = async (company?: string): Promise<number> =>
    Number(
      (
        await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${NAMESPACE}.envelope_nonces WHERE $1::text IS NULL OR company_id = $1`,
          [company ?? null],
        )
      ).rows[0]?.n,
    )
  const at = (now: number) => paperclip({ now: () => now })
  const refusal = (res: { status: number; body: unknown }) => [res.status, (code(res.body) as { code: string }).code]

  it('are kept while the verifier takes their envelope, and an hour past it; a replay stays refused', async () => {
    const first = commissionRequest(commissionOf()) // exp NOW + 120
    const second = commissionRequest(commissionOf(), { iat: NOW + 3_600 }) // exp NOW + 3_720
    const last = NOW + 120 + ENVELOPE_SKEW_SECONDS // the last second the verifier takes the first envelope
    assert.equal((await at(NOW).request(first)).status, 200)
    assert.equal((await at(NOW + 3_600).request(second)).status, 200)
    assert.equal(await nonces(), 2)
    // At the verifier's boundary the first envelope is still taken: its nonce is kept, and refuses its replay.
    assert.equal(await forgetSpentNonces(at(last).host), 0)
    assert.deepEqual(refusal(await at(last).request(first)), [409, 'replayed'])
    // A second later the verifier refuses it as expired; its nonce is still kept, for an hour past the boundary.
    assert.deepEqual(refusal(await at(last + 1).request(first)), [401, 'envelope_expired'])
    assert.equal(await forgetSpentNonces(at(last + NONCE_GRACE_SECONDS).host), 0)
    assert.equal(await nonces(), 2)
    // Then it is forgotten (the later one is kept), and its envelope is still refused as expired: nothing is admitted.
    const later = at(last + NONCE_GRACE_SECONDS + 1)
    assert.equal(await forgetSpentNonces(later.host), 1)
    assert.equal(await nonces(), 1)
    assert.deepEqual(refusal(await later.request(first)), [401, 'envelope_expired'])
    assert.equal(later.issues.size, 0)
    assert.equal(await nonces(), 1, 'the refused replay kept no nonce')
    assert.deepEqual(refusal(await at(NOW + 3_600).request(second)), [409, 'replayed'])
  })

  it('go by their expiry alone, whatever company kept them', async () => {
    const keep = (company: string, exp: number) =>
      client.query(
        `INSERT INTO ${NAMESPACE}.envelope_nonces (nonce, company_id, delivery_key, expires_at)
         VALUES ($1, $2, $3, to_timestamp($4))`,
        [randomUUID(), company, `delivery-${randomUUID()}`, exp],
      )
    const now = NOW + 10_000
    const spent = now - ENVELOPE_SKEW_SECONDS - NONCE_GRACE_SECONDS - 1
    const kept = now - ENVELOPE_SKEW_SECONDS - NONCE_GRACE_SECONDS
    for (const company of [COMPANY, OTHER_COMPANY]) {
      await keep(company, spent)
      await keep(company, kept)
      await keep(company, now + 120)
    }
    assert.equal(await forgetSpentNonces(at(now).host), 2)
    assert.deepEqual([await nonces(COMPANY), await nonces(OTHER_COMPANY)], [2, 2])
  })
})

describe('control', () => {
  async function commissioned() {
    const p = paperclip()
    const c = commissionOf()
    await p.request(commissionRequest(c))
    const issueId = [...p.issues.keys()][0] ?? ''
    return { p, c, issueId }
  }

  it('mirrors Hold, Resume and Stop onto the issue, idempotently per delivery', async () => {
    const { p, c, issueId } = await commissioned()
    const hold = await p.request(controlRequest(c, issueId, 'hold', 'hold-1'))
    assert.deepEqual(hold.body, { outcome: 'applied', issueId, status: 'blocked', wakeQueued: false })
    const again = await p.request(controlRequest(c, issueId, 'hold', 'hold-1'))
    assert.deepEqual(again.body, { outcome: 'already', issueId, status: 'blocked', wakeQueued: false })
    const resume = await p.request(controlRequest(c, issueId, 'resume', 'resume-1'))
    assert.deepEqual(resume.body, { outcome: 'applied', issueId, status: 'todo', wakeQueued: true })
    const stop = await p.request(controlRequest(c, issueId, 'stop', 'stop-1'))
    assert.deepEqual(stop.body, { outcome: 'applied', issueId, status: 'cancelled', wakeQueued: false })
    const rows = await client.query(`SELECT op FROM ${NAMESPACE}.controls ORDER BY applied_at, op`)
    assert.deepEqual(rows.rows.map((r: { op: string }) => r.op).toSorted(), ['hold', 'resume', 'stop'])
  })

  async function failing() {
    const fault: { update: boolean; wake: 'before' | 'after' | 'not_queued' | null } = { update: false, wake: null }
    const p = paperclip({ fails: { update: () => fault.update, wake: () => fault.wake } })
    const c = commissionOf()
    await p.request(commissionRequest(c))
    const issueId = [...p.issues.keys()][0] ?? ''
    return { p, c, issueId, fault }
  }

  const stateOf = async (key: string): Promise<string | undefined> =>
    (await client.query<{ state: string }>(`SELECT state FROM ${NAMESPACE}.controls WHERE delivery_key = $1`, [key]))
      .rows[0]?.state

  it('a Hold whose issue update failed is applied by its resend, never answered already (WBC-02-CX-0002)', async () => {
    const { p, c, issueId, fault } = await failing()
    fault.update = true
    await assert.rejects(p.request(controlRequest(c, issueId, 'hold', 'hold-f')), /injected: issue update failed/)
    assert.equal(p.issues.get(issueId)?.status, 'todo')
    assert.equal(await stateOf('hold-f'), 'pending', 'the key is recorded, its effect is not')
    fault.update = false
    const retry = await p.request(controlRequest(c, issueId, 'hold', 'hold-f'))
    assert.deepEqual(retry.body, { outcome: 'applied', issueId, status: 'blocked', wakeQueued: false })
    assert.equal(await stateOf('hold-f'), 'applied')
    const again = await p.request(controlRequest(c, issueId, 'hold', 'hold-f'))
    assert.equal(outcome(again.body).outcome, 'already')
  })

  it('a Resume whose wakeup never arrived wakes on a resend once its ask is stale (WBC-02-CX-0002/0004)', async () => {
    const { p, c, issueId, fault } = await failing()
    await p.request(controlRequest(c, issueId, 'hold', 'hold-w'))
    const runs = await runsOf(issueId)
    fault.wake = 'before'
    await assert.rejects(p.request(controlRequest(c, issueId, 'resume', 'resume-w')), /before it was durable/)
    assert.equal(p.issues.get(issueId)?.status, 'todo', 'the status moved')
    assert.equal(await runsOf(issueId), runs, 'nobody was woken')
    assert.equal(await stateOf('resume-w'), 'pending')
    fault.wake = null
    const early = await p.request(controlRequest(c, issueId, 'resume', 'resume-w'))
    assert.equal(early.status, 503, 'an ask that may still be in flight is waited for')
    assert.equal(await stateOf('resume-w'), 'pending')
    await ageAsk('resume-w')
    const retry = await p.request(controlRequest(c, issueId, 'resume', 'resume-w'))
    assert.deepEqual(retry.body, { outcome: 'applied', issueId, status: 'todo', wakeQueued: true })
    assert.equal(await runsOf(issueId), runs + 1)
  })

  it('a Resume whose wakeup was durable but whose reply was lost is reconciled by its run, never asked again (CX-0004)', async () => {
    const { p, c, issueId, fault } = await failing()
    await p.request(controlRequest(c, issueId, 'hold', 'hold-d'))
    const runs = await runsOf(issueId)
    fault.wake = 'after'
    await assert.rejects(p.request(controlRequest(c, issueId, 'resume', 'resume-d')), /durable, then the call failed/)
    assert.equal(await runsOf(issueId), runs + 1)
    fault.wake = null
    const retry = await p.request(controlRequest(c, issueId, 'resume', 'resume-d'))
    assert.deepEqual(retry.body, { outcome: 'applied', issueId, status: 'todo', wakeQueued: false })
    assert.equal(await runsOf(issueId), runs + 1, 'no second run')
    assert.equal(await stateOf('resume-d'), 'applied')
  })

  it('a Resume whose wakeup the host did not queue is not delivered: it is asked again, never answered applied (WBC-02-CX-0007)', async () => {
    const { p, c, issueId, fault } = await failing()
    await p.request(controlRequest(c, issueId, 'hold', 'hold-n'))
    const runs = await runsOf(issueId)
    fault.wake = 'not_queued'
    const refused = await p.request(controlRequest(c, issueId, 'resume', 'resume-n'))
    assert.equal(refused.status, 503)
    assert.equal((code(refused.body) as { code: string }).code, 'wake_not_queued')
    assert.equal(await stateOf('resume-n'), 'pending', 'not delivered')
    assert.equal(await runsOf(issueId), runs)
    fault.wake = null
    await ageAsk('resume-n')
    const retry = await p.request(controlRequest(c, issueId, 'resume', 'resume-n'))
    assert.deepEqual(retry.body, { outcome: 'applied', issueId, status: 'todo', wakeQueued: true })
    assert.equal(await runsOf(issueId), runs + 1)
  })

  it('a crash after the effect but before it was recorded re-applies on the resend, idempotently', async () => {
    const { p, c, issueId } = await commissioned()
    await p.request(controlRequest(c, issueId, 'hold', 'hold-c'))
    await p.request(controlRequest(c, issueId, 'resume', 'resume-c'))
    // The crash window: the wakeup is durable, neither it nor the control was recorded as done.
    await client.query(
      `UPDATE ${NAMESPACE}.controls SET state = 'pending', applied_at = NULL WHERE delivery_key = 'resume-c'`,
    )
    await client.query(`UPDATE ${NAMESPACE}.wakes SET confirmed_at = NULL WHERE wake_key = 'resume-c'`)
    const runs = await runsOf(issueId)
    const retry = await p.request(controlRequest(c, issueId, 'resume', 'resume-c'))
    assert.equal(outcome(retry.body).outcome, 'applied')
    assert.equal(p.issues.get(issueId)?.status, 'todo')
    assert.equal(await runsOf(issueId), runs, 'its run since the ask confirms the wakeup: no second run')
    assert.equal(await stateOf('resume-c'), 'applied')
  })

  it('concurrent resends of a pending key leave one effect', async () => {
    const { p, c, issueId, fault } = await failing()
    fault.update = true
    await assert.rejects(p.request(controlRequest(c, issueId, 'stop', 'stop-cc')))
    fault.update = false
    const replies = await Promise.all([
      p.request(controlRequest(c, issueId, 'stop', 'stop-cc')),
      p.request(controlRequest(c, issueId, 'stop', 'stop-cc')),
    ])
    for (const r of replies) assert.equal(r.status, 200)
    assert.equal(p.issues.get(issueId)?.status, 'cancelled')
    assert.equal(await stateOf('stop-cc'), 'applied')
  })

  it('an older pending control never undoes a later one that took effect', async () => {
    const { p, c, issueId, fault } = await failing()
    fault.update = true
    await assert.rejects(p.request(controlRequest(c, issueId, 'hold', 'hold-old')))
    fault.update = false
    // Out of the worker's order (it never sends the next control before this one is answered), for the guard only.
    await p.request(controlRequest(c, issueId, 'stop', 'stop-new'))
    const stale = await p.request(controlRequest(c, issueId, 'hold', 'hold-old'))
    assert.equal(outcome(stale.body).outcome, 'already')
    assert.equal(p.issues.get(issueId)?.status, 'cancelled', 'the Stop stands')
    assert.equal(await stateOf('hold-old'), 'applied')
  })

  it(
    'a delayed original Hold that lands after its resend and a later Stop never undoes the Stop (WBC-02-CX-0008)',
    { timeout: 20_000 },
    async () => {
      let gate: PromiseWithResolvers<void> | null = Promise.withResolvers<void>()
      // The original's write is at the host, held there: not only its lease taken (Codex on 5c3b50ee, CI job
      // 112764079889: the gate removed before the original reached it let the original land first).
      const entered = Promise.withResolvers<void>()
      const p = paperclip({
        beforeUpdate: (_id, status) => {
          if (status !== 'blocked' || !gate) return undefined
          entered.resolve()
          return gate.promise
        },
      })
      const c = commissionOf()
      await p.request(commissionRequest(c))
      const issueId = [...p.issues.keys()][0] ?? ''
      const held = gate
      const original = p.request(controlRequest(c, issueId, 'hold', 'hold-late'))
      await entered.promise
      gate = null // the resend's update lands at once
      await expireLease(c.key)
      const resend = await p.request(controlRequest(c, issueId, 'hold', 'hold-late'))
      assert.equal(outcome(resend.body).outcome, 'applied', 'the write in flight can only set what the Hold wants')
      const stop = await p.request(controlRequest(c, issueId, 'stop', 'stop-after'))
      assert.equal(stop.status, 503, 'the Stop is not confirmed while a Hold write may still land')
      assert.equal((code(stop.body) as { code: string }).code, 'effect_unsettled')
      assert.equal(p.issues.get(issueId)?.status, 'cancelled')
      assert.equal(await stateOf('stop-after'), 'applied', 'its effect took place')
      held.resolve() // the original's write lands now, after the Stop
      const late = await original
      assert.equal(late.status, 200)
      assert.equal(p.issues.get(issueId)?.status, 'cancelled', 'the later Stop stands')
      const confirmed = await p.request(controlRequest(c, issueId, 'stop', 'stop-after'))
      assert.deepEqual(confirmed.body, { outcome: 'already', issueId, status: 'cancelled', wakeQueued: false })
      assert.deepEqual([await stateOf('hold-late'), await stateOf('stop-after')], ['applied', 'applied'])
      assert.equal(await openWrites(c.key), 0)
    },
  )

  /** A Hold whose original delivery is held in its update, then lands `blocked` and fails, after its resend and a Stop. */
  async function lateFailingHold(settleFails = { now: false }) {
    let late = true
    const gate = Promise.withResolvers<void>()
    // The original's write is at the host, held there, before `late` is cleared for the resend (as above).
    const entered = Promise.withResolvers<void>()
    const p = paperclip({
      beforeUpdate: (_id, status) => {
        if (status !== 'blocked' || !late) return undefined
        entered.resolve()
        return gate.promise
      },
      fails: {
        update: (status) => {
          if (status === 'blocked' && late) return 'after'
          return status === 'cancelled' && settleFails.now ? 'before' : null
        },
      },
    })
    const c = commissionOf()
    await p.request(commissionRequest(c))
    const issueId = [...p.issues.keys()][0] ?? ''
    const original = p.request(controlRequest(c, issueId, 'hold', 'hold-x'))
    await entered.promise
    late = false
    await expireLease(c.key)
    assert.equal(outcome((await p.request(controlRequest(c, issueId, 'hold', 'hold-x'))).body).outcome, 'applied')
    const stop = await p.request(controlRequest(c, issueId, 'stop', 'stop-x'))
    assert.equal(stop.status, 503)
    assert.equal(p.issues.get(issueId)?.status, 'cancelled')
    return { p, c, issueId, gate, original }
  }

  it(
    'a delayed original Hold that writes after a later Stop and then fails is settled before its error: the Stop stands (WBC-02-CX-0013)',
    { timeout: 20_000 },
    async () => {
      const { p, c, issueId, gate, original } = await lateFailingHold()
      gate.resolve() // the original writes blocked, then the host answers an error
      await assert.rejects(original, /durable, then the call failed/)
      assert.equal(p.issues.get(issueId)?.status, 'cancelled', 'settled before the error was answered')
      for (const [op, key] of [
        ['stop', 'stop-x'],
        ['hold', 'hold-x'],
      ] as const) {
        const again = await p.request(controlRequest(c, issueId, op, key))
        assert.deepEqual(again.body, { outcome: 'already', issueId, status: 'cancelled', wakeQueued: false })
      }
      assert.deepEqual([await stateOf('hold-x'), await stateOf('stop-x')], ['applied', 'applied'])
      assert.equal(await openWrites(c.key), 0)
      assert.equal(await leaseOf(c.key), null)
    },
  )

  it(
    'a settlement that itself fails leaves the late write open: no delivery is confirmed until the settle job settles it (WBC-02-CX-0013)',
    { timeout: 20_000 },
    async () => {
      const settleFails = { now: false }
      const { p, c, issueId, gate, original } = await lateFailingHold(settleFails)
      settleFails.now = true
      gate.resolve()
      await assert.rejects(original, /durable, then the call failed/)
      assert.equal(p.issues.get(issueId)?.status, 'blocked', 'the late write landed and its settlement failed')
      assert.ok((await openWrites(c.key)) > 0, 'it stays open')
      await assert.rejects(p.request(controlRequest(c, issueId, 'stop', 'stop-x')), /issue update failed/)
      assert.equal(await leaseOf(c.key), null, 'a failed settlement releases its lease')
      settleFails.now = false
      assert.equal(await settleOpenWrites(p.host), 1)
      assert.equal(p.issues.get(issueId)?.status, 'cancelled')
      assert.equal(await openWrites(c.key), 0)
      const again = await p.request(controlRequest(c, issueId, 'stop', 'stop-x'))
      assert.deepEqual(again.body, { outcome: 'already', issueId, status: 'cancelled', wakeQueued: false })
    },
  )

  const NS = 'boot-1/pid:[4026531836]'
  const OLD = { namespace: NS, process: '2201:90101' }

  /** The operator's fence of a previous instance, as deploy/paperclip/fence-previous-instance.sql records it. */
  const operatorFence = () =>
    client.query(
      `UPDATE ${NAMESPACE}.effects SET fenced_at = now(), fence = 'operator: previous instance stopped, its sessions ended'
        WHERE settled_at IS NULL AND ended_at IS NULL AND fenced_at IS NULL AND started_at < now()`,
    )

  /** A Hold whose original update the host never answered (nothing landed yet), its resend applied, then a Stop. */
  async function unansweredHold(host: { now: HostProcess | null }) {
    let unanswered = true
    const p = paperclip({
      hostProcess: () => host.now,
      fails: { update: (status) => (status === 'blocked' && unanswered ? 'unanswered' : null) },
    })
    const c = commissionOf()
    await p.request(commissionRequest(c))
    const issueId = [...p.issues.keys()][0] ?? ''
    await assert.rejects(p.request(controlRequest(c, issueId, 'hold', 'hold-u')), /did not answer/)
    assert.equal(p.issues.get(issueId)?.status, 'todo', 'nothing landed yet')
    unanswered = false
    assert.equal(outcome((await p.request(controlRequest(c, issueId, 'hold', 'hold-u'))).body).outcome, 'applied')
    const stop = await p.request(controlRequest(c, issueId, 'stop', 'stop-u'))
    assert.equal((code(stop.body) as { code: string }).code, 'effect_unsettled')
    const issue = p.issues.get(issueId)
    assert.ok(issue)
    assert.equal(issue.status, 'cancelled')
    return { p, c, issueId, issue }
  }

  const stopCode = async (p: MemoryPaperclip, c: Commission, issueId: string) =>
    (code((await p.request(controlRequest(c, issueId, 'stop', 'stop-u'))).body) as { code?: string }).code

  it('a write the host never answered stays open however old: landing after any deadline it is undone, and the Stop is never confirmed while its host runs (WBC-02-CX-0017)', async () => {
    const { p, c, issueId, issue } = await unansweredHold({ now: OLD })
    await ageUnended(c.key)
    assert.equal(await settleOpenWrites(p.host), 0, 'a day later it is still open')
    assert.equal(await stopCode(p, c, issueId), 'effect_unsettled', 'elapsed time confirms nothing')
    issue.status = 'blocked' // the host acts on the unanswered call only now, after any deadline
    assert.equal(await settleOpenWrites(p.host), 0)
    assert.equal(issue.status, 'cancelled', 'the settle job undoes it: the write was still open')
    issue.status = 'blocked' // and again, should a write land twice
    assert.equal((await p.request(controlRequest(c, issueId, 'stop', 'stop-u'))).status, 503)
    assert.equal(issue.status, 'cancelled', 'so does the next delivery')
    assert.equal(await openWrites(c.key), 1, 'the unanswered write is the one still open')
  })

  it('the plugin never fences an unanswered write itself: not under another host, nor in another namespace; a late write is undone; only the operator fence settles it (WBC-02-CX-0020, CX-0024)', async () => {
    const host = { now: OLD as HostProcess | null }
    const { p, c, issueId, issue } = await unansweredHold(host)
    for (const now of [
      { namespace: NS, process: '3302:90202' }, // a second host in the same namespace
      { namespace: 'boot-2/pid:[4026532111]', process: '7:1200' }, // a replacement container
      null, // a host whose process cannot be read
    ]) {
      host.now = now
      assert.equal(await settleOpenWrites(p.host), 0)
      assert.equal(await stopCode(p, c, issueId), 'effect_unsettled')
    }
    issue.status = 'blocked' // the old session commits after its host died (CX-0024): still undone
    assert.equal(await settleOpenWrites(p.host), 0)
    assert.equal(issue.status, 'cancelled')
    const recorded = await client.query<{ host_namespace: string; host_process: string }>(
      `SELECT host_namespace, host_process FROM ${NAMESPACE}.effects WHERE ended_at IS NULL`,
    )
    assert.deepEqual(recorded.rows, [{ host_namespace: NS, host_process: OLD.process }], 'for the operator')
    await operatorFence()
    assert.equal(await settleOpenWrites(p.host), 1)
    const confirmed = await p.request(controlRequest(c, issueId, 'stop', 'stop-u'))
    assert.deepEqual(confirmed.body, { outcome: 'already', issueId, status: 'cancelled', wakeQueued: false })
  })

  it("the settle job restores Sophia's latest control over a dead worker's write, keeps it open until the operator fence, and leaves the host's own status alone", async () => {
    const { p, c, issueId } = await commissioned()
    await p.request(controlRequest(c, issueId, 'hold', 'hold-d'))
    await p.request(controlRequest(c, issueId, 'resume', 'resume-d'))
    // A Hold write recorded by a worker that died mid-call (never ended).
    await client.query(
      `INSERT INTO ${NAMESPACE}.effects (effect_id, commission_key, status, host_namespace, host_process)
       VALUES ($1, $2, 'blocked', $3, '2201:90101')`,
      [randomUUID(), c.key, NS],
    )
    const issue = p.issues.get(issueId)
    assert.ok(issue)
    issue.status = 'blocked' // it landed after the Resume
    assert.equal(await settleOpenWrites(p.host), 0)
    assert.equal(issue.status, 'todo', 'the Resume stands; the write stays open')
    issue.status = 'in_progress' // the host started the run since
    await operatorFence()
    assert.equal(await settleOpenWrites(p.host), 1)
    assert.equal(issue.status, 'in_progress', 'a status no open write made is the host’s own')
    assert.equal(await openWrites(c.key), 0)
  })

  it(
    'a delivery whose lease ran out while a host call was slow writes nothing: it is told to ask again (WBC-02-CX-0013)',
    { timeout: 20_000 },
    async () => {
      let armed: PromiseWithResolvers<void> | null = null
      let key = ''
      const p = paperclip({
        beforeGet: async () => {
          const gate = armed
          if (gate && (await leaseOf(key)) !== null) {
            armed = null
            await gate.promise
          }
        },
      })
      const c = commissionOf()
      key = c.key
      await p.request(commissionRequest(c))
      const issueId = [...p.issues.keys()][0] ?? ''
      const gate = Promise.withResolvers<void>()
      armed = gate
      const slow = p.request(controlRequest(c, issueId, 'hold', 'hold-slow')) // its read of the issue is held
      await waitUntil(() => Promise.resolve(armed === null))
      await expireLease(c.key)
      assert.equal(outcome((await p.request(controlRequest(c, issueId, 'stop', 'stop-fast'))).body).outcome, 'applied')
      gate.resolve()
      const late = await slow
      assert.equal(late.status, 503)
      assert.equal((code(late.body) as { code: string }).code, 'control_in_progress')
      assert.equal(p.issues.get(issueId)?.status, 'cancelled', 'it wrote nothing')
      assert.equal(await stateOf('hold-slow'), 'pending')
      const resend = await p.request(controlRequest(c, issueId, 'hold', 'hold-slow'))
      assert.deepEqual(resend.body, { outcome: 'already', issueId, status: 'cancelled', wakeQueued: false })
    },
  )

  it(
    'a resend while the original still holds the lease is told to ask again, and then finds it applied',
    { timeout: 20_000 },
    async () => {
      const gate = Promise.withResolvers<void>()
      const p = paperclip({ beforeUpdate: (_id, status) => (status === 'blocked' ? gate.promise : undefined) })
      const c = commissionOf()
      await p.request(commissionRequest(c))
      const issueId = [...p.issues.keys()][0] ?? ''
      const original = p.request(controlRequest(c, issueId, 'hold', 'hold-busy'))
      await waitUntil(async () => (await leaseOf(c.key)) !== null)
      const busy = await p.request(controlRequest(c, issueId, 'hold', 'hold-busy'))
      assert.equal(busy.status, 503)
      assert.equal((code(busy.body) as { code: string }).code, 'control_in_progress')
      gate.resolve()
      assert.equal(outcome((await original).body).outcome, 'applied')
      assert.equal(outcome((await p.request(controlRequest(c, issueId, 'hold', 'hold-busy'))).body).outcome, 'already')
      assert.equal(await leaseOf(c.key), null, 'the lease is released')
    },
  )

  it('refuses a delivery key resent with another operation', async () => {
    const { p, c, issueId } = await commissioned()
    await p.request(controlRequest(c, issueId, 'hold', 'key-one'))
    const res = await p.request(controlRequest(c, issueId, 'stop', 'key-one'))
    assert.equal(res.status, 409)
    assert.equal(p.issues.get(issueId)?.status, 'blocked')
  })

  it('refuses a control on an issue that does not hold the commission', async () => {
    const { p, c } = await commissioned()
    const other = await p.request(commissionRequest(commissionOf()))
    const otherIssue = (other.body as { issueId: string }).issueId
    const res = await p.request(controlRequest(c, otherIssue, 'stop', 'stop-x'))
    assert.equal(res.status, 403)
    assert.equal(p.issues.get(otherIssue)?.status, 'todo')
  })

  it('refuses a control whose envelope names another operation', async () => {
    const { p, c, issueId } = await commissioned()
    const res = await p.request(controlRequest(c, issueId, 'stop', 'stop-2', 'resume'))
    assert.equal(res.status, 403)
    assert.equal(p.issues.get(issueId)?.status, 'todo')
  })

  it('routes no unknown key', async () => {
    const res = await paperclip().request({ routeKey: 'admin', params: {}, companyId: COMPANY, body: {} })
    assert.equal(res.status, 404)
  })

  it('keeps routes under the plugin namespace path', () => {
    assert.equal(ROUTES.control('a b'), '/issues/a%20b/control')
  })
})

/** A board user moves the issue: to another project of the same company, or out of every project. */
const moveTo = (p: MemoryPaperclip, issueId: string, projectId: string | null) => {
  const issue = p.issues.get(issueId)
  assert.ok(issue)
  p.issues.set(issueId, { ...issue, projectId })
}

describe('an issue moved out of its mapped Paperclip project (Codex’s automatic review of a06db118, P1)', () => {
  const count = async (table: string, key: string) =>
    Number(
      (
        await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${NAMESPACE}.${table} WHERE commission_key = $1`,
          [key],
        )
      ).rows[0]?.n,
    )
  async function commissioned() {
    const p = paperclip()
    const c = commissionOf()
    await p.request(commissionRequest(c))
    const issueId = [...p.issues.keys()][0] ?? ''
    return { p, c, issueId }
  }

  it('an issue whose project id differs only in case is in its project: controlled, found and sent again', async () => {
    const { p, c, issueId } = await commissioned()
    // The configuration's id as written, and Paperclip's own for the same project (a UUID's case is not its identity).
    moveTo(p, issueId, PROJECT.toUpperCase())
    const hold = await p.request(controlRequest(c, issueId, 'hold', 'hold-case'))
    assert.equal(hold.status, 200, JSON.stringify(hold.body))
    assert.equal(p.issues.get(issueId)?.status, 'blocked')
    const found = await p.request(lookupRequest(c))
    assert.deepEqual(found.body, { outcome: 'found', issueId, status: 'blocked' })
    const again = await p.request(commissionRequest(c))
    assert.equal(again.status, 200, JSON.stringify(again.body))
    assert.equal(p.issues.size, 1)
  })

  for (const [where, to] of [
    ['another project', 'pc-project-b'],
    ['no project', null],
  ] as const) {
    it(`a control of an issue moved to ${where} changes nothing and records nothing`, async () => {
      const { p, c, issueId } = await commissioned()
      moveTo(p, issueId, to)
      const res = await p.request(controlRequest(c, issueId, 'hold', `hold-${to ?? 'none'}`))
      assert.equal(res.status, 409, JSON.stringify(res.body))
      assert.deepEqual(code(res.body), {
        code: 'issue_moved',
        message:
          'The issue that holds this commission is no longer in its mapped Paperclip project; nothing was changed',
      })
      assert.equal(p.issues.get(issueId)?.status, 'todo')
      assert.equal(await count('controls', c.key), 0)
      assert.equal(await count('effects', c.key), 0)
    })

    it(`a control held at the lease while the issue moves to ${where} writes nothing to it`, async () => {
      const { p, c, issueId } = await commissioned()
      await client.query(
        `UPDATE ${NAMESPACE}.commissions SET effect_holder = 'another-delivery', effect_until = now() + interval '60 seconds'
          WHERE commission_key = $1`,
        [c.key],
      )
      const held = p.request(controlRequest(c, issueId, 'hold', `hold-late-${to ?? 'none'}`))
      await new Promise((resolve) => setTimeout(resolve, 300))
      moveTo(p, issueId, to)
      await client.query(
        `UPDATE ${NAMESPACE}.commissions SET effect_holder = NULL, effect_until = NULL WHERE commission_key = $1`,
        [c.key],
      )
      const res = await held
      assert.equal(res.status, 409, JSON.stringify(res.body))
      assert.equal(
        p.issues.get(issueId)?.status,
        'todo',
        'the issue it reads just before writing is in another project',
      )
      assert.equal(await count('effects', c.key), 0)
    })

    it(`a commission sent again for an issue moved to ${where} neither binds nor wakes it, nor creates another`, async () => {
      const { p, c, issueId } = await commissioned()
      assert.equal(p.wakeups.length, 1)
      moveTo(p, issueId, to)
      const again = await p.request(commissionRequest(c))
      assert.equal(again.status, 409, JSON.stringify(again.body))
      assert.equal(p.issues.size, 1, 'never a second issue')
      assert.equal(p.wakeups.length, 1, 'not woken again')
    })

    it(`a commission whose crashed create left its issue, moved to ${where}, creates no second one and binds nothing`, async () => {
      const p = paperclip()
      const c = commissionOf()
      moveTo(p, await landCreate(p, c), to)
      const res = await p.request(commissionRequest(c))
      assert.equal(res.status, 409, JSON.stringify(res.body))
      assert.equal(p.issues.size, 1, 'a miss in the mapped project is no leave to create')
      assert.equal(await count('commissions', c.key), 0, 'not bound')
      assert.equal(p.wakeups.length, 0)
    })

    it(`a create whose issue lands just after the commission's first read, moved to ${where}, binds and wakes nothing`, async () => {
      const p = paperclip()
      const c = commissionOf()
      // The create an earlier claim followed ends with its issue between this commission's first read and its claim.
      const host: CoordinationHost = {
        ...p.host,
        reviewerAgent: async (companyId) => {
          moveTo(p, await landCreate(p, c), to)
          return p.host.reviewerAgent(companyId)
        },
      }
      const actor = { actorType: 'user' as const, actorId: INTEGRATION_USER, userId: INTEGRATION_USER }
      const res = await handleApiRequest(host, { ...commissionRequest(c), actor })
      assert.equal(res.status, 409, JSON.stringify(res.body))
      assert.equal(p.issues.size, 1, 'never a second issue')
      assert.equal(p.wakeups.length, 0)
      assert.deepEqual(
        await claimOf(c.key),
        { process: 'host-1:100', ended: true },
        'the host answered: the claim ends',
      )
      const bound = await client.query(
        `SELECT 1 FROM ${NAMESPACE}.commissions WHERE commission_key = $1 AND issue_id IS NOT NULL`,
        [c.key],
      )
      assert.equal(bound.rowCount, 0, 'not bound')
    })

    it(`a lookup answers an issue moved to ${where} neither found nor absent`, async () => {
      const { p, c, issueId } = await commissioned()
      moveTo(p, issueId, to)
      const res = await p.request(lookupRequest(c))
      assert.equal(res.status, 409, JSON.stringify(res.body))
    })

    it(`the settle job writes nothing to an issue moved to ${where}`, async () => {
      const { p, c, issueId } = await commissioned()
      const hold = await p.request(controlRequest(c, issueId, 'hold', `hold-settle-${to ?? 'none'}`))
      assert.equal(hold.status, 200)
      // A stale write lands after the Hold (the issue shows todo again, from a write still open), then the issue moves.
      await client.query(
        `INSERT INTO ${NAMESPACE}.effects (effect_id, commission_key, status, ended_at) VALUES ($1, $2, 'todo', now())`,
        [randomUUID(), c.key],
      )
      const issue = p.issues.get(issueId)
      assert.ok(issue)
      issue.status = 'todo'
      moveTo(p, issueId, to)
      assert.equal(await settleOpenWrites(p.host), 0)
      assert.equal(p.issues.get(issueId)?.status, 'todo', 'nothing written to an issue in another project')
      assert.equal(await openWrites(c.key), 1, 'left open: back in its project, it is settled then')
    })
  }
})
