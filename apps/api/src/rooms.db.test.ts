// S1-04 room routes through the real app (level: sql-run): room-scoped LiveKit tokens and the input floor.
// The token is checked by verifying its signature with the LiveKit secret, as a LiveKit server would.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { jwtVerify, SignJWT } from 'jose'
import type pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { parseExchangeReceipt, parseRoomToken, parseSnapshot } from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const LIVEKIT = { url: 'ws://127.0.0.1:7880', apiKey: 'devkey', apiSecret: 'livekit-test-secret-at-least-32-bytes!!' }
const A = randomUUID() // admin
const B = randomUUID() // editor
const V = randomUUID() // viewer
const C = randomUUID() // outsider

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let noVoice: FastifyInstance
let seed: SeededProject
let roomId: string

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated', email: `${sub.slice(0, 8)}@sophia.test` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

async function post(
  target: FastifyInstance,
  actor: string,
  url: string,
  body: unknown,
  key: string | null = randomUUID(),
) {
  const res = await target.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${await token(actor)}`, ...(key ? { 'idempotency-key': key } : {}) },
    payload: body as Record<string, unknown>,
  })
  return { status: res.statusCode, json: res.json<unknown>() }
}

const roomToken = (actor: string, room = roomId, projectId = seed.projectId, audience = 1) =>
  post(app, actor, `/api/v1/projects/${projectId}/room-token`, { roomId: room, expectedAudienceRevision: audience })

/** What a LiveKit server reads from the token: the signature, the identity and the single-room grant. */
async function grantOf(jwt: string) {
  const { payload } = await jwtVerify(jwt, new TextEncoder().encode(LIVEKIT.apiSecret), { issuer: LIVEKIT.apiKey })
  return payload as { sub?: string; name?: string; exp?: number; nbf?: number; video?: Record<string, unknown> }
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  seed = await seedProject(db.ownerUrl, { admin: A, editors: [B], viewers: [V] })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor, livekit: LIVEKIT })
  noVoice = buildApp({ pool, verifyActor })
  const snap = await app.inject({
    method: 'GET',
    url: `/api/v1/projects/${seed.projectId}/snapshot`,
    headers: { authorization: `Bearer ${await token(A)}` },
  })
  roomId = parseSnapshot(snap.json<unknown>()).room.id
})

after(async () => {
  await app?.close()
  await noVoice?.close()
  await pool?.end()
  await db?.drop()
})

describe('room tokens', () => {
  it('grant exactly this project room, as the verified actor, for ten minutes', async () => {
    const res = await roomToken(B)
    assert.equal(res.status, 200)
    const issued = parseRoomToken(res.json)
    const grant = await grantOf(issued.token)
    assert.deepEqual(
      { room: issued.roomId, url: issued.serverUrl, sub: grant.sub, name: grant.name },
      { room: roomId, url: LIVEKIT.url, sub: B, name: `${B.slice(0, 8)}@sophia.test` },
    )
    assert.deepEqual(grant.video, {
      roomJoin: true,
      room: roomId,
      canSubscribe: true,
      canPublish: true,
      canPublishSources: ['microphone', 'camera', 'screen_share', 'screen_share_audio'],
      canPublishData: false,
      canUpdateOwnMetadata: false,
    })
    assert.equal((grant.exp ?? 0) - (grant.nbf ?? 0), 600)
  })

  // Changed by amendment A06 (S1-05A, for Luis's review): viewers speak in the human room too.
  it('let viewers publish in the human room (amendment A06)', async () => {
    const grant = await grantOf(parseRoomToken((await roomToken(V)).json).token)
    assert.deepEqual(
      [grant.video?.canPublish, grant.video?.canPublishSources],
      [true, ['microphone', 'camera', 'screen_share', 'screen_share_audio']],
    )
  })

  it('refuse outsiders, another project’s room, a changed audience and a missing key', async () => {
    const other = await seedProject(db.ownerUrl, { admin: A })
    const otherSnap = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${other.projectId}/snapshot`,
      headers: { authorization: `Bearer ${await token(A)}` },
    })
    const otherRoom = parseSnapshot(otherSnap.json<unknown>()).room.id
    assert.equal((await roomToken(C)).status, 403)
    // A is a member of both projects, but one project's id cannot carry the other project's room.
    assert.equal((await roomToken(A, otherRoom)).status, 403)
    assert.equal((await roomToken(A, roomId, seed.projectId, 2)).status, 409)
    const keyless = await post(
      app,
      A,
      `/api/v1/projects/${seed.projectId}/room-token`,
      { roomId, expectedAudienceRevision: 1 },
      null,
    )
    assert.equal(keyless.status, 422)
  })

  it('say plainly when no LiveKit server is configured', async () => {
    const res = await post(noVoice, A, `/api/v1/projects/${seed.projectId}/room-token`, {
      roomId,
      expectedAudienceRevision: 1,
    })
    assert.deepEqual([res.status, (res.json as { code: string }).code], [503, 'unavailable'])
  })
})

describe('input floor over HTTP', () => {
  // Changed by amendment A06: a viewer may hold the floor, but cannot take it from someone else.
  it('passes the floor with a contract receipt; a viewer cannot take it from its holder (amendment A06)', async () => {
    const res = await post(app, A, `/api/v1/rooms/${roomId}/input-floor`, { nextActorId: B, expectedRoomRevision: 1 })
    assert.equal(res.status, 200)
    assert.deepEqual(
      { ...parseExchangeReceipt(res.json), exchangeId: 'id' },
      { exchangeId: 'id', roomId, revision: 2, inputActorId: B },
    )
    const viewer = await post(app, V, `/api/v1/rooms/${roomId}/input-floor`, {
      nextActorId: V,
      expectedRoomRevision: 2,
    })
    assert.equal(viewer.status, 409)
  })
})
