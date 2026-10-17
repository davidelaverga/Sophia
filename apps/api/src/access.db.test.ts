// S1-04A room access through the real app (level: sql-run): invitations, the public preview, anonymous
// guests in the lobby, member acceptance bound to an email, emails written to a folder, and sessions.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { jwtVerify, SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  parseInvitation,
  parseInvitationPreview,
  parseActivityPage,
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

  it('name a guest in the activity: their knock under the name they gave, and the decision on them (activity-followups.md)', async () => {
    const link = { token: tokenOf(parseInvitation((await invite(B, { kind: 'guest' })).json).url) }
    const G = randomUUID()
    const knocked = parseLobbyEntry(
      (await call('/api/v1/join/knock', { bearer: await guestToken(G), body: { ...link, displayName: 'Rosa' } })).json,
    )
    await call(`/api/v1/lobby/${knocked.id}/decision`, { bearer: await token(B), body: { decision: 'admit' } })
    const read = parseActivityPage(
      (await call(`/api/v1/projects/${seed.projectId}/activity`, { method: 'GET', bearer: await token(A) })).json,
    )
    const lobby = read.entries.filter((e) => e.type === 'room.lobby_changed').slice(0, 2)
    assert.deepEqual(
      lobby.map((e) => [e.actor.id, e.actor.name, e.target?.id ?? null, e.target?.name ?? null]),
      [
        [B, lobby[0]?.actor.name ?? null, G, 'Rosa'],
        [G, 'Rosa', null, null],
      ],
    )
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

  it('a guest declined just after the quiesce check, with no exchange to pause, still gets no token', async () => {
    const inv = parseInvitation((await invite(B, { kind: 'guest' })).json)
    const guest = await guestToken(randomUUID())
    const knocked = parseLobbyEntry(
      (await call('/api/v1/join/knock', { bearer: guest, body: { token: tokenOf(inv.url), displayName: 'Eva' } })).json,
    )
    await call(`/api/v1/lobby/${knocked.id}/decision`, { bearer: await token(B), body: { decision: 'admit' } })
    // The editor's decline lands inside the quiesce's own transaction, after its admission check: it is committed
    // before the token would be minted, and nothing but a last check can see it.
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    try {
      await owner.query(`CREATE FUNCTION sophia.test_decline_now() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.status := 'denied'; RETURN NEW; END $$`)
      await owner.query(
        `CREATE TRIGGER test_decline_now BEFORE UPDATE OF guest_token_at ON sophia.room_lobby FOR EACH ROW
         WHEN (NEW.id = '${knocked.id}' AND OLD.guest_token_at IS NULL) EXECUTE FUNCTION sophia.test_decline_now()`,
      )
      const res = await call(`/api/v1/lobby/${knocked.id}/room-token`, { bearer: guest })
      assert.equal(res.status, 409, 'declined before the mint: no token')
    } finally {
      await owner.query(`DROP TRIGGER IF EXISTS test_decline_now ON sophia.room_lobby`)
      await owner.query(`DROP FUNCTION IF EXISTS sophia.test_decline_now()`)
      await owner.end()
    }
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

describe('people to invite from other projects (A26)', () => {
  it('offers an admin the members of their other projects known by address; not members, not themselves, not invited', async () => {
    const [admin, editor, other, quiet] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const elsewhere = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [other, quiet] })
    const here = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    // Known by address once they opened a project (the room keeps the name their token carries).
    for (const sub of [admin, editor, other])
      assert.equal(
        (await call(`/api/v1/projects/${elsewhere.projectId}/membership`, { method: 'GET', bearer: await token(sub) }))
          .status,
        200,
      )
    const offered = async (sub: string) =>
      call(`/api/v1/projects/${here.projectId}/invitable`, { method: 'GET', bearer: await token(sub) })
    const first = await offered(admin)
    assert.equal(first.status, 200)
    assert.deepEqual(first.json, { people: [{ actorId: other, email: `${other.slice(0, 8)}@sophia.test` }] })
    assert.equal((await offered(editor)).status, 403)
    const bearer = await token(admin)
    const sent = await call(`/api/v1/projects/${here.projectId}/invitations`, {
      bearer,
      key: true,
      body: { kind: 'member', role: 'viewer', email: `${other.slice(0, 8)}@sophia.test` },
    })
    assert.equal(sent.status, 200)
    assert.deepEqual((await offered(admin)).json, { people: [] })
  })
})

describe('a project’s members (A25)', () => {
  it('lists the active members with their roles, named once they opened the project; an outsider is refused', async () => {
    const [admin, editor, viewer] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const opens = async (sub: string) =>
      call(`/api/v1/projects/${projectId}/membership`, { method: 'GET', bearer: await token(sub) })
    assert.equal((await opens(admin)).status, 200)
    assert.equal((await opens(editor)).status, 200)
    const listed = await call(`/api/v1/projects/${projectId}/members`, { method: 'GET', bearer: await token(viewer) })
    assert.equal(listed.status, 200)
    assert.deepEqual(listed.json, {
      members: [
        { actorId: admin, role: 'admin', name: `${admin.slice(0, 8)}@sophia.test` },
        { actorId: editor, role: 'editor', name: `${editor.slice(0, 8)}@sophia.test` },
        { actorId: viewer, role: 'viewer', name: null },
      ],
    })
    const outsider = await call(`/api/v1/projects/${projectId}/members`, {
      method: 'GET',
      bearer: await token(randomUUID()),
    })
    assert.equal(outsider.status, 403)
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

  it('bring back someone who left (A22): their membership is active again, with the new role', async () => {
    const first = parseInvitation((await invite(A, { kind: 'member', role: 'editor', email: 'lena@example.com' })).json)
    const L = randomUUID()
    const bearer = await token(L, { email: 'lena@example.com' })
    assert.equal((await call('/api/v1/join/accept', { bearer, body: { token: tokenOf(first.url) } })).status, 200)
    const left = await call(`/api/v1/projects/${seed.projectId}/leave`, { bearer, body: {}, key: true })
    assert.equal(left.status, 200)
    const gone = await call(`/api/v1/projects/${seed.projectId}/membership`, { method: 'GET', bearer })
    assert.equal(gone.status, 403)
    const second = parseInvitation(
      (await invite(A, { kind: 'member', role: 'viewer', email: 'lena@example.com' })).json,
    )
    assert.equal((await call('/api/v1/join/accept', { bearer, body: { token: tokenOf(second.url) } })).status, 200)
    // Back in, the removal their leaving left is cancelled: the call isn't taken from them again (Codex P1 on #349).
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    try {
      const open = await owner.query(
        `SELECT 1 FROM sophia.room_removals WHERE project_id = $1 AND identity = $2 AND state <> 'cancelled'`,
        [seed.projectId, L],
      )
      assert.equal(open.rowCount, 0)
      // The join event carries the membership's revision now, after the leave's (Codex P2 on #349).
      const { rows } = await owner.query<{ type: string; entity_revision: string }>(
        `SELECT type, entity_revision FROM sophia.project_events
          WHERE project_id = $1 AND entity_id = $2 ORDER BY sequence`,
        [seed.projectId, L],
      )
      assert.deepEqual(
        rows.map((r) => [r.type, Number(r.entity_revision)]),
        [
          ['project.member_joined', 1],
          ['project.member_left', 2],
          ['project.member_joined', 3],
        ],
      )
    } finally {
      await owner.end()
    }
    const me = parseMembership(
      (await call(`/api/v1/projects/${seed.projectId}/membership`, { method: 'GET', bearer })).json,
    )
    assert.deepEqual(me, { actorId: L, role: 'viewer' })
  })

  it('bring back someone an admin removed (A29): the removal is cancelled, so the call isn’t taken from them again', async () => {
    const first = parseInvitation((await invite(A, { kind: 'member', role: 'editor', email: 'rafa@example.com' })).json)
    const R = randomUUID()
    const bearer = await token(R, { email: 'rafa@example.com' })
    assert.equal((await call('/api/v1/join/accept', { bearer, body: { token: tokenOf(first.url) } })).status, 200)
    const removed = await call(`/api/v1/projects/${seed.projectId}/members/${R}/removal`, {
      bearer: await token(A),
      body: {},
      key: true,
    })
    assert.equal(removed.status, 200)
    const second = parseInvitation(
      (await invite(A, { kind: 'member', role: 'viewer', email: 'rafa@example.com' })).json,
    )
    assert.equal((await call('/api/v1/join/accept', { bearer, body: { token: tokenOf(second.url) } })).status, 200)
    const owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    try {
      const open = await owner.query(
        `SELECT 1 FROM sophia.room_removals WHERE project_id = $1 AND identity = $2 AND state <> 'cancelled'`,
        [seed.projectId, R],
      )
      assert.equal(open.rowCount, 0)
    } finally {
      await owner.end()
    }
  })

  it('an invitation issued before a removal no longer brings them back; one issued after does (Codex P1 on #356)', async () => {
    const older = parseInvitation(
      (await invite(A, { kind: 'member', role: 'editor', email: 'sara@example.com', maxUses: 3 })).json,
    )
    const S = randomUUID()
    const bearer = await token(S, { email: 'sara@example.com' })
    assert.equal((await call('/api/v1/join/accept', { bearer, body: { token: tokenOf(older.url) } })).status, 200)
    const removed = await call(`/api/v1/projects/${seed.projectId}/members/${S}/removal`, {
      bearer: await token(A),
      body: {},
      key: true,
    })
    assert.equal(removed.status, 200)
    // The same link, with uses left: closed for them now, and not waiting in the app either.
    const again = await call('/api/v1/join/accept', { bearer, body: { token: tokenOf(older.url) } })
    assert.equal(again.status, 409)
    const waiting = await call('/api/v1/me/invitations', { method: 'GET', bearer })
    assert.deepEqual((waiting.json as { invitations: unknown[] }).invitations, [])
    // An admin's new invitation, after the removal, brings them back.
    const newer = parseInvitation((await invite(A, { kind: 'member', role: 'viewer', email: 'sara@example.com' })).json)
    assert.equal((await call('/api/v1/join/accept', { bearer, body: { token: tokenOf(newer.url) } })).status, 200)
  })

  it('are admin-only', async () => {
    assert.equal((await invite(B, { kind: 'member', role: 'viewer', email: 'beto@example.com' })).status, 403)
  })
})

describe('member invitations waiting in the app (A16)', () => {
  // The person an invitation is for sees it where they are, signed in with that address, and accepts it there: the
  // same acceptance as the link's, so every check holds (the address, closed, used up, already a member).
  const inbox = async (sub: string, email: string) => {
    const res = await call('/api/v1/me/invitations', { method: 'GET', bearer: await token(sub, { email }) })
    return { status: res.status, list: (res.json as { invitations?: Record<string, unknown>[] } | null)?.invitations }
  }
  const accept = async (sub: string, email: string, id: string) =>
    call(`/api/v1/invitations/${id}/accept`, { bearer: await token(sub, { email }) })

  it('lists what waits for the signed-in address, with no link in it, and accepts it there', async () => {
    const created = parseInvitation(
      (await invite(A, { kind: 'member', role: 'viewer', email: 'nina@example.com' })).json,
    )
    const N = randomUUID()
    const mine = await inbox(N, 'Nina@Example.com')
    assert.equal(mine.status, 200)
    assert.equal(mine.list?.length, 1)
    const [waiting] = mine.list ?? []
    assert.deepEqual(
      { ...waiting, expiresAt: Date.parse(String(waiting?.expiresAt)) },
      {
        id: created.id,
        projectId: seed.projectId,
        projectTitle: 'Founders',
        inviter: `${A.slice(0, 8)}@sophia.test`,
        role: 'viewer',
        expiresAt: Date.parse(created.expiresAt),
      },
    )
    assert.deepEqual((await inbox(randomUUID(), 'someone.else@example.com')).list, [])
    const stranger = await accept(randomUUID(), 'someone.else@example.com', created.id)
    assert.deepEqual([stranger.status, (stranger.json as { code?: string }).code], [422, 'not_found'])
    const joined = await accept(N, 'nina@example.com', created.id)
    assert.deepEqual([joined.status, joined.json], [200, { projectId: seed.projectId }])
    const me = parseMembership(
      (await call(`/api/v1/projects/${seed.projectId}/membership`, { method: 'GET', bearer: await token(N) })).json,
    )
    assert.deepEqual(me, { actorId: N, role: 'viewer' })
    assert.deepEqual((await inbox(N, 'nina@example.com')).list, [])
    // A retry after a lost reply is answered as the link's is: the same project, not «not found» (Codex P2 on #332).
    const again = await accept(N, 'nina@example.com', created.id)
    assert.deepEqual([again.status, again.json], [200, { projectId: seed.projectId }])
  })

  it('shows no closed invitation, and a guest has none', async () => {
    const created = parseInvitation(
      (await invite(A, { kind: 'member', role: 'editor', email: 'rita@example.com' })).json,
    )
    await call(`/api/v1/invitations/${created.id}/revoke`, { bearer: await token(A), body: {} })
    const R = randomUUID()
    assert.deepEqual((await inbox(R, 'rita@example.com')).list, [])
    // Closed, it is said closed, as the link says it (409), not unknown.
    assert.equal((await accept(R, 'rita@example.com', created.id)).status, 409)
    const guest = await call('/api/v1/me/invitations', { method: 'GET', bearer: await guestToken(randomUUID()) })
    assert.equal(guest.status, 403)
  })
})

describe('the invitations list', () => {
  // Who manages invitations reads them; anyone else is refused as every project read refuses them, not answered an
  // empty list (e2e-real S3): a viewer, an outsider, and a project that does not exist.
  const list = async (actor: string, projectId = seed.projectId) =>
    (await call(`/api/v1/projects/${projectId}/invitations`, { method: 'GET', bearer: await token(actor) })).status
  it('is read by its admin and editors, and refused to a viewer, an outsider and a project that does not exist', async () => {
    assert.deepEqual(
      [await list(A), await list(B), await list(V), await list(randomUUID()), await list(A, randomUUID())],
      [200, 200, 403, 403, 403],
    )
  })
})

describe('who wrote in the room, as the room shows it (e2e chat «A member»)', () => {
  // A message keeps its author's name from the token that wrote it, so a chat read outside a call names its author;
  // the client cannot name itself (the request has no such field).
  const said = (actor: string, body: Record<string, unknown>) =>
    token(actor).then((bearer) =>
      call(`/api/v1/projects/${seed.projectId}/contributions`, {
        bearer,
        key: true,
        body: { source: null, threadId: null, artifactVersionId: null, intent: 'discuss', ...body },
      }),
    )
  it('keeps the author’s name with the message, and refuses a name sent by the client', async () => {
    assert.equal((await said(B, { text: 'Can we start with the checklist?' })).status, 202)
    const snap = await call(`/api/v1/projects/${seed.projectId}/snapshot`, { method: 'GET', bearer: await token(A) })
    const entries = (
      snap.json as { discussion: { actorId: string; text: string | null; authorName?: string | null }[] }
    ).discussion
    const mine = entries.find((e) => e.text === 'Can we start with the checklist?')
    assert.deepEqual([mine?.actorId, mine?.authorName], [B, `${B.slice(0, 8)}@sophia.test`])
    assert.equal((await said(B, { text: 'Spoofed', authorName: 'Luis' })).status, 422)
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
