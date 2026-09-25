// S1-05A room exchange (migration 0013, amendment A06), level: sql-run. Member calls on the non-owner sophia_api
// login with a transaction-local actor; the media bridge's calls on the same login with no actor.
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  ackQuiesce,
  controlExchange,
  createPool,
  createRoomInvitation,
  decideLobbyEntry,
  holderEvent,
  knockRoom,
  mediaAssignments,
  quiesceAcked,
  readSnapshot,
  reportPresence,
  requestGuestQuiesce,
  startExchange,
  toolSpeaker,
  transferInputFloor,
  withActor,
  withService,
  type PresenceReport,
} from './index.ts'

const A = randomUUID() // admin
const E = randomUUID() // editor
const V = randomUUID() // viewer
const G = randomUUID() // guest
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

const snapshotOf = async (actor: string, projectId: string) => {
  const snap = await withActor(pool, actor, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  return snap
}

async function room(projectId: string) {
  const snap = await snapshotOf(A, projectId)
  return { id: snap.room.id, revision: snap.room.revision }
}

const open = async (actor: string, projectId: string, allowVision = true, key = randomUUID()) => {
  const r = await room(projectId)
  return withActor(pool, actor, 'write', (c) =>
    startExchange(c, r.id, key, { expectedRoomRevision: r.revision, allowVision }),
  )
}

const control = (
  actor: string,
  exchangeId: string,
  action: Parameters<typeof controlExchange>[2],
  source: 'screen' | null = null,
) => withActor(pool, actor, 'write', (c) => controlExchange(c, exchangeId, action, source))

const present = (
  roomId: string,
  exchangeId: string | null,
  participants: PresenceReport['participants'],
  voice: PresenceReport['voice'] = 'ready',
) =>
  withService(pool, (c) =>
    reportPresence(c, { roomId, exchangeId, bridgeInstanceId: 'bridge-test', voice, reason: null, participants }),
  )

async function workCount(projectId: string): Promise<number> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    const { rows } = await c.query<{ n: number }>(
      `SELECT ((SELECT count(*) FROM sophia.commands WHERE project_id=$1) + (SELECT count(*) FROM sophia.jobs WHERE project_id=$1))::int AS n`,
      [projectId],
    )
    return rows[0]!.n
  } finally {
    await c.end()
  }
}

describe('opening and controlling the exchange', () => {
  it('opens once per room for any member, gives a free floor to the opener, and retries idempotently', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
    const key = randomUUID()
    const receipt = await open(V, projectId, true, key)
    assert.equal(receipt.inputActorId, V, 'a viewer may open a (read-only) exchange and holds the free floor')
    assert.deepEqual(await open(V, projectId, true, key), receipt)
    assert.equal(await codeOf(open(E, projectId)), 'invalid_state', 'one exchange per room')
    assert.equal(await codeOf(open(C, projectId)), 'forbidden')
    const sophia = (await snapshotOf(E, projectId)).room.sophia
    assert.deepEqual(
      [sophia.exchange, sophia.voice, sophia.inputActorId, sophia.inputEpoch],
      ['open', 'unavailable', V, 1],
      'no bridge has reported: her voice is unavailable, not listening',
    )
  })

  it('moves only its own epoch per control and never touches work', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const { exchangeId } = await open(E, projectId)
    const workBefore = await workCount(projectId)
    const spoke = await control(A, exchangeId, 'stop_speaking')
    assert.deepEqual([spoke.playbackEpoch, spoke.observationEpoch, spoke.inputEpoch], [2, 1, 1])
    const looked = await control(E, exchangeId, 'look', 'screen')
    assert.equal(looked.observationEpoch, 2)
    assert.deepEqual((await snapshotOf(A, projectId)).room.sophia.looking, { participantIdentity: E, source: 'screen' })
    const stopped = await control(A, exchangeId, 'stop_looking')
    assert.equal(stopped.observationEpoch, 3)
    assert.equal((await snapshotOf(A, projectId)).room.sophia.looking, null)
    const ended = await control(E, exchangeId, 'end')
    assert.equal(ended.state, 'ended')
    assert.deepEqual(await control(A, exchangeId, 'end'), ended, 'ending twice changes nothing')
    assert.equal(await codeOf(control(A, exchangeId, 'stop_speaking')), 'invalid_state')
    assert.equal(await workCount(projectId), workBefore, 'no command or job was created')
  })

  it('refuses to look when vision is off', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A })
    const { exchangeId } = await open(A, projectId, false)
    assert.equal(await codeOf(control(A, exchangeId, 'look', 'screen')), 'invalid_state')
  })
})

describe('speaker binding across a floor change (case A10)', () => {
  it('binds each input epoch to exactly one speaker; an old call keeps its own speaker and never the new one', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
    const { exchangeId } = await open(E, projectId)
    const r = await room(projectId)
    await withActor(pool, E, 'write', (c) =>
      transferInputFloor(c, r.id, randomUUID(), { nextActorId: V, expectedRoomRevision: r.revision }),
    )
    const sophia = (await snapshotOf(A, projectId)).room.sophia
    assert.deepEqual([sophia.inputEpoch, sophia.inputActorId], [2, V])
    const speaker = (epoch: number, actor: string) =>
      codeOf(withService(pool, (c) => toolSpeaker(c, exchangeId, epoch, actor)))
    assert.equal(await speaker(1, E), 'resolved', 'the old holder’s late call keeps its original actor')
    assert.equal(await speaker(2, V), 'resolved')
    assert.equal(await speaker(1, V), 'forbidden', 'the new holder cannot claim the old epoch')
    assert.equal(await speaker(2, E), 'forbidden', 'the old holder cannot act as the new one')
  })

  it('pauses input when the holder leaves; a stale departure cannot clear a newly transferred floor', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const { exchangeId } = await open(E, projectId)
    const left = await withService(pool, (c) =>
      holderEvent(c, { exchangeId, actorId: E, inputEpoch: 1, event: 'left' }),
    )
    assert.equal(left, 'paused')
    assert.deepEqual((await snapshotOf(A, projectId)).room.sophia.pauseReason, 'holder_left')
    const r = await room(projectId)
    await withActor(pool, A, 'write', (c) =>
      transferInputFloor(c, r.id, randomUUID(), { nextActorId: A, expectedRoomRevision: r.revision }),
    )
    const stale = await withService(pool, (c) =>
      holderEvent(c, { exchangeId, actorId: E, inputEpoch: 1, event: 'gone' }),
    )
    assert.equal(stale, 'stale')
    const sophia = (await snapshotOf(A, projectId)).room.sophia
    assert.deepEqual([sophia.exchange, sophia.inputActorId, sophia.inputEpoch], ['open', A, 2])
    const gone = await withService(pool, (c) =>
      holderEvent(c, { exchangeId, actorId: A, inputEpoch: 2, event: 'gone' }),
    )
    assert.equal(gone, 'cleared')
    const cleared = await snapshotOf(A, projectId)
    assert.deepEqual(
      [cleared.room.inputActorId, cleared.room.sophia.inputActorId, cleared.room.sophia.inputEpoch],
      [null, null, 3],
    )
  })
})

describe('guests and a project-aware Sophia (case A12)', () => {
  it('pauses on a guest present, refuses to open or resume until member-only, and resumes only by member action', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const { exchangeId } = await open(E, projectId)
    const r = await room(projectId)
    await present(r.id, exchangeId, [
      { identity: E, standing: 'editor' },
      { identity: G, standing: 'guest' },
    ])
    assert.deepEqual((await snapshotOf(A, projectId)).room.sophia.pauseReason, 'guest')
    assert.equal(await codeOf(control(E, exchangeId, 'resume')), 'invalid_state', 'not while the guest is present')
    await present(r.id, exchangeId, [{ identity: E, standing: 'editor' }])
    assert.equal((await snapshotOf(A, projectId)).room.sophia.exchange, 'paused', 'a guest leaving does not resume her')
    const resumed = await control(E, exchangeId, 'resume')
    assert.deepEqual([resumed.state, resumed.inputEpoch], ['open', 2], 'resume is a new input generation')
  })

  it('opens a quiesce request when a guest asks for a token, and records the bridge’s acknowledgement', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const { exchangeId } = await open(E, projectId)
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
    const entry = await withActor(pool, G, 'write', (c) => knockRoom(c, hash, 'Guest'))
    await withActor(pool, E, 'write', (c) => decideLobbyEntry(c, entry.id, 'admit'))
    const requestId = await withActor(pool, G, 'write', (c) => requestGuestQuiesce(c, entry.id))
    assert.ok(requestId)
    assert.deepEqual((await snapshotOf(A, projectId)).room.sophia.pauseReason, 'guest')
    const [assignment] = (await withService(pool, (c) => mediaAssignments(c))).filter(
      (a) => a.exchangeId === exchangeId,
    )
    assert.equal(assignment?.quiesceRequestId, requestId, 'the bridge sees what to confirm')
    assert.equal(await withService(pool, (c) => quiesceAcked(c, requestId)), false)
    await withService(pool, (c) => ackQuiesce(c, requestId, 'bridge-test'))
    assert.equal(await withService(pool, (c) => quiesceAcked(c, requestId)), true)
  })
})

describe('the media bridge is a service, not a member', () => {
  it('refuses a bridge call that carries a member identity', async () => {
    assert.equal(await codeOf(withActor(pool, A, 'read', (c) => mediaAssignments(c))), 'forbidden')
  })

  it('reports voice only while the bridge’s report is for this exchange and fresh', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A })
    const { exchangeId } = await open(A, projectId)
    const r = await room(projectId)
    await present(r.id, exchangeId, [{ identity: A, standing: 'admin' }], 'ready')
    assert.equal((await snapshotOf(A, projectId)).room.sophia.voice, 'ready')
    await present(r.id, exchangeId, [{ identity: A, standing: 'admin' }], 'recovering')
    assert.equal((await snapshotOf(A, projectId)).room.sophia.voice, 'recovering')
    const c = new pg.Client({ connectionString: db.ownerUrl })
    await c.connect()
    await c.query(`UPDATE sophia.room_ai_presence SET reported_at=now()-interval '1 minute' WHERE room_id=$1`, [r.id])
    await c.end()
    assert.equal((await snapshotOf(A, projectId)).room.sophia.voice, 'unavailable', 'a silent bridge is not heard')
  })
})
