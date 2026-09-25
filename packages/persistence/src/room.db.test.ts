// S1-04 room (migration 0009, contract amendment A01), level: sql-run. Same non-owner sophia_api login and
// transaction-local actor as the API.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { FloorRequest } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import {
  authorizeRoomJoin,
  createPool,
  createProject,
  readEventFrames,
  readSnapshot,
  transferInputFloor,
  withActor,
} from './index.ts'

const A = randomUUID() // admin
const B = randomUUID() // editor
const V = randomUUID() // viewer
const C = randomUUID() // outsider

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

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? err.code : `raw:${String(err)}`
  }
}

async function roomOf(actor: string, projectId: string) {
  const snap = await withActor(pool, actor, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap, `no snapshot for ${actor}`)
  return snap.room
}

const pass = (actor: string, roomId: string, req: FloorRequest, key = randomUUID()) =>
  withActor(pool, actor, 'write', (c) => transferInputFloor(c, roomId, key, req))

const workCounts = async (projectId: string) => {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    const { rows } = await c.query(
      `SELECT (SELECT count(*) FROM sophia.commands WHERE project_id = $1)::int AS commands,
              (SELECT count(*) FROM sophia.outbox WHERE project_id = $1)::int AS outbox,
              (SELECT string_agg(status || ':' || authority_epoch, ',') FROM sophia.goals WHERE project_id = $1) AS goals`,
      [projectId],
    )
    return rows[0] as unknown
  } finally {
    await c.end()
  }
}

describe('every project has one room', () => {
  it('opens free, on revision 1, for projects seeded by the owner and created through the API role', async () => {
    const seeded = await seedProject(db.ownerUrl, { admin: A })
    const created = await withActor(pool, A, 'write', (c) => createProject(c, randomUUID(), { title: 'Room project' }))
    for (const projectId of [seeded.projectId, created.projectId]) {
      const room = await roomOf(A, projectId)
      assert.deepEqual(
        { ...room, id: typeof room.id },
        { id: 'string', revision: 1, inputActorId: null, mode: 'invoked' },
      )
    }
    assert.notEqual((await roomOf(A, seeded.projectId)).id, (await roomOf(A, created.projectId)).id)
  })
})

describe('input floor', () => {
  let seed: SeededProject
  before(async () => {
    seed = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
  })

  it('passes by compare-and-set, emits one event and never touches work', async () => {
    const before = await workCounts(seed.projectId)
    const room = await roomOf(B, seed.projectId)
    const receipt = await pass(B, room.id, { nextActorId: B, expectedRoomRevision: 1 })
    assert.deepEqual(
      { ...receipt, exchangeId: typeof receipt.exchangeId },
      {
        exchangeId: 'string',
        roomId: room.id,
        revision: 2,
        inputActorId: B,
      },
    )
    assert.deepEqual(await roomOf(A, seed.projectId), { ...room, revision: 2, inputActorId: B })
    const events = await withActor(pool, A, 'read', (c) => readEventFrames(c, seed.projectId, 0n))
    assert.deepEqual(
      events.frames.map((f) => ('entityType' in f ? [f.type, f.entityId, f.entityRevision] : f.type)),
      [['room.input_floor_changed', room.id, 2]],
    )
    assert.deepEqual(await workCounts(seed.projectId), before)
  })

  it('returns the first receipt for a retry and refuses a key reused for another request', async () => {
    const room = await roomOf(A, seed.projectId)
    const key = randomUUID()
    const req = { nextActorId: B, expectedRoomRevision: room.revision }
    const first = await pass(B, room.id, req, key)
    assert.deepEqual(await pass(B, room.id, req, key), first)
    assert.equal(await codeOf(pass(B, room.id, { ...req, nextActorId: A }, key)), 'idempotency_conflict')
  })

  it('refuses a stale room revision', async () => {
    const room = await roomOf(A, seed.projectId)
    const stale = { nextActorId: A, expectedRoomRevision: room.revision - 1 }
    assert.equal(await codeOf(pass(B, room.id, stale)), 'stale_revision')
  })

  it('lets the holder pass it and an admin reclaim it, but not another editor take it', async () => {
    let room = await roomOf(A, seed.projectId)
    assert.equal(room.inputActorId, B)
    room = await roomOf(A, seed.projectId)
    const reclaimed = await pass(A, room.id, { nextActorId: A, expectedRoomRevision: room.revision })
    assert.equal(reclaimed.inputActorId, A)
    assert.equal(
      await codeOf(pass(B, room.id, { nextActorId: B, expectedRoomRevision: reclaimed.revision })),
      'invalid_state',
    )
    const handed = await pass(A, room.id, { nextActorId: B, expectedRoomRevision: reclaimed.revision })
    assert.equal(handed.inputActorId, B)
  })

  it('keeps viewers listening: they cannot pass it or receive it', async () => {
    const room = await roomOf(V, seed.projectId)
    assert.equal(await codeOf(pass(V, room.id, { nextActorId: V, expectedRoomRevision: room.revision })), 'forbidden')
    assert.equal(
      await codeOf(pass(B, room.id, { nextActorId: V, expectedRoomRevision: room.revision })),
      'invalid_request',
    )
  })

  it('treats an outsider, an unknown room and another project’s room alike', async () => {
    const room = await roomOf(A, seed.projectId)
    const other = await seedProject(db.ownerUrl, { admin: C })
    const otherRoom = await roomOf(C, other.projectId)
    const req = { nextActorId: C, expectedRoomRevision: 1 }
    assert.equal(await codeOf(pass(C, room.id, { ...req, expectedRoomRevision: room.revision })), 'forbidden')
    assert.equal(await codeOf(pass(A, randomUUID(), req)), 'forbidden')
    assert.equal(await codeOf(pass(A, otherRoom.id, { ...req, nextActorId: A })), 'forbidden')
  })
})

describe('joining the room (room-token authorization)', () => {
  it('returns the member role, nothing for outsiders or foreign rooms, and stale on a changed audience', async () => {
    const seed = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
    const other = await seedProject(db.ownerUrl, { admin: A })
    const { id: roomId } = await roomOf(A, seed.projectId)
    const { id: otherRoom } = await roomOf(A, other.projectId)
    const join = (actor: string, projectId: string, room: string, audience = 1) =>
      withActor(pool, actor, 'read', (c) => authorizeRoomJoin(c, projectId, room, audience))

    assert.deepEqual(await join(A, seed.projectId, roomId), { role: 'admin' })
    assert.deepEqual(await join(B, seed.projectId, roomId), { role: 'editor' })
    assert.deepEqual(await join(V, seed.projectId, roomId), { role: 'viewer' })
    assert.equal(await join(C, seed.projectId, roomId), null)
    // A member of both projects still cannot use one project's id with the other project's room.
    assert.equal(await join(A, seed.projectId, otherRoom), null)
    assert.equal(await codeOf(join(A, seed.projectId, roomId, 2)), 'stale_revision')
  })
})
