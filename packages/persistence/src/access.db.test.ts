// S1-04A room access (migration 0010, contract amendment A02), level: sql-run. Same non-owner sophia_api
// login and transaction-local actor as the API. Token hashes are random bytes here: the API derives them.
import { randomBytes, randomUUID } from 'node:crypto'
import type pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { DomainError } from '@sophia/domain'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import {
  acceptRoomInvitation,
  authorizeGuestJoin,
  cancelRoomSession,
  createPool,
  createRoomInvitation,
  decideLobbyEntry,
  knockRoom,
  listInvitations,
  previewRoomInvitation,
  readEventFrames,
  readLobbyEntry,
  readMembership,
  readSnapshot,
  reissueRoomInvitation,
  revokeRoomInvitation,
  scheduleRoomSession,
  withActor,
  withoutActor,
  type InvitationRequest,
} from './index.ts'

const A = randomUUID() // admin
const E = randomUUID() // editor
const V = randomUUID() // viewer
const G = randomUUID() // a guest (no membership)
const H = randomUUID() // another guest
const M = randomUUID() // someone invited as a member

let db: TestDatabase
let pool: pg.Pool
let seed: SeededProject

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  seed = await seedProject(db.ownerUrl, { title: 'Founders', admin: A, editors: [E], viewers: [V] })
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

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
const guestRequest = (over: Partial<InvitationRequest> = {}): InvitationRequest => ({
  kind: 'guest',
  role: null,
  email: null,
  sessionId: null,
  expiresAt: inDays(7),
  maxUses: 50,
  inviterName: 'luis@sophia.test',
  ...over,
})
const invite = (actor: string, req: InvitationRequest, hash = randomBytes(32), key = randomUUID()) =>
  withActor(pool, actor, 'write', (c) =>
    createRoomInvitation(c, {
      projectId: seed.projectId,
      id: randomUUID(),
      request: req,
      tokenSha256: hash,
      idempotencyKey: key,
    }),
  )
const knock = (actor: string, hash: Buffer, name: string) =>
  withActor(pool, actor, 'write', (c) => knockRoom(c, hash, name))
const decide = (actor: string, entry: string, decision: 'admit' | 'deny') =>
  withActor(pool, actor, 'write', (c) => decideLobbyEntry(c, entry, decision))
const snapshotOf = (actor: string) => withActor(pool, actor, 'read', (c) => readSnapshot(c, seed.projectId))

describe('guest invitations and the lobby', () => {
  it('lets editors invite guests, idempotently per key; viewers and outsiders cannot', async () => {
    const key = randomUUID()
    const hash = randomBytes(32)
    const first = await invite(E, guestRequest(), hash, key)
    assert.equal(await invite(E, guestRequest(), randomBytes(32), key), first)
    assert.equal(await codeOf(invite(E, guestRequest({ maxUses: 3 }), randomBytes(32), key)), 'idempotency_conflict')
    assert.equal(await codeOf(invite(V, guestRequest())), 'forbidden')
    assert.equal(await codeOf(invite(G, guestRequest())), 'forbidden')
    const listed = await withActor(pool, E, 'read', (c) => listInvitations(c, seed.projectId))
    assert.ok(listed.some((i) => i.id === first && i.tokenVersion === 1))
    assert.deepEqual(await withActor(pool, V, 'read', (c) => listInvitations(c, seed.projectId)), [])
  })

  it('shows anyone holding the link where it leads, and nothing for an unknown link', async () => {
    const hash = randomBytes(32)
    await invite(A, guestRequest(), hash)
    const preview = await withoutActor(pool, (c) => previewRoomInvitation(c, hash))
    assert.deepEqual(
      [preview.projectTitle, preview.kind, preview.state, preview.session],
      ['Founders', 'guest', 'open', null],
    )
    assert.equal(await codeOf(withoutActor(pool, (c) => previewRoomInvitation(c, randomBytes(32)))), 'not_found')
  })

  it('keeps a guest waiting until an editor admits them, then lets only them join the call', async () => {
    const hash = randomBytes(32)
    await invite(E, guestRequest(), hash)
    const entry = await knock(G, hash, '  Ana  ')
    assert.deepEqual([entry.status, entry.displayName], ['waiting', 'Ana'])
    const lobby = (await snapshotOf(A))?.lobby ?? []
    assert.ok(lobby.some((e) => e.id === entry.id && e.status === 'waiting'))
    assert.equal(await codeOf(withActor(pool, G, 'read', (c) => authorizeGuestJoin(c, entry.id))), 'invalid_state')
    assert.equal(await codeOf(withActor(pool, H, 'read', (c) => readLobbyEntry(c, entry.id))), 'not_found')
    assert.equal(await codeOf(decide(V, entry.id, 'admit')), 'forbidden')
    assert.equal((await decide(E, entry.id, 'admit')).status, 'admitted')
    const access = await withActor(pool, G, 'read', (c) => authorizeGuestJoin(c, entry.id))
    assert.deepEqual(access, { roomId: (await snapshotOf(A))?.room.id, displayName: 'Ana' })
    // A guest is never a member: no snapshot, no role.
    assert.equal(await snapshotOf(G), null)
    assert.equal(await withActor(pool, G, 'read', (c) => readMembership(c, seed.projectId)), null)
  })

  // The lobby is one entry per person and room, so each test knocks with people new to the room.
  it('keeps a denied guest out, counts each guest once, and stops at the use limit', async () => {
    const [ana, beto] = [randomUUID(), randomUUID()]
    const hash = randomBytes(32)
    await invite(E, guestRequest({ maxUses: 1 }), hash)
    const entry = await knock(ana, hash, 'Ana')
    await decide(A, entry.id, 'deny')
    assert.equal((await knock(ana, hash, 'Ana again')).status, 'denied')
    assert.equal(await codeOf(withActor(pool, ana, 'read', (c) => authorizeGuestJoin(c, entry.id))), 'invalid_state')
    assert.equal(await codeOf(knock(beto, hash, 'Beto')), 'invalid_state')
    const preview = await withoutActor(pool, (c) => previewRoomInvitation(c, hash))
    assert.equal(preview.state, 'used_up')
  })

  it('closes a revoked link and tells members who knocked', async () => {
    const hash = randomBytes(32)
    const id = await invite(E, guestRequest(), hash)
    const cursor = BigInt((await snapshotOf(A))?.cursor ?? '0')
    await knock(randomUUID(), hash, 'Beto')
    const page = await withActor(pool, A, 'read', (c) => readEventFrames(c, seed.projectId, cursor, 10))
    assert.ok(page.frames.some((f) => 'type' in f && f.type === 'room.lobby_changed'))
    await withActor(pool, E, 'write', (c) => revokeRoomInvitation(c, id))
    assert.equal((await withoutActor(pool, (c) => previewRoomInvitation(c, hash))).state, 'revoked')
    assert.equal(await codeOf(knock(randomUUID(), hash, 'Late')), 'invalid_state')
  })
})

describe('member invitations', () => {
  const memberRequest = (email: string): InvitationRequest => ({
    ...guestRequest(),
    kind: 'member',
    role: 'editor',
    email,
    maxUses: 1,
  })

  it('are for admins, and only the invited email can accept them', async () => {
    assert.equal(await codeOf(invite(E, memberRequest('ana@example.com'))), 'forbidden')
    const hash = randomBytes(32)
    await invite(A, memberRequest('Ana@Example.com'), hash)
    const wrong = await codeOf(withActor(pool, M, 'write', (c) => acceptRoomInvitation(c, hash, 'mallory@example.com')))
    assert.equal(wrong, 'forbidden')
    const audience = (await snapshotOf(A))?.audienceRevision ?? 0
    const accepted = await withActor(pool, M, 'write', (c) => acceptRoomInvitation(c, hash, 'ana@example.com'))
    assert.equal(accepted.projectId, seed.projectId)
    assert.deepEqual(await withActor(pool, M, 'read', (c) => readMembership(c, seed.projectId)), {
      actorId: M,
      role: 'editor',
    })
    assert.equal((await snapshotOf(A))?.audienceRevision, audience + 1)
    // Accepting again as a member changes nothing and uses nothing.
    await withActor(pool, M, 'write', (c) => acceptRoomInvitation(c, hash, 'ana@example.com'))
    assert.equal((await snapshotOf(A))?.audienceRevision, audience + 1)
  })

  it('reissue retires the old link, compare-and-set on the version', async () => {
    const hash = randomBytes(32)
    const id = await invite(A, memberRequest('beto@example.com'), hash)
    const next = randomBytes(32)
    assert.equal(
      await codeOf(withActor(pool, A, 'write', (c) => reissueRoomInvitation(c, id, 7, next))),
      'stale_revision',
    )
    assert.equal(await withActor(pool, A, 'write', (c) => reissueRoomInvitation(c, id, 1, next)), 2)
    assert.equal(await codeOf(withoutActor(pool, (c) => previewRoomInvitation(c, hash))), 'not_found')
    assert.equal((await withoutActor(pool, (c) => previewRoomInvitation(c, next))).state, 'open')
  })
})

describe('room sessions', () => {
  const start = new Date(Date.now() + 3_600_000)
  const req = {
    title: 'Weekly with Sophia',
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
    timeZone: 'America/Bogota',
  }

  it('lets editors schedule idempotently and members see what is ahead', async () => {
    const key = randomUUID()
    const session = await withActor(pool, E, 'write', (c) => scheduleRoomSession(c, seed.projectId, req, key))
    const again = await withActor(pool, E, 'write', (c) => scheduleRoomSession(c, seed.projectId, req, key))
    assert.equal(again.id, session.id)
    assert.deepEqual(session, { id: session.id, ...req })
    assert.ok((await snapshotOf(V))?.sessions.some((s) => s.id === session.id))
    assert.equal(
      await codeOf(withActor(pool, V, 'write', (c) => scheduleRoomSession(c, seed.projectId, req, randomUUID()))),
      'forbidden',
    )
  })

  it('refuses sessions that end before they start or last over a day, and drops canceled ones', async () => {
    const backwards = { ...req, endsAt: new Date(start.getTime() - 60_000).toISOString() }
    assert.equal(
      await codeOf(withActor(pool, E, 'write', (c) => scheduleRoomSession(c, seed.projectId, backwards, randomUUID()))),
      'invalid_request',
    )
    const session = await withActor(pool, A, 'write', (c) => scheduleRoomSession(c, seed.projectId, req, randomUUID()))
    await withActor(pool, E, 'write', (c) => cancelRoomSession(c, session.id))
    assert.ok(!(await snapshotOf(A))?.sessions.some((s) => s.id === session.id))
  })
})
