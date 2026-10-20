// A project's human tasks (A39, docs/handoffs/FND-C5-HUMAN-TASKS-attempt-1.md, FND-C5), through the real app on
// PostgreSQL as the restricted API role (level: sql-run), every answer read with the generated parser: D-TASKS's every
// role cell; compare-and-set, concurrency, once-per-key replay and key conflicts; a removed member; the origin as a link
// decided for each reader on each read (published, private, ineligible, erased, replayed) with no copy of a source's
// words, hash or title anywhere; one event per act and no other authority row moved.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ProjectTask } from '@sophia/contracts'
import { parseActivityPage, parseProjectTask, parseProjectTaskList } from '@sophia/contracts/validate'
import { createPool, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance

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

type Method = 'GET' | 'POST' | 'PUT'

async function call(sub: string, method: Method, url: string, o: { body?: unknown; key?: string } = {}) {
  const res = await app.inject({
    method,
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

const tasks = (p: string) => `/api/v1/projects/${p}/tasks`

async function create(sub: string, p: string, body: Record<string, unknown>, key: string = randomUUID()) {
  return call(sub, 'POST', tasks(p), { body, key })
}

async function created(sub: string, p: string, body: Record<string, unknown>): Promise<ProjectTask> {
  const res = await create(sub, p, body)
  assert.equal(res.status, 201, res.raw)
  return parseProjectTask(res.json)
}

const setOwner = (sub: string, p: string, t: ProjectTask | string, ownerId: string | null, expected: number) =>
  call(sub, 'PUT', `${tasks(p)}/${typeof t === 'string' ? t : t.taskId}/owner`, {
    body: { ownerId, expectedRevision: expected },
  })

const done = (sub: string, p: string, t: ProjectTask | string, expected: number, key: string = randomUUID()) =>
  call(sub, 'POST', `${tasks(p)}/${typeof t === 'string' ? t : t.taskId}/done`, {
    body: { expectedRevision: expected },
    key,
  })

async function read(sub: string, p: string, id: string): Promise<ProjectTask> {
  const res = await call(sub, 'GET', `${tasks(p)}/${id}`)
  assert.equal(res.status, 200, res.raw)
  return parseProjectTask(res.json)
}

async function list(sub: string, p: string, cursor?: string) {
  const res = await call(sub, 'GET', `${tasks(p)}${cursor ? `?cursor=${cursor}` : ''}`)
  assert.equal(res.status, 200, res.raw)
  return parseProjectTaskList(res.json)
}

async function reportTasks(sub: string, artifactId: string) {
  const res = await call(sub, 'GET', `/api/v1/artifacts/${artifactId}/tasks`)
  assert.equal(res.status, 200, res.raw)
  return parseProjectTaskList(res.json)
}

/** A Markdown report of the project with published versions (the last stable), each its own source, kept by `by`. */
async function report(seed: { projectId: string; goalId: string }, by: string, title: string, texts: string[]) {
  const [artifact] = await owner<{ id: string }>(
    `INSERT INTO sophia.artifacts(project_id,title,format) VALUES($1,$2,'markdown') RETURNING id`,
    [seed.projectId, title],
  )
  assert.ok(artifact)
  const versions: { id: string; sourceId: string; sha256: string }[] = []
  for (const [i, text] of texts.entries()) {
    const [s] = await owner<{ id: string; sha256: string }>(
      `SELECT (s).id, (s).sha256 FROM (SELECT sophia.put_text_source($1,$2,'text/markdown',$3) AS s) x`,
      [seed.projectId, by, text],
    )
    assert.ok(s)
    const [v] = await owner<{ id: string }>(
      `INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,
         authority_epoch,state,version_number) VALUES($1,$2,$3,$4,$5,$6,1,1,$7,$8) RETURNING id`,
      [
        seed.projectId,
        artifact.id,
        versions.at(-1)?.id ?? null,
        s.id,
        s.sha256,
        seed.goalId,
        i === texts.length - 1 ? 'stable' : 'superseded',
        i + 1,
      ],
    )
    assert.ok(v)
    versions.push({ id: v.id, sourceId: s.id, sha256: s.sha256 })
  }
  await owner(`UPDATE sophia.artifacts SET stable_version_id=$2 WHERE id=$1`, [artifact.id, versions.at(-1)?.id])
  return { artifactId: artifact.id, versions }
}

const at = (artifactId: string, versionId: string, block = 3, word = 2, count = 4) => ({
  artifactId,
  versionId,
  block,
  word,
  count,
})

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

describe('project human tasks (A39, D-TASKS)', () => {
  it('lets editors and admins create, claim, assign, reassign, release and finish; a viewer reads and finishes only their own', async () => {
    const [admin, editor, viewer, other, outsider] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ]
    NAMES.set(editor, 'Marco Editor')
    const { projectId: p } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer, other] })
    await seedProject(db.ownerUrl, { admin: outsider })
    // Create: an editor and an admin; never a viewer or someone outside.
    const t = await created(editor, p, { title: 'Check the March figure' })
    assert.deepEqual([t.state, t.revision, t.ownerId, t.origin, t.createdBy], ['open', 1, null, null, editor])
    assert.equal(t.createdByName, 'Marco Editor', 'the current display name, never an address')
    assert.ok((await created(admin, p, { title: 'Book the room', ownerId: viewer })).ownerId === viewer)
    assert.equal((await create(viewer, p, { title: 'Mine' })).status, 403)
    assert.equal((await create(outsider, p, { title: 'Theirs' })).status, 403)
    // Assign, reassign, claim, release: editors and admins only; the owner an active member of any role.
    assert.equal((await setOwner(viewer, p, t, viewer, 1)).status, 403, 'a viewer never claims')
    let now = parseProjectTask((await setOwner(editor, p, t, viewer, 1)).json)
    assert.deepEqual([now.ownerId, now.revision], [viewer, 2])
    now = parseProjectTask((await setOwner(admin, p, t, other, 2)).json)
    assert.equal(now.ownerId, other)
    assert.equal((await setOwner(other, p, t, null, 3)).status, 403, 'a viewer never releases')
    now = parseProjectTask((await setOwner(editor, p, t, editor, 3)).json)
    assert.equal(now.ownerId, editor, 'an editor claims')
    now = parseProjectTask((await setOwner(editor, p, t, null, 4)).json)
    assert.deepEqual([now.ownerId, now.revision], [null, 5])
    const notMember = await setOwner(editor, p, t, outsider, 5)
    assert.deepEqual([notMember.status, notMember.json?.code], [422, 'invalid_request'])
    // Done: a viewer only on the task explicitly theirs; not an unassigned one, not someone else's.
    assert.equal((await done(viewer, p, t, 5)).status, 403, 'unassigned')
    now = parseProjectTask((await setOwner(editor, p, t, viewer, 5)).json)
    assert.equal((await done(other, p, t, 6)).status, 403, "someone else's")
    const finished = await done(viewer, p, t, 6)
    assert.equal(finished.status, 200, finished.raw)
    const doneTask = parseProjectTask(finished.json)
    assert.deepEqual([doneTask.state, doneTask.doneBy, doneTask.revision], ['done', viewer, 7])
    // An editor finishes an unassigned task and someone else's.
    const u = await created(admin, p, { title: 'Unassigned' })
    assert.equal((await done(editor, p, u, 1)).status, 200)
    const theirs = await created(admin, p, { title: 'For the other viewer', ownerId: other })
    assert.equal((await done(admin, p, theirs, 1)).status, 200)
    // Reads: every member; nobody outside; an unknown task is 404.
    assert.equal((await list(viewer, p)).tasks.length, 4)
    assert.equal((await call(outsider, 'GET', tasks(p))).status, 403)
    assert.equal((await call(outsider, 'GET', `${tasks(p)}/${t.taskId}`)).status, 403)
    // Unknown: the API's not_found (422, as every not_found here).
    const unknown = await call(viewer, 'GET', `${tasks(p)}/${randomUUID()}`)
    assert.deepEqual([unknown.status, unknown.json?.code], [422, 'not_found'])
    assert.equal((await call(viewer, 'GET', tasks(randomUUID()))).status, 403)
  })

  it('refuses a moved revision (409, nothing changed), lets one of two concurrent assignments win, and answers a key once', async () => {
    const [admin, editor, viewer] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId: p } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const t = await created(editor, p, { title: 'Call the venue' })
    const stale = await setOwner(editor, p, t, viewer, 7)
    assert.deepEqual([stale.status, stale.json?.code], [409, 'stale_revision'])
    assert.equal((await read(viewer, p, t.taskId)).revision, 1, 'nothing changed')
    const both = await Promise.all([setOwner(editor, p, t, viewer, 1), setOwner(admin, p, t, editor, 1)])
    assert.deepEqual(
      both.map((r) => r.status).toSorted((x, y) => x - y),
      [200, 409],
    )
    // Create once per key: the same request answers the same task; another request under the key is a conflict.
    const key = randomUUID()
    const first = await create(editor, p, { title: 'Order chairs' }, key)
    const again = await create(editor, p, { title: 'Order chairs' }, key)
    assert.deepEqual([first.status, again.status], [201, 201])
    assert.equal(parseProjectTask(again.json).taskId, parseProjectTask(first.json).taskId)
    const reused = await create(editor, p, { title: 'Order tables' }, key)
    assert.deepEqual([reused.status, reused.json?.code], [409, 'idempotency_conflict'])
    // Done once per key; done is terminal: another key, a stale revision, or an owner change are refused.
    const d = await created(editor, p, { title: 'Send the invoice', ownerId: viewer })
    const dk = randomUUID()
    assert.equal((await done(viewer, p, d, 1, dk)).status, 200)
    const replay = await done(viewer, p, d, 1, dk)
    assert.deepEqual([replay.status, parseProjectTask(replay.json).revision], [200, 2])
    const twice = await done(editor, p, d, 2)
    assert.deepEqual([twice.status, twice.json?.code], [409, 'invalid_state'])
    const moved = await done(editor, p, d, 1)
    assert.deepEqual([moved.status, moved.json?.code], [409, 'stale_revision'])
    const reown = await setOwner(editor, p, d, editor, 2)
    assert.deepEqual([reown.status, reown.json?.code], [409, 'invalid_state'])
    // A Done against a revision from before a reassignment is stale.
    const r = await created(editor, p, { title: 'Reassigned meanwhile', ownerId: viewer })
    await setOwner(editor, p, r, editor, 1)
    assert.equal((await done(editor, p, r, 1)).status, 409)
  })

  it('denies a removed member everything, keeps their task readable and reassignable', async () => {
    const [admin, editor, leaving] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId: p } = await seedProject(db.ownerUrl, { admin, editors: [editor, leaving] })
    const theirs = await created(leaving, p, { title: 'Their task', ownerId: leaving })
    const out = await call(admin, 'POST', `/api/v1/projects/${p}/members/${leaving}/removal`, {
      body: {},
      key: randomUUID(),
    })
    assert.equal(out.status, 200, out.raw)
    assert.equal((await call(leaving, 'GET', tasks(p))).status, 403)
    assert.equal((await done(leaving, p, theirs, 1)).status, 403)
    assert.equal((await create(leaving, p, { title: 'More' })).status, 403)
    const seen = await read(editor, p, theirs.taskId)
    assert.equal(seen.ownerId, leaving, 'still theirs, and shown as a former member')
    assert.equal((await setOwner(editor, p, theirs, leaving, 1)).status, 422, 'never assigned again to a former member')
    assert.equal(parseProjectTask((await setOwner(editor, p, theirs, editor, 1)).json).ownerId, editor)
  })

  it('links a published passage only when this person may read its source; never a forged, foreign or candidate version', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const p = seed.projectId
    const other = await seedProject(db.ownerUrl, { admin })
    const keeper = randomUUID() // a source's keeper who is nobody's member: no one reads it as its owner
    const r = await report(seed, keeper, 'Kiosk pilot', ['# One\nold words', '# Two\nnew words'])
    const [v1, v2] = r.versions
    assert.ok(v1 && v2)
    // A superseded published version is a valid origin.
    const t1 = await created(editor, p, { title: 'Check the first version', origin: at(r.artifactId, v1.id) })
    assert.deepEqual(t1.origin, {
      available: true,
      artifactId: r.artifactId,
      versionId: v1.id,
      versionNumber: 1,
      title: 'Kiosk pilot',
      at: { block: 3, word: 2, count: 4 },
    })
    const refused = async (origin: unknown, why: string) => {
      const res = await create(editor, p, { title: 'x', origin })
      assert.equal(res.status, 422, `${why}: ${res.raw}`)
    }
    // Another project's report, the tuple crossed, an unknown version, a candidate.
    const foreign = await report(other, keeper, 'Elsewhere', ['# F\nfar'])
    await refused(at(foreign.artifactId, foreign.versions[0]?.id ?? ''), 'another project')
    await refused(at(r.artifactId, foreign.versions[0]?.id ?? ''), 'a version of another report')
    await refused(at(r.artifactId, randomUUID()), 'unknown')
    const [cand] = await owner<{ id: string }>(
      `INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,
         authority_epoch,state,version_number) VALUES($1,$2,$3,$4,$5,$6,1,1,'candidate',3) RETURNING id`,
      [p, r.artifactId, v2.id, v2.sourceId, v2.sha256, seed.goalId],
    )
    await refused(at(r.artifactId, cand?.id ?? ''), 'a candidate')
    // The place is numbers in their bounds; a quote is never accepted.
    await refused({ ...at(r.artifactId, v2.id), count: 61 }, 'count')
    await refused({ ...at(r.artifactId, v2.id), block: 10000 }, 'block')
    await refused({ ...at(r.artifactId, v2.id), quote: 'old words' }, 'a quote')
    await refused({ ...at(r.artifactId, v2.id), block: '3' }, 'a string')
  })

  it('decides the origin for each reader on each read and replay: private, ineligible and erased read as unavailable, with no copy of the source anywhere', async () => {
    const [admin, editor, viewer] = [randomUUID(), randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const p = seed.projectId
    const WORDS = 'The vendor quoted 9,400 for the kiosk.'
    // The editor's own private report: theirs to link; nobody else's to see.
    const mine = await report(seed, editor, 'Private draft', [`# Costs\n${WORDS}`])
    const mv = mine.versions[0]
    assert.ok(mv)
    await owner(`UPDATE sophia.source_objects SET scope='private' WHERE id=$1`, [mv.sourceId])
    assert.equal((await create(admin, p, { title: 'x', origin: at(mine.artifactId, mv.id) })).status, 422)
    const key = randomUUID()
    const res = await create(editor, p, { title: 'Ask about the quote', origin: at(mine.artifactId, mv.id) }, key)
    assert.equal(res.status, 201, res.raw)
    const priv = parseProjectTask(res.json)
    assert.equal(priv.origin?.available, true, "available to the source's owner")
    for (const reader of [viewer, admin]) {
      assert.deepEqual((await read(reader, p, priv.taskId)).origin, { available: false })
      assert.deepEqual((await list(reader, p)).tasks.find((x) => x.taskId === priv.taskId)?.origin, {
        available: false,
      })
      assert.deepEqual((await reportTasks(reader, mine.artifactId)).tasks, [], 'not listed under the report')
      assert.equal((await read(reader, p, priv.taskId)).title, 'Ask about the quote', 'the task itself stays visible')
    }
    assert.equal((await reportTasks(editor, mine.artifactId)).tasks.length, 1)
    // A project report, later made ineligible: unavailable to all who don't own its source.
    const shared = await report(seed, randomUUID(), 'Shared survey', [`# Birds\n${WORDS}`])
    const sv = shared.versions[0]
    assert.ok(sv)
    const s = await created(editor, p, { title: 'Recount the birds', origin: at(shared.artifactId, sv.id) })
    assert.equal((await read(viewer, p, s.taskId)).origin?.available, true)
    await owner(`UPDATE sophia.source_objects SET eligible=false WHERE id=$1`, [sv.sourceId])
    assert.deepEqual((await read(viewer, p, s.taskId)).origin, { available: false })
    assert.deepEqual((await read(editor, p, s.taskId)).origin, { available: false })
    // Erased (0041's mission_erase_source): unavailable to everyone, its owner too, and a replay never resurrects it.
    await owner(`SELECT sophia.mission_erase_source($1,$2)`, [p, mv.sourceId])
    assert.deepEqual((await read(editor, p, priv.taskId)).origin, { available: false })
    const replay = await create(editor, p, { title: 'Ask about the quote', origin: at(mine.artifactId, mv.id) }, key)
    assert.equal(replay.status, 201, replay.raw)
    assert.deepEqual(parseProjectTask(replay.json).origin, { available: false })
    assert.equal(parseProjectTask(replay.json).taskId, priv.taskId)
    // No copy of a source's words, hash or the report's title in any task, request, receipt or event row.
    const rows = await owner<{ text: string }>(
      `SELECT to_jsonb(t)::text AS text FROM sophia.project_tasks t WHERE project_id=$1
       UNION ALL SELECT to_jsonb(r)::text FROM sophia.project_task_requests r WHERE project_id=$1
       UNION ALL SELECT to_jsonb(e)::text FROM sophia.project_events e WHERE project_id=$1 AND entity_type='project_task'`,
      [p],
    )
    assert.ok(rows.length >= 6)
    for (const { text } of rows) {
      for (const secret of [WORDS, '9,400', mv.sha256, sv.sha256, 'Private draft', 'Shared survey']) {
        assert.ok(!text.includes(secret), `a copy of «${secret}» in ${text}`)
      }
    }
  })

  it('records one fixed event per act, listed in the activity, and moves no goal, decision, work, allowance, command or outbox row', async () => {
    const [admin, editor, viewer] = [randomUUID(), randomUUID(), randomUUID()]
    const { projectId: p } = await seedProject(db.ownerUrl, { admin, editors: [editor], viewers: [viewer] })
    const authority = async () =>
      (
        await owner<{ s: string }>(
          `SELECT concat_ws('|',
             (SELECT md5(coalesce(string_agg(to_jsonb(g)::text, ',' ORDER BY g.id), '')) FROM sophia.goals g WHERE project_id=$1),
             (SELECT count(*) FROM sophia.decisions WHERE project_id=$1),
             (SELECT count(*) FROM sophia.work_items WHERE project_id=$1),
             (SELECT count(*) FROM sophia.work_assignments WHERE project_id=$1),
             (SELECT count(*) FROM sophia.research_allowances WHERE project_id=$1),
             (SELECT count(*) FROM sophia.commands WHERE project_id=$1),
             (SELECT count(*) FROM sophia.outbox WHERE project_id=$1),
             (SELECT md5(mission_revision::text||eligibility_revision::text) FROM sophia.projects WHERE id=$1)) AS s`,
          [p],
        )
      )[0]?.s
    const beforeAll = await authority()
    const t = await created(editor, p, { title: 'Water the plants' })
    await setOwner(editor, p, t, viewer, 1)
    assert.equal((await done(viewer, p, t, 2)).status, 200)
    assert.equal(await authority(), beforeAll, 'no authority row moved')
    const events = await owner<{
      type: string
      summary_code: string
      actor_id: string
      entity_id: string
      entity_revision: string
      references_json: unknown
    }>(
      `SELECT type, summary_code, actor_id, entity_id, entity_revision, references_json FROM sophia.project_events
        WHERE project_id=$1 AND entity_type='project_task' ORDER BY sequence`,
      [p],
    )
    assert.deepEqual(
      events.map((e) => [e.type, e.summary_code, e.actor_id, e.entity_id, Number(e.entity_revision)]),
      [
        ['project.task_created', 'task.created', editor, t.taskId, 1],
        ['project.task_owner_set', 'task.owner_set', editor, t.taskId, 2],
        ['project.task_done', 'task.done', viewer, t.taskId, 3],
      ],
    )
    assert.ok(events.every((e) => JSON.stringify(e.references_json) === '[]'))
    // A replay, a refused act and the same owner again emit nothing.
    await setOwner(editor, p, t, viewer, 3)
    assert.equal((await done(editor, p, t, 3)).status, 409)
    assert.equal(
      (await owner(`SELECT 1 FROM sophia.project_events WHERE project_id=$1 AND entity_type='project_task'`, [p]))
        .length,
      3,
    )
    const activity = await call(admin, 'GET', `/api/v1/projects/${p}/activity`)
    assert.equal(activity.status, 200, activity.raw)
    const codes = parseActivityPage(activity.json).entries.map((e) => e.summaryCode)
    for (const code of ['task.created', 'task.owner_set', 'task.done']) assert.ok(codes.includes(code), code)
  })

  it('pages open tasks first, newest first, 50 a page, each once', async () => {
    const [admin] = [randomUUID()]
    const { projectId: p } = await seedProject(db.ownerUrl, { admin })
    const ids: string[] = []
    for (let i = 0; i < 55; i += 1) ids.push((await created(admin, p, { title: `Task ${String(i)}` })).taskId)
    for (const id of ids.slice(0, 3)) assert.equal((await done(admin, p, id, 1)).status, 200)
    const first = await list(admin, p)
    assert.equal(first.tasks.length, 50)
    assert.ok(first.next)
    const second = await list(admin, p, first.next)
    assert.equal(second.next, null)
    const all = [...first.tasks, ...second.tasks]
    assert.equal(new Set(all.map((t) => t.taskId)).size, 55)
    assert.deepEqual(
      all.slice(-3).map((t) => t.state),
      ['done', 'done', 'done'],
    )
    assert.equal((await call(admin, 'GET', `${tasks(p)}?cursor=abc`)).status, 422)
  })

  it('grants the API role only reads of tasks and the three writes; no definer is callable but those; readiness needs 0074', async () => {
    const [g] = await owner<Record<string, boolean>>(
      `SELECT has_table_privilege('sophia_api','sophia.project_tasks','SELECT') AS tasks_read,
              has_table_privilege('sophia_api','sophia.project_tasks','INSERT,UPDATE,DELETE') AS tasks_write,
              has_table_privilege('sophia_api','sophia.project_task_requests','SELECT,INSERT,UPDATE,DELETE') AS requests,
              has_function_privilege('sophia_api','sophia.create_project_task(uuid,text,jsonb)','EXECUTE') AS creates,
              has_function_privilege('sophia_api','sophia.set_project_task_owner(uuid,uuid,uuid,bigint)','EXECUTE') AS assigns,
              has_function_privilege('sophia_api','sophia.finish_project_task(uuid,uuid,text,bigint)','EXECUTE') AS finishes,
              has_function_privilege('sophia_api','sophia.task_request(uuid,text,uuid,text,jsonb)','EXECUTE') AS helper,
              has_function_privilege('public','sophia.create_project_task(uuid,text,jsonb)','EXECUTE') AS public_exec,
              (SELECT relrowsecurity FROM pg_class WHERE oid='sophia.project_tasks'::regclass) AS rls`,
    )
    assert.deepEqual(g, {
      tasks_read: true,
      tasks_write: false,
      requests: false,
      creates: true,
      assigns: true,
      finishes: true,
      helper: false,
      public_exec: false,
      rls: true,
    })
    // The API's own role reads a project's tasks only as a member.
    const n = await withActor(
      pool,
      randomUUID(),
      'read',
      async (c) => (await c.query(`SELECT 1 FROM sophia.project_tasks`)).rowCount,
    )
    assert.equal(n, 0)
    const ready = await app.inject({ method: 'GET', url: '/ready' })
    assert.equal(ready.statusCode, 200, ready.body)
  })
})

/** A restricted API connection (the application role) acting as `actor` inside one open transaction. */
async function actorTx(actor: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: db.apiUrl })
  await c.connect()
  await c.query('BEGIN')
  await c.query("SELECT set_config('sophia.actor_id', $1, true)", [actor])
  return c
}

/** Waits until some backend is blocked on a lock: the barrier is the lock queue, never a sleep. */
async function blockedOnLock(pid: number): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const [w] = await owner<{ n: number }>(
      `SELECT count(*)::int n FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'`,
      [pid],
    )
    if (w?.n === 1) return
    await new Promise((r) => setTimeout(r, 10))
  }
  assert.fail('the Done never waited for the project lock')
}

type Revoke = (c: pg.Client, p: string, viewer: string) => Promise<unknown>
const LEAVE: Revoke = (c, p) => c.query('SELECT sophia.leave_project($1,$2)', [p, randomUUID()])
const REMOVE: Revoke = (c, p, viewer) => c.query('SELECT sophia.remove_member($1,$2,$3)', [p, viewer, randomUUID()])

async function taskRows(p: string) {
  return owner<{ t: string; e: number; r: number }>(
    `SELECT (SELECT json_agg(t ORDER BY id)::text FROM sophia.project_tasks t WHERE project_id=$1) t,
            (SELECT count(*)::int FROM sophia.project_events WHERE project_id=$1 AND type LIKE 'project.task%') e,
            (SELECT count(*)::int FROM sophia.project_task_requests WHERE project_id=$1) r`,
    [p],
  )
}

async function raceDone(revoke: Revoke, revokerIsViewer: boolean) {
  const [admin, viewer] = [randomUUID(), randomUUID()]
  const { projectId: p } = await seedProject(db.ownerUrl, { admin, viewers: [viewer] })
  // Created through the application role's SQL too, so the race needs no API admission (it runs on 0074 or 0077).
  const maker = await actorTx(admin)
  const made = await maker.query<{ r: { taskId: string } }>('SELECT sophia.create_project_task($1,$2,$3) r', [
    p,
    randomUUID(),
    { title: 'Theirs', ownerId: viewer },
  ])
  await maker.query('COMMIT')
  await maker.end()
  const t = { taskId: made.rows[0]?.r.taskId ?? '' }
  const prior = await taskRows(p)
  const revoker = await actorTx(revokerIsViewer ? viewer : admin)
  const doer = await actorTx(viewer)
  try {
    await revoke(revoker, p, viewer) // holds the project lock, membership off, not yet committed
    const [{ pid } = { pid: 0 }] = (await doer.query<{ pid: number }>('SELECT pg_backend_pid() pid')).rows
    const finishing = doer.query('SELECT sophia.finish_project_task($1,$2,$3,$4)', [p, t.taskId, randomUUID(), 1]).then(
      () => 'committed',
      (e: unknown) => (e instanceof Error && 'code' in e ? String(e.code) : 'error'),
    )
    await blockedOnLock(pid)
    await revoker.query('COMMIT')
    const outcome = await finishing
    await doer.query(outcome === 'committed' ? 'COMMIT' : 'ROLLBACK')
    return { outcome, prior, later: await taskRows(p) }
  } finally {
    await revoker.end()
    await doer.end()
  }
}

/** The three Task writes as a migration defines them, to put 0074's back (0077 absent) or 0077's again. */
function taskWritesOf(migration: string): string {
  const sql = readFileSync(new URL(`../../../db/migrations/${migration}`, import.meta.url), 'utf8')
  return ['create_project_task', 'set_project_task_owner', 'finish_project_task']
    .map((name) => {
      const start = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION sophia\\.${name}\\(`))
      const end = sql.indexOf('END $$;', start) + 'END $$;'.length
      return sql.slice(start, end).replace(/^CREATE FUNCTION/, 'CREATE OR REPLACE FUNCTION')
    })
    .join('\n')
}

describe('Task revalidation (0077, FND-C50)', () => {
  it('refuses every Task write (503, nothing written) while 0077 is absent, and admits them once it is installed', async () => {
    const [admin, viewer] = [randomUUID(), randomUUID()]
    const { projectId: p } = await seedProject(db.ownerUrl, { admin, viewers: [viewer] })
    const t = await created(admin, p, { title: 'Theirs', ownerId: viewer })
    const free = await created(admin, p, { title: 'For nobody yet' })
    const fresh = buildApp({
      pool,
      verifyActor: createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET }),
    })
    const as = async (sub: string, method: Method, url: string, body: unknown) =>
      (
        await fresh.inject({
          method,
          url,
          headers: { authorization: `Bearer ${await token(sub)}`, 'idempotency-key': randomUUID() },
          payload: body as Record<string, unknown>,
        })
      ).statusCode
    const writes = async () => [
      await as(admin, 'POST', tasks(p), { title: 'More' }),
      await as(viewer, 'POST', `${tasks(p)}/${t.taskId}/done`, { expectedRevision: 1 }),
      await as(admin, 'PUT', `${tasks(p)}/${free.taskId}/owner`, { ownerId: viewer, expectedRevision: 1 }),
    ]
    try {
      await owner(taskWritesOf('0074_project_human_tasks.sql'))
      const prior = await taskRows(p)
      assert.equal((await fresh.inject({ method: 'GET', url: '/ready' })).statusCode, 503)
      assert.deepEqual(await writes(), [503, 503, 503], 'create, Done and assign refused before any write')
      assert.deepEqual(await taskRows(p), prior, 'no task, revision, event or request moved')
      assert.equal((await call(admin, 'GET', tasks(p))).status, 200, 'reads are not gated')
    } finally {
      await owner(taskWritesOf('0077_project_human_tasks_revalidation.sql'))
    }
    assert.equal((await fresh.inject({ method: 'GET', url: '/ready' })).statusCode, 200)
    assert.deepEqual(await writes(), [201, 200, 200], 'the same writes, admitted')
    await fresh.close()
  })

  it('is ready only with 0077 installed: every Task write locks first, and a new origin is Markdown', async () => {
    const ready = await app.inject({ method: 'GET', url: '/ready' })
    assert.equal(ready.statusCode, 200, ready.body)
  })

  for (const [name, revoke, self] of [
    ['leaves', LEAVE, true],
    ['is removed by an admin', REMOVE, false],
  ] as const) {
    it(`refuses an assigned viewer's Done that waited for the project lock while the viewer ${name}`, async () => {
      const { outcome, prior, later } = await raceDone(revoke, self)
      assert.equal(outcome, '42501', 'the current membership, read after the lock, is gone')
      assert.deepEqual(later, prior, 'no task revision, state, event or receipt moved')
    })
  }

  it('still lets the assigned viewer finish when the revocation comes after (reverse order), once per key', async () => {
    const [admin, viewer] = [randomUUID(), randomUUID()]
    const { projectId: p } = await seedProject(db.ownerUrl, { admin, viewers: [viewer] })
    const t = await created(admin, p, { title: 'Theirs', ownerId: viewer })
    const key = randomUUID()
    const first = await done(viewer, p, t, 1, key)
    assert.equal(first.status, 200, first.raw)
    assert.deepEqual((await done(viewer, p, t, 1, key)).json, first.json, 'the same key answers the same')
    assert.equal((await done(viewer, p, t, 1)).status, 409, 'a stale revision')
    const out = await call(admin, 'POST', `/api/v1/projects/${p}/members/${viewer}/removal`, {
      body: {},
      key: randomUUID(),
    })
    assert.equal(out.status, 200, out.raw)
    assert.equal((await done(viewer, p, t, 2, key)).status, 403, 'a replay rechecks current membership')
  })

  it('links only a Markdown report; a stored non-Markdown origin reads unavailable and its report has no task list', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const seed = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    const p = seed.projectId
    const md = await report(seed, editor, 'Markdown report', ['# One\nwords'])
    const html = await report(seed, editor, 'Not Markdown', ['# One\nwords'])
    await owner(`UPDATE sophia.artifacts SET format='html' WHERE id=$1`, [html.artifactId])
    const [hv] = html.versions
    const [mv] = md.versions
    assert.ok(hv && mv)
    const prior = await taskRows(p)
    const refused = await create(editor, p, { title: 'From HTML', origin: at(html.artifactId, hv.id) })
    assert.equal(refused.status, 422, refused.raw)
    assert.deepEqual(await taskRows(p), prior, 'nothing committed')
    const ok = await created(editor, p, { title: 'From Markdown', origin: at(md.artifactId, mv.id) })
    assert.deepEqual([ok.origin?.available, ok.origin?.versionId], [true, mv.id], 'the exact version')
    assert.equal((await reportTasks(editor, md.artifactId)).tasks.length, 1)
    // An origin stored before 0077 on a report that is not Markdown: kept, but unavailable, and not listed.
    await owner(`UPDATE sophia.artifacts SET format='html' WHERE id=$1`, [md.artifactId])
    const seen = await read(editor, p, ok.taskId)
    assert.deepEqual([seen.taskId, seen.origin?.available], [ok.taskId, false])
    assert.equal(JSON.stringify(seen).includes('words'), false, 'no copy of the source')
    const gone = await call(editor, 'GET', `/api/v1/artifacts/${md.artifactId}/tasks`)
    const unknown = await call(editor, 'GET', `/api/v1/artifacts/${randomUUID()}/tasks`)
    assert.deepEqual(
      [gone.status, gone.json?.code],
      [unknown.status, 'not_found'],
      'answered as a report that is not there',
    )
  })
})

describe('a task page cursor belongs to its project (FND-C54, finding 4319532308)', () => {
  it("refuses a cursor from another project the reader can also read (422), never using it as that list's boundary", async () => {
    const [admin] = [randomUUID()]
    const { projectId: a } = await seedProject(db.ownerUrl, { admin })
    const { projectId: b } = await seedProject(db.ownerUrl, { admin })
    for (let i = 0; i < 51; i += 1) await created(admin, a, { title: `A ${String(i)}` })
    const fromA = (await list(admin, a)).next
    assert.ok(fromA, 'a real cursor of A')
    // B's tasks are all newer than A's cursor: used as B's boundary, it would skip every one of them.
    const bIds: string[] = []
    for (let i = 0; i < 3; i += 1) bIds.push((await created(admin, b, { title: `B ${String(i)}` })).taskId)
    const crossed = await call(admin, 'GET', `${tasks(b)}?cursor=${fromA}`)
    assert.deepEqual([crossed.status, crossed.json?.code], [422, 'invalid_request'], crossed.raw)
    // B's own list is whole, and A's cursor still pages A: its next page, each task once, in order.
    assert.deepEqual(new Set((await list(admin, b)).tasks.map((t) => t.taskId)), new Set(bIds))
    const first = await list(admin, a)
    const second = await list(admin, a, fromA)
    assert.deepEqual([first.tasks.length, second.tasks.length, second.next], [50, 1, null])
    const all = [...first.tasks, ...second.tasks]
    assert.equal(new Set(all.map((t) => t.taskId)).size, 51)
    assert.deepEqual(
      all.map((t) => t.createdAt),
      all.map((t) => t.createdAt).toSorted((x, y) => y.localeCompare(x)),
      'newest first across the pages',
    )
    // A well-formed cursor naming no task of this project, and a malformed one: the same refusal.
    const forged = Buffer.from(`0.${String(Date.now() * 1000)}.${randomUUID()}`).toString('base64url')
    assert.equal((await call(admin, 'GET', `${tasks(a)}?cursor=${forged}`)).status, 422)
    assert.equal((await call(admin, 'GET', `${tasks(a)}?cursor=abc`)).status, 422)
  })
})

const encodeCursor = (flag: string, us: string, id: string) => Buffer.from(`${flag}.${us}.${id}`).toString('base64url')
const decodeCursor = (cursor: string) => Buffer.from(cursor, 'base64url').toString('utf8').split('.')

describe('a task page cursor is a boundary this list issued (FND-C66, finding 4321265115)', () => {
  it('refuses a real task id with an altered time or done flag (422); a genuine cursor pages, also after its task is done', async () => {
    const [admin, editor] = [randomUUID(), randomUUID()]
    const { projectId: p } = await seedProject(db.ownerUrl, { admin, editors: [editor] })
    for (let i = 0; i < 55; i += 1) await created(admin, p, { title: `Task ${String(i)}` })
    const first = await list(admin, p)
    assert.ok(first.next)
    const [flag, us, id] = decodeCursor(first.next)
    assert.ok(flag === '0' && us && id, 'a genuine open boundary')
    const altered = {
      timeZero: encodeCursor('0', '0', id),
      timeMax: encodeCursor('0', '9223372036854775807', id),
      doneWhileOpen: encodeCursor('1', us, id),
    }
    const outcomes: [string, number, unknown, number | null][] = []
    for (const [what, cursor] of Object.entries(altered)) {
      const res = await call(admin, 'GET', `${tasks(p)}?cursor=${cursor}`)
      const page = res.status === 200 ? parseProjectTaskList(res.json).tasks.length : null
      outcomes.push([what, res.status, res.json?.code, page])
    }
    console.log(`C66 altered-cursor witness ${JSON.stringify(outcomes)}`)
    assert.deepEqual(
      outcomes.map(([what, status, code]) => [what, status, code]),
      Object.keys(altered).map((what) => [what, 422, 'invalid_request']),
      'each altered boundary refused as unknown',
    )
    // The genuine cursor pages: the other 5, each once.
    const second = await list(admin, p, first.next)
    assert.equal(second.tasks.length, 5)
    assert.equal(new Set([...first.tasks, ...second.tasks].map((t) => t.taskId)).size, 55)
    // Its boundary task finished between the pages: the cursor it was issued as (done 0) still pages the open rest.
    assert.equal((await done(editor, p, id, 1)).status, 200)
    const stale = await call(admin, 'GET', `${tasks(p)}?cursor=${first.next}`)
    assert.equal(stale.status, 200, stale.raw)
    const rest = parseProjectTaskList(stale.json)
    assert.deepEqual(
      new Set(rest.tasks.filter((t) => t.state === 'open').map((t) => t.taskId)),
      new Set(second.tasks.map((t) => t.taskId)),
      'the same open rest',
    )
    // And a done-1 cursor naming it, now that it is done, is a boundary the list could issue: accepted.
    assert.equal((await call(admin, 'GET', `${tasks(p)}?cursor=${encodeCursor('1', us, id)}`)).status, 200)
  })

  it('keeps tie order: tasks created at one time page by id, 50 + 5, each once', async () => {
    const admin = randomUUID()
    const { projectId: p } = await seedProject(db.ownerUrl, { admin })
    for (let i = 0; i < 55; i += 1) await created(admin, p, { title: `Tie ${String(i)}` })
    await owner(`UPDATE sophia.project_tasks SET created_at = '2026-10-20T00:00:00Z' WHERE project_id = $1`, [p])
    const first = await list(admin, p)
    assert.ok(first.next)
    const second = await list(admin, p, first.next)
    const all = [...first.tasks, ...second.tasks].map((t) => t.taskId)
    assert.deepEqual([first.tasks.length, second.tasks.length, new Set(all).size], [50, 5, 55])
    assert.deepEqual(
      all,
      all.toSorted((x, y) => y.localeCompare(x)),
      'id descending at one time',
    )
  })
})
