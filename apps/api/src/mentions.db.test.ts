// A member mentions other members in a room message, and each is asked to look (A37, docs/plans/mentions.md,
// FND-C3b), through the real app on PostgreSQL (level: sql-run): explicit ids only; who may mention; attention bound to
// the committed revision; a stale seen never clears a newer mention; a reader without the opt-in never meets the kind.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ContributionActPreview, Need } from '@sophia/contracts'
import {
  parseContributionActPreview,
  parseContributionActReceipt,
  parseContributionReceipt,
  parseNeedList,
} from '@sophia/contracts/validate'
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

const proof = (p: ContributionActPreview) => ({
  expectedRevision: p.revision,
  reach: p.reach.map(({ taskId, kind, restarts }) => ({ taskId, kind, restarts })),
  previewToken: p.previewToken,
})

/** A correction through its preview; `mentions` left out keeps the recipients. */
async function correct(sub: string, projectId: string, id: string, text: string, mentions?: unknown) {
  const shown = await call(sub, `${messages(projectId)}/${id}/preview?action=correct`)
  assert.equal(shown.status, 200, shown.raw)
  return call(sub, `${messages(projectId)}/${id}/correction`, {
    body: { text, ...proof(parseContributionActPreview(shown.json)), ...(mentions === undefined ? {} : { mentions }) },
    key: randomUUID(),
  })
}

async function withdraw(sub: string, projectId: string, id: string) {
  const shown = await call(sub, `${messages(projectId)}/${id}/preview?action=withdraw`)
  assert.equal(shown.status, 200, shown.raw)
  return call(sub, `${messages(projectId)}/${id}/withdrawal`, {
    body: proof(parseContributionActPreview(shown.json)),
    key: randomUUID(),
  })
}

/** The person's needs with the opt-in, parsed by the generated validator: only their mentions. */
async function mentionsOf(sub: string): Promise<Need[]> {
  const res = await call(sub, '/api/v1/me/needs?mentions=1')
  assert.equal(res.status, 200, res.raw)
  return parseNeedList(res.json).needs.filter((n) => n.kind === 'mention')
}

const seen = async (sub: string, id: string) =>
  (await call(sub, `/api/v1/me/needs/${encodeURIComponent(id)}/seen`, { body: {} })).status

/** What a mention need says: its id, revision, words and who mentioned. */
const saidOf = (n: Need) => [n.id, n.ref.within, n.title, n.detail]

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

describe('explicit mentions in room messages (A37)', () => {
  it('records explicit member ids only: deduplicated, self left out, a non-member or a sixth refused; an editor mentions, a viewer cannot but is mentioned', async () => {
    const [admin, editor, viewer, other, outsider] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ]
    NAMES.set(editor, 'Eda Kaya')
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor, other], viewers: [viewer] })
    const r = await said(editor, projectId, 'Can you both check the door plan?', [viewer, other, viewer, editor])
    const [row] = await owner<{ recipients: string[] }>(
      `SELECT array_agg(recipient_id::text ORDER BY recipient_id) AS recipients FROM sophia.contribution_mentions
        WHERE project_id=$1 AND contribution_id=$2 AND state='pending' AND revision=1`,
      [projectId, r.contributionId],
    )
    assert.deepEqual(row?.recipients, [viewer, other].toSorted())
    // A non-member, a sixth, a malformed id: 422; nothing recorded.
    for (const mentions of [[outsider], [1, 2, 3, 4, 5, 6].map(() => randomUUID()), ['not-an-id']]) {
      const refused = await say(editor, projectId, 'Nope.', mentions)
      assert.equal(refused.status, 422, refused.raw)
    }
    // A viewer can't mention, but still writes their own ordinary words, with no recipients or an empty list.
    assert.equal((await say(viewer, projectId, 'Me too?', [editor])).status, 403)
    assert.equal((await say(viewer, projectId, 'Looks good.')).status, 202)
    assert.equal((await say(viewer, projectId, 'Looks good again.', [])).status, 202)
    // Only the mentioned are asked; the viewer among them; the author's label, never an address.
    const viewerNeeds = await mentionsOf(viewer)
    assert.deepEqual(
      viewerNeeds.map((n) => [n.title, n.detail, n.projectId, n.ref.kind, n.ref.id, n.ref.within]),
      [
        [
          'Can you both check the door plan?',
          'Eda Kaya mentioned you',
          projectId,
          'contribution',
          r.contributionId,
          '1.1',
        ],
      ],
    )
    assert.equal(viewerNeeds[0]?.id, `mention:${projectId}:1.1:${r.contributionId}`)
    assert.equal((await mentionsOf(other)).length, 1)
    assert.deepEqual(await mentionsOf(admin), [])
    assert.ok(!JSON.stringify(viewerNeeds).includes('@sophia.test'))
  })

  it('keeps every reader before A37 whole: no mention kind without the opt-in, the same submit and correction, no new entry field', async () => {
    const [admin, editor, viewer] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const key = randomUUID()
    const r = await say(editor, projectId, 'For you.', [viewer], key)
    assert.equal(r.status, 202)
    // A15's reader: only its kinds.
    const legacy = await call(viewer, '/api/v1/me/needs')
    assert.equal(legacy.status, 200)
    const kinds = (legacy.json as { needs: Array<{ kind: string; ref: { kind: string } }> }).needs
    assert.ok(kinds.every((n) => ['decision', 'permission', 'guest', 'reply'].includes(n.kind)))
    assert.ok(kinds.every((n) => n.ref.kind !== 'contribution'))
    // A request without mentions is as before: an old client's retry of its own earlier message replays its receipt.
    const plain = await say(editor, projectId, 'Plain words.')
    const plainKey = (
      await owner<{ k: string }>(
        `SELECT idempotency_key AS k FROM sophia.contributions WHERE project_id=$1 AND id=$2`,
        [projectId, String(plain.json?.contributionId)],
      )
    )[0]?.k
    const replay = await say(editor, projectId, 'Plain words.', undefined, plainKey ?? '')
    assert.deepEqual([replay.status, replay.json], [202, plain.json])
    // The same key with the same recipients replays; other recipients under it conflict.
    assert.deepEqual((await say(editor, projectId, 'For you.', [viewer], key)).json, r.json)
    assert.equal((await say(editor, projectId, 'For you.', [], key)).status, 409)
    // Readers without revisions=1 get exactly the earlier entry; with it, who is mentioned.
    const snap = await call(viewer, `/api/v1/projects/${projectId}/snapshot`)
    for (const e of (snap.json as { discussion: Array<Record<string, unknown>> }).discussion)
      assert.equal('mentions' in e, false)
    const revised = await call(viewer, `/api/v1/projects/${projectId}/snapshot?revisions=1`)
    const entries = (revised.json as { discussion: Array<{ id: string; mentions: string[] }> }).discussion
    assert.deepEqual(
      entries.map((e) => e.mentions),
      [[viewer], []],
    )
  })

  it('binds attention to the committed revision: kept and waiting moves as one, kept and seen is not asked again, added asked, removed retired', async () => {
    const [admin, author, b, c, d] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [author, b, c, d] })
    const m = await said(author, projectId, 'Plan v1.', [b, c])
    const [bNeed] = await mentionsOf(b)
    assert.ok(bNeed)
    assert.equal(await seen(b, bNeed.id), 204)
    assert.deepEqual(await mentionsOf(b), [])

    // New words, recipients left out: kept. B looked already: not asked again. C still waits: one item, on revision 2.
    const fixed = await correct(author, projectId, m.contributionId, 'Plan v2.')
    assert.equal(fixed.status, 200, fixed.raw)
    assert.deepEqual(await mentionsOf(b), [])
    const cNeeds = await mentionsOf(c)
    assert.deepEqual(cNeeds.map(saidOf), [
      [`mention:${projectId}:2.1:${m.contributionId}`, '2.1', 'Plan v2.', 'A member mentioned you'],
    ])
    // A seen for revision 1 is stale: 204, and the revision 2 mention stays.
    assert.equal(await seen(c, `mention:${projectId}:1.1:${m.contributionId}`), 204)
    assert.equal((await mentionsOf(c)).length, 1)

    // Explicit recipients [B, D]: C removed (no longer asked), D added (asked), B kept and seen (not asked again).
    const changed = await correct(author, projectId, m.contributionId, 'Plan v3.', [b, d])
    assert.equal(changed.status, 200, changed.raw)
    assert.deepEqual(await mentionsOf(c), [])
    assert.deepEqual(await mentionsOf(b), [])
    assert.deepEqual(
      (await mentionsOf(d)).map((n) => [n.ref.within, n.title]),
      [['3.1', 'Plan v3.']],
    )
    // The old words are in no need.
    for (const who of [b, c, d]) {
      const raw = (await call(who, '/api/v1/me/needs?mentions=1')).raw
      assert.ok(!raw.includes('Plan v1') && !raw.includes('Plan v2'))
    }

    // Withdrawn: nobody is asked; D's seen of its id finds nothing waiting (204) and nothing comes back.
    const out = await withdraw(author, projectId, m.contributionId)
    assert.equal(out.status, 200, out.raw)
    assert.deepEqual(await mentionsOf(d), [])
    const [left] = await owner<{ n: string }>(
      `SELECT count(*) AS n FROM sophia.contribution_mentions WHERE project_id=$1 AND contribution_id=$2 AND state<>'retired'`,
      [projectId, m.contributionId],
    )
    assert.equal(Number(left?.n), 0)
  })

  it('gives each new attention its own occurrence: a delayed old seen never clears a re-added mention; the current seen is idempotent (V on #409)', async () => {
    const [admin, author, recipient] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [author, recipient] })
    // An unrelated need of the recipient's (Sophia's reply in their space), which no mention seen may touch.
    await owner(`INSERT INTO sophia.personal_spaces(owner_id, turn_seq) VALUES ($1, 1)`, [recipient])
    await owner(
      `INSERT INTO sophia.personal_turns(owner_id,id,seq,author,body,reply_to,reply,asked_at)
       VALUES ($1,$2,1,'sophia','A reply waiting.',NULL,NULL,NULL)`,
      [recipient, randomUUID()],
    )
    const others = async () =>
      parseNeedList((await call(recipient, '/api/v1/me/needs?mentions=1')).json).needs.filter(
        (n) => n.kind !== 'mention',
      )
    const kept = await others()
    assert.equal(kept.length, 1)

    const message = await said(author, projectId, 'Same words.', [recipient])
    const [old] = await mentionsOf(recipient)
    assert.ok(old)
    // Same words: removed, then named again. No new text revision.
    assert.equal((await correct(author, projectId, message.contributionId, 'Same words.', [])).status, 200)
    assert.deepEqual(await mentionsOf(recipient), [])
    assert.equal((await correct(author, projectId, message.contributionId, 'Same words.', [recipient])).status, 200)
    const [fresh] = await mentionsOf(recipient)
    assert.ok(fresh)
    assert.notEqual(fresh.id, old.id, 'a new occurrence has its own identity')
    assert.equal(fresh.ref.id, old.ref.id)
    const [row] = await owner<{ revision: string; source_id: string }>(
      `SELECT revision, source_id FROM sophia.contributions WHERE project_id=$1 AND id=$2`,
      [projectId, message.contributionId],
    )
    assert.deepEqual(
      [row?.revision, row?.source_id],
      ['1', message.sourceId],
      'same words: no text revision, same source',
    )
    // The old seen arrives late: 204, and the re-added mention still waits.
    assert.equal(await seen(recipient, old.id), 204)
    assert.deepEqual(
      (await mentionsOf(recipient)).map((n) => n.id),
      [fresh.id],
    )
    // The current seen clears it; again, it is the same answer and changes nothing.
    assert.equal(await seen(recipient, fresh.id), 204)
    assert.deepEqual(await mentionsOf(recipient), [])
    assert.equal(await seen(recipient, fresh.id), 204)
    assert.deepEqual(await mentionsOf(recipient), [])
    // Nothing else of theirs was cleared.
    assert.deepEqual(await others(), kept)
  })

  it('keeps a text revision’s stale seen stale, and the kept waiting mention one item on its new revision', async () => {
    const [admin, author, recipient] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [author, recipient] })
    const message = await said(author, projectId, 'First words.', [recipient])
    const [old] = await mentionsOf(recipient)
    assert.ok(old)
    assert.equal((await correct(author, projectId, message.contributionId, 'Second words.')).status, 200)
    const now = await mentionsOf(recipient)
    assert.equal(now.length, 1)
    assert.notEqual(now[0]?.id, old.id)
    assert.equal(await seen(recipient, old.id), 204)
    assert.equal((await mentionsOf(recipient)).length, 1, 'the earlier revision’s seen clears nothing')
  })

  it('changes only who is mentioned for the same words: no revision, nothing erased or woken; an [] clears; a viewer keeps their own words without recipients', async () => {
    const [admin, author, viewer, b] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [author, b], viewers: [viewer] })
    const m = await said(author, projectId, 'Same words.', [b])
    const [was] = await owner<{ source_id: string; eligibility: string }>(
      `SELECT c.source_id, p.eligibility_revision AS eligibility FROM sophia.contributions c JOIN sophia.projects p ON p.id=c.project_id
        WHERE c.project_id=$1 AND c.id=$2`,
      [projectId, m.contributionId],
    )
    const added = await correct(author, projectId, m.contributionId, 'Same words.', [b, viewer])
    assert.equal(added.status, 200, added.raw)
    const receipt = parseContributionActReceipt(added.json)
    assert.deepEqual([receipt.changed, receipt.revision], [true, 1])
    const [afterRow] = await owner<{ source_id: string; eligibility: string; state: string }>(
      `SELECT c.source_id, p.eligibility_revision AS eligibility, s.state FROM sophia.contributions c
        JOIN sophia.projects p ON p.id=c.project_id JOIN sophia.source_objects s ON s.project_id=c.project_id AND s.id=c.source_id
        WHERE c.project_id=$1 AND c.id=$2`,
      [projectId, m.contributionId],
    )
    assert.deepEqual(
      [afterRow?.source_id, afterRow?.eligibility, afterRow?.state],
      [was?.source_id, was?.eligibility, 'ready'],
    )
    assert.deepEqual(
      (await mentionsOf(viewer)).map((n) => n.ref.within),
      ['1.1'],
    )
    // [] clears every recipient.
    assert.equal((await correct(author, projectId, m.contributionId, 'Same words.', [])).status, 200)
    assert.deepEqual(await mentionsOf(b), [])
    assert.deepEqual(await mentionsOf(viewer), [])

    // A viewer's own message: corrected and withdrawn with no recipients; recipients refused (403).
    const own = await said(viewer, projectId, 'My own words.')
    assert.equal((await correct(viewer, projectId, own.contributionId, 'My own words, fixed.')).status, 200)
    assert.equal((await correct(viewer, projectId, own.contributionId, 'My own words, fixed.', [b])).status, 403)
    assert.equal((await withdraw(viewer, projectId, own.contributionId)).status, 200)
  })

  it('checks membership at write, read and seen; a stale proof changes no recipient; the table is the functions’ alone', async () => {
    const [admin, author, b, c] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [author, b, c] })
    const m = await said(author, projectId, 'Look at this.', [b])
    // A stale correction (a moved revision) records nothing, recipients included.
    const shown = await call(author, `${messages(projectId)}/${m.contributionId}/preview?action=correct`)
    const old = proof(parseContributionActPreview(shown.json))
    assert.equal((await correct(author, projectId, m.contributionId, 'Look again.')).status, 200)
    const stale = await call(author, `${messages(projectId)}/${m.contributionId}/correction`, {
      body: { text: 'Look once more.', ...old, mentions: [c] },
      key: randomUUID(),
    })
    assert.deepEqual([stale.status, stale.json?.code], [409, 'stale_revision'])
    assert.deepEqual(await mentionsOf(c), [])
    // B leaves: B's mention is not listed, and B's seen names nothing of theirs (404).
    const [need] = await mentionsOf(b)
    assert.ok(need)
    await owner(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [projectId, b])
    assert.deepEqual(await mentionsOf(b), [])
    assert.equal(await seen(b, need.id), 404)
    // A removed member can't be newly mentioned.
    assert.equal((await say(author, projectId, 'Back?', [b])).status, 422)
    // Nor kept by an explicit list (Codex on #409): a correction naming B again is refused; left out, the list is kept.
    const explicit = await correct(author, projectId, m.contributionId, 'Look again, B.', [b])
    assert.deepEqual([explicit.status, explicit.json?.code], [422, 'invalid_request'], explicit.raw)
    const kept = await correct(author, projectId, m.contributionId, 'Look again, everyone.')
    assert.equal(kept.status, 200, kept.raw)
    // A malformed or foreign mention id: 404.
    assert.equal(await seen(c, `mention:${projectId}:x:${m.contributionId}`), 404)
    assert.equal(await seen(c, `mention:${projectId}:2.1:${m.contributionId}`), 404, 'not mentioned')
    // A bare revision (before occurrences) names nothing.
    assert.equal(await seen(c, `mention:${projectId}:2:${m.contributionId}`), 404)
    // The restricted role reads no mention row itself.
    await assert.rejects(
      withActor(pool, author, 'read', (cl) => cl.query('SELECT * FROM sophia.contribution_mentions')),
      (err: unknown) =>
        err instanceof Error && /permission denied/.test(String((err.cause as Error | undefined)?.message)),
    )
  })
})
