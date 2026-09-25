// S1-05A durable room removals (migration 0014, amendment A07), level: sql-run. Members decide on the sophia_api
// login with an actor; the worker claims and settles on the sophia_worker login; the API's immediate attempt
// settles on the sophia_api login with no actor.
import { randomBytes, randomUUID } from 'node:crypto'
import type pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  claimRoomRemovals,
  createPool,
  createRoomInvitation,
  decideLobbyEntry,
  knockRoom,
  pendingRemoval,
  readSnapshot,
  settleRoomRemoval,
  withActor,
  withService,
} from './index.ts'

const A = randomUUID() // admin
const E = randomUUID() // editor

let db: TestDatabase
let pool: pg.Pool
let worker: pg.Pool
let owner: pg.Pool

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  worker = createPool(db.workerUrl, { max: 2 })
  owner = createPool(db.ownerUrl, { max: 2 })
})
after(async () => {
  await pool.end()
  await worker.end()
  await owner.end()
  await db.drop()
})

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? err.code : `raw:${String(err)}`
  }
}

/** A project with a guest who knocked (and, unless `admit` is false, was let in). */
async function guestIn(admit = true) {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
  const hash = randomBytes(32)
  await withActor(pool, A, 'write', (c) =>
    createRoomInvitation(c, {
      projectId,
      id: randomUUID(),
      request: {
        kind: 'guest',
        role: null,
        email: null,
        sessionId: null,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        maxUses: 5,
        inviterName: null,
      },
      tokenSha256: hash,
      idempotencyKey: randomUUID(),
    }),
  )
  const guest = randomUUID()
  const entry = await withActor(pool, guest, 'write', (c) => knockRoom(c, hash, 'Guest'))
  if (admit) await withActor(pool, E, 'write', (c) => decideLobbyEntry(c, entry.id, 'admit'))
  return { projectId, entryId: entry.id, guest }
}

const decide = (actor: string, entryId: string, decision: 'admit' | 'deny' | 'block' | 'unblock') =>
  withActor(pool, actor, 'write', (c) => decideLobbyEntry(c, entryId, decision))

const removalOf = async (projectId: string, entryId: string) => {
  const snap = await withActor(pool, A, 'read', (c) => readSnapshot(c, projectId))
  return snap?.lobby.find((e) => e.id === entryId)?.removal ?? null
}

/** Make every open removal of the entry due now (the test cannot wait out a backoff). */
const dueNow = (entryId: string) =>
  owner.query(`UPDATE sophia.room_removals SET next_attempt_at = now() WHERE lobby_entry_id = $1`, [entryId])

/** The entry's open removal, claimed by `workerId` (other tests' due removals may be claimed alongside). */
async function claimOpen(entryId: string, workerId = 'worker-1') {
  const open = await withActor(pool, A, 'read', (c) => pendingRemoval(c, entryId))
  assert.ok(open, 'an open removal')
  const claimed = (await claimRoomRemovals(worker, workerId)).find((c) => c.id === open.id)
  return { open, claimed }
}

describe('removal obligations (amendment A07)', () => {
  it('declining a guest who was let in records a pending removal with the decision; one never let in has none', async () => {
    const { projectId, entryId, guest } = await guestIn()
    await decide(E, entryId, 'deny')
    assert.deepEqual(await removalOf(projectId, entryId), { state: 'pending', attempts: 0, lastError: null })
    const open = await withActor(pool, A, 'read', (c) => pendingRemoval(c, entryId))
    assert.equal(open?.identity, guest)

    const waiting = await guestIn(false)
    await decide(E, waiting.entryId, 'deny')
    assert.equal(await removalOf(waiting.projectId, waiting.entryId), null)
  })

  it('a failed removal stays pending, visibly, with backoff; only evidence settles it', async () => {
    const { projectId, entryId } = await guestIn()
    await decide(E, entryId, 'block')
    const { claimed: claim } = await claimOpen(entryId)
    assert.ok(claim)
    assert.equal(
      await settleRoomRemoval(worker, claim.id, 'worker-1', { outcome: 'failed', error: 'connect ECONNREFUSED' }),
      'pending',
    )
    assert.deepEqual(await removalOf(projectId, entryId), {
      state: 'pending',
      attempts: 1,
      lastError: 'connect ECONNREFUSED',
    })
    assert.equal(
      (await claimRoomRemovals(worker, 'worker-1')).some((c) => c.id === claim.id),
      false,
      'not due again before its backoff',
    )
    await dueNow(entryId)
    const [again] = (await claimRoomRemovals(worker, 'worker-1')).filter((c) => c.id === claim.id)
    assert.ok(again, 'retried after the backoff, for as long as it takes')
    assert.equal(await settleRoomRemoval(worker, claim.id, 'worker-1', { outcome: 'removed' }), 'removed')
    assert.deepEqual(await removalOf(projectId, entryId), { state: 'removed', attempts: 2, lastError: null })
  })

  it('a claim is a lease: another worker cannot settle it, and cannot claim it meanwhile', async () => {
    const { entryId } = await guestIn()
    await decide(E, entryId, 'deny')
    const { open, claimed } = await claimOpen(entryId, 'worker-a')
    assert.ok(claimed)
    assert.equal(
      (await claimRoomRemovals(worker, 'worker-b')).some((c) => c.id === open.id),
      false,
    )
    assert.equal(await settleRoomRemoval(worker, open.id, 'worker-b', { outcome: 'removed' }), 'stale')
    assert.equal(await settleRoomRemoval(worker, open.id, 'worker-a', { outcome: 'absent' }), 'absent')
  })

  it('keeps watch after settling while an earlier token could bring the guest back', async () => {
    const { projectId, entryId } = await guestIn()
    await decide(E, entryId, 'deny')
    const { open, claimed } = await claimOpen(entryId)
    assert.ok(claimed)
    assert.equal(await settleRoomRemoval(worker, open.id, 'worker-1', { outcome: 'removed' }), 'removed')
    await dueNow(entryId)
    const watch = (await claimRoomRemovals(worker, 'worker-1')).find((c) => c.id === open.id)
    assert.equal(watch?.state, 'removed', 'checked again while on watch')
    assert.equal(await settleRoomRemoval(worker, open.id, 'worker-1', { outcome: 'absent' }), 'removed')
    await owner.query(`UPDATE sophia.room_removals SET guard_until = now(), next_attempt_at = now() WHERE id = $1`, [
      open.id,
    ])
    assert.equal(
      (await claimRoomRemovals(worker, 'worker-1')).some((c) => c.id === open.id),
      false,
      'watch over',
    )
    assert.equal((await removalOf(projectId, entryId))?.state, 'removed')
  })

  it('letting the guest in again cancels an open removal', async () => {
    const { projectId, entryId } = await guestIn()
    await decide(E, entryId, 'deny')
    await decide(E, entryId, 'admit')
    assert.equal(await removalOf(projectId, entryId), null)
    assert.equal(await withActor(pool, A, 'read', (c) => pendingRemoval(c, entryId)), null)
    await decide(E, entryId, 'deny')
    assert.equal((await removalOf(projectId, entryId))?.state, 'pending', 'a new obligation for the new decision')
  })

  it('declining then blocking keeps one obligation', async () => {
    const { entryId } = await guestIn()
    await decide(E, entryId, 'deny')
    await decide(A, entryId, 'block')
    const { rows } = await owner.query<{ n: string; reason: string }>(
      `SELECT count(*) AS n, max(reason) AS reason FROM sophia.room_removals WHERE lobby_entry_id = $1`,
      [entryId],
    )
    assert.deepEqual([rows[0]?.n, rows[0]?.reason], ['1', 'blocked'])
  })

  it('a member identity can neither claim nor settle; the API settles with no identity', async () => {
    const { entryId } = await guestIn()
    await decide(E, entryId, 'deny')
    const open = await withActor(pool, A, 'read', (c) => pendingRemoval(c, entryId))
    assert.ok(open)
    assert.equal(await codeOf(withActor(pool, A, 'write', (c) => claimRoomRemovals(c, 'sneaky'))), 'forbidden')
    assert.equal(
      await codeOf(withActor(pool, A, 'write', (c) => settleRoomRemoval(c, open.id, 'sneaky', { outcome: 'removed' }))),
      'forbidden',
    )
    assert.equal(
      await withService(pool, (c) => settleRoomRemoval(c, open.id, 'api:1', { outcome: 'removed' })),
      'removed',
    )
  })
})
