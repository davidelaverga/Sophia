// R 4308307168 (level: sql-run, the real app on PostgreSQL): a mention's need carries words from its message's source
// only while the recipient may read that source (owner, or a ready eligible project source). A source made ineligible
// or private after the mention must not leak its words through Needs; restored, they show again.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { Need } from '@sophia/contracts'
import { parseContributionReceipt, parseNeedList } from '@sophia/contracts/validate'
import { createPool, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance

/** Who signs in: a person's display name rides on their token (the provider's), never a request field. */
const NAMES = new Map<string, string>()
const token = (sub: string) =>
  new SignJWT({
    role: 'authenticated',
    email: `${sub.slice(0, 8)}@sophia.test`,
    ...(NAMES.has(sub) ? { user_metadata: { full_name: NAMES.get(sub) } } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

async function call(sub: string, url: string, o: { body?: unknown; key?: string } = {}) {
  const res = await app.inject({
    method: o.body === undefined ? 'GET' : 'POST',
    url,
    headers: { authorization: `Bearer ${await token(sub)}`, ...(o.key ? { 'idempotency-key': o.key } : {}) },
    ...(o.body === undefined ? {} : { payload: o.body as Record<string, unknown> }),
  })
  return { status: res.statusCode, json: res.body ? res.json<Record<string, unknown>>() : null, raw: res.body }
}

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

const messages = (projectId: string) => `/api/v1/projects/${projectId}/contributions`

/** A message written as text, mentioning `mentions` when given (left out of the request otherwise, as before A37). */
const say = (sub: string, projectId: string, text: string, mentions?: unknown, key: string = randomUUID()) =>
  call(sub, messages(projectId), {
    body: {
      intent: 'discuss',
      text,
      source: null,
      threadId: null,
      artifactVersionId: null,
      ...(mentions === undefined ? {} : { mentions }),
    },
    key,
  })

async function said(sub: string, projectId: string, text: string, mentions?: unknown) {
  const res = await say(sub, projectId, text, mentions)
  assert.equal(res.status, 202, res.raw)
  return parseContributionReceipt(res.json)
}

async function mentionsOf(sub: string): Promise<Need[]> {
  const res = await call(sub, '/api/v1/me/needs?mentions=1')
  assert.equal(res.status, 200, res.raw)
  return parseNeedList(res.json).needs.filter((n) => n.kind === 'mention')
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor })
})

after(async () => {
  await app?.close()
  await pool?.end()
  await db?.drop()
})

/** What the recipient may read of the source through the ordinary read path (RLS). */
const readable = async (sub: string, projectId: string, sourceId: string) =>
  (
    await withActor(pool, sub, 'read', (cl) =>
      cl.query('SELECT 1 FROM sophia.source_texts WHERE project_id=$1 AND source_id=$2', [projectId, sourceId]),
    )
  ).rowCount ?? 0

const leaks = (needs: Need[], words: string) =>
  needs.filter((n) => (n.title ?? '').includes(words) || (n.detail ?? '').includes(words))

describe('a mention need never carries words its recipient may not read (4308307168)', () => {
  it('eligible shows; made ineligible or private hides; restored shows again; the source owner reads their own', async () => {
    const [admin, author, b] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [author, b] })
    const words = `Unique private prefix ${randomUUID().slice(0, 8)}`
    const m = await said(author, projectId, `${words} and the rest of the message.`, [b])
    const [row] = await owner<{ source_id: string }>(
      'SELECT source_id FROM sophia.contributions WHERE project_id=$1 AND id=$2',
      [projectId, m.contributionId],
    )
    const sourceId = row!.source_id
    const set = (sql: string) =>
      owner(`UPDATE sophia.source_objects SET ${sql} WHERE project_id=$1 AND id=$2`, [projectId, sourceId])
    // Positive: an eligible project source, readable, its words in the mention.
    assert.equal(await readable(b, projectId, sourceId), 1)
    assert.equal(leaks(await mentionsOf(b), words).length, 1)
    // Shared -> ineligible: the recipient's ordinary read is denied; the need must not carry the words.
    await set('eligible=false')
    assert.equal(await readable(b, projectId, sourceId), 0, 'ordinary read denied')
    const ineligible = await mentionsOf(b)
    console.log(`INELIGIBLE leaks=${String(leaks(ineligible, words).length)} mentions=${String(ineligible.length)}`)
    assert.deepEqual(leaks(ineligible, words), [])
    // Restored eligible: shown again.
    await set('eligible=true')
    assert.equal(leaks(await mentionsOf(b), words).length, 1)
    // Shared -> private (owned by the author): denied to the recipient, no words.
    await set("scope='private'")
    assert.equal(await readable(b, projectId, sourceId), 0, 'ordinary read denied')
    const priv = await mentionsOf(b)
    console.log(`PRIVATE leaks=${String(leaks(priv, words).length)} mentions=${String(priv.length)}`)
    assert.deepEqual(leaks(priv, words), [])
    // Owner exception: a private source owned by the recipient is theirs to read; the words show.
    await set(`owner_id='${b}'`)
    assert.equal(await readable(b, projectId, sourceId), 1)
    assert.equal(leaks(await mentionsOf(b), words).length, 1)
    // A legacy reader (no opt-in) never meets the kind.
    const legacy = (await call(b, '/api/v1/me/needs')).json as { needs: Array<{ kind: string }> }
    assert.equal(legacy.needs.filter((n) => n.kind === 'mention').length, 0)
  })
})
