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

/** A job id that sorts first, or last, among UUIDs: the order a query might wrongly lean on is tried both ways. */
const tail = () => randomUUID().slice(24)
const lowJob = () => `00000000-0000-4000-8000-${tail()}`
const highJob = () => `ffffffff-ffff-4fff-bfff-${tail()}`

/** A report version as its producer writes it, on its own client: the fields the producers set, nothing invented. */
interface VersionRow {
  artifact: string
  parent: string | null
  source: { id: string; sha256: string }
  number: number
  job: string
  facts: Record<string, unknown> | null
  trigger: Record<string, unknown>
}

/** The new current version: it supersedes its parent and becomes the artifact's stable version. */
async function current(c: pg.Client, seed: SeededProject, v: VersionRow): Promise<string> {
  const version = await row<{ id: string }>(
    c,
    `INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,
       authority_epoch,state,version_number,job_id,change_facts,trigger)
     VALUES($1,$2,$3,$4,$5,$6,1,1,'stable',$7,$8,$9::jsonb,$10::jsonb) RETURNING id`,
    [
      seed.projectId,
      v.artifact,
      v.parent,
      v.source.id,
      v.source.sha256,
      seed.goalId,
      v.number,
      v.job,
      v.facts === null ? null : JSON.stringify(v.facts),
      JSON.stringify(v.trigger),
    ],
  )
  if (v.parent) await c.query(`UPDATE sophia.artifact_versions SET state='superseded' WHERE id=$1`, [v.parent])
  await c.query(`UPDATE sophia.artifacts SET stable_version_id=$2 WHERE id=$1`, [v.artifact, version.id])
  return version.id
}

/** A task admitted by `asker` (its admitting event), then its result from the runtime (no member actor). */
async function admitted(c: pg.Client, seed: SeededProject, asker: string, kind: string, jobId?: string) {
  await c.query(`SELECT set_config('sophia.actor_id', $1, false)`, [asker])
  const job = await row<{ id: string }>(
    c,
    `INSERT INTO sophia.jobs(project_id,id,kind,state) VALUES($1,coalesce($2::uuid,gen_random_uuid()),$3,'succeeded')
     RETURNING id`,
    [seed.projectId, jobId ?? null, kind],
  )
  await c.query(`SELECT sophia.emit_project_event($1,'native_task.admitted','job',$2,1,$3)`, [
    seed.projectId,
    job.id,
    `native_task.${kind}`,
  ])
  await c.query(`SELECT set_config('sophia.actor_id', '', false)`)
  return job.id
}

const resultReady = (c: pg.Client, seed: SeededProject, job: string) =>
  c.query(`SELECT sophia.emit_project_event($1,'native_task.result_ready','job',$2,3,'native_task.result_ready')`, [
    seed.projectId,
    job,
  ])

/** Work on the migration owner's client, closed after. */
async function owned<T>(work: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await work(c)
  } finally {
    await c.end()
  }
}

interface Made {
  job: string
  artifact: string
  version: string
  source: { id: string; sha256: string }
  number: number
}

/**
 * A research version (0026, 0037): its task admitted by `asker`, then its result. An amendment's parent is the version
 * it replaces, and its trigger names the task it amends.
 */
const made = (seed: SeededProject, asker: string, title: string, o: { amends?: Made; job?: string } = {}) =>
  owned(async (c): Promise<Made> => {
    const job = await admitted(c, seed, asker, 'research', o.job)
    const artifact =
      o.amends?.artifact ??
      (
        await row<{ id: string }>(
          c,
          `INSERT INTO sophia.artifacts(project_id,title,format) VALUES($1,$2,'markdown') RETURNING id`,
          [seed.projectId, title],
        )
      ).id
    const source = await row<{ id: string; sha256: string }>(
      c,
      `SELECT (s).id, (s).sha256 FROM (SELECT sophia.put_text_source($1,$2,'text/markdown',$3) AS s) x`,
      [seed.projectId, asker, `# ${title} by ${job}`],
    )
    const number = (o.amends?.number ?? 0) + 1
    const trigger = { kind: 'research', taskId: job, ...(o.amends ? { amendsTaskId: o.amends.job } : {}) }
    const version = await current(c, seed, {
      artifact,
      parent: o.amends?.version ?? null,
      source,
      number,
      job,
      facts: { versionNumber: number },
      trigger,
    })
    await resultReady(c, seed, job)
    return { job, artifact, version, source, number }
  })

/** A design (scoped) edit (0041): its own task, admitted by `designer`; its parent the base; marked renditionOnly. */
const designEdit = (seed: SeededProject, base: Made, designer: string, jobId?: string) =>
  owned(async (c): Promise<Made> => {
    const job = await admitted(c, seed, designer, 'design', jobId)
    const number = base.number + 1
    const version = await current(c, seed, {
      artifact: base.artifact,
      parent: base.version,
      source: base.source,
      number,
      job,
      facts: { versionNumber: number, renditionOnly: true },
      trigger: { kind: 'design', taskId: job, mode: 'edit' },
    })
    await resultReady(c, seed, job)
    return { job, artifact: base.artifact, version, source: base.source, number }
  })

/**
 * A rendition settled (0040 research_rendition_settled): a render job, kind rendition, on the base version, whose own
 * queue admits nothing; the new version keeps the base's source, its parent the base, its trigger naming the render job
 * and the origin task; then artifact.rendition_ready. `proven: false` leaves out the render job's record.
 */
const renditionOf = (seed: SeededProject, base: Made, o: { job?: string; proven?: boolean } = {}) =>
  owned(async (c): Promise<Made> => {
    const job = await row<{ id: string }>(
      c,
      `INSERT INTO sophia.jobs(project_id,id,kind,state) VALUES($1,coalesce($2::uuid,gen_random_uuid()),'render','succeeded')
       RETURNING id`,
      [seed.projectId, o.job ?? null],
    )
    if (o.proven !== false)
      await c.query(
        `INSERT INTO sophia.render_jobs(project_id,job_id,parent_job_id,goal_id,format,language,manifest_sha256,kind,
           base_version_id) VALUES($1,$2,$3,$4,'pdf','en',$5,'rendition',$6)`,
        [seed.projectId, job.id, base.job, seed.goalId, '0'.repeat(64), base.version],
      )
    const number = base.number + 1
    const version = await current(c, seed, {
      artifact: base.artifact,
      parent: base.version,
      source: base.source,
      number,
      job: job.id,
      facts: { versionNumber: number, renditionOnly: true },
      trigger: { kind: 'rendition', taskId: base.job, renderJobId: job.id },
    })
    await c.query(
      `SELECT sophia.emit_project_event($1,'artifact.rendition_ready','artifact',$2,$3,'artifact.rendition_ready')`,
      [seed.projectId, base.artifact, number],
    )
    return { job: job.id, artifact: base.artifact, version, source: base.source, number }
  })

/** Make a task's admitting event private to `owner` (or public again with null). */
const admissionPrivateTo = (seed: SeededProject, job: string, owner: string | null) =>
  asOwner(
    `UPDATE sophia.project_events SET visibility_owner=$3 WHERE project_id=$1 AND entity_id=$2 AND type='native_task.admitted'`,
    [seed.projectId, job, owner],
  )

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
      report.source.id,
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

  for (const order of ['the older job sorting first', 'the newer job sorting first'] as const) {
    const jobs = (): [string, string] =>
      order === 'the older job sorting first' ? [lowJob(), highJob()] : [highJob(), lowJob()]

    it(`credits an amendment to its own task; a private admission there is null, never the older requester (${order})`, async () => {
      const [admin, editor, older, newer] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
      const seed = await seedProject(db.ownerUrl, { admin, editors: [editor, older, newer] })
      await asOwner(
        `INSERT INTO sophia.actor_profiles(actor_id, display_name) VALUES ($1, 'Olga Older'), ($2, 'Nils Newer')`,
        [older, newer],
      )
      const [olderJob, newerJob] = jobs()
      const first = await made(seed, older, 'Door study', { job: olderJob })
      const second = await made(seed, newer, 'Door study', { job: newerJob, amends: first })
      const u = await updatesOf(admin, seed.projectId)
      assert.deepEqual(
        u.made.map((m) => [m.artifactVersionId, m.versionNumber, m.askedBy]),
        [[second.version, 2, newer]],
      )
      assert.deepEqual([u.names[newer], u.names[older]], ['Nils Newer', undefined])
      // Its admission private to the editor: the parent and the older result, both visible, supply no one.
      await admissionPrivateTo(seed, second.job, editor)
      const hidden = await updatesOf(admin, seed.projectId)
      assert.deepEqual(
        hidden.made.map((m) => [m.artifactVersionId, m.askedBy]),
        [[second.version, null]],
      )
      assert.deepEqual([hidden.names[newer], hidden.names[older]], [undefined, undefined])
      assert.equal((await updatesOf(editor, seed.projectId)).made[0]?.askedBy, newer)
    })

    it(`credits a design edit to its own task, never its base’s requester when that is private (${order})`, async () => {
      const [admin, editor, older, designer] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
      const seed = await seedProject(db.ownerUrl, { admin, editors: [editor, older, designer] })
      const [baseJob, editJob] = jobs()
      const base = await made(seed, older, 'Venue study', { job: baseJob })
      const edit = await designEdit(seed, base, designer, editJob)
      const u = await updatesOf(admin, seed.projectId)
      assert.deepEqual(
        u.made.map((m) => [m.artifactVersionId, m.versionNumber, m.askedBy]),
        [[edit.version, 2, designer]],
      )
      // renditionOnly and a parent are no rendition proof: a private edit admission is null, not the base's requester.
      await admissionPrivateTo(seed, edit.job, editor)
      assert.equal((await updatesOf(admin, seed.projectId)).made[0]?.askedBy, null)
      assert.equal((await updatesOf(editor, seed.projectId)).made[0]?.askedBy, designer)
    })

    it(`credits a proven rendition to its origin task, private stays null, and an unproven one to no one (${order})`, async () => {
      const [admin, editor, asker] = [randomUUID(), randomUUID(), randomUUID()]
      const seed = await seedProject(db.ownerUrl, { admin, editors: [editor, asker] })
      const [baseJob, renderJob] = jobs()
      const base = await made(seed, asker, 'Door study', { job: baseJob })
      const pdf = await renditionOf(seed, base, { job: renderJob })
      const u = await updatesOf(admin, seed.projectId)
      assert.deepEqual(
        u.made.map((m) => [m.artifactId, m.artifactVersionId, m.versionNumber, m.askedBy]),
        [[base.artifact, pdf.version, 2, asker]],
      )
      // The origin task's admission private: null, with no other source of a name.
      await admissionPrivateTo(seed, base.job, editor)
      assert.equal((await updatesOf(admin, seed.projectId)).made[0]?.askedBy, null)
      assert.equal((await updatesOf(editor, seed.projectId)).made[0]?.askedBy, asker)
      await admissionPrivateTo(seed, base.job, null)
      // A rendition-shaped version with no render job's record (unproven) names no one, even with a readable parent.
      const other = await made(seed, asker, 'Room study', { job: jobs()[0] })
      const unproven = await renditionOf(seed, other, { proven: false })
      const later = await updatesOf(admin, seed.projectId)
      assert.deepEqual(
        later.made.filter((m) => m.artifactId === other.artifact).map((m) => [m.artifactVersionId, m.askedBy]),
        [[unproven.version, null]],
      )
    })
  }

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
