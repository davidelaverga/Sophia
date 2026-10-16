// A member corrects or withdraws their own message in the room's discussion (A36, docs/plans/message-acts.md,
// FND-C3a), through the real app on PostgreSQL (level: sql-run): only the author; what a message is made of decides
// what it may do; the act is what its signed preview showed; erased words leave no text or digest behind; and a reader
// that didn't opt in reads exactly the shape it read before.
import { createHash, createHmac, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ContributionActPreview } from '@sophia/contracts'
import {
  parseContributionActPreview,
  parseContributionActReceipt,
  parseContributionReceipt,
  parseDiscussionPage,
  parseSnapshot,
} from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance

const token = (sub: string, name?: string) =>
  new SignJWT({
    role: 'authenticated',
    email: `${sub.slice(0, 8)}@sophia.test`,
    ...(name ? { user_metadata: { full_name: name } } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

async function call(sub: string, url: string, o: { method?: 'GET' | 'POST'; body?: unknown; key?: string } = {}) {
  const res = await app.inject({
    method: o.method ?? (o.body === undefined ? 'GET' : 'POST'),
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

/** The digest the database keeps of a text (0048). */
const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

const messages = (projectId: string) => `/api/v1/projects/${projectId}/contributions`
const at = (projectId: string, id: string) => `${messages(projectId)}/${id}`

/** A message written as text, by `sub`. */
async function say(sub: string, projectId: string, text: string, key = randomUUID()) {
  const res = await call(sub, messages(projectId), {
    body: { intent: 'discuss', text, source: null, threadId: null, artifactVersionId: null },
    key,
  })
  assert.equal(res.status, 202, JSON.stringify(res.json))
  return { ...parseContributionReceipt(res.json), key }
}

/** A message that shares a source, by `sub`. */
async function share(sub: string, projectId: string, source: { sourceId: string; sha256: string }, key = randomUUID()) {
  const [p] = await owner<{ e: string }>(`SELECT eligibility_revision AS e FROM sophia.projects WHERE id=$1`, [
    projectId,
  ])
  const res = await call(sub, messages(projectId), {
    body: {
      intent: 'discuss',
      text: null,
      source: { ...source, eligibilityRevision: Number(p?.e) },
      threadId: null,
      artifactVersionId: null,
    },
    key,
  })
  assert.equal(res.status, 202, JSON.stringify(res.json))
  return { ...parseContributionReceipt(res.json), key, eligibilityRevision: Number(p?.e) }
}

const preview = (sub: string, projectId: string, id: string, action: 'correct' | 'withdraw') =>
  call(sub, `${at(projectId, id)}/preview?action=${action}`)

async function previewed(sub: string, projectId: string, id: string, action: 'correct' | 'withdraw') {
  const res = await preview(sub, projectId, id, action)
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return parseContributionActPreview(res.json)
}

/** What the act carries from the preview the member was shown. */
const shown = (p: ContributionActPreview) => ({
  expectedRevision: p.revision,
  reach: p.reach.map((r) => r.taskId),
  previewToken: p.previewToken,
})

const correct = (sub: string, projectId: string, id: string, body: Record<string, unknown>, key = randomUUID()) =>
  call(sub, `${at(projectId, id)}/correction`, { body, key })
const withdraw = (sub: string, projectId: string, id: string, body: Record<string, unknown>, key = randomUUID()) =>
  call(sub, `${at(projectId, id)}/withdrawal`, { body, key })

/** Correct a message through its preview, as the Studio does. */
async function corrected(sub: string, projectId: string, id: string, text: string, key = randomUUID()) {
  const p = await previewed(sub, projectId, id, 'correct')
  const res = await correct(sub, projectId, id, { text, ...shown(p) }, key)
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return parseContributionActReceipt(res.json)
}

async function withdrawn(sub: string, projectId: string, id: string) {
  const p = await previewed(sub, projectId, id, 'withdraw')
  const res = await withdraw(sub, projectId, id, shown(p))
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return parseContributionActReceipt(res.json)
}

const snapshotRaw = async (sub: string, projectId: string, revisions = false) => {
  const res = await call(sub, `/api/v1/projects/${projectId}/snapshot${revisions ? '?revisions=1' : ''}`)
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return res.json as { discussion: Array<Record<string, unknown>>; discussionWithdrawn?: unknown[] }
}

interface SourceRow {
  state: string
  eligible: boolean
  sha256: string
  text: string | null
  eligibility_revision: string
}
const sourceOf = async (projectId: string, sourceId: string) => {
  const [s] = await owner<SourceRow>(
    `SELECT s.state, s.eligible, s.sha256, t.body AS text, s.eligibility_revision FROM sophia.source_objects s
      LEFT JOIN sophia.source_texts t ON t.project_id=s.project_id AND t.source_id=s.id WHERE s.project_id=$1 AND s.id=$2`,
    [projectId, sourceId],
  )
  assert.ok(s)
  return s
}
const projectRevisions = async (projectId: string) => {
  const [p] = await owner<{ eligibility: string; events: string }>(
    `SELECT eligibility_revision AS eligibility, event_sequence AS events FROM sophia.projects WHERE id=$1`,
    [projectId],
  )
  assert.ok(p)
  return { eligibility: Number(p.eligibility), events: Number(p.events) }
}

/** The proof a preview would carry, signed with the database's own key: to make one that has expired. */
async function signed(p: {
  projectId: string
  contributionId: string
  actor: string
  action: string
  revision: number
  sourceId: string
  expires: number
}) {
  const [k] = await owner<{ secret: Buffer }>(`SELECT secret FROM sophia_secrets.mission_preview_keys WHERE id=1`)
  assert.ok(k)
  const message = [
    'sophia.contribution-act-preview.v1',
    p.projectId,
    p.contributionId,
    p.actor,
    p.action,
    String(p.revision),
    p.sourceId,
    String(p.expires),
    '',
  ].join('|')
  return `v1.${p.expires}.${createHmac('sha256', k.secret).update(message, 'utf8').digest('hex')}`
}

/** A refusal with its status and code. */
const refused = (res: Awaited<ReturnType<typeof call>>, status: number, code: string) =>
  assert.deepEqual([res.status, res.json?.code], [status, code], JSON.stringify(res.json))

/** The keys a DiscussionEntry had before A36. */
const LEGACY_KEYS = ['actorId', 'authorName', 'createdAt', 'id', 'intent', 'origin', 'sha256', 'sourceId', 'text']

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

describe('own message correction and withdrawal (A36)', () => {
  it('lets only the author act: an editor and a viewer on their own; nobody on another’s; not an outsider or a removed member', async () => {
    const [admin, editor, viewer, outsider] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const mine = await say(editor, projectId, 'The door is on the left.')
    const theirs = await say(viewer, projectId, 'I found the door.')
    const [was] = await owner<{ created_at: Date; actor_id: string }>(
      `SELECT created_at, actor_id FROM sophia.contributions WHERE project_id=$1 AND id=$2`,
      [projectId, mine.contributionId],
    )

    const fixed = await corrected(editor, projectId, mine.contributionId, 'The door is on the right.')
    assert.deepEqual(
      [fixed.contributionId, fixed.operation, fixed.revision, fixed.state, fixed.changed],
      [mine.contributionId, 'correct', 2, 'current', true],
    )
    // A viewer may act on their own ordinary talk.
    const viewerFixed = await corrected(viewer, projectId, theirs.contributionId, 'I found the right door.')
    assert.equal(viewerFixed.revision, 2)

    // Same message, author and time; the new words in place of the old.
    const [now] = await owner<{ created_at: Date; actor_id: string; corrected_at: Date | null }>(
      `SELECT created_at, actor_id, corrected_at FROM sophia.contributions WHERE project_id=$1 AND id=$2`,
      [projectId, mine.contributionId],
    )
    assert.deepEqual([now?.created_at, now?.actor_id], [was?.created_at, was?.actor_id])
    assert.ok(now?.corrected_at)
    const legacy = await snapshotRaw(admin, projectId)
    assert.deepEqual(
      legacy.discussion.map((e) => [e.id, e.text]),
      [
        [mine.contributionId, 'The door is on the right.'],
        [theirs.contributionId, 'I found the right door.'],
      ],
    )

    // Another member's message: neither its preview nor an act, whatever their role, admin included.
    for (const other of [admin, viewer]) {
      assert.equal((await preview(other, projectId, mine.contributionId, 'correct')).status, 403)
      assert.equal((await preview(other, projectId, mine.contributionId, 'withdraw')).status, 403)
    }
    const p = await previewed(editor, projectId, mine.contributionId, 'withdraw')
    for (const other of [admin, viewer, outsider]) {
      assert.equal((await withdraw(other, projectId, mine.contributionId, shown(p))).status, 403)
      assert.equal(
        (await correct(other, projectId, mine.contributionId, { text: 'Not yours.', ...shown(p) })).status,
        403,
      )
    }
    assert.equal((await preview(outsider, projectId, mine.contributionId, 'withdraw')).status, 403)
    // A message that isn't the discussion's.
    assert.equal((await preview(editor, projectId, randomUUID(), 'withdraw')).status, 422)

    // Removed, the author can no longer act on their own message.
    await owner(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
      projectId,
      editor,
    ])
    assert.equal((await preview(editor, projectId, mine.contributionId, 'withdraw')).status, 403)
    assert.equal((await withdraw(editor, projectId, mine.contributionId, shown(p))).status, 403)
    assert.equal((await snapshotRaw(admin, projectId)).discussion.length, 2)
  })

  it('erases a written message’s old words, with the project’s eligibility; a shared source is only detached, even when the author owns it', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const said = await say(editor, projectId, 'Meet at nine.')
    // The author shares their own message's source in a second message: it has no words of its own.
    const shared = await share(editor, projectId, { sourceId: said.sourceId, sha256: said.sha256 })

    const sharedPreview = await previewed(editor, projectId, shared.contributionId, 'withdraw')
    assert.deepEqual([sharedPreview.erases, sharedPreview.reach], [false, []])
    const noCorrection = await preview(editor, projectId, shared.contributionId, 'correct')
    assert.deepEqual([noCorrection.status, noCorrection.json?.code], [422, 'invalid_request'])
    const writtenPreview = await previewed(editor, projectId, said.contributionId, 'correct')
    assert.deepEqual([writtenPreview.erases, writtenPreview.reach, writtenPreview.revision], [true, [], 1])

    const was = await projectRevisions(projectId)
    const out = await withdrawn(editor, projectId, shared.contributionId)
    assert.deepEqual([out.operation, out.state, out.revision], ['withdraw', 'withdrawn', 2])
    // Detached only: the source it shared is as it was, and the message that wrote it still reads.
    const kept = await sourceOf(projectId, said.sourceId)
    assert.deepEqual([kept.state, kept.eligible, kept.sha256, kept.text], ['ready', true, said.sha256, 'Meet at nine.'])
    const afterDetach = await projectRevisions(projectId)
    assert.equal(afterDetach.eligibility, was.eligibility + 1)
    // Its submit's retry is stale: the message is withdrawn, not answered as recorded.
    const replay = await call(editor, messages(projectId), {
      body: {
        intent: 'discuss',
        text: null,
        source: { sourceId: said.sourceId, sha256: said.sha256, eligibilityRevision: shared.eligibilityRevision },
        threadId: null,
        artifactVersionId: null,
      },
      key: shared.key,
    })
    assert.deepEqual([replay.status, replay.json?.code], [409, 'stale_revision'])
    assert.deepEqual(
      (await snapshotRaw(admin, projectId)).discussion.map((e) => e.id),
      [said.contributionId],
    )

    // Correcting the written message erases its old words: text, hash and eligibility go; the new words are a new
    // source; the project's eligibility moves.
    await corrected(editor, projectId, said.contributionId, 'Meet at ten.')
    const old = await sourceOf(projectId, said.sourceId)
    assert.deepEqual([old.state, old.eligible, old.text], ['deleted', false, null])
    assert.notEqual(old.sha256, said.sha256)
    assert.equal(Number(old.eligibility_revision), 2)
    const [row] = await owner<{ source_id: string }>(
      `SELECT source_id FROM sophia.contributions WHERE project_id=$1 AND id=$2`,
      [projectId, said.contributionId],
    )
    assert.ok(row && row.source_id !== said.sourceId)
    const fresh = await sourceOf(projectId, row.source_id)
    assert.deepEqual([fresh.state, fresh.eligible, fresh.text], ['ready', true, 'Meet at ten.'])
    assert.equal((await projectRevisions(projectId)).eligibility, afterDetach.eligibility + 1)

    // Withdrawing it erases the current words too.
    await withdrawn(editor, projectId, said.contributionId)
    const gone = await sourceOf(projectId, row.source_id)
    assert.deepEqual([gone.state, gone.eligible, gone.text], ['deleted', false, null])
    assert.equal((await projectRevisions(projectId)).eligibility, afterDetach.eligibility + 2)
    assert.deepEqual((await snapshotRaw(admin, projectId)).discussion, [])
  })

  it('keeps an accepted decision and a published report that drew on the words', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const { projectId } = seed
    const said = await say(editor, projectId, 'Signs at the door would help.')
    const proposed = await call(editor, `/api/v1/projects/${projectId}/mission/proposals`, {
      body: { kind: 'constraint', statement: 'Signs at the door.' },
      key: randomUUID(),
    })
    assert.equal(proposed.status, 202, JSON.stringify(proposed.json))
    const decisionId = String(proposed.json?.decisionId)
    const decided = await call(admin, `/api/v1/projects/${projectId}/mission/proposals/${decisionId}/decision`, {
      body: { decision: 'accept', expectedRevision: 1 },
      key: randomUUID(),
    })
    assert.equal(decided.status, 202, JSON.stringify(decided.json))
    // A published report version whose source drew on the message (as a research result records it).
    const [report] = await owner<{ version: string; source: string; sha256: string }>(
      `WITH s AS (SELECT (sophia.put_text_source($1,$2,'text/markdown','# Door study')).*),
         a AS (INSERT INTO sophia.artifacts(project_id,title,format) VALUES($1,'Door study','markdown') RETURNING id),
         d AS (INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) SELECT $1,$3,s.id FROM s),
         v AS (INSERT INTO sophia.artifact_versions(project_id,artifact_id,source_id,source_hash,goal_id,goal_revision,
                 authority_epoch,state,version_number)
               SELECT $1,a.id,s.id,s.sha256,$4,1,1,'stable',1 FROM a, s RETURNING id)
       SELECT v.id AS version, s.id AS source, s.sha256 FROM v, s`,
      [projectId, admin, said.sourceId, seed.goalId],
    )
    assert.ok(report)

    await withdrawn(editor, projectId, said.contributionId)

    const [decision] = await owner<{ state: string; statement: string; revision: string }>(
      `SELECT state, proposal->>'statement' AS statement, revision FROM sophia.decisions WHERE project_id=$1 AND id=$2`,
      [projectId, decisionId],
    )
    assert.deepEqual(
      [decision?.state, decision?.statement, Number(decision?.revision)],
      ['accepted', 'Signs at the door.', 2],
    )
    const published = await sourceOf(projectId, report.source)
    assert.deepEqual([published.state, published.sha256, published.text], ['ready', report.sha256, '# Door study'])
    const [version] = await owner<{ state: string }>(
      `SELECT state FROM sophia.artifact_versions WHERE project_id=$1 AND id=$2`,
      [projectId, report.version],
    )
    assert.equal(version?.state, 'stable')
  })

  it('is idempotent per key, a conflict for another request, and stale on a moved revision', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const said = await say(editor, projectId, 'Lunch at noon.')
    const p = await previewed(editor, projectId, said.contributionId, 'correct')
    const key = randomUUID()
    const first = await correct(editor, projectId, said.contributionId, { text: 'Lunch at one.', ...shown(p) }, key)
    assert.equal(first.status, 200, JSON.stringify(first.json))
    // A retry after a lost reply: the same receipt, nothing written twice, even with a fresh preview's proof.
    const events = (await projectRevisions(projectId)).events
    const again = await correct(editor, projectId, said.contributionId, { text: 'Lunch at one.', ...shown(p) }, key)
    assert.deepEqual([again.status, again.json], [200, first.json])
    assert.equal((await projectRevisions(projectId)).events, events)
    // The same key for other words is a conflict.
    const other = await correct(editor, projectId, said.contributionId, { text: 'Lunch at two.', ...shown(p) }, key)
    assert.deepEqual([other.status, other.json?.code], [409, 'idempotency_conflict'])
    // A new key with the revision shown before the correction is stale: the message moved.
    const stale = await correct(editor, projectId, said.contributionId, { text: 'Lunch at two.', ...shown(p) })
    assert.deepEqual([stale.status, stale.json?.code], [409, 'stale_revision'])
    // Withdrawn, the message takes no further act; a withdrawal's retry answers its receipt.
    const w = await previewed(editor, projectId, said.contributionId, 'withdraw')
    const wKey = randomUUID()
    const out = await withdraw(editor, projectId, said.contributionId, shown(w), wKey)
    assert.equal(out.status, 200)
    assert.deepEqual((await withdraw(editor, projectId, said.contributionId, shown(w), wKey)).json, out.json)
    const late = await withdraw(editor, projectId, said.contributionId, shown(w))
    assert.deepEqual([late.status, late.json?.code], [409, 'stale_revision'])
    assert.deepEqual((await preview(editor, projectId, said.contributionId, 'correct')).json?.code, 'stale_revision')
  })

  it('requires the server’s own unexpired proof, for this member, message and act, with the reach shown', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const a = await say(editor, projectId, 'First.')
    const b = await say(editor, projectId, 'Second.')
    const forA = await previewed(editor, projectId, a.contributionId, 'withdraw')
    const correctA = await previewed(editor, projectId, a.contributionId, 'correct')
    // Another message's proof, another act's proof, an altered proof, no proof.
    refused(await withdraw(editor, projectId, b.contributionId, shown(forA)), 422, 'invalid_request')
    refused(await withdraw(editor, projectId, a.contributionId, shown(correctA)), 422, 'invalid_request')
    const altered = `${forA.previewToken.slice(0, -1)}${forA.previewToken.endsWith('0') ? '1' : '0'}`
    refused(
      await withdraw(editor, projectId, a.contributionId, { ...shown(forA), previewToken: altered }),
      422,
      'invalid_request',
    )
    const { previewToken: _, ...noProof } = shown(forA)
    refused(await withdraw(editor, projectId, a.contributionId, noProof), 422, 'invalid_request')
    // A reach other than what the act would change now is stale: the member must look again.
    refused(
      await withdraw(editor, projectId, a.contributionId, { ...shown(forA), reach: [randomUUID()] }),
      409,
      'stale_revision',
    )
    // The server's proof, expired.
    const expired = await signed({
      projectId,
      contributionId: a.contributionId,
      actor: editor,
      action: 'withdraw',
      revision: 1,
      sourceId: a.sourceId,
      expires: Math.floor(Date.now() / 1000) - 1,
    })
    refused(
      await withdraw(editor, projectId, a.contributionId, { ...shown(forA), previewToken: expired }),
      409,
      'stale_revision',
    )
    // Nothing was changed by any of them; the proof shown still works.
    assert.equal((await withdraw(editor, projectId, a.contributionId, shown(forA))).status, 200)
  })

  it('changes nothing for identical words: no erasure, no event, no eligibility, no revision', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const said = await say(editor, projectId, 'Same words.')
    const was = await projectRevisions(projectId)
    const p = await previewed(editor, projectId, said.contributionId, 'correct')
    const res = await correct(editor, projectId, said.contributionId, { text: 'Same words.', ...shown(p) })
    assert.equal(res.status, 200, JSON.stringify(res.json))
    const receipt = parseContributionActReceipt(res.json)
    assert.deepEqual([receipt.changed, receipt.revision, receipt.cursor], [false, 1, null])
    assert.deepEqual(await projectRevisions(projectId), was)
    const kept = await sourceOf(projectId, said.sourceId)
    assert.deepEqual([kept.state, kept.sha256, kept.text], ['ready', said.sha256, 'Same words.'])
  })

  it('leaves no erased words or digests to a retry: the submit, an earlier correction and the acts kept', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const said = await say(editor, projectId, 'A secret plan.')
    const firstKey = randomUUID()
    await corrected(editor, projectId, said.contributionId, 'A better plan.', firstKey)
    // The submit's retry is refused as erased, never answered with its digest.
    const replay = await call(editor, messages(projectId), {
      body: { intent: 'discuss', text: 'A secret plan.', source: null, threadId: null, artifactVersionId: null },
      key: said.key,
    })
    assert.deepEqual([replay.status, replay.json?.code], [409, 'request_erased'])
    assert.ok(!replay.raw.includes(said.sha256))
    // Correct again: the first correction's words are erased, and its retry is refused the same way.
    await corrected(editor, projectId, said.contributionId, 'The final plan.')
    const p = await previewed(editor, projectId, said.contributionId, 'correct')
    const retry = await correct(
      editor,
      projectId,
      said.contributionId,
      { text: 'A better plan.', ...shown(p) },
      firstKey,
    )
    assert.deepEqual([retry.status, retry.json?.code], [409, 'request_erased'])
    // Nothing kept for the message holds an erased word or digest.
    const erased = [said.sha256, digest('A better plan.'), 'A secret plan', 'A better plan']
    const kept = JSON.stringify(
      await owner(
        `SELECT c.semantic_request, c.receipt, (SELECT jsonb_agg(jsonb_build_array(a.semantic_request,a.receipt))
           FROM sophia.contribution_acts a WHERE a.project_id=c.project_id AND a.contribution_id=c.id) AS acts
           FROM sophia.contributions c WHERE c.project_id=$1 AND c.id=$2`,
        [projectId, said.contributionId],
      ),
    )
    for (const word of erased) assert.ok(!kept.includes(word), `kept: ${word}`)
    assert.ok(kept.includes(digest('The final plan.')), 'the current words’ digest stays for a retry')
  })

  it('serves the old shape without revisions=1, and revisions and tombstones with it, in the snapshot and earlier pages', async () => {
    const [admin, editor, viewer] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const ids: string[] = []
    for (let i = 0; i < 53; i += 1) ids.push((await say(editor, projectId, `Message ${i}.`)).contributionId)
    const [m0, m1, m2] = ids as [string, string, string]
    await corrected(editor, projectId, m1, 'Message one, corrected.')
    await withdrawn(editor, projectId, m2)
    const newest = ids.at(-1) as string
    await withdrawn(editor, projectId, newest)

    // Old readers: exactly the keys they knew; withdrawn messages left out; the corrected words in place.
    const legacy = await snapshotRaw(viewer, projectId)
    assert.equal(legacy.discussionWithdrawn, undefined)
    for (const e of legacy.discussion) assert.deepEqual(Object.keys(e).toSorted(), LEGACY_KEYS)
    assert.equal(legacy.discussion.length, 50)
    assert.ok(!legacy.discussion.some((e) => e.id === newest))
    parseSnapshot(legacy)
    const legacyEarlier = await call(
      viewer,
      `/api/v1/projects/${projectId}/discussion?before=${String(legacy.discussion[0]?.id)}`,
    )
    assert.equal(legacyEarlier.status, 200)
    const legacyPage = legacyEarlier.json as { entries: Array<Record<string, unknown>>; withdrawn?: unknown }
    assert.equal(legacyPage.withdrawn, undefined)
    // 51 messages stand: the newest 50, the corrected one first in its new words; the oldest is the page before.
    assert.deepEqual([legacy.discussion[0]?.id, legacy.discussion[0]?.text], [m1, 'Message one, corrected.'])
    assert.deepEqual(
      legacyPage.entries.map((e) => [e.id, e.text]),
      [[m0, 'Message 0.']],
    )
    for (const e of legacyPage.entries) assert.deepEqual(Object.keys(e).toSorted(), LEGACY_KEYS)

    // A reader that opted in: revisions, when corrected, what each is made of; tombstones in place, counted in the 50.
    const revised = await snapshotRaw(viewer, projectId, true)
    const snap = parseSnapshot(revised)
    assert.equal(snap.discussion.length + (snap.discussionWithdrawn?.length ?? 0), 50)
    assert.deepEqual(
      snap.discussionWithdrawn?.map((w) => [w.id, w.actorId, Object.keys(w).toSorted()]),
      [[newest, editor, ['actorId', 'authorName', 'createdAt', 'id', 'withdrawnAt']]],
    )
    assert.ok(snap.discussion.every((e) => e.revision === 1 && e.correctedAt === null && e.kind === 'text'))
    const earlier = await call(
      viewer,
      `/api/v1/projects/${projectId}/discussion?revisions=1&before=${String(revised.discussion[0]?.id)}`,
    )
    assert.equal(earlier.status, 200)
    const page = parseDiscussionPage(earlier.json)
    assert.deepEqual(
      page.entries.map((e) => [e.id, e.text, e.revision, e.correctedAt !== null]),
      [
        [m0, 'Message 0.', 1, false],
        [m1, 'Message one, corrected.', 2, true],
      ],
    )
    assert.deepEqual(
      page.withdrawn?.map((w) => w.id),
      [m2],
    )
    assert.ok(!earlier.raw.includes('Message 2.'))
    // A withdrawn message stays a page's anchor.
    const fromWithdrawn = await call(viewer, `/api/v1/projects/${projectId}/discussion?before=${m2}`)
    assert.deepEqual(
      (fromWithdrawn.json as { entries: Array<{ id: string }> }).entries.map((e) => e.id),
      [m0, m1],
    )
    // Only the opt-in value is accepted.
    assert.equal((await call(viewer, `/api/v1/projects/${projectId}/discussion?revisions=2`)).status, 422)
  })
})
