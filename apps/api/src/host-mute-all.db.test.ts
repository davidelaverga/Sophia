// «Mute everyone» against a room server whose answers the test controls (Codex P2s on #385): over HTTP, through the
// route, into the real database. A partial batch records each member it muted as that member muted, never «muted
// everyone», and still fails; a first failure or nothing to mute records nothing; a guest it muted is not written as
// anyone; a complete batch records the whole act. The room server's real behaviour is host-controls.livekit.test.ts's.
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const ISSUER = 'https://auth.example.test/auth/v1'
const SECRET = 'host-mute-all-test-secret-at-least-32-bytes'
const A = randomUUID() // admin, the host
const B = randomUUID() // editor
const C = randomUUID() // editor
const G = `guest-${randomUUID()}` // a guest in the call

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let base: string
let roomServer: Server

/** What the room server holds and answers: who is in, who left after the list, and whose mute fails. */
interface Room {
  people: { identity: string; standing: object; muted: boolean }[]
  left: Set<string>
  failMute: Set<string>
  muteCalls: string[]
}
let room: Room

const participant = (p: Room['people'][number]) => ({
  identity: p.identity,
  name: p.identity,
  metadata: JSON.stringify(p.standing),
  tracks: [{ sid: `TR_${p.identity}`, type: 'AUDIO', source: 'MICROPHONE', muted: p.muted }],
})

function answer(method: string, body: Record<string, unknown>): [number, unknown] {
  if (method === 'ListParticipants') return [200, { participants: room.people.map(participant) }]
  const who = room.people.find((p) => p.identity === body.identity)
  if (!who || room.left.has(who.identity)) return [404, { code: 'not_found', msg: 'participant not found' }]
  if (method === 'GetParticipant') return [200, participant(who)]
  if (method === 'MutePublishedTrack') {
    room.muteCalls.push(who.identity)
    if (room.failMute.has(who.identity)) return [400, { code: 'invalid_argument', msg: 'the room server refused' }]
    who.muted = true
    return [200, { track: participant(who).tracks[0] }]
  }
  return [404, { code: 'bad_route', msg: method }]
}

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated', email: `${sub.slice(0, 6)}@example.test` })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

async function muteAll(projectId: string): Promise<number> {
  const res = await fetch(`${base}/api/v1/projects/${projectId}/room/mute-all`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token(A)}` },
  })
  await res.arrayBuffer()
  return res.status
}

async function events(projectId: string): Promise<string[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    const { rows } = await c.query<{ e: string }>(
      `SELECT type || ' ' || entity_id AS e FROM sophia.project_events
        WHERE project_id = $1 AND type LIKE 'room.host_%' ORDER BY sequence`,
      [projectId],
    )
    return rows.map((r) => r.e)
  } finally {
    await c.end()
  }
}

before(async () => {
  roomServer = createServer((req, res) => {
    const method = req.url?.split('/').at(-1) ?? ''
    let raw = ''
    req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')))
    req.on('end', () => {
      const [status, body] = answer(method, raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    })
  })
  await new Promise<void>((resolve) => roomServer.listen(0, '127.0.0.1', resolve))
  const port = (roomServer.address() as AddressInfo).port
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const livekit = {
    url: `ws://127.0.0.1:${String(port)}`,
    apiKey: 'devkey',
    apiSecret: 'a-secret-of-thirty-two-bytes-or-more!',
  }
  app = buildApp({ pool, verifyActor, livekit })
  await app.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
})
after(async () => {
  await app.close()
  await pool.end()
  await db.drop()
  await new Promise<void>((resolve) => roomServer.close(() => resolve()))
})
beforeEach(() => {
  room = { people: [], left: new Set(), failMute: new Set(), muteCalls: [] }
})

const inCall = (...people: [string, object][]) =>
  people.map(([identity, standing]) => ({ identity, standing, muted: false }))

describe('mute everyone, against a controlled room server (Codex P2s on #385)', () => {
  it('B muted, then C fails: only B is recorded, as muted; never everyone; the request fails', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B, C] })
    room.people = inCall([A, { role: 'admin' }], [B, { role: 'editor' }], [C, { role: 'editor' }])
    room.failMute.add(C)
    assert.ok((await muteAll(projectId)) >= 400)
    assert.deepEqual(room.muteCalls, [B, C], 'the host is never muted; B before C')
    assert.deepEqual(await events(projectId), [`room.host_muted ${B}`])
  })

  it('a first failure, or no one to mute, records nothing', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B, C] })
    room.people = inCall([B, { role: 'editor' }], [C, { role: 'editor' }])
    room.failMute.add(B)
    assert.ok((await muteAll(projectId)) >= 400)
    assert.deepEqual(await events(projectId), [])
    room.failMute.clear()
    room.people = room.people.map((p) => ({ ...p, muted: true }))
    assert.equal(await muteAll(projectId), 204)
    assert.deepEqual(await events(projectId), [], 'already muted: nothing happened')
  })

  it('a guest muted before a failure is not written as a member, or as everyone', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    room.people = inCall([G, { guest: true }], [B, { role: 'editor' }])
    room.failMute.add(B)
    assert.ok((await muteAll(projectId)) >= 400)
    assert.deepEqual(room.muteCalls, [G, B])
    assert.deepEqual(await events(projectId), [], 'the guest’s mute has no activity the project can name (0057)')
  })

  it('C left after the list (Codex P2 on #369): B and G are still muted, and the whole act is recorded', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B, C] })
    room.people = inCall([A, { role: 'admin' }], [C, { role: 'editor' }], [B, { role: 'editor' }], [G, { guest: true }])
    room.left.add(C)
    assert.equal(await muteAll(projectId), 204)
    assert.deepEqual(room.muteCalls, [B, G], 'C, gone, does not stop the ones after them')
    const recorded = await events(projectId)
    assert.equal(recorded.length, 1)
    assert.match(recorded[0] ?? '', /^room\.host_muted_all /)
  })

  it('a single mute of a member who left after the check did nothing: 204, nothing recorded', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B] })
    room.people = inCall([A, { role: 'admin' }], [B, { role: 'editor' }])
    room.left.add(B)
    for (const act of ['mute', 'stop-camera', 'stop-screen']) {
      const res = await fetch(`${base}/api/v1/projects/${projectId}/room/people/${B}/${act}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await token(A)}` },
      })
      await res.arrayBuffer()
      assert.equal(res.status, 204, act)
    }
    assert.deepEqual(room.muteCalls, [])
    assert.deepEqual(await events(projectId), [])
  })

  it('everyone muted: the whole act, once', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [B, C] })
    room.people = inCall([A, { role: 'admin' }], [B, { role: 'editor' }], [G, { guest: true }], [C, { role: 'editor' }])
    assert.equal(await muteAll(projectId), 204)
    const recorded = await events(projectId)
    assert.equal(recorded.length, 1)
    assert.match(recorded[0] ?? '', /^room\.host_muted_all /)
  })
})
