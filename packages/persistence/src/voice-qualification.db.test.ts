// Voice qualification evidence (migration 0046; docs/plans/voice-qualification-g7.md), level: sql-run. The grant is
// the migration owner's; the bridge's calls run on the sophia_api login with no actor; a member's with theirs.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  createPool,
  mediaAssignments,
  readQualificationEvidence,
  readSnapshot,
  recordQualificationEvidence,
  roomQualification,
  startExchange,
  voiceQualificationGuard,
  withActor,
  withService,
  type QualificationReceiptKind,
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

  it('past its connection or turn limit, as the bridge reports them', async () => {
    const one = await project()
    const g1 = await grant(one.projectId, P, { connections: 2 })
    const x1 = await open(one.projectId)
    assert.deepEqual(await record(x1, g1, 0, 'provider', { connectionsOpened: 2, turns: 0, usageTokens: 0 }), {
      ended: false,
      reason: null,
    })
    assert.deepEqual(await record(x1, g1, 1, 'provider', { connectionsOpened: 3, turns: 0, usageTokens: 0 }), {
      ended: true,
      reason: 'connections',
    })

    const two = await project()
    const g2 = await grant(two.projectId, P, { turns: 4 })
    const x2 = await open(two.projectId)
    assert.equal((await record(x2, g2, 0, 'provider', { connectionsOpened: 1, turns: 3 })).ended, false)
    assert.deepEqual(await record(x2, g2, 1, 'provider', { connectionsOpened: 1, turns: 4 }), {
      ended: true,
      reason: 'turns',
    })
  })

  it('at its budget with the next turn reserved: the context it bills again and one turn’s output cap', async () => {
    const { projectId } = await project()
    // Budget 100,000; output cap 2,000.
    const g = await grant(projectId, P, { budget: 100_000, outputPerTurn: 2000 })
    const x = await open(projectId)
    // 60,000 reported + 37,999 context + 2,000 cap = 99,999: one more turn fits.
    assert.equal(
      (await record(x, g, 0, 'provider', { connectionsOpened: 1, usageTokens: 60_000, lastPromptTokens: 37_999 }))
        .ended,
      false,
    )
    // 60,000 + 38,000 + 2,000 = 100,000: the next turn could reach it, so the exchange ends now.
    assert.deepEqual(
      await record(x, g, 1, 'provider', { connectionsOpened: 1, usageTokens: 60_000, lastPromptTokens: 38_000 }),
      { ended: true, reason: 'usage' },
    )
  })

  it('never lowers what was reported: an older report after a newer one changes nothing', async () => {
    const { projectId } = await project()
    const g = await grant(projectId, P, { budget: 100_000, outputPerTurn: 1000 })
    const x = await open(projectId)
    await record(x, g, 1, 'provider', { connectionsOpened: 2, turns: 3, usageTokens: 50_000, lastPromptTokens: 9000 })
    await record(x, g, 0, 'provider', { connectionsOpened: 1, turns: 1, usageTokens: 10_000, lastPromptTokens: 2000 })
    const row = await owner((c) =>
      c.query(
        `SELECT connections_opened AS c, turns AS t, usage_tokens::int AS u, last_prompt_tokens::int AS p
          FROM sophia.voice_qualification_exchanges WHERE exchange_id=$1`,
        [x],
      ),
    )
    assert.deepEqual(row.rows[0], { c: 2, t: 3, u: 50_000, p: 9000 })
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
