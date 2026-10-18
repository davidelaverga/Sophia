// A person names themself, and nobody is named by their address (FND-C1-PROFILE, #365 sections 6 and 8, A32, 0062),
// through the real app on PostgreSQL (level: sql-run). Synthetic HS256 tokens stand in for Supabase Auth: each carries
// an address, and some a provider's name in user_metadata, as a Google account's does.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  parseActivityPage,
  parseInvitation,
  parseInvitationPreview,
  parseMissionContext,
  parseProfile,
  parseProjectMembers,
  parseSnapshot,
} from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const INVITES = { secret: 'invite-test-secret-at-least-32-characters!!', studioUrl: 'https://studio.test' }

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance

const address = (sub: string) => `${sub.slice(0, 8)}@sophia.test`

/** A member's token: their address, and the provider's name when `name` is given. */
const token = (sub: string, name?: string, extra: Record<string, unknown> = {}) =>
  new SignJWT({
    role: 'authenticated',
    email: address(sub),
    ...(name === undefined ? {} : { user_metadata: { full_name: name } }),
    ...extra,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

interface Call {
  method?: 'GET' | 'POST' | 'PUT'
  bearer: string
  body?: unknown
  key?: string | null
}

async function call(url: string, { method = 'GET', bearer, body, key = null }: Call) {
  const res = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${bearer}`, ...(key ? { 'idempotency-key': key } : {}) },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  })
  return { status: res.statusCode, json: res.body ? res.json<Record<string, unknown>>() : null }
}

const profile = async (sub: string, name?: string) => call('/api/v1/me/profile', { bearer: await token(sub, name) })

const rename = async (sub: string, displayName: unknown, expectedRevision: unknown, key = randomUUID()) =>
  call('/api/v1/me/profile', {
    method: 'PUT',
    bearer: await token(sub),
    key,
    body: { displayName, expectedRevision },
  })

/** A row as the database keeps it, read as the migration owner (RLS bypassed on purpose). */
async function asOwner<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor, invites: INVITES })
})

after(async () => {
  await app?.close()
  await pool?.end()
  await db?.drop()
})

describe('my profile (A32)', () => {
  it('reads none for an account that gives no name, and the provider’s name for one that does, unchosen', async () => {
    const plain = await profile(randomUUID())
    assert.equal(plain.status, 200)
    assert.deepEqual(parseProfile(plain.json), { displayName: null, chosen: false, revision: 0 })
    const google = await profile(randomUUID(), '  Ana López ')
    assert.deepEqual(parseProfile(google.json), { displayName: 'Ana López', chosen: false, revision: 0 })
    // An address is never a name, even when the provider gives one as the name.
    const sub = randomUUID()
    assert.deepEqual(parseProfile((await profile(sub, address(sub))).json).displayName, null)
  })

  it('sets the caller’s own name, trimmed, compare-and-set on its revision and idempotent per key', async () => {
    const me = randomUUID()
    const key = randomUUID()
    const set = await rename(me, '  Bea  ', 0, key)
    assert.equal(set.status, 200)
    assert.deepEqual(parseProfile(set.json), { displayName: 'Bea', chosen: true, revision: 1 })
    // The same edit again under its key is the same answer, not a second edit.
    assert.deepEqual((await rename(me, '  Bea  ', 0, key)).json, set.json)
    assert.deepEqual(parseProfile((await profile(me)).json), { displayName: 'Bea', chosen: true, revision: 1 })
    // The key with another edit is a conflict; an edit from a stale revision is refused, and changes nothing.
    const reused = await rename(me, 'Beatriz', 0, key)
    assert.deepEqual([reused.status, reused.json?.code], [409, 'idempotency_conflict'])
    const stale = await rename(me, 'Beatriz', 0)
    assert.deepEqual([stale.status, stale.json?.code], [409, 'stale_revision'])
    const next = parseProfile((await rename(me, 'Beatriz', 1)).json)
    assert.deepEqual(next, { displayName: 'Beatriz', chosen: true, revision: 2 })
  })

  it('refuses a blank name, an address, a control or invisible character, and more than 60 characters', async () => {
    const me = randomUUID()
    for (const name of [
      '',
      '   ',
      'bea@sophia.test',
      'Bea @ home',
      'Be\u0007a',
      'Bea\nOrtiz',
      'Be\u202Ea',
      'B\u200Bea',
    ])
      assert.deepEqual([(await rename(me, name, 0)).status, name], [422, name])
    assert.equal((await rename(me, 'x'.repeat(61), 0)).status, 422)
    assert.equal((await rename(me, 'x'.repeat(60), 0)).status, 200)
    // Nothing that was refused was kept.
    assert.deepEqual(parseProfile((await profile(me)).json), { displayName: 'x'.repeat(60), chosen: true, revision: 1 })
  })

  it('changes only the caller’s own: a request cannot name whose profile it is, and needs a key', async () => {
    const [me, other] = [randomUUID(), randomUUID()]
    assert.equal((await rename(other, 'Other', 0)).status, 200)
    const spoofed = await call('/api/v1/me/profile', {
      method: 'PUT',
      bearer: await token(me),
      key: randomUUID(),
      body: { displayName: 'Mallory', expectedRevision: 1, actorId: other },
    })
    assert.equal(spoofed.status, 422)
    const unkeyed = await call('/api/v1/me/profile', {
      method: 'PUT',
      bearer: await token(me),
      body: { displayName: 'Mallory', expectedRevision: 0 },
    })
    assert.equal(unkeyed.status, 422)
    assert.equal((await rename(me, 'Mine', 0)).status, 200)
    assert.deepEqual(parseProfile((await profile(other)).json), { displayName: 'Other', chosen: true, revision: 1 })
    const guest = await call('/api/v1/me/profile', {
      bearer: await token(randomUUID(), undefined, { is_anonymous: true }),
    })
    assert.equal(guest.status, 403)
  })

  // Codex 4300538474: a provider claim that can't be a name is skipped for a later one that can (NAME_KEYS order).
  it('seeds a later usable provider claim past an unusable early one; none usable seeds no name', async () => {
    const seeded = async (sub: string, m: Record<string, unknown>) =>
      parseProfile(
        (await call('/api/v1/me/profile', { bearer: await token(sub, undefined, { user_metadata: m }) })).json,
      )
    const github = randomUUID()
    assert.deepEqual(await seeded(github, { full_name: address(github), user_name: 'luis' }), {
      displayName: 'luis',
      chosen: false,
      revision: 0,
    })
    const long = randomUUID()
    assert.equal((await seeded(long, { full_name: 'x'.repeat(61), name: 'Luis Prieto' })).displayName, 'Luis Prieto')
    const none = randomUUID()
    assert.equal((await seeded(none, { full_name: address(none), user_name: 'x'.repeat(61) })).displayName, null)
    // A chosen name stays chosen, whatever usable claim a later token carries.
    const chooser = randomUUID()
    assert.equal((await rename(chooser, 'Chosen', 0)).status, 200)
    assert.deepEqual(await seeded(chooser, { full_name: address(chooser), user_name: 'provider' }), {
      displayName: 'Chosen',
      chosen: true,
      revision: 1,
    })
  })

  it('keeps a chosen name when the provider’s name changes; an unchosen one follows the provider', async () => {
    const [chooser, follower] = [randomUUID(), randomUUID()]
    await profile(chooser, 'Carla From Google')
    assert.equal((await rename(chooser, 'Carla', 0)).status, 200)
    assert.deepEqual(parseProfile((await profile(chooser, 'Carla Renamed At Google')).json), {
      displayName: 'Carla',
      chosen: true,
      revision: 1,
    })
    await profile(follower, 'Dan')
    assert.equal(parseProfile((await profile(follower, 'Daniel')).json).displayName, 'Daniel')
    // No name in a later token leaves the seeded one: nothing blanks a name.
    assert.equal(parseProfile((await profile(follower)).json).displayName, 'Daniel')
  })
})

describe('the names members read (#365 section 6)', () => {
  it('name an author by their current display name on what they wrote before, never by address; ids and times stay', async () => {
    const [admin, editor, viewer] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const said = await call(`/api/v1/projects/${projectId}/contributions`, {
      method: 'POST',
      bearer: await token(editor),
      key: randomUUID(),
      body: { source: null, text: 'First thoughts.', threadId: null, artifactVersionId: null, intent: 'discuss' },
    })
    assert.equal(said.status, 202)
    const discussion = async () =>
      parseSnapshot((await call(`/api/v1/projects/${projectId}/snapshot`, { bearer: await token(viewer) })).json)
        .discussion
    const first = (await discussion()).find((e) => e.text === 'First thoughts.')
    assert.ok(first)
    // The editor's token gave only an address: their message names no one (the Studio's «A member»).
    assert.equal(first.authorName, null)
    assert.equal((await rename(editor, 'Eli', 0)).status, 200)
    const named = (await discussion()).find((e) => e.id === first.id)
    assert.deepEqual([named?.actorId, named?.createdAt, named?.authorName], [first.actorId, first.createdAt, 'Eli'])
    assert.equal((await rename(editor, 'Elena', 1)).status, 200)
    assert.equal((await discussion()).find((e) => e.id === first.id)?.authorName, 'Elena')
    // The row keeps who wrote it and when: only the name read changes.
    const [row] = await asOwner<{ actor_id: string }>(
      `SELECT actor_id FROM sophia.contributions WHERE project_id = $1 AND id = $2`,
      [projectId, first.id],
    )
    assert.equal(row?.actor_id, editor)
  })

  it('never hand out an address a row kept before 0062, and keep a kept name that isn’t one', async () => {
    const [admin, early, late] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [early, late] })
    const write = async (sub: string, text: string) =>
      call(`/api/v1/projects/${projectId}/contributions`, {
        method: 'POST',
        bearer: await token(sub),
        key: randomUUID(),
        body: { source: null, text, threadId: null, artifactVersionId: null, intent: 'discuss' },
      })
    assert.equal((await write(early, 'Kept an address.')).status, 202)
    assert.equal((await write(late, 'Kept a name.')).status, 202)
    // As an API before 0062 kept them: the token's email, or a name an account gave.
    await asOwner(
      `UPDATE sophia.contributions SET author_name = CASE actor_id WHEN $2::uuid THEN $3 ELSE 'Lio' END
        WHERE project_id = $1`,
      [projectId, early, address(early)],
    )
    const read = parseSnapshot(
      (await call(`/api/v1/projects/${projectId}/snapshot`, { bearer: await token(admin) })).json,
    )
    const by = (sub: string) => read.discussion.find((e) => e.actorId === sub)?.authorName
    assert.deepEqual([by(early), by(late)], [null, 'Lio'])
    assert.ok(!JSON.stringify(read).includes('@sophia.test'), 'no address in the snapshot')
  })

  it('name members, the brief and the activity by display name; the room keeps addresses for invitations only', async () => {
    const [admin, editor, viewer] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId, goalId } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    // Opening the project keeps each address in the room's address book (0050) and seeds the admin's name.
    for (const [sub, name] of [
      [admin, 'Ada Admin'],
      [editor, undefined],
      [viewer, undefined],
    ] as const)
      assert.equal(
        (await call(`/api/v1/projects/${projectId}/membership`, { bearer: await token(sub, name) })).status,
        200,
      )
    const kept = await asOwner<{ actor_id: string; name: string }>(
      `SELECT actor_id, name FROM sophia.room_names WHERE project_id = $1 ORDER BY name`,
      [projectId],
    )
    assert.deepEqual(kept.map((r) => r.name).toSorted(), [admin, editor, viewer].map(address).toSorted())
    const members = parseProjectMembers(
      (await call(`/api/v1/projects/${projectId}/members`, { bearer: await token(viewer) })).json,
    )
    assert.deepEqual(
      members.members.map((m) => [m.actorId, m.name]),
      [
        [admin, 'Ada Admin'],
        [editor, null],
        [viewer, null],
      ],
    )
    // A note and a decision name their authors by their current names.
    const noted = await call(`/api/v1/projects/${projectId}/mission/entries`, {
      method: 'POST',
      bearer: await token(editor),
      key: randomUUID(),
      body: { kind: 'observation', epistemic: 'observed', text: 'The door is hard to find.' },
    })
    assert.equal(noted.status, 202, JSON.stringify(noted.json))
    assert.equal((await rename(editor, 'Edu', 0)).status, 200)
    const brief = parseMissionContext(
      (await call(`/api/v1/projects/${projectId}/mission?names=1`, { bearer: await token(viewer) })).json,
    )
    assert.equal(brief.entries.find((e) => e.actorId === editor)?.authorName, 'Edu')
    // The activity names the admin and the editor; nobody by an address.
    const set = await call(`/api/v1/projects/${projectId}/goals/${goalId}/target`, {
      method: 'PUT',
      bearer: await token(editor),
      body: { ownerId: editor, targetDate: null, expectedRevision: 0 },
    })
    assert.equal(set.status, 200, JSON.stringify(set.json))
    const activity = parseActivityPage(
      (await call(`/api/v1/projects/${projectId}/activity`, { bearer: await token(admin) })).json,
    )
    assert.ok(activity.entries.some((e) => e.actor.id === editor && e.actor.name === 'Edu'))
    assert.ok(!JSON.stringify(activity).includes('@'), 'no address in the activity')
  })

  it('name the inviter by display name, and still match a member invitation by the invited address', async () => {
    const [admin, joiner] = [randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin })
    assert.equal((await rename(admin, 'Ines', 0)).status, 200)
    const created = await call(`/api/v1/projects/${projectId}/invitations`, {
      method: 'POST',
      bearer: await token(admin),
      key: randomUUID(),
      body: { kind: 'member', role: 'viewer', email: address(joiner) },
    })
    assert.equal(created.status, 200, JSON.stringify(created.json))
    const link = { token: parseInvitation(created.json).url.split('#')[1] ?? '' }
    const preview = parseInvitationPreview(
      (await app.inject({ method: 'POST', url: '/api/v1/join/preview', payload: link })).json(),
    )
    assert.equal(preview.inviterName, 'Ines')
    // An invitation kept before 0062 named its inviter by address: it is read as naming no one.
    await asOwner(`UPDATE sophia.room_invitations SET inviter_name = $2 WHERE project_id = $1`, [
      projectId,
      address(admin),
    ])
    const old = parseInvitationPreview(
      (await app.inject({ method: 'POST', url: '/api/v1/join/preview', payload: link })).json(),
    )
    assert.equal(old.inviterName, null)
    // The address is the contact: someone else's account cannot accept, the invited address can.
    const stranger = await call('/api/v1/join/accept', {
      method: 'POST',
      bearer: await token(randomUUID()),
      body: link,
    })
    assert.equal(stranger.status, 403)
    const accepted = await call('/api/v1/join/accept', { method: 'POST', bearer: await token(joiner), body: link })
    assert.deepEqual([accepted.status, accepted.json], [200, { projectId }])
  })
})
