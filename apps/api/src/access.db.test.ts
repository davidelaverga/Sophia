// S1-04A room access through the real app (level: sql-run): invitations, the public preview, anonymous
// guests in the lobby, member acceptance bound to an email, emails written to a folder, and sessions.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { jwtVerify, SignJWT } from 'jose'
import type pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  parseInvitation,
  parseInvitationPreview,
  parseLobbyEntry,
  parseMembership,
  parseRoomSession,
  parseRoomToken,
  parseSnapshot,
} from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { folderMailer } from './mail.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const LIVEKIT = { url: 'ws://127.0.0.1:7880', apiKey: 'devkey', apiSecret: 'livekit-test-secret-at-least-32-bytes!!' }
const INVITES = { secret: 'invite-test-secret-at-least-32-characters!!', studioUrl: 'https://studio.test' }
const A = randomUUID() // admin
const B = randomUUID() // editor
const V = randomUUID() // viewer

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let closed: FastifyInstance
let seed: SeededProject
let mailDir: string

const token = (sub: string, claims: Record<string, unknown> = { email: `${sub.slice(0, 8)}@sophia.test` }) =>
  new SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
const guestToken = (sub: string) => token(sub, { is_anonymous: true })

interface Call {
  method?: 'GET' | 'POST'
  bearer?: string | null
  body?: unknown
  key?: boolean
  target?: FastifyInstance
}

async function call(url: string, { method = 'POST', bearer = null, body, key = false, target = app }: Call = {}) {
  const res = await target.inject({
    method,
    url,
    headers: {
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(key ? { 'idempotency-key': randomUUID() } : {}),
    },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  })
  return { status: res.statusCode, json: res.body ? res.json<unknown>() : null }
}

const tokenOf = (url: string) => url.split('#')[1] ?? ''

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  seed = await seedProject(db.ownerUrl, { title: 'Founders', admin: A, editors: [B], viewers: [V] })
  mailDir = mkdtempSync(join(tmpdir(), 'sophia-mail-'))
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor, livekit: LIVEKIT, invites: INVITES, mailer: folderMailer(mailDir) })
  closed = buildApp({ pool, verifyActor })
})

after(async () => {
  await app?.close()
  await closed?.close()
  await pool?.end()
  await db?.drop()
  rmSync(mailDir, { recursive: true, force: true })
})

const invite = async (actor: string, body: Record<string, unknown>) =>
  call(`/api/v1/projects/${seed.projectId}/invitations`, { bearer: await token(actor), body, key: true })

describe('guest invitations', () => {
  it('say plainly when this server has no link secret', async () => {
    const res = await call(`/api/v1/projects/${seed.projectId}/invitations`, {
      target: closed,
      bearer: await token(A),
      body: { kind: 'guest' },
      key: true,
    })
    assert.equal(res.status, 503)
  })

  it('let an anonymous guest knock, wait, and join only after an editor admits them', async () => {
    const created = await invite(B, { kind: 'guest' })
    assert.equal(created.status, 200)
    const inv = parseInvitation(created.json)
    const link = { token: tokenOf(inv.url) }
    const preview = parseInvitationPreview((await call('/api/v1/join/preview', { body: link })).json)
    assert.deepEqual([preview.projectTitle, preview.kind, preview.state], ['Founders', 'guest', 'open'])

    const G = randomUUID()
    const guest = await guestToken(G)
    const knocked = parseLobbyEntry(
      (await call('/api/v1/join/knock', { bearer: guest, body: { ...link, displayName: 'Ana' } })).json,
    )
    assert.equal(knocked.status, 'waiting')
    assert.equal((await call(`/api/v1/lobby/${knocked.id}/room-token`, { bearer: guest })).status, 409)
    // A guest reaches nothing else: not the project, not a new project.
    assert.equal(
      (await call(`/api/v1/projects/${seed.projectId}/snapshot`, { method: 'GET', bearer: guest })).status,
      403,
    )
    assert.equal((await call('/api/v1/projects', { bearer: guest, body: { title: 'Mine' }, key: true })).status, 403)

    const snap = parseSnapshot(
      (await call(`/api/v1/projects/${seed.projectId}/snapshot`, { method: 'GET', bearer: await token(A) })).json,
    )
    assert.ok(snap.lobby.some((e) => e.id === knocked.id && e.displayName === 'Ana'))
    const admitted = await call(`/api/v1/lobby/${knocked.id}/decision`, {
      bearer: await token(B),
      body: { decision: 'admit' },
    })
    assert.equal(parseLobbyEntry(admitted.json).status, 'admitted')

    const issued = parseRoomToken((await call(`/api/v1/lobby/${knocked.id}/room-token`, { bearer: guest })).json)
    const { payload } = await jwtVerify(issued.token, new TextEncoder().encode(LIVEKIT.apiSecret), {
      issuer: LIVEKIT.apiKey,
    })
    assert.deepEqual(
      [payload.sub, payload.name, payload.metadata, issued.roomId],
      [G, 'Ana', '{"guest":true}', snap.room.id],
    )

    await call(`/api/v1/lobby/${knocked.id}/decision`, { bearer: await token(A), body: { decision: 'deny' } })
    assert.equal((await call(`/api/v1/lobby/${knocked.id}/room-token`, { bearer: guest })).status, 409)
    // Declined a moment ago: asking again waits the minute (A03).
    const tooSoon = await call('/api/v1/join/knock', { bearer: guest, body: { ...link, displayName: 'Ana' } })
    assert.equal(tooSoon.status, 409)
  })

  it('blocks a guest for good until someone unblocks them (A03)', async () => {
    const inv = parseInvitation((await invite(B, { kind: 'guest' })).json)
    const link = { token: tokenOf(inv.url) }
    const guest = await guestToken(randomUUID())
    const knock = async () =>
      parseLobbyEntry(
        (await call('/api/v1/join/knock', { bearer: guest, body: { ...link, displayName: 'Beto' } })).json,
      )
    const entry = await knock()
    const decide = async (decision: 'block' | 'unblock' | 'admit') =>
      call(`/api/v1/lobby/${entry.id}/decision`, { bearer: await token(B), body: { decision } })
    const blocked = parseLobbyEntry((await decide('block')).json)
    assert.deepEqual([blocked.status, blocked.knocks, typeof blocked.decidedAt], ['blocked', 1, 'string'])
    assert.equal((await knock()).status, 'blocked')
    assert.equal((await decide('admit')).status, 409)
    assert.equal(parseLobbyEntry((await decide('unblock')).json).status, 'left')
    assert.deepEqual([(await knock()).status, (await knock()).knocks], ['waiting', 2])
  })

  it('reissue retires the old link and revoke closes the new one', async () => {
    const inv = parseInvitation((await invite(A, { kind: 'guest' })).json)
    const reissued = parseInvitation(
      (await call(`/api/v1/invitations/${inv.id}/reissue`, { bearer: await token(A) })).json,
    )
    assert.notEqual(reissued.url, inv.url)
    assert.equal((await call('/api/v1/join/preview', { body: { token: tokenOf(inv.url) } })).status, 422)
    await call(`/api/v1/invitations/${inv.id}/revoke`, { bearer: await token(B) })
    const preview = parseInvitationPreview(
      (await call('/api/v1/join/preview', { body: { token: tokenOf(reissued.url) } })).json,
    )
    assert.equal(preview.state, 'revoked')
  })
})

describe('member invitations', () => {
  it('email the invited person, and only they can accept, signed in with that address', async () => {
    const created = await invite(A, { kind: 'member', role: 'editor', email: 'ana@example.com' })
    const inv = parseInvitation(created.json)
    assert.equal(inv.emailStatus, 'sent')
    const files = readdirSync(mailDir)
    const text = files.find((f) => f.endsWith('.txt') && f.includes(inv.id))
    assert.ok(text, `no email written for ${inv.id}`)
    const written = readFileSync(join(mailDir, text), 'utf8')
    assert.ok(written.startsWith('To: ana@example.com\nSubject: '))
    assert.ok(written.includes(`Accept the invitation: ${inv.url}`))

    const link = { token: tokenOf(inv.url) }
    assert.equal(
      (await call('/api/v1/join/accept', { bearer: await guestToken(randomUUID()), body: link })).status,
      403,
    )
    const M = randomUUID()
    assert.equal((await call('/api/v1/join/accept', { bearer: await token(randomUUID()), body: link })).status, 403)
    const accepted = await call('/api/v1/join/accept', {
      bearer: await token(M, { email: 'Ana@Example.com' }),
      body: link,
    })
    assert.deepEqual(accepted.json, { projectId: seed.projectId })
    const me = parseMembership(
      (await call(`/api/v1/projects/${seed.projectId}/membership`, { method: 'GET', bearer: await token(M) })).json,
    )
    assert.deepEqual(me, { actorId: M, role: 'editor' })
  })

  it('are admin-only', async () => {
    assert.equal((await invite(B, { kind: 'member', role: 'viewer', email: 'beto@example.com' })).status, 403)
  })
})

describe('sessions and membership', () => {
  it('put a start on the room calendar, in a real time zone', async () => {
    const startsAt = new Date(Date.now() + 86_400_000).toISOString()
    const endsAt = new Date(Date.now() + 90_000_000).toISOString()
    const url = `/api/v1/projects/${seed.projectId}/sessions`
    const body = { title: 'Weekly', startsAt, endsAt, timeZone: 'America/Bogota' }
    const session = parseRoomSession((await call(url, { bearer: await token(B), body, key: true })).json)
    assert.equal(session.timeZone, 'America/Bogota')
    const bad = await call(url, { bearer: await token(B), body: { ...body, timeZone: 'Mars/Olympus' }, key: true })
    assert.equal(bad.status, 422)
    const snap = parseSnapshot(
      (await call(`/api/v1/projects/${seed.projectId}/snapshot`, { method: 'GET', bearer: await token(V) })).json,
    )
    assert.ok(snap.sessions.some((s) => s.id === session.id))
    assert.equal((await call(`/api/v1/sessions/${session.id}/cancel`, { bearer: await token(V) })).status, 403)
  })

  it('tells each person their own role, and outsiders nothing', async () => {
    const mine = parseMembership(
      (await call(`/api/v1/projects/${seed.projectId}/membership`, { method: 'GET', bearer: await token(V) })).json,
    )
    assert.deepEqual(mine, { actorId: V, role: 'viewer' })
    const outsider = await call(`/api/v1/projects/${seed.projectId}/membership`, {
      method: 'GET',
      bearer: await token(randomUUID()),
    })
    assert.equal(outsider.status, 403)
  })
})
