// Voice qualification evidence (migration 0046; docs/plans/voice-qualification-g7.md), level: sql-run. The grant is
// the migration owner's; the bridge's calls run on the sophia_api login with no actor; a member's with theirs.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  answerLiveCall,
  createPool,
  fenceLiveCall,
  isFenceMoved,
  liveCallAnswer,
  markLiveCall,
  mediaAssignments,
  readQualificationEvidence,
  readSnapshot,
  recordQualificationEvidence,
  recordLiveCall,
  reserveQualification,
  roomQualification,
  sealLiveCall,
  startExchange,
  voiceQualificationGuard,
  withActor,
  withService,
  type QualificationReceiptKind,
  type QualificationReserve,
} from './index.ts'

const A = randomUUID() // admin
const P = randomUUID() // the synthetic principal, an editor
const E = randomUUID() // another editor
const V = randomUUID() // a viewer
const RUN = 'ab'.repeat(32)

let db: TestDatabase
let pool: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
})
after(async () => {
  await pool.end()
  await db.drop()
})

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

/** Whether a write was refused because another attempt took the call's fence (0047, 'Fence moved'). */
const moved = (p: Promise<unknown>) =>
  p.then(
    () => false,
    (err: unknown) => isFenceMoved(err),
  )

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? err.code : `raw:${String(err)}`
  }
}

interface Limits {
  seconds?: number
  connections?: number
  turns?: number
  outputPerTurn?: number
  budget?: number
  ttl?: number
}

async function grant(projectId: string, principal = P, limits: Limits = {}): Promise<string> {
  const { rows } = await owner((c) =>
    c.query<{ id: string }>(
      `SELECT (sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',$4,$5,$6,$7,$8,$9)).id AS id`,
      [
        projectId,
        principal,
        RUN,
        limits.seconds ?? 900,
        limits.connections ?? 3,
        limits.turns ?? 20,
        limits.outputPerTurn ?? 1000,
        limits.budget ?? 200_000,
        limits.ttl ?? 3600,
      ],
    ),
  )
  return rows[0]!.id
}

async function project() {
  const seeded = await seedProject(db.ownerUrl, { admin: A, editors: [P, E], viewers: [V] })
  const snap = await withActor(pool, A, 'read', (c) => readSnapshot(c, seeded.projectId))
  assert.ok(snap)
  return { projectId: seeded.projectId, roomId: snap.room.id }
}

async function open(projectId: string, actor = P): Promise<string> {
  const snap = await withActor(pool, actor, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const receipt = await withActor(pool, actor, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return receipt.exchangeId
}

const assignment = async (exchangeId: string) =>
  (await withService(pool, (c) => mediaAssignments(c))).find((a) => a.exchangeId === exchangeId)

const qualificationOf = async (exchangeId: string): Promise<Record<string, unknown> | undefined> =>
  Reflect.get((await assignment(exchangeId)) ?? {}, 'qualification') as Record<string, unknown> | undefined

const stateOf = async (exchangeId: string) =>
  (
    await owner((c) =>
      c.query<{ state: string; reason: string | null }>(
        `SELECT e.state, q.ended_reason AS reason FROM sophia.room_exchanges e
          LEFT JOIN sophia.voice_qualification_exchanges q ON q.exchange_id=e.id WHERE e.id=$1`,
        [exchangeId],
      ),
    )
  ).rows[0]!

const receipt = (grantId: string, kind: QualificationReceiptKind, extra: Record<string, unknown> = {}) => ({
  kind,
  schema: 'sophia.bridge.voice_qualification.v1',
  grantId,
  runBindingSha256: RUN,
  atMs: 1,
  ...extra,
})

const record = (exchangeId: string, grantId: string, seq: number, kind: QualificationReceiptKind, extra = {}) =>
  withService(pool, (c) =>
    recordQualificationEvidence(c, { exchangeId, grantId, seq, kind, receipt: receipt(grantId, kind, extra) }),
  )

/** A provider receipt's usage on connection 1. */
const provider = (usageTokens: number, lastPromptTokens: number) => ({ connection: 1, usageTokens, lastPromptTokens })
const noop = (): void => undefined

const reserve = (
  exchangeId: string,
  grantId: string,
  kind: QualificationReserve['kind'],
  ordinal?: number,
  charge?: number,
) =>
  withService(pool, (c) =>
    reserveQualification(c, {
      exchangeId,
      grantId,
      kind,
      ...(ordinal === undefined ? {} : { ordinal }),
      ...(charge === undefined ? {} : { charge }),
    }),
  )

const countsOf = async (exchangeId: string) =>
  (
    await owner((c) =>
      c.query<{ connections: number; turns: number }>(
        `SELECT connections_opened AS connections, turns FROM sophia.voice_qualification_exchanges WHERE exchange_id=$1`,
        [exchangeId],
      ),
    )
  ).rows[0]

const committedOf = async (exchangeId: string) =>
  Number(
    (await owner((c) => c.query<{ n: string }>(`SELECT sophia.voice_committed($1) AS n`, [exchangeId]))).rows[0]!.n,
  )

describe('a voice qualification grant (0046)', () => {
  it('is off without one: no assignment names it, the guard ends nothing, no room token carries it', async () => {
    const { projectId, roomId } = await project()
    const exchangeId = await open(projectId)
    assert.equal(await qualificationOf(exchangeId), undefined)
    assert.equal(await withService(pool, (c) => voiceQualificationGuard(c)), 0)
    assert.equal((await stateOf(exchangeId)).state, 'open')
    assert.equal(await withActor(pool, P, 'read', (c) => roomQualification(c, roomId)), null)
  })

  it('is the migration owner’s alone, for an active editor or admin, and never covers an exchange opened before it', async () => {
    const { projectId, roomId } = await project()
    // The API's login may not grant (no EXECUTE), with or without a member identity.
    const refused = await withService(pool, (c) =>
      c.query(`SELECT sophia.voice_qualification_grant($1,$2,$3,'x',900,3,20,1000,200000,3600)`, [projectId, P, RUN]),
    ).then(
      () => 'resolved',
      (err: unknown) => (err instanceof DomainError ? err.code : String(err)),
    )
    assert.notEqual(refused, 'resolved')
    await assert.rejects(grant(projectId, V), /active editor or admin/)
    const earlier = await open(projectId)
    const grantId = await grant(projectId)
    assert.equal(await qualificationOf(earlier), undefined, 'an exchange opened before the grant is not under it')
    await owner((c) => c.query(`UPDATE sophia.room_exchanges SET state='ended', ended_at=now() WHERE id=$1`, [earlier]))
    const exchangeId = await open(projectId)
    const q = await qualificationOf(exchangeId)
    assert.ok(q)
    assert.deepEqual(
      {
        grantId: q.grantId,
        run: q.runBindingSha256,
        principal: q.principalActorId,
        turns: q.maxTurns,
        out: q.maxOutputTokensPerTurn,
      },
      { grantId, run: RUN, principal: P, turns: 20, out: 1000 },
    )
    // The room token names it for the principal only.
    assert.deepEqual(await withActor(pool, P, 'read', (c) => roomQualification(c, roomId)), {
      grantId,
      runBindingSha256: RUN,
    })
    assert.equal(await withActor(pool, E, 'read', (c) => roomQualification(c, roomId)), null)
  })

  it('a new grant supersedes the project’s open one; another project’s exchanges are never under it', async () => {
    const one = await project()
    const two = await project()
    const first = await grant(one.projectId)
    const second = await grant(one.projectId)
    const revoked = await owner((c) =>
      c.query<{ reason: string }>(`SELECT revoke_reason AS reason FROM sophia.voice_qualification_grants WHERE id=$1`, [
        first,
      ]),
    )
    assert.equal(revoked.rows[0]!.reason, 'superseded')
    const elsewhere = await open(two.projectId)
    assert.equal(await qualificationOf(elsewhere), undefined)
    const here = await open(one.projectId)
    assert.equal((await qualificationOf(here))?.grantId, second)
  })
})

describe('the guard (0046): it ends an exchange under a grant whether or not the Lab is there', () => {
  it('at its deadline', async () => {
    const { projectId } = await project()
    const g = await grant(projectId, P, { seconds: 60 })
    const exchangeId = await open(projectId)
    assert.equal(await withService(pool, (c) => voiceQualificationGuard(c)), 0)
    // 61 s later: the grant and the exchange both moved back (an exchange opened before its grant is never under it).
    await owner(async (c) => {
      await c.query(
        `UPDATE sophia.voice_qualification_grants SET created_at=created_at-interval '61 seconds',
          expires_at=expires_at-interval '61 seconds' WHERE id=$1`,
        [g],
      )
      await c.query(`UPDATE sophia.room_exchanges SET opened_at=opened_at-interval '61 seconds' WHERE id=$1`, [
        exchangeId,
      ])
    })
    assert.equal(await withService(pool, (c) => voiceQualificationGuard(c)), 1)
    assert.deepEqual(await stateOf(exchangeId), { state: 'ended', reason: 'deadline' })
    assert.equal(await assignment(exchangeId), undefined, 'the bridge is no longer assigned it')
    const events = await owner((c) =>
      c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id=$1 AND summary_code='room.exchange_qualification_limit'`,
        [projectId],
      ),
    )
    assert.equal(events.rows[0]!.n, 1, 'the event that wakes the bridge’s poll')
    assert.equal(await withService(pool, (c) => voiceQualificationGuard(c)), 0, 'once')
  })

  it('when the grant is revoked, or expires', async () => {
    const one = await project()
    const g1 = await grant(one.projectId)
    const x1 = await open(one.projectId)
    await owner((c) => c.query(`SELECT sophia.voice_qualification_revoke($1,$2,'operator_kill')`, [one.projectId, g1]))
    await withService(pool, (c) => voiceQualificationGuard(c))
    assert.deepEqual(await stateOf(x1), { state: 'ended', reason: 'revoked' })

    const two = await project()
    const g2 = await grant(two.projectId)
    const x2 = await open(two.projectId)
    await owner((c) =>
      c.query(
        `UPDATE sophia.voice_qualification_grants SET created_at=now()-interval '2 hours', expires_at=now()-interval '1 second' WHERE id=$1`,
        [g2],
      ),
    )
    await owner((c) =>
      c.query(`UPDATE sophia.room_exchanges SET opened_at=now()-interval '90 minutes' WHERE id=$1`, [x2]),
    )
    await withService(pool, (c) => voiceQualificationGuard(c))
    assert.deepEqual(await stateOf(x2), { state: 'ended', reason: 'expired' })
  })

  it('past its connection limit, or past its turns, as reserved: the counts are durable, never what a receipt says', async () => {
    const one = await project()
    const g1 = await grant(one.projectId, P, { connections: 2 })
    const x1 = await open(one.projectId)
    await reserve(x1, g1, 'connection')
    // A receipt that says fewer, or more, changes no count.
    await record(x1, g1, 0, 'provider', { connection: 1, connectionsOpened: 1, turns: 0, usageTokens: null })
    await record(x1, g1, 1, 'provider', { connection: 1, connectionsOpened: 9, turns: 9, usageTokens: null })
    assert.deepEqual(await countsOf(x1), { connections: 1, turns: 0 })
    assert.equal((await stateOf(x1)).state, 'open')
    // Past the limit only by the counter itself (a reservation never takes it there): the guard ends it.
    await owner((c) =>
      c.query(`UPDATE sophia.voice_qualification_exchanges SET connections_opened=3 WHERE exchange_id=$1`, [x1]),
    )
    await withService(pool, (c) => voiceQualificationGuard(c))
    assert.deepEqual(await stateOf(x1), { state: 'ended', reason: 'connections' })

    const two = await project()
    const g2 = await grant(two.projectId, P, { turns: 3 })
    const x2 = await open(two.projectId)
    await reserve(x2, g2, 'connection')
    assert.equal((await reserve(x2, g2, 'generation', 1, 1000)).ok, true)
    assert.equal((await reserve(x2, g2, 'generation', 1, 1000)).ok, true)
    await withService(pool, (c) => voiceQualificationGuard(c))
    assert.equal((await stateOf(x2)).state, 'open', 'two generations of three')
    assert.equal((await reserve(x2, g2, 'generation', 1, 1000)).ok, true)
    await withService(pool, (c) => voiceQualificationGuard(c))
    assert.equal((await stateOf(x2)).state, 'open', 'the last generation allowed runs to its end')
    assert.equal((await reserve(x2, g2, 'generation', 1, 1000)).ok, false)
    assert.deepEqual(await stateOf(x2), { state: 'ended', reason: 'turns' }, 'past its turns, the exchange ends')
  })

  it('at its budget: what the exchange may have cost, the next turn’s context and one turn’s output cap', async () => {
    const { projectId } = await project()
    // Budget 100,000; output cap 2,000.
    const g = await grant(projectId, P, { budget: 100_000, outputPerTurn: 2000 })
    const x = await open(projectId)
    await reserve(x, g, 'connection')
    // 60,000 reported + 37,999 context + 2,000 cap = 99,999: one more turn fits.
    assert.equal((await record(x, g, 0, 'provider', provider(60_000, 37_999))).ended, false)
    // 60,000 + 38,000 + 2,000 = 100,000: the next turn could reach it, so the exchange ends now.
    assert.deepEqual(await record(x, g, 1, 'provider', provider(60_000, 38_000)), { ended: true, reason: 'usage' })
  })

  it('never lowers what a connection reported: an older report after a newer one changes nothing', async () => {
    const { projectId } = await project()
    const g = await grant(projectId, P, { budget: 100_000, outputPerTurn: 1000 })
    const x = await open(projectId)
    await reserve(x, g, 'connection')
    await record(x, g, 1, 'provider', { connection: 1, usageTokens: 50_000, lastPromptTokens: 9000 })
    await record(x, g, 0, 'provider', { connection: 1, usageTokens: 10_000, lastPromptTokens: 2000 })
    const row = await owner((c) =>
      c.query(
        `SELECT reported_usage::int AS u, last_prompt::int AS p FROM sophia.voice_qualification_connections
          WHERE exchange_id=$1 AND ordinal=1`,
        [x],
      ),
    )
    assert.deepEqual(row.rows[0], { u: 50_000, p: 9000 })
  })
})

describe('the exchange’s durable bound (0046, media_voice_reserve)', () => {
  it('two connection reservations at once with one left: exactly one is granted, the other ends the exchange', async () => {
    const { projectId } = await project()
    const g = await grant(projectId, P, { connections: 2 })
    const x = await open(projectId)
    assert.deepEqual(await reserve(x, g, 'connection'), { ok: true, ordinal: 1, stop: null, ended: false })
    // The first holds its transaction open with the exchange's lock; the second starts while it does.
    let release = noop
    const held = new Promise<void>((resolve) => (release = resolve))
    const first = withService(pool, async (c) => {
      const r = await reserveQualification(c, { exchangeId: x, grantId: g, kind: 'connection' })
      await held
      return r
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const second = withService(pool, (c) => reserveQualification(c, { exchangeId: x, grantId: g, kind: 'connection' }))
    await new Promise((resolve) => setTimeout(resolve, 300))
    release()
    const results = await Promise.allSettled([first, second])
    assert.deepEqual(
      results.map((r) => (r.status === 'fulfilled' ? r.value : `rejected: ${String(r.reason)}`)),
      [
        { ok: true, ordinal: 2, stop: null, ended: false },
        { ok: false, ordinal: null, stop: 'connections', ended: true },
      ],
    )
    assert.deepEqual(await countsOf(x), { connections: 2, turns: 0 })
    assert.deepEqual(await stateOf(x), { state: 'ended', reason: 'connections' })
    assert.equal(await codeOf(reserve(x, g, 'connection')), 'invalid_state', 'an ended exchange reserves nothing')
  })

  it('charges each connection; what the exchange may have cost is each one’s greater of charged and reported, summed', async () => {
    const { projectId } = await project()
    const g = await grant(projectId, P, { budget: 100_000, outputPerTurn: 2000 })
    const x = await open(projectId)
    await reserve(x, g, 'connection')
    assert.equal((await reserve(x, g, 'generation', 1, 30_000)).ok, true)
    await record(x, g, 1, 'provider', { connection: 1, usageTokens: 20_000, lastPromptTokens: 500 })
    assert.equal(await committedOf(x), 30_000, 'a report under the charge: the charge stands')
    await record(x, g, 2, 'provider', { connection: 1, usageTokens: 45_000, lastPromptTokens: 500 })
    assert.equal(await committedOf(x), 45_000, 'a report over it: the report')
    assert.deepEqual(await reserve(x, g, 'connection'), { ok: true, ordinal: 2, stop: null, ended: false })
    assert.equal((await reserve(x, g, 'generation', 2, 30_000)).ok, true)
    await record(x, g, 3, 'provider', { connection: 2, usageTokens: 10_000, lastPromptTokens: 1000 })
    assert.equal(await committedOf(x), 45_000 + 30_000)
    const evidence = (await withActor(pool, P, 'read', (c) => readQualificationEvidence(c, x))) as {
      grant: Record<string, unknown>
    }
    assert.deepEqual(
      [evidence.grant.usageTokens, evidence.grant.committedTokens, evidence.grant.lastPromptTokens],
      [55_000, 75_000, 1000],
      'reported, summed over the connections; what may have been spent; the latest connection’s prompt',
    )
    assert.deepEqual([evidence.grant.connectionsOpened, evidence.grant.turns], [2, 2])
    // 75,000 + 26,000 would pass 100,000: refused, and the exchange ends.
    assert.deepEqual(await reserve(x, g, 'generation', 2, 26_000), {
      ok: false,
      ordinal: null,
      stop: 'usage',
      ended: true,
    })
    assert.deepEqual(await stateOf(x), { state: 'ended', reason: 'usage' })
    assert.equal(await committedOf(x), 75_000, 'a refused charge is not kept')
  })

  it('a generation nobody asked for is counted and charged whatever the limits, and then the exchange ends', async () => {
    const { projectId } = await project()
    const g = await grant(projectId, P, { turns: 1, budget: 50_000, outputPerTurn: 1000 })
    const x = await open(projectId)
    await reserve(x, g, 'connection')
    assert.equal((await reserve(x, g, 'unasked', 1, 27_000)).ok, true, 'its one turn: it runs to its end')
    assert.equal((await reserve(x, g, 'unasked', 1, 27_000)).ok, false, 'a second is past its turns: it ends')
    assert.deepEqual(await countsOf(x), { connections: 1, turns: 2 })
    assert.equal(await committedOf(x), 54_000)
    assert.deepEqual(await stateOf(x), { state: 'ended', reason: 'turns' })

    const two = await project()
    const g2 = await grant(two.projectId, P, { turns: 10, budget: 50_000, outputPerTurn: 1000 })
    const x2 = await open(two.projectId)
    await reserve(x2, g2, 'connection')
    assert.equal((await reserve(x2, g2, 'unasked', 1, 27_000)).ok, true)
    assert.deepEqual(await reserve(x2, g2, 'unasked', 1, 27_000), {
      ok: false,
      ordinal: null,
      stop: 'usage',
      ended: true,
    })
    assert.equal(await committedOf(x2), 54_000, 'already spent: kept though it passes the budget')
  })

  it('a generation it grants, the guard never cuts: turns and the budget agree, at the boundary from both sides', async () => {
    const one = await project()
    const g1 = await grant(one.projectId, P, { turns: 2 })
    const x1 = await open(one.projectId)
    await reserve(x1, g1, 'connection')
    assert.equal((await reserve(x1, g1, 'generation', 1, 27_000)).ok, true)
    assert.equal((await reserve(x1, g1, 'generation', 1, 27_000)).ok, true, 'the second of two')
    assert.equal(await withService(pool, (c) => voiceQualificationGuard(c)), 0, 'not cut by the guard')
    assert.equal((await record(x1, g1, 1, 'input_turn')).ended, false, 'nor by its own turn’s receipt')
    assert.deepEqual(await reserve(x1, g1, 'generation', 1, 27_000), {
      ok: false,
      ordinal: null,
      stop: 'turns',
      ended: true,
    })

    // Budget 100,000, output cap 2,000, no prompt reported yet: a charge of 97,999 leaves 99,999 with the next turn's
    // cap, under the budget; 98,000 would reach it.
    const two = await project()
    const g2 = await grant(two.projectId, P, { budget: 100_000, outputPerTurn: 2000 })
    const x2 = await open(two.projectId)
    await reserve(x2, g2, 'connection')
    assert.equal((await reserve(x2, g2, 'generation', 1, 97_999)).ok, true)
    assert.equal(await withService(pool, (c) => voiceQualificationGuard(c)), 0, 'granted, so not cut')
    assert.equal((await stateOf(x2)).state, 'open')
    const three = await project()
    const g3 = await grant(three.projectId, P, { budget: 100_000, outputPerTurn: 2000 })
    const x3 = await open(three.projectId)
    await reserve(x3, g3, 'connection')
    assert.deepEqual(await reserve(x3, g3, 'generation', 1, 98_000), {
      ok: false,
      ordinal: null,
      stop: 'usage',
      ended: true,
    })
    assert.equal(await committedOf(x3), 0, 'refused, never granted and cut')
    // A later report of the prompt's size still ends it, as the guard always did: the next turn could pass the budget.
    assert.deepEqual(await record(x2, g2, 1, 'provider', provider(10_000, 1)), { ended: true, reason: 'usage' })
  })

  it('a bridge’s own stop (session_closed, guard) ends the exchange, for good', async () => {
    const { projectId } = await project()
    const g = await grant(projectId)
    const x = await open(projectId)
    const closed = { providerClosed: true, windows: 0, turns: 0, replies: 0, toolCalls: 0, typedMessages: 0 }
    assert.deepEqual(
      await record(x, g, 1, 'session_closed', { ...closed, transcriptRetained: false, reason: 'lost' }),
      {
        ended: false,
        reason: null,
      },
    )
    assert.deepEqual(
      await record(x, g, 2, 'session_closed', { ...closed, transcriptRetained: false, reason: 'guard' }),
      {
        ended: true,
        reason: 'bridge',
      },
    )
    assert.equal(await codeOf(reserve(x, g, 'connection')), 'invalid_state')
  })

  it('the bridge’s own stop, sent as a stop: ends the exchange (bridge), records nothing, and answers the same again', async () => {
    const { projectId } = await project()
    const g = await grant(projectId)
    const x = await open(projectId)
    await reserve(x, g, 'connection')
    const stopped = { ok: true, ordinal: null, stop: null, ended: true }
    assert.deepEqual(await reserve(x, g, 'stop'), stopped)
    assert.deepEqual(await stateOf(x), { state: 'ended', reason: 'bridge' })
    assert.deepEqual(await reserve(x, g, 'stop'), stopped, 'once: an ended exchange answers it the same')
    const rows = await owner((c) =>
      c.query<{ source: string; kind: string }>(
        `SELECT source, kind FROM sophia.voice_qualification_evidence WHERE exchange_id=$1 ORDER BY seq`,
        [x],
      ),
    )
    assert.deepEqual(rows.rows, [{ source: 'service', kind: 'guard' }], 'only the guard’s own receipt')
    assert.equal(await codeOf(reserve(x, randomUUID(), 'stop')), 'forbidden', 'another grant stops nothing')
  })

  it('refuses what it cannot bind: another grant, an unknown exchange, an unreserved connection, a charge out of bounds', async () => {
    const { projectId } = await project()
    const g = await grant(projectId)
    const x = await open(projectId)
    assert.equal(await codeOf(reserve(x, randomUUID(), 'connection')), 'forbidden')
    assert.equal(await codeOf(reserve(randomUUID(), g, 'connection')), 'not_found')
    assert.equal(await codeOf(reserve(x, g, 'generation', 1, 1000)), 'invalid_request', 'no connection 1 yet')
    await reserve(x, g, 'connection')
    assert.equal(await codeOf(reserve(x, g, 'generation', 1, -1)), 'invalid_request')
    assert.equal(await codeOf(reserve(x, g, 'generation', 1, 5_000_001)), 'invalid_request')
    assert.equal(await codeOf(reserve(x, g, 'generation', 1)), 'invalid_request', 'a generation names its charge')
    assert.equal(
      await codeOf(
        withActor(pool, P, 'write', (c) => reserveQualification(c, { exchangeId: x, grantId: g, kind: 'connection' })),
      ),
      'forbidden',
      'a member is never the bridge',
    )
    // A receipt names only a reserved connection.
    assert.equal(await codeOf(record(x, g, 1, 'provider', { connection: 2, usageTokens: 1 })), 'invalid_request')
    assert.equal(await codeOf(record(x, g, 2, 'input_window', { connection: 2 })), 'invalid_request')
    assert.equal((await record(x, g, 3, 'input_window', { connection: 1 })).ended, false)
    assert.equal((await stateOf(x)).state, 'open', 'a refusal that binds nothing ends nothing')
  })
})

describe('a top-up of a connection’s input allowance (0046, media_voice_reserve spend; Codex P1 on PR #190)', () => {
  it('is a charge only: it counts no turn and opens no ordinal, and is kept on its connection', async () => {
    const { projectId } = await project()
    // Its one turn: a top-up during the last generation allowed is not a generation, so it is not refused for turns.
    const g = await grant(projectId, P, { turns: 1, budget: 100_000, outputPerTurn: 2000 })
    const x = await open(projectId)
    await reserve(x, g, 'connection')
    assert.equal((await reserve(x, g, 'generation', 1, 27_000)).ok, true)
    assert.deepEqual(await reserve(x, g, 'spend', 1, 4000), { ok: true, ordinal: 1, stop: null, ended: false })
    assert.deepEqual(await reserve(x, g, 'spend', 1, 4000), { ok: true, ordinal: 1, stop: null, ended: false })
    assert.deepEqual(await countsOf(x), { connections: 1, turns: 1 }, 'no turn counted, no connection opened')
    assert.equal(await committedOf(x), 35_000, 'charged to what the exchange may have cost')
    const charged = await owner((c) =>
      c.query<{ ordinal: number; charged: string }>(
        `SELECT ordinal, charged FROM sophia.voice_qualification_connections WHERE exchange_id=$1`,
        [x],
      ),
    )
    assert.deepEqual(charged.rows, [{ ordinal: 1, charged: '35000' }])
    assert.equal(await withService(pool, (c) => voiceQualificationGuard(c)), 0, 'the guard leaves it running')
    assert.equal((await stateOf(x)).state, 'open')
  })

  it('fits by the generation’s budget rule, at the boundary from both sides; refused, it ends the exchange and says why', async () => {
    const { projectId } = await project()
    // Budget 100,000, output cap 2,000, no prompt reported: 27,000 + 70,999 + 2,000 = 99,999 fits; one more reaches it.
    const g = await grant(projectId, P, { budget: 100_000, outputPerTurn: 2000 })
    const x = await open(projectId)
    await reserve(x, g, 'connection')
    await reserve(x, g, 'generation', 1, 27_000)
    assert.equal((await reserve(x, g, 'spend', 1, 70_999)).ok, true)
    assert.deepEqual(await reserve(x, g, 'spend', 1, 1), { ok: false, ordinal: null, stop: 'usage', ended: true })
    assert.equal(await committedOf(x), 97_999, 'a refused top-up is not kept')
    assert.deepEqual(await countsOf(x), { connections: 1, turns: 1 })
    assert.deepEqual(await stateOf(x), { state: 'ended', reason: 'usage' })
    const guard = await owner((c) =>
      c.query<{ source: string; reason: string }>(
        `SELECT source, receipt->>'reason' AS reason FROM sophia.voice_qualification_evidence WHERE exchange_id=$1 AND kind='guard'`,
        [x],
      ),
    )
    assert.deepEqual(guard.rows, [{ source: 'service', reason: 'usage' }], 'the guard’s receipt records why')
    const events = await owner((c) =>
      c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id=$1 AND summary_code='room.exchange_qualification_limit'`,
        [projectId],
      ),
    )
    assert.equal(events.rows[0]!.n, 1, 'and the event that wakes the bridge’s poll')
    assert.equal(
      await codeOf(reserve(x, g, 'spend', 1, 1)),
      'invalid_state',
      'an ended exchange: 40001, as for the others',
    )
    assert.deepEqual(await reserve(x, g, 'stop'), { ok: true, ordinal: null, stop: null, ended: true })

    // The last prompt reported is the context the next turn bills again: the same rule as a generation's.
    const two = await project()
    const g2 = await grant(two.projectId, P, { budget: 100_000, outputPerTurn: 2000 })
    const x2 = await open(two.projectId)
    await reserve(x2, g2, 'connection')
    await reserve(x2, g2, 'generation', 1, 27_000)
    await record(x2, g2, 1, 'provider', provider(10_000, 30_000))
    assert.equal((await reserve(x2, g2, 'spend', 1, 40_999)).ok, true, '27,000 + 40,999 + 30,000 + 2,000 = 99,999')
    assert.equal((await reserve(x2, g2, 'spend', 1, 1)).stop, 'usage')
  })

  it('refuses what it cannot bind, as the other kinds do; a member is never the bridge', async () => {
    const { projectId } = await project()
    const g = await grant(projectId)
    const x = await open(projectId)
    assert.equal(await codeOf(reserve(x, g, 'spend', 1, 10)), 'invalid_request', 'no connection 1 yet')
    await reserve(x, g, 'connection')
    assert.equal(await codeOf(reserve(x, randomUUID(), 'spend', 1, 10)), 'forbidden', 'another grant')
    assert.equal(await codeOf(reserve(randomUUID(), g, 'spend', 1, 10)), 'not_found')
    assert.equal(await codeOf(reserve(x, g, 'spend', 2, 10)), 'invalid_request', 'an unreserved connection')
    assert.equal(await codeOf(reserve(x, g, 'spend', 1)), 'invalid_request', 'a top-up names its charge')
    assert.equal(await codeOf(reserve(x, g, 'spend', undefined, 10)), 'invalid_request', 'and its connection')
    for (const charge of [-1, 5_000_001]) {
      assert.equal(await codeOf(reserve(x, g, 'spend', 1, charge)), 'invalid_request', `charge ${String(charge)}`)
    }
    const member = await withActor(pool, P, 'write', (c) =>
      c.query(`SELECT sophia.media_voice_reserve($1,$2,'spend',1,10)`, [x, g]).then(
        () => 'resolved',
        (err: unknown) => (err as { code?: string }).code,
      ),
    )
    assert.equal(member, '42501', 'a member is never the bridge')
    // The API's login reaches the charges only through the function: row security and no grant keep it off the rows.
    const direct = await withService(pool, (c) =>
      c.query(`UPDATE sophia.voice_qualification_connections SET charged=charged+1 WHERE exchange_id=$1`, [x]).then(
        () => 'resolved',
        (err: unknown) => (err as { code?: string }).code,
      ),
    )
    assert.equal(direct, '42501')
    assert.equal(await committedOf(x), 0, 'nothing was charged by any of them')
    assert.equal((await stateOf(x)).state, 'open', 'a refusal that binds nothing ends nothing')
  })
})

describe('a recorded voice call’s key (0046, media_record_live_call; Codex P1 on PR #190)', () => {
  it('the same call again is a no-op; another tool or another epoch under the key is refused and changes nothing', async () => {
    const { projectId } = await project()
    await grant(projectId)
    const x = await open(projectId)
    const key = `live:${x}:1:c-1`
    const recordAs = (tool: string, inputEpoch = 1) =>
      withService(pool, (c) => recordLiveCall(c, { exchangeId: x, inputEpoch, actorId: P, key, name: tool }))
    assert.equal(await recordAs('project_status'), true)
    assert.equal(await recordAs('project_status'), true, 'the bridge’s retry of a lost answer: the same call')
    assert.equal(await codeOf(recordAs('start_research')), 'idempotency_conflict', 'another operation under the key')
    // P holds input epoch 2 as well (a floor that came back to them): the key's call was epoch 1's.
    await owner((c) =>
      c.query(`INSERT INTO sophia.exchange_inputs(project_id,exchange_id,input_epoch,actor_id) VALUES($1,$2,2,$3)`, [
        projectId,
        x,
        P,
      ]),
    )
    assert.equal(await codeOf(recordAs('project_status', 2)), 'idempotency_conflict', 'another epoch under the key')
    const rows = await owner((c) =>
      c.query<{ tool: string; epoch: string }>(
        `SELECT tool, input_epoch AS epoch FROM sophia.live_tool_calls WHERE exchange_id=$1`,
        [x],
      ),
    )
    assert.deepEqual(rows.rows, [{ tool: 'project_status', epoch: '1' }], 'one call, as first recorded')
  })

  it('its answer, for a repeat: none while unanswered, then the outcome once; the service’s alone (0047; Codex r4234171899)', async () => {
    const { projectId } = await project()
    await grant(projectId)
    const x = await open(projectId)
    const key = `live:${x}:1:c-1`
    const answerOf = () => withService(pool, (c) => liveCallAnswer(c, { exchangeId: x, actorId: P, key }))
    assert.equal(await answerOf(), null, 'never recorded')
    assert.equal(
      await withService(pool, (c) =>
        recordLiveCall(c, { exchangeId: x, inputEpoch: 1, actorId: P, key, name: 'control_work' }),
      ),
      true,
    )
    assert.equal(await answerOf(), null, 'recorded, not answered: the repeat runs it')
    await withService(pool, (c) => answerLiveCall(c, { exchangeId: x, actorId: P, key, outcome: 'refused' }))
    assert.deepEqual(await answerOf(), { outcome: 'refused', commandId: null, taskId: null })
    await withService(pool, (c) => answerLiveCall(c, { exchangeId: x, actorId: P, key, outcome: 'ok' }))
    assert.deepEqual(await answerOf(), { outcome: 'refused', commandId: null, taskId: null }, 'answered once')
    assert.equal(
      await codeOf(withActor(pool, P, 'read', (c) => liveCallAnswer(c, { exchangeId: x, actorId: P, key }))),
      'forbidden',
      'a member is never the service',
    )
  })

  it('its answer under its fence’s generation: each attempt takes the next; under a moved one nothing is written; the next waits for a seal (0047; Codex r4234782534)', async () => {
    const { projectId } = await project()
    await grant(projectId)
    const x = await open(projectId)
    const key = `live:${x}:1:c-2`
    const answerOf = () => withService(pool, (c) => liveCallAnswer(c, { exchangeId: x, actorId: P, key }))
    const fence = () => withService(pool, (c) => fenceLiveCall(c, x, key))
    const seal = (generation: string, outcome: 'ok' | 'refused') =>
      withActor(pool, P, 'write', (c) => sealLiveCall(c, { exchangeId: x, key, generation, outcome }))
    const mark = (generation: string, outcome: 'ok' | 'refused') =>
      withService(pool, (c) => markLiveCall(c, { exchangeId: x, actorId: P, key, generation, outcome }))
    await withService(pool, (c) =>
      recordLiveCall(c, { exchangeId: x, inputEpoch: 1, actorId: P, key, name: 'control_work' }),
    )
    assert.equal(await fence(), '1')
    assert.equal(await fence(), '2', 'the next attempt takes the next generation')
    assert.equal(await moved(seal('1', 'ok')), true, 'a seal under a moved generation is refused')
    assert.equal(await moved(mark('1', 'refused')), true, 'and so is a mark')
    assert.equal(await answerOf(), null, 'nothing was written')
    assert.equal(
      await codeOf(withService(pool, (c) => sealLiveCall(c, { exchangeId: x, key, generation: '2', outcome: 'ok' }))),
      'forbidden',
      'a seal is the speaker’s own write',
    )
    assert.equal(
      await codeOf(withActor(pool, P, 'write', (c) => fenceLiveCall(c, x, key))),
      'forbidden',
      'a generation is the service’s',
    )
    assert.equal(
      await codeOf(
        withActor(pool, P, 'write', (c) =>
          markLiveCall(c, { exchangeId: x, actorId: P, key, generation: '2', outcome: 'ok' }),
        ),
      ),
      'forbidden',
      'and so is a mark',
    )
    // A seal under the current generation holds the key's row to its commit: the next generation waits for it.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SELECT set_config('sophia.actor_id', $1, true)`, [P])
      await sealLiveCall(client, { exchangeId: x, key, generation: '2', outcome: 'ok' })
      let taken = false
      const next = fence().then((g) => {
        taken = true
        return g
      })
      await new Promise((resolve) => setTimeout(resolve, 300))
      assert.equal(taken, false, 'the next generation waits for the seal’s commit')
      await client.query('COMMIT')
      assert.equal(await next, '3')
    } finally {
      client.release()
    }
    assert.deepEqual(await answerOf(), { outcome: 'ok', commandId: null, taskId: null }, 'the seal’s answer')
    await mark('3', 'refused')
    assert.deepEqual(await answerOf(), { outcome: 'ok', commandId: null, taskId: null }, 'answered once')
  })
})

describe('bridge receipts (0046)', () => {
  it('are bound to the exchange’s grant and run, once per sequence number', async () => {
    const { projectId } = await project()
    const g = await grant(projectId)
    const x = await open(projectId)
    assert.equal(
      await codeOf(
        withService(pool, (c) =>
          recordQualificationEvidence(c, {
            exchangeId: x,
            grantId: g,
            seq: 0,
            kind: 'input_turn',
            receipt: { ...receipt(g, 'input_turn'), runBindingSha256: 'cd'.repeat(32) },
          }),
        ),
      ),
      'invalid_request',
      'another run’s binding',
    )
    assert.equal(
      await codeOf(record(x, randomUUID(), 0, 'input_turn')),
      'forbidden',
      'a grant that does not cover the exchange',
    )
    assert.equal(
      await codeOf(
        withService(pool, (c) =>
          recordQualificationEvidence(c, {
            exchangeId: x,
            grantId: g,
            seq: 0,
            kind: 'input_turn',
            receipt: receipt(g, 'provider'),
          }),
        ),
      ),
      'invalid_request',
      'a kind its body does not say',
    )
    assert.equal(
      await codeOf(
        withService(pool, (c) =>
          c.query(`SELECT sophia.media_record_evidence($1,$2,0,'guard',$3)`, [
            x,
            g,
            JSON.stringify(receipt(g, 'input_turn')),
          ]),
        ),
      ),
      'invalid_request',
      'the guard’s own receipt is the service’s',
    )
    assert.equal((await record(x, g, 0, 'input_turn', { turnOrdinal: 1 })).ended, false)
    assert.equal((await record(x, g, 0, 'input_turn', { turnOrdinal: 1 })).ended, false, 'the same again: a no-op')
    assert.equal(
      await codeOf(record(x, g, 0, 'input_turn', { turnOrdinal: 2 })),
      'idempotency_conflict',
      'another receipt under the same number',
    )
    assert.equal(
      await codeOf(
        withActor(pool, P, 'write', (c) =>
          recordQualificationEvidence(c, {
            exchangeId: x,
            grantId: g,
            seq: 9,
            kind: 'input_turn',
            receipt: receipt(g, 'input_turn'),
          }),
        ),
      ),
      'forbidden',
      'a member is never the bridge',
    )
  })

  it('are read by the grant’s principal alone, in order, until they expire', async () => {
    const { projectId } = await project()
    const g = await grant(projectId)
    const x = await open(projectId)
    await record(x, g, 1, 'input_turn', { turnOrdinal: 1 })
    await record(x, g, 0, 'input_window', { windowSeq: 1 })
    const read = (actor: string) => withActor(pool, actor, 'read', (c) => readQualificationEvidence(c, x))
    const evidence = (await read(P)) as { grant: Record<string, unknown>; receipts: Array<Record<string, unknown>> }
    assert.equal(evidence.grant.grantId, g)
    assert.deepEqual(
      evidence.receipts.map((r) => [r.seq, r.kind]),
      [
        [0, 'input_window'],
        [1, 'input_turn'],
      ],
    )
    for (const other of [A, E, V, randomUUID()]) assert.equal(await codeOf(read(other)), 'not_found', other)
    assert.equal(await codeOf(withService(pool, (c) => readQualificationEvidence(c, x))), 'forbidden')
    await owner((c) =>
      c.query(
        `UPDATE sophia.voice_qualification_evidence SET expires_at=now()-interval '1 second' WHERE seq=0 AND exchange_id=$1`,
        [x],
      ),
    )
    const later = (await read(P)) as { receipts: unknown[] }
    assert.equal(later.receipts.length, 1, 'an expired receipt is not read')
    await withService(pool, (c) => voiceQualificationGuard(c))
    const left = await owner((c) =>
      c.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM sophia.voice_qualification_evidence WHERE exchange_id=$1`,
        [x],
      ),
    )
    assert.equal(left.rows[0]!.n, 1, 'and is deleted by the next guard')
  })

  it('a guard receipt says why it ended, bound to the run', async () => {
    const { projectId } = await project()
    const g = await grant(projectId)
    const x = await open(projectId)
    await owner((c) => c.query(`SELECT sophia.voice_qualification_revoke($1,$2,'operator_kill')`, [projectId, g]))
    await withService(pool, (c) => voiceQualificationGuard(c))
    const evidence = (await withActor(pool, P, 'read', (c) => readQualificationEvidence(c, x))) as {
      grant: Record<string, unknown>
      receipts: Array<{ source: string; kind: string; receipt: Record<string, unknown> }>
    }
    assert.equal(evidence.grant.endedReason, 'revoked')
    const guard = evidence.receipts.find((r) => r.kind === 'guard')
    assert.ok(guard)
    assert.equal(guard.source, 'service')
    assert.deepEqual([guard.receipt.reason, guard.receipt.runBindingSha256], ['revoked', RUN])
  })
})
