// SMC-M03 S1: the readers of research work and its reports (migration 0022, amendment A11), level: sql-run. No
// writer exists yet, so the rows a later release writes are made here as the table owner; every read runs on the
// non-owner sophia_api login, as a member or as the media bridge. What is read must pass the wire validators the
// Studio and the bridge use.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { parseMediaAssignmentBatch, parseNativeTaskDetail, parseSnapshot } from '@sophia/contracts/validate'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  createPool,
  mediaAssignments,
  readNativeTask,
  readSnapshot,
  startExchange,
  withActor,
  withService,
} from './index.ts'

const A = randomUUID() // admin
const E = randomUUID() // editor
const C = randomUUID() // outsider

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Client

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
})
after(async () => {
  await owner.end()
  await pool.end()
  await db.drop()
})

const one = async <T>(sql: string, params: unknown[]): Promise<T> => (await owner.query(sql, params)).rows[0] as T

async function rawError(sql: string, params: unknown[]): Promise<string> {
  try {
    await owner.query(sql, params)
    return 'resolved'
  } catch (err) {
    return String(err)
  }
}

const textSource = async (projectId: string, mime: string, body: string) =>
  one<{ id: string; sha256: string; byte_length: string }>(
    `SELECT (s).id, (s).sha256, (s).byte_length FROM (SELECT sophia.put_text_source($1, $2, $3, $4) AS s) x`,
    [projectId, A, mime, body],
  )

/** One task job with its attempt and command, as admission writes them (0012 admit_native_task's shape). */
async function task(projectId: string, goalId: string, kind: string) {
  const instruction = await textSource(projectId, 'text/plain', `Research ${kind}`)
  const context = await textSource(projectId, 'application/json', '{"sources":[]}')
  const attempt = await one<{ id: string }>(
    `INSERT INTO sophia.work_attempts(project_id,goal_id,goal_revision,authority_epoch,context_source_id,state)
     VALUES($1,$2,1,1,$3,'admitted') RETURNING id`,
    [projectId, goalId, context.id],
  )
  const command = await one<{ id: string }>(
    `INSERT INTO sophia.commands(project_id,actor_id,goal_id,goal_revision,authority_epoch,kind,idempotency_key,
       semantic_request,body_source_id,state)
     VALUES($1,$2,$3,1,1,'native_task',$4,'{}',$5,'admitted') RETURNING id`,
    [projectId, E, goalId, randomUUID(), instruction.id],
  )
  const job = await one<{ id: string }>(
    `INSERT INTO sophia.jobs(project_id,kind,input_source_id,command_id,attempt_id,state)
     VALUES($1,$2,$3,$4,$5,'pending') RETURNING id`,
    [projectId, kind, context.id, command.id, attempt.id],
  )
  return { jobId: job.id, attemptId: attempt.id, commandId: command.id }
}

/** A published report: v1 in Markdown written by `jobId`, stable, with its PDF rendered by a child job. */
async function report(projectId: string, goalId: string, jobId: string) {
  const markdown = await textSource(projectId, 'text/markdown', '# Hosts\n\nRender on a sandboxed host.')
  const pdf = await textSource(projectId, 'application/pdf', '%PDF-1.7 stand-in')
  const artifact = await one<{ id: string }>(
    `INSERT INTO sophia.artifacts(project_id,title,format,summary) VALUES($1,'Sandboxed PDF rendering','markdown',
       'Compares managed hosts for the PDF renderer.') RETURNING id`,
    [projectId],
  )
  const render = await one<{ id: string }>(
    `INSERT INTO sophia.jobs(project_id,kind,parent_job_id,state) VALUES($1,'render',$2,'succeeded') RETURNING id`,
    [projectId, jobId],
  )
  await owner.query('BEGIN')
  const version = await one<{ id: string }>(
    `INSERT INTO sophia.artifact_versions(project_id,artifact_id,source_id,source_hash,goal_id,goal_revision,
       authority_epoch,state,version_number,job_id,limitations)
     VALUES($1,$2,$3,$4,$5,1,1,'stable',1,$6,'{"One source could not be read."}') RETURNING id`,
    [projectId, artifact.id, markdown.id, markdown.sha256, goalId, jobId],
  )
  await owner.query(`UPDATE sophia.artifacts SET stable_version_id=$3 WHERE project_id=$1 AND id=$2`, [
    projectId,
    artifact.id,
    version.id,
  ])
  await owner.query('COMMIT')
  await owner.query(
    `INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count,job_id)
     VALUES($1,$2,'pdf',$3,4,$4)`,
    [projectId, version.id, pdf.id, render.id],
  )
  await owner.query(`UPDATE sophia.jobs SET artifact_id=$3 WHERE project_id=$1 AND id=$2`, [
    projectId,
    jobId,
    artifact.id,
  ])
  return { artifactId: artifact.id, versionId: version.id, markdown, pdf, renderJobId: render.id }
}

const snapshotOf = async (actor: string, projectId: string) =>
  withActor(pool, actor, 'read', (c) => readSnapshot(c, projectId))

describe('research readers (0022, A11)', () => {
  it('reads a research task with its real kind, and a brief exactly as before', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const brief = await task(p.projectId, p.goalId, 'draft_brief')
    const research = await task(p.projectId, p.goalId, 'research')
    const snap = await snapshotOf(E, p.projectId)
    assert.ok(snap)
    assert.deepEqual(parseSnapshot(snap), snap)
    assert.deepEqual(
      snap.work.map((t) => [t.id, t.kind]),
      [
        [brief.jobId, 'draft_brief'],
        [research.jobId, 'research'],
      ],
    )
    for (const t of snap.work) assert.equal('artifactId' in t, false, 'absent until the task has a report')
    assert.equal(await snapshotOf(C, p.projectId), null, 'an outsider reads nothing')
  })

  it('projects a published Markdown report with its PDF rendition, instead of refusing the snapshot', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const research = await task(p.projectId, p.goalId, 'research')
    const r = await report(p.projectId, p.goalId, research.jobId)
    const snap = await snapshotOf(E, p.projectId)
    assert.ok(snap)
    assert.deepEqual(parseSnapshot(snap), snap)
    assert.equal(snap.artifacts.length, 1)
    const [version] = snap.artifacts
    assert.ok(version)
    assert.deepEqual(
      {
        id: version.id,
        artifactId: version.artifactId,
        format: version.format,
        state: version.state,
        title: version.title,
        versionNumber: version.versionNumber,
        exportEditability: version.exportEditability,
        sourceHash: version.sourceHash,
      },
      {
        id: r.versionId,
        artifactId: r.artifactId,
        format: 'markdown',
        state: 'stable',
        title: 'Sandboxed PDF rendering',
        versionNumber: 1,
        exportEditability: 'source_editable',
        sourceHash: r.markdown.sha256,
      },
    )
    assert.deepEqual(version.renditions, [
      {
        format: 'pdf',
        sourceId: r.pdf.id,
        sha256: r.pdf.sha256,
        byteLength: Number(r.pdf.byte_length),
        mime: 'application/pdf',
        pageCount: 4,
      },
    ])
    const [work] = snap.work
    assert.equal(work?.artifactId, r.artifactId)
    assert.deepEqual(
      snap.work.map((t) => t.id),
      [research.jobId],
      'the child render job is never a task',
    )
  })

  it('reads a research result with its outputs and cache usage; a brief result keeps its old shape', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const brief = await task(p.projectId, p.goalId, 'draft_brief')
    const research = await task(p.projectId, p.goalId, 'research')
    const r = await report(p.projectId, p.goalId, research.jobId)
    const briefText = await textSource(p.projectId, 'text/markdown', '## Intended outcome\n\nA room.')
    await owner.query(
      `UPDATE sophia.jobs SET state='succeeded', result_source_id=CASE id WHEN $2 THEN $4::uuid ELSE $5::uuid END
        WHERE project_id=$1 AND id IN ($2,$3)`,
      [p.projectId, brief.jobId, research.jobId, briefText.id, r.markdown.id],
    )
    await owner.query(
      `INSERT INTO sophia.usage_records(project_id,attempt_id,provider_call_id,billing_kind,input_tokens,output_tokens,
         provider,model,cache_read_tokens,cache_write_tokens)
       VALUES($1,$2,'call-b','api',100,20,'openai','gpt-6-luna',NULL,NULL),
             ($1,$3,'call-r','api',1200,300,'openai','gpt-6.1-sol',900,0)`,
      [p.projectId, brief.attemptId, research.attemptId],
    )
    const detail = await withActor(pool, E, 'read', (c) => readNativeTask(c, p.projectId, research.jobId))
    assert.deepEqual(parseNativeTaskDetail(detail), detail)
    assert.equal(detail.task.kind, 'research')
    assert.equal(detail.result?.cacheReadTokens, 900)
    assert.equal(detail.result?.cacheWriteTokens, 0, 'a reported zero is kept')
    assert.deepEqual(detail.result?.outputs, [
      {
        artifactVersionId: r.versionId,
        format: 'markdown',
        sourceId: r.markdown.id,
        sha256: r.markdown.sha256,
        byteLength: Number(r.markdown.byte_length),
        limitations: ['One source could not be read.'],
      },
      {
        artifactVersionId: r.versionId,
        format: 'pdf',
        sourceId: r.pdf.id,
        sha256: r.pdf.sha256,
        byteLength: Number(r.pdf.byte_length),
        limitations: [],
      },
    ])
    const old = await withActor(pool, E, 'read', (c) => readNativeTask(c, p.projectId, brief.jobId))
    assert.deepEqual(parseNativeTaskDetail(old), old)
    assert.deepEqual(Object.keys(old.result ?? {}).toSorted(), [
      'capturedAt',
      'inputTokens',
      'markdown',
      'model',
      'outputTokens',
      'provider',
      'sha256',
      'sourceId',
    ])
    assert.deepEqual(Object.keys(old.task).includes('artifactId'), false)
  })

  it('lists a research result for the bridge with its kind, never a child job', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const snap = await snapshotOf(A, p.projectId)
    assert.ok(snap)
    await withActor(pool, A, 'write', (c) =>
      startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
    )
    const research = await task(p.projectId, p.goalId, 'research')
    const r = await report(p.projectId, p.goalId, research.jobId)
    const child = await textSource(p.projectId, 'application/json', '{"render":"ok"}')
    await owner.query(
      `UPDATE sophia.jobs SET state='succeeded', result_source_id=$3, result_revision=1 WHERE project_id=$1 AND id=$2`,
      [p.projectId, research.jobId, r.markdown.id],
    )
    await owner.query(`UPDATE sophia.jobs SET result_source_id=$3, result_revision=1 WHERE project_id=$1 AND id=$2`, [
      p.projectId,
      r.renderJobId,
      child.id,
    ])
    const assignments = await withService(pool, (c) => mediaAssignments(c))
    const mine = assignments.find((a) => a.projectId === p.projectId)
    assert.ok(mine)
    assert.deepEqual(mine.results, [{ taskId: research.jobId, resultRevision: 1, kind: 'research' }])
    const batch = { assignments: [{ ...mine, roomToken: null }], version: 'a'.repeat(64) }
    assert.deepEqual(parseMediaAssignmentBatch(batch), batch)
  })

  it('keeps one task job per attempt, and a child job without an attempt or a command', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const research = await task(p.projectId, p.goalId, 'research')
    assert.match(
      await rawError(`INSERT INTO sophia.jobs(project_id,kind,attempt_id,state) VALUES($1,'research',$2,'pending')`, [
        p.projectId,
        research.attemptId,
      ]),
      /one_task_job_per_attempt/,
    )
    assert.match(
      await rawError(
        `INSERT INTO sophia.jobs(project_id,kind,parent_job_id,attempt_id,state) VALUES($1,'render',$2,$3,'pending')`,
        [p.projectId, research.jobId, research.attemptId],
      ),
      /jobs_child_has_no_attempt/,
    )
    assert.match(
      await rawError(`INSERT INTO sophia.artifacts(project_id,title,format) VALUES($1,'x','docx')`, [p.projectId]),
      /artifacts_format_check/,
    )
  })
})
