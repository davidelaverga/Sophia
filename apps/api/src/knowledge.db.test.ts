// SMC-M03 Knowledge reads through real HTTP (level: sql-run, amendment A11): report cards from one project or every
// project the reader is in, with format and search filters and pages; a report's published versions with their
// notes and the sources a version cites; a member's edit of a report's description. A reader never sees a card, a
// count or a project name from a project they are not in. Report rows are made as the table owner, as publication
// writes them.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  parseArtifactVersionList,
  parseReportList,
  parseReportSourceList,
  parseReportSummary,
} from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const A = randomUUID() // in P1 and P2
const E = randomUUID() // in P1 only
const C = randomUUID() // in P3 only

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Client
let app: FastifyInstance
let base: string
const P: Record<'one' | 'two' | 'three', { projectId: string; goalId: string }> = {} as never
const R: Record<string, { artifactId: string; versions: string[] }> = {}

async function token(sub: string, anonymous = false): Promise<string> {
  return new SignJWT({ role: 'authenticated', ...(anonymous ? { is_anonymous: true } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
}

async function get(path: string, actor: string, anonymous = false) {
  const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${await token(actor, anonymous)}` } })
  const text = await res.text()
  return { status: res.status, json: text ? (JSON.parse(text) as unknown) : null }
}

async function patch(path: string, actor: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${await token(actor)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: text ? (JSON.parse(text) as unknown) : null }
}

const list = async (actor: string, query: string) => {
  const res = await get(`/api/v1/knowledge/reports?${query}`, actor)
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return parseReportList(res.json)
}

const one = async <T>(sql: string, params: unknown[]): Promise<T> => (await owner.query(sql, params)).rows[0] as T

interface VersionSpec {
  change?: string
  retained?: string
  pdf?: boolean
}

/**
 * A report with published versions v1..vN (the last stable, earlier ones superseded), each a Markdown source, the
 * stable one optionally with a PDF; plus one unpublished candidate that no reader may see. `at` orders the reports.
 */
async function report(
  project: { projectId: string; goalId: string },
  title: string,
  summary: string | null,
  versions: VersionSpec[],
  at: string,
) {
  const artifact = await one<{ id: string }>(
    `INSERT INTO sophia.artifacts(project_id,title,format,summary) VALUES($1,$2,'markdown',$3) RETURNING id`,
    [project.projectId, title, summary],
  )
  const ids: string[] = []
  let parent: string | null = null
  for (const [i, spec] of [...versions, { candidate: true } as VersionSpec & { candidate?: boolean }].entries()) {
    const candidate = i === versions.length
    const source = await one<{ id: string; sha256: string }>(
      `SELECT (s).id, (s).sha256 FROM (SELECT sophia.put_text_source($1,$2,'text/markdown',$3) AS s) x`,
      [project.projectId, A, `# ${title} v${i + 1}`],
    )
    const state = candidate ? 'candidate' : i === versions.length - 1 ? 'stable' : 'superseded'
    const v: { id: string } = await one(
      `INSERT INTO sophia.artifact_versions(project_id,artifact_id,parent_id,source_id,source_hash,goal_id,goal_revision,
         authority_epoch,state,version_number,change_note,retained_note,created_at)
       VALUES($1,$2,$3,$4,$5,$6,1,1,$7,$8,$9,$10,$11::timestamptz + make_interval(mins => $8)) RETURNING id`,
      [
        project.projectId,
        artifact.id,
        parent,
        source.id,
        source.sha256,
        project.goalId,
        state,
        i + 1,
        spec.change ?? null,
        spec.retained ?? null,
        at,
      ],
    )
    if (!candidate) {
      ids.unshift(v.id)
      parent = v.id
    }
    if (state === 'stable') {
      await owner.query(`UPDATE sophia.artifacts SET stable_version_id=$2 WHERE id=$1`, [artifact.id, v.id])
      if (spec.pdf) {
        const pdf = await one<{ id: string }>(
          `SELECT (sophia.put_text_source($1,$2,'application/pdf','%PDF stand-in')).id`,
          [project.projectId, A],
        )
        await owner.query(
          `INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count)
           VALUES($1,$2,'pdf',$3,3)`,
          [project.projectId, v.id, pdf.id],
        )
      }
    }
  }
  R[title] = { artifactId: artifact.id, versions: ids }
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  app = buildApp({
    pool,
    verifyActor: createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET }),
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  P.one = await seedProject(db.ownerUrl, { title: 'Sophia Next', admin: A, editors: [E] })
  P.two = await seedProject(db.ownerUrl, { title: 'Secret plans', admin: A })
  P.three = await seedProject(db.ownerUrl, { title: 'Elsewhere', admin: C })
  await report(P.one, 'Voice latency budget', 'Where the three seconds go.', [{}], '2026-09-01T10:00:00Z')
  await report(
    P.one,
    'Sandboxed PDF rendering',
    'Compares managed hosts for the PDF renderer.',
    [{}, { change: 'Removed Fly Machines; Cloud Run jobs as the fallback.', retained: 'Findings 1 to 4.', pdf: true }],
    '2026-09-02T10:00:00Z',
  )
  await report(P.two, 'Pricing tiers', 'Which tier pays for the renderer.', [{}], '2026-09-03T10:00:00Z')
  await report(P.three, 'Unrelated', null, [{}], '2026-09-04T10:00:00Z')
})
after(async () => {
  await app.close()
  await owner.end()
  await pool.end()
  await db.drop()
})

const titles = (l: { reports: ReadonlyArray<{ title: string }> }) => l.reports.map((r) => r.title)

describe('Knowledge reads (A11)', () => {
  it('lists every project the reader is in, newest first, and nothing from any other project', async () => {
    const forE = await list(E, 'project=all')
    assert.deepEqual(titles(forE), ['Sandboxed PDF rendering', 'Voice latency budget'])
    assert.deepEqual(forE.projects, [{ projectId: P.one.projectId, title: 'Sophia Next', count: 2 }])
    assert.equal(JSON.stringify(forE).includes('Secret plans'), false, 'no name from a project E is not in')
    const forA = await list(A, 'project=all')
    assert.deepEqual(titles(forA), ['Pricing tiers', 'Sandboxed PDF rendering', 'Voice latency budget'])
    assert.deepEqual(
      forA.projects.map((p) => [p.title, p.count]),
      [
        ['Secret plans', 1],
        ['Sophia Next', 2],
      ],
    )
    const elsewhere = await list(E, `project=${P.two.projectId}`)
    assert.deepEqual([elsewhere.reports, elsewhere.projects], [[], []], 'a project E is not in reads as empty')
  })

  it('describes a card: what it is, its current version, its formats and its latest change', async () => {
    const [card] = (await list(E, `project=${P.one.projectId}&format=pdf`)).reports
    assert.ok(card)
    assert.deepEqual(
      {
        title: card.title,
        projectTitle: card.projectTitle,
        summary: card.summary,
        summaryAuthorId: card.summaryAuthorId,
        currentVersionId: card.currentVersionId,
        currentVersionNumber: card.currentVersionNumber,
        versionCount: card.versionCount,
        formats: card.formats,
        latestChange: card.latestChange,
      },
      {
        title: 'Sandboxed PDF rendering',
        projectTitle: 'Sophia Next',
        summary: 'Compares managed hosts for the PDF renderer.',
        summaryAuthorId: null,
        currentVersionId: R['Sandboxed PDF rendering']?.versions[0],
        currentVersionNumber: 2,
        versionCount: 2,
        formats: ['markdown', 'pdf'],
        latestChange: { note: 'Removed Fly Machines; Cloud Run jobs as the fallback.', retained: 'Findings 1 to 4.' },
      },
    )
  })

  it('filters by format and searches the title, description and notes, never the body', async () => {
    assert.deepEqual(titles(await list(A, 'project=all&format=pdf')), ['Sandboxed PDF rendering'])
    assert.deepEqual(titles(await list(A, 'project=all&format=markdown_only')), [
      'Pricing tiers',
      'Voice latency budget',
    ])
    assert.deepEqual(titles(await list(A, 'project=all&q=managed%20hosts')), ['Sandboxed PDF rendering'])
    assert.deepEqual(titles(await list(A, 'project=all&q=Cloud%20Run')), ['Sandboxed PDF rendering'], 'a change note')
    assert.deepEqual(titles(await list(A, 'project=all&q=sandbox')), ['Sandboxed PDF rendering'], 'a word’s start')
    assert.deepEqual(titles(await list(A, 'project=all&q=hosts%20pricing')), [], 'every word must match')
    assert.deepEqual(titles(await list(A, 'project=all&q=v2')), [], 'not the report body')
    assert.deepEqual(
      titles(await list(A, 'project=all&q=%27%3A*%20%7C%20!')),
      ['Pricing tiers', 'Sandboxed PDF rendering', 'Voice latency budget'],
      'query syntax is not searched',
    )
    const filtered = await list(A, 'project=all&q=renderer')
    assert.deepEqual(titles(filtered), ['Pricing tiers', 'Sandboxed PDF rendering'])
    assert.deepEqual(
      filtered.projects.map((p) => [p.title, p.count]),
      [
        ['Secret plans', 1],
        ['Sophia Next', 1],
      ],
      'counts follow the filters',
    )
  })

  it('pages newest first without repeating or skipping a card', async () => {
    const p = await seedProject(db.ownerUrl, { title: 'Many', admin: A })
    for (let i = 0; i < 33; i += 1) {
      await report(p, `Batch ${String(i).padStart(2, '0')}`, null, [{}], '2026-08-01T00:00:00Z')
    }
    const first = await list(A, `project=${p.projectId}`)
    assert.equal(first.reports.length, 30)
    assert.ok(first.nextCursor)
    const second = await list(A, `project=${p.projectId}&cursor=${first.nextCursor}`)
    assert.equal(second.nextCursor, null)
    const all = [...titles(first), ...titles(second)]
    assert.equal(new Set(all).size, 33)
    assert.equal(all.length, 33)
    assert.equal((await get(`/api/v1/knowledge/reports?project=all&cursor=bm9wZQ`, A)).status, 422)
  })

  it('refuses a cursor the API could not have issued before any query, never as a retryable failure (M03-RF-0002)', async () => {
    const id = randomUUID()
    const status = async (keyset: string) =>
      (await get(`/api/v1/knowledge/reports?project=all&cursor=${Buffer.from(keyset).toString('base64url')}`, A)).status
    assert.equal(await status(`9999999999999999999.${id}`), 422, 'beyond bigint')
    assert.equal(await status(`9223372036854775808.${id}`), 422, 'bigint max + 1')
    assert.equal(await status(`9223372036854775807.${id}`), 200, 'bigint max: a valid, empty-tailed page')
    assert.equal(await status(`0.${id}`), 200, 'zero: nothing older')
    assert.equal(await status(`1.${id}.1`), 422, 'an extra segment')
  })

  it('answers a report’s published versions with their notes, never a candidate, only to its members', async () => {
    const r = R['Sandboxed PDF rendering']
    assert.ok(r)
    const res = await get(`/api/v1/artifacts/${r.artifactId}/versions`, E)
    assert.equal(res.status, 200)
    const versions = parseArtifactVersionList(res.json)
    assert.deepEqual(
      versions.map((v) => [v.id, v.versionNumber, v.state, v.changeNote ?? null, v.renditions?.length ?? 0]),
      [
        [r.versions[0], 2, 'stable', 'Removed Fly Machines; Cloud Run jobs as the fallback.', 1],
        [r.versions[1], 1, 'superseded', null, 0],
      ],
    )
    assert.equal(versions[0]?.retainedNote, 'Findings 1 to 4.')
    assert.equal(versions[0]?.parentId, r.versions[1])
    const secret = R['Pricing tiers']
    assert.ok(secret)
    assert.equal((await get(`/api/v1/artifacts/${secret.artifactId}/versions`, E)).status, 422)
    assert.equal((await get(`/api/v1/knowledge/reports?project=all`, E, true)).status, 403, 'never a guest')
  })

  it('lists the sources a version cites with their provenance, only to its members', async () => {
    const r = R['Sandboxed PDF rendering']
    assert.ok(r)
    const version = await one<{ project_id: string; source_id: string }>(
      `SELECT project_id, source_id FROM sophia.artifact_versions WHERE id=$1`,
      [r.versions[0]],
    )
    const cite = async (body: string) => {
      const s = await one<{ id: string }>(`SELECT (sophia.put_text_source($1,$2,'text/plain',$3)).id`, [
        version.project_id,
        A,
        body,
      ])
      await owner.query(
        `INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES($1,$2,$3)`,
        [version.project_id, s.id, version.source_id],
      )
      return s.id
    }
    const given = await cite('A page the member attached.')
    await owner.query(
      `INSERT INTO sophia.source_provenance(project_id,source_id,kind,coverage,requested_url,title,retrieved_at)
       VALUES($1,$2,'admitted_input','complete','https://hosts.example.org/given','The given page','2026-09-02T09:00:00Z')`,
      [version.project_id, given],
    )
    const plain = await cite('A note in the project.')
    const res = await get(`/api/v1/artifacts/${r.artifactId}/versions/${r.versions[0]}/sources`, E)
    assert.equal(res.status, 200, JSON.stringify(res.json))
    const { sources } = parseReportSourceList(res.json)
    assert.deepEqual(
      sources.map((x) => [x.sourceId, x.kind, x.title, x.url, x.coverage, x.retrievedAt]),
      [
        [given, 'input', 'The given page', 'https://hosts.example.org/given', 'complete', '2026-09-02T09:00:00.000Z'],
        [plain, 'input', null, null, null, null],
      ],
    )
    const older = await get(`/api/v1/artifacts/${r.artifactId}/versions/${r.versions[1]}/sources`, E)
    assert.deepEqual(parseReportSourceList(older.json).sources, [], 'the earlier version cites nothing')
    assert.equal((await get(`/api/v1/artifacts/${r.artifactId}/versions/${r.versions[0]}/sources`, C)).status, 422)
    const secret = R['Pricing tiers']
    assert.ok(secret)
    assert.equal(
      (await get(`/api/v1/artifacts/${secret.artifactId}/versions/${secret.versions[0]}/sources`, E)).status,
      422,
      'a project the reader is not in',
    )
  })

  it('takes a member’s description edit against the revision they saw, attributed to them', async () => {
    const r = R['Voice latency budget']
    assert.ok(r)
    const card = (await list(E, `project=${P.one.projectId}`)).reports.find((x) => x.artifactId === r.artifactId)
    assert.ok(card)
    const path = `/api/v1/artifacts/${r.artifactId}/summary`
    const edited = await patch(path, E, {
      summary: 'Where the three seconds go, by stage.',
      expectedRevision: card.summaryRevision,
    })
    assert.equal(edited.status, 200, JSON.stringify(edited.json))
    const summary = parseReportSummary(edited.json)
    assert.deepEqual(
      [summary.summary, summary.summaryAuthorId, summary.summaryRevision],
      ['Where the three seconds go, by stage.', E, card.summaryRevision + 1],
    )
    const stale = await patch(path, A, { summary: 'Another.', expectedRevision: card.summaryRevision })
    assert.deepEqual([stale.status, (stale.json as { code: string }).code], [409, 'stale_revision'])
    assert.equal((await patch(path, E, { summary: '', expectedRevision: 2 })).status, 422, 'empty')
    assert.equal((await patch(path, E, { summary: 'x'.repeat(241), expectedRevision: 2 })).status, 422, 'too long')
    assert.equal((await patch(path, E, { summary: 'x', expectedRevision: 2, extra: 1 })).status, 422)
    assert.equal((await patch(path, C, { summary: 'Mine.', expectedRevision: 2 })).status, 422, 'an outsider')
    const now = (await list(E, `project=${P.one.projectId}`)).reports.find((x) => x.artifactId === r.artifactId)
    assert.deepEqual([now?.summary, now?.summaryAuthorId], ['Where the three seconds go, by stage.', E])
  })
})
