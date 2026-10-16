// What changed in a project since a member last looked (A34, docs/plans/project-updates.md, FND-C2-ATTENTION C2b),
// through the real app on PostgreSQL (level: sql-run): the window is the member's own, bounded, and only the seen write
// moves its mark, to what was shown; what was withdrawn since is in no line and no count.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  parseMissionReceipt,
  parseMissionWithdrawalPreview,
  parseNeedList,
  parseProjectUpdates,
} from '@sophia/contracts/validate'
import { createPool, shownReach, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
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

type Method = 'GET' | 'POST' | 'PUT'
async function call(url: string, bearer: string, method: Method = 'GET', body?: unknown, key = false) {
  const res = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${bearer}`, ...(key ? { 'idempotency-key': randomUUID() } : {}) },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  })
  return { status: res.statusCode, json: res.body ? res.json<Record<string, unknown>>() : null }
}

const updatesOf = async (sub: string, projectId: string) => {
  const res = await call(`/api/v1/projects/${projectId}/since`, await token(sub))
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return parseProjectUpdates(res.json)
}
const markSeen = async (sub: string, projectId: string, sequence: string) =>
  (await call(`/api/v1/projects/${projectId}/seen`, await token(sub), 'PUT', { sequence })).status

const note = async (sub: string, projectId: string, text: string, name?: string) =>
  parseMissionReceipt(
    (
      await call(
        `/api/v1/projects/${projectId}/mission/entries`,
        await token(sub, name),
        'POST',
        { kind: 'observation', epistemic: 'observed', text },
        true,
      )
    ).json,
  )
const propose = async (sub: string, projectId: string, statement: string) =>
  parseMissionReceipt(
    (
      await call(
        `/api/v1/projects/${projectId}/mission/proposals`,
        await token(sub),
        'POST',
        { kind: 'constraint', statement },
        true,
      )
    ).json,
  )

async function asOwner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

/** The one row a seeding statement returns. */
async function row<T extends pg.QueryResultRow>(c: pg.Client, sql: string, params: unknown[]): Promise<T> {
  const [found] = (await c.query<T>(sql, params)).rows
  if (!found) throw new Error(`no row: ${sql}`)
  return found
}

/** A report version a task made, with its events as the runtime emits them (admitted by `asker`, then its result). */
async function made(seed: SeededProject, asker: string, title: string, amends?: { artifact: string; version: string }) {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    await c.query(`SELECT set_config('sophia.actor_id', $1, false)`, [asker])
    const job = await row<{ id: string }>(
      c,
      `INSERT INTO sophia.jobs(project_id,kind,state) VALUES($1,'research','succeeded') RETURNING id`,
      [seed.projectId],
    )
    const artifact = amends
      ? { id: amends.artifact }
      : await row<{ id: string }>(
          c,
          `INSERT INTO sophia.artifacts(project_id,title,format) VALUES($1,$2,'markdown') RETURNING id`,
          [seed.projectId, title],
        )
    const source = await row<{ id: string; sha256: string }>(
      c,
      `SELECT (s).id, (s).sha256 FROM (SELECT sophia.put_text_source($1,$2,'text/markdown',$3) AS s) x`,
      [seed.projectId, asker, `# ${title}`],
    )
    const version = await row<{ id: string }>(
      c,
      `INSERT INTO sophia.artifact_versions(project_id,artifact_id,source_id,source_hash,goal_id,goal_revision,
         authority_epoch,state,version_number,job_id)
       VALUES($1,$2,$3,$4,$5,1,1,'stable',$7,$6) RETURNING id`,
      [seed.projectId, artifact.id, source.id, source.sha256, seed.goalId, job.id, amends ? 2 : 1],
    )
    // An amendment supersedes the version before it (0026): the report's current version is the new one.
    if (amends) await c.query(`UPDATE sophia.artifact_versions SET state='superseded' WHERE id=$1`, [amends.version])
    await c.query(`UPDATE sophia.artifacts SET stable_version_id=$2 WHERE id=$1`, [artifact.id, version.id])
    await c.query(`SELECT sophia.emit_project_event($1,'native_task.admitted','job',$2,1,'native_task.research')`, [
      seed.projectId,
      job.id,
    ])
    // The result is the runtime's: an event with no member actor.
    await c.query(`SELECT set_config('sophia.actor_id', '', false)`)
    await c.query(
      `SELECT sophia.emit_project_event($1,'native_task.result_ready','job',$2,3,'native_task.result_ready')`,
      [seed.projectId, job.id],
    )
    return { job: job.id, artifact: artifact.id, version: version.id, source: source.id }
  } finally {
    await c.end()
  }
}

/**
 * A rendition settled (0032, 0040): a renderer's version supersedes the report's current one, becomes its stable
 * version, and `artifact.rendition_ready` names the artifact, from the service (no member actor).
 */
async function rendition(seed: SeededProject, artifact: string, prior: string, versionNumber: number) {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    const job = await row<{ id: string }>(
      c,
      `INSERT INTO sophia.jobs(project_id,kind,state) VALUES($1,'render','succeeded') RETURNING id`,
      [seed.projectId],
    )
    const source = await row<{ id: string; sha256: string }>(
      c,
      `SELECT (s).id, (s).sha256 FROM (SELECT sophia.put_text_source($1,$2,'application/pdf',$3) AS s) x`,
      [seed.projectId, randomUUID(), `pdf ${String(versionNumber)}`],
    )
    const version = await row<{ id: string }>(
      c,
      `INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,
         authority_epoch,state,version_number,job_id)
       VALUES($1,$2,$3,$4,$5,$6,1,1,'stable',$7,$8) RETURNING id`,
      [seed.projectId, artifact, prior, source.id, source.sha256, seed.goalId, versionNumber, job.id],
    )
    await c.query(`UPDATE sophia.artifact_versions SET state='superseded' WHERE id=$1`, [prior])
    await c.query(`UPDATE sophia.artifacts SET stable_version_id=$2 WHERE id=$1`, [artifact, version.id])
    await c.query(
      `SELECT sophia.emit_project_event($1,'artifact.rendition_ready','artifact',$2,$3,'artifact.rendition_ready')`,
      [seed.projectId, artifact, versionNumber],
    )
    return version.id
  } finally {
    await c.end()
  }
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

describe('what changed since a member last looked (A34)', () => {
  it('reads current records the window names, by display name; a viewer reads, an outsider and a removed member don’t', async () => {
    const [admin, editor, viewer, outsider] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const kept = await note(editor, seed.projectId, 'Three of five got lost at the door.', 'Eda Kaya')
    const asked = await propose(editor, seed.projectId, 'Signs at the door.')
    const waiting = await propose(editor, seed.projectId, 'A host at the door.')
    const decided = await call(
      `/api/v1/projects/${seed.projectId}/mission/proposals/${String(asked.decisionId)}/decision`,
      await token(admin),
      'POST',
      { decision: 'accept', expectedRevision: 1 },
      true,
    )
    assert.equal(decided.status, 202, JSON.stringify(decided.json))
    const report = await made(seed, admin, 'Door study')
    const u = await updatesOf(viewer, seed.projectId)
    assert.equal(u.fromSequence, null)
    assert.equal(u.more, false)
    assert.deepEqual(
      u.noted.map((n) => [n.entryId, n.text, n.actorId, n.authoredBy]),
      [[kept.entryId, 'Three of five got lost at the door.', editor, 'member']],
    )
    assert.deepEqual(
      u.decided.map((d) => [d.decisionId, d.statement, d.proposedBy, d.decidedBy]),
      [[asked.decisionId, 'Signs at the door.', editor, admin]],
    )
    assert.deepEqual(
      u.open.map((o) => [o.proposalId, o.statement]),
      [[waiting.decisionId, 'A host at the door.']],
    )
    assert.deepEqual(
      u.made.map((m) => [m.artifactId, m.artifactVersionId, m.title, m.versionNumber, m.askedBy]),
      [[report.artifact, report.version, 'Door study', 1, admin]],
    )
    assert.deepEqual(
      u.work.map((w) => [w.taskId, w.kind, w.state]),
      [[report.job, 'research', 'succeeded']],
    )
    // Names are display names: Eda's, given; the admin has none, so none is said; never an address.
    assert.deepEqual(u.names, { [editor]: 'Eda Kaya' })
    assert.ok(!JSON.stringify(u).includes('@'))
    assert.equal((await call(`/api/v1/projects/${seed.projectId}/since`, await token(outsider))).status, 403)
    assert.equal(await markSeen(outsider, seed.projectId, u.toSequence), 403)
    await asOwner(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
      seed.projectId,
      viewer,
    ])
    assert.equal((await call(`/api/v1/projects/${seed.projectId}/since`, await token(viewer))).status, 403)
  })

  it('marks seen only what was shown: an event after the shown bound stays new; the mark never goes back or ahead', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    await note(editor, seed.projectId, 'The first finding.')
    const shown = await updatesOf(admin, seed.projectId)
    assert.equal(shown.noted.length, 1)
    // Reading again, as a poll does, acknowledges nothing.
    assert.equal((await updatesOf(admin, seed.projectId)).noted.length, 1)
    // A newer event arrives while the window is on screen.
    const later = await note(editor, seed.projectId, 'A later finding.')
    assert.equal(await markSeen(admin, seed.projectId, shown.toSequence), 204)
    const next = await updatesOf(admin, seed.projectId)
    assert.equal(next.fromSequence, shown.toSequence)
    assert.deepEqual(
      next.noted.map((n) => n.entryId),
      [later.entryId],
    )
    // The same seen again (a lost reply's retry) is the same; an older one never moves the mark back.
    assert.equal(await markSeen(admin, seed.projectId, shown.toSequence), 204)
    assert.equal(await markSeen(admin, seed.projectId, '0'), 204)
    assert.equal((await updatesOf(admin, seed.projectId)).fromSequence, shown.toSequence)
    // Past any bigint: refused as a request, not a database failure.
    const huge = await call(`/api/v1/projects/${seed.projectId}/seen`, await token(admin), 'PUT', {
      sequence: '9999999999999999999',
    })
    assert.deepEqual([huge.status, huge.json?.code], [422, 'invalid_request'])
    // Never past the newest event: that would swallow what comes next.
    const ahead = String(BigInt(next.toSequence) + 5n)
    const refused = await call(`/api/v1/projects/${seed.projectId}/seen`, await token(admin), 'PUT', {
      sequence: ahead,
    })
    assert.deepEqual([refused.status, refused.json?.code], [422, 'invalid_request'])
    assert.equal(await markSeen(admin, seed.projectId, next.toSequence), 204)
    const empty = await updatesOf(admin, seed.projectId)
    assert.deepEqual([empty.noted, empty.more, empty.fromSequence], [[], false, next.toSequence])
    // Each member's mark is their own.
    assert.equal((await updatesOf(editor, seed.projectId)).fromSequence, null)
  })

  it('reads a bounded window and says more lie after it; the next window starts where the shown one ended', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    for (const n of [1, 2, 3]) await note(editor, seed.projectId, `Finding ${String(n)}.`)
    const window = (limit: number) =>
      withActor(pool, admin, 'read', async (c) => {
        const { rows } = await c.query<{ u: Record<string, unknown> }>('SELECT sophia.project_updates($1,$2) AS u', [
          seed.projectId,
          limit,
        ])
        return parseProjectUpdates(rows[0]?.u)
      })
    const first = await window(2)
    assert.equal(first.more, true)
    assert.equal(first.toSequence, String(2))
    assert.equal(await markSeen(admin, seed.projectId, first.toSequence), 204)
    const second = await window(2)
    assert.equal(second.fromSequence, first.toSequence)
    assert.ok(BigInt(second.toSequence) > BigInt(first.toSequence))
  })

  it('lists nothing withdrawn or superseded since, so it is in no count; another person’s private event is never read', async () => {
    const [admin, editor, other] = [randomUUID(), randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor, other] })
    const gone = await note(editor, seed.projectId, 'A finding later withdrawn.')
    const stays = await note(editor, seed.projectId, 'A finding that stays.')
    const report = await made(seed, admin, 'Withdrawn study')
    const path = `/api/v1/projects/${seed.projectId}/mission/entries/${String(gone.entryId)}/withdrawal`
    const preview = parseMissionWithdrawalPreview((await call(path, await token(editor))).json)
    const withdrawn = await call(path, await token(editor), 'POST', shownReach(preview), true)
    assert.equal(withdrawn.status, 202, JSON.stringify(withdrawn.json))
    // The report's source made unreadable (as a withdrawal of its source leaves it).
    await asOwner(`UPDATE sophia.source_objects SET state='deleted', eligible=false WHERE project_id=$1 AND id=$2`, [
      seed.projectId,
      report.source,
    ])
    const u = await updatesOf(admin, seed.projectId)
    assert.deepEqual(
      u.noted.map((n) => n.entryId),
      [stays.entryId],
    )
    assert.ok(!JSON.stringify(u).includes('later withdrawn'))
    assert.deepEqual(u.made, [])
    // An event private to someone else (visibility_owner) is not read by this member; its owner reads it.
    await asOwner(`UPDATE sophia.project_events SET visibility_owner=$3 WHERE project_id=$1 AND entity_id=$2`, [
      seed.projectId,
      stays.entryId,
      other,
    ])
    assert.deepEqual((await updatesOf(admin, seed.projectId)).noted, [])
    assert.deepEqual(
      (await updatesOf(other, seed.projectId)).noted.map((n) => n.entryId),
      [stays.entryId],
    )
  })

  it('lists a report’s current version only, and reads no private event to say who asked for it', async () => {
    const [admin, editor, asker] = [randomUUID(), randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor, asker] })
    await asOwner(`INSERT INTO sophia.actor_profiles(actor_id, display_name) VALUES ($1, 'Ari Asker')`, [asker])
    const first = await made(seed, asker, 'Door study')
    const second = await made(seed, asker, 'Door study', { artifact: first.artifact, version: first.version })
    const u = await updatesOf(admin, seed.projectId)
    assert.deepEqual(
      u.made.map((m) => [m.artifactVersionId, m.versionNumber, m.askedBy]),
      [[second.version, 2, asker]],
    )
    assert.equal(u.names[asker], 'Ari Asker')
    // The admitting event is made private to the editor: the admin no longer reads who asked, nor their name.
    await asOwner(
      `UPDATE sophia.project_events SET visibility_owner=$3
        WHERE project_id=$1 AND entity_id=$2 AND type='native_task.admitted'`,
      [seed.projectId, second.job, editor],
    )
    const hidden = await updatesOf(admin, seed.projectId)
    assert.deepEqual(
      hidden.made.map((m) => [m.artifactVersionId, m.askedBy]),
      [[second.version, null]],
    )
    assert.equal(hidden.names[asker], undefined)
    assert.equal((await updatesOf(editor, seed.projectId)).made[0]?.askedBy, asker)
  })

  it('lists a report whose rendition settled at its current version, with who asked for the report', async () => {
    const [admin, asker] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [asker] })
    const report = await made(seed, asker, 'Venue study')
    const pdf = await rendition(seed, report.artifact, report.version, 2)
    const u = await updatesOf(admin, seed.projectId)
    assert.deepEqual(
      u.made.map((m) => [m.artifactId, m.artifactVersionId, m.versionNumber, m.askedBy]),
      [[report.artifact, pdf, 2, asker]],
    )
    // A window holding only a later rendition still lists the report, at its newest version; the renderer asked for
    // nothing, and the asking event is not in this window.
    assert.equal(await markSeen(admin, seed.projectId, u.toSequence), 204)
    const later = await rendition(seed, report.artifact, pdf, 3)
    const next = await updatesOf(admin, seed.projectId)
    assert.deepEqual(
      next.made.map((m) => [m.artifactVersionId, m.versionNumber, m.askedBy]),
      [[later, 3, null]],
    )
  })

  it('still reads an archived project to its members, who can mark it seen; the mark is theirs alone', async () => {
    const [admin, viewer] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, viewers: [viewer] })
    await note(admin, seed.projectId, 'Wrapped up.')
    await asOwner(`UPDATE sophia.projects SET archived_at=now() WHERE id=$1`, [seed.projectId])
    const u = await updatesOf(viewer, seed.projectId)
    assert.equal(u.noted.length, 1)
    assert.equal(await markSeen(viewer, seed.projectId, u.toSequence), 204)
    assert.equal((await updatesOf(viewer, seed.projectId)).noted.length, 0)
    assert.equal((await updatesOf(admin, seed.projectId)).noted.length, 1)
  })

  it('leaves a decision the work board waits on where it is: seen is not an answer', async () => {
    const admin = randomUUID()
    const seed = await seedProject(db.ownerUrl, { admin })
    const [plan, work, decisionId] = [randomUUID(), randomUUID(), randomUUID()]
    await asOwner(
      `INSERT INTO sophia.work_plans(project_id,id,goal_id,goal_revision,criteria_ref,mission_revision,recipe,route,work_id,
         assignment_id,source_ids,manifest_source_id,definition,allowance_usd,proposed_by,decision_id)
       VALUES($1,$2,$3,1,'c1',1,'sophia-source-review-v1','paperclip',$4,$5,ARRAY[$6]::uuid[],$6,'{}',0.5,$7,$8)`,
      [seed.projectId, plan, seed.goalId, work, randomUUID(), seed.sourceId, admin, decisionId],
    )
    await asOwner(
      `INSERT INTO sophia.work_decisions(project_id,id,kind,plan_id,plan_revision,work_id,question,decider_id,choices,
         expires_at) VALUES($1,$2,'plan_admission',$3,1,$4,'Admit the plan?',$5,'[{"id":"accept"}]',now()+interval '1 hour')`,
      [seed.projectId, decisionId, plan, work, admin],
    )
    await note(admin, seed.projectId, 'Something changed.')
    const u = await updatesOf(admin, seed.projectId)
    assert.equal(await markSeen(admin, seed.projectId, u.toSequence), 204)
    const needs = parseNeedList((await call('/api/v1/me/needs', await token(admin))).json)
    assert.deepEqual(
      needs.needs.map((n) => n.ref.id),
      [decisionId],
    )
  })
})
