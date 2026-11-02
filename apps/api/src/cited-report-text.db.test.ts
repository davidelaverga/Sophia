// getCitedReportText through real HTTP and the API login (level: sql-run, amendment A11, migration 0090): a member reads
// the text of a project input a published report version cites, from that report's Sources, and nothing else reads
// through it. The report rows are made as the table owner, as publication writes them; the sources as put_text_source
// and the owner write them. Synthetic HS256 tokens stand in for Supabase Auth. No byte store, model or provider.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import { parseReportSourceList, parseSourceContent } from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const A = randomUUID() // admin
const E = randomUUID() // editor, who added the inputs
const V = randomUUID() // viewer
const O = randomUUID() // outsider
const F = randomUUID() // admin of another project only
/** UTF-8 that is not ASCII, so its size in bytes is not its length in characters; and markup that must stay text. */
const NOTE = 'Synthetic pilot note — café, naïve, ☕.\nOption A: 90 credits. <img src=x onerror=alert(1)> **not bold**'

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Client
let app: FastifyInstance
let base: string

const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const one = async <T>(sql: string, params: unknown[]): Promise<T> => (await owner.query(sql, params)).rows[0] as T

interface Report {
  projectId: string
  artifactId: string
  versionId: string
}

interface Read {
  status: number
  cache: string | null
  body: string
}

async function get(path: string, as: string | null): Promise<Read> {
  const res = await fetch(`${base}${path}`, { headers: as ? { authorization: `Bearer ${await token(as)}` } : {} })
  return { status: res.status, cache: res.headers.get('cache-control'), body: await res.text() }
}

/** The cited text of `source` as `as` reads it from `report`'s version (or another version given). */
const cited = (report: Report, source: string, as: string | null, versionId = report.versionId) =>
  get(`/api/v1/artifacts/${report.artifactId}/versions/${versionId}/sources/${source}/content`, as)

/** A refusal, as every one is: not_found, naming nothing of the source. */
function refused(read: Read, why: string) {
  assert.equal(read.status, 422, `${why}: ${read.body}`)
  const error = JSON.parse(read.body) as { code: string; message: string }
  assert.equal(error.code, 'not_found', why)
  assert.ok(!read.body.includes('café') && !read.body.includes('credits'), `${why}: no text in the refusal`)
}

/** An inline text source, as put_text_source writes one: released, ready, in the project, owned by `by`. */
const text = (projectId: string, body: string, mime = 'text/plain; charset=utf-8', by = E) =>
  one<{ id: string }>(`SELECT (sophia.put_text_source($1, $2, $3, $4)).id`, [projectId, by, mime, body]).then(
    (r) => r.id,
  )

/** A version of a new artifact in `projectId`, in `state`, whose own source cites `citations`. */
async function publishReport(
  projectId: string,
  goalId: string,
  citations: string[],
  state = 'stable',
): Promise<Report> {
  const markdown = await text(
    projectId,
    `# Brief\n\nCites ${String(citations.length)}.`,
    'text/markdown; charset=utf-8',
  )
  const artifact = await one<{ id: string }>(
    `INSERT INTO sophia.artifacts(project_id,title,format) VALUES($1,'Reading-room brief','markdown') RETURNING id`,
    [projectId],
  )
  const version = await one<{ id: string }>(
    `INSERT INTO sophia.artifact_versions(project_id,artifact_id,source_id,source_hash,goal_id,goal_revision,
       authority_epoch,state,version_number)
     SELECT $1,$2,s.id,s.sha256,$3,1,1,$5,CASE WHEN $5 IN ('stable','superseded') THEN 1 END
       FROM sophia.source_objects s WHERE s.project_id=$1 AND s.id=$4 RETURNING id`,
    [projectId, artifact.id, goalId, markdown, state],
  )
  for (const c of citations) {
    await owner.query(
      'INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES($1,$2,$3)',
      [projectId, c, markdown],
    )
  }
  return { projectId, artifactId: artifact.id, versionId: version.id }
}

const setSource = (projectId: string, id: string, set: string) =>
  owner.query(`UPDATE sophia.source_objects SET ${set} WHERE project_id=$1 AND id=$2`, [projectId, id])

let main: { projectId: string; goalId: string }
let foreign: { projectId: string; goalId: string }

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
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  main = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
  foreign = await seedProject(db.ownerUrl, { admin: F })
})

after(async () => {
  await app.close()
  await owner.end()
  await pool.end()
  await db.drop()
})

describe('getCitedReportText: a member reads the project text a published version cites', () => {
  it('answers every member with the exact text, its hash, its size in bytes and its type, inline and never cached', async () => {
    const note = await text(main.projectId, NOTE)
    const r = await publishReport(main.projectId, main.goalId, [note])
    for (const as of [E, V, A]) {
      const read = await cited(r, note, as)
      assert.equal(read.status, 200, read.body)
      assert.equal(read.cache, 'no-store')
      const content = parseSourceContent(JSON.parse(read.body))
      assert.equal(content.text, NOTE)
      assert.equal(content.sha256, sha(NOTE))
      assert.equal(content.byteLength, Buffer.byteLength(NOTE, 'utf8'))
      assert.notEqual(content.byteLength, NOTE.length, 'counted in bytes, not characters')
      assert.deepEqual(
        [content.sourceId, content.mime, content.disposition, content.downloadUrl, content.expiresAt],
        [note, 'text/plain; charset=utf-8', 'inline', null, null],
      )
      assert.equal(content.filename, `source-${note.slice(0, 8)}.txt`)
    }
  })

  it('reads an admitted input and a Markdown input, and a superseded version’s citation too', async () => {
    const admitted = await text(main.projectId, 'An admitted input.')
    await owner.query(
      `INSERT INTO sophia.source_provenance(project_id,source_id,kind,coverage) VALUES($1,$2,'admitted_input','complete')`,
      [main.projectId, admitted],
    )
    const md = await text(main.projectId, '# Notes\n\n- one', 'text/markdown')
    const r = await publishReport(main.projectId, main.goalId, [admitted, md], 'superseded')
    assert.equal(parseSourceContent(JSON.parse((await cited(r, admitted, V)).body)).text, 'An admitted input.')
    const read = parseSourceContent(JSON.parse((await cited(r, md, V)).body))
    assert.deepEqual([read.text, read.filename], ['# Notes\n\n- one', `source-${md.slice(0, 8)}.md`])
  })

  it('is the same text the Sources list names: the list and the read agree on the citation', async () => {
    const note = await text(main.projectId, 'Listed and read.')
    const r = await publishReport(main.projectId, main.goalId, [note])
    const list = parseReportSourceList(
      JSON.parse((await get(`/api/v1/artifacts/${r.artifactId}/versions/${r.versionId}/sources`, V)).body),
    )
    assert.deepEqual(
      list.sources.map((s) => [s.sourceId, s.kind]),
      [[note, 'input']],
    )
    assert.equal((await cited(r, note, V)).status, 200)
  })
})

describe('getCitedReportText refuses, with one not_found that names nothing', () => {
  it('refuses no token (401), an outsider, and an admin of another project, even with the right ids', async () => {
    const note = await text(main.projectId, NOTE)
    const r = await publishReport(main.projectId, main.goalId, [note])
    assert.equal((await cited(r, note, null)).status, 401)
    refused(await cited(r, note, O), 'an outsider')
    refused(await cited(r, note, F), 'another project’s admin')
  })

  it('refuses a source the version does not cite: unrelated, cited by another report, or asked under another artifact', async () => {
    const note = await text(main.projectId, NOTE)
    const unrelated = await text(main.projectId, 'Never cited.')
    const r = await publishReport(main.projectId, main.goalId, [note])
    const other = await publishReport(main.projectId, main.goalId, [unrelated])
    refused(await cited(r, unrelated, E), 'unrelated to this version')
    refused(await cited({ ...r, artifactId: other.artifactId }, note, E), 'this version under another artifact')
    refused(await cited(r, note, E, other.versionId), 'another version, which cites something else')
    refused(await cited(r, randomUUID(), E), 'an unknown id')
  })

  it('refuses a foreign project’s cited text to this project’s members, and this one’s to the foreign admin', async () => {
    const there = await text(foreign.projectId, 'Another project’s note.', 'text/plain', F)
    const r = await publishReport(foreign.projectId, foreign.goalId, [there])
    assert.equal((await cited(r, there, F)).status, 200)
    for (const as of [A, E, V]) refused(await cited(r, there, as), 'a project the reader is not in')
  })

  it('refuses a candidate, a validated and a rejected version’s citations', async () => {
    const note = await text(main.projectId, NOTE)
    for (const state of ['candidate', 'validated', 'rejected']) {
      refused(
        await cited(await publishReport(main.projectId, main.goalId, [note], state), note, E),
        `a ${state} version`,
      )
    }
  })

  it('refuses a private source, the reader’s own included, an unreleased one, and one not ready or deleted', async () => {
    const cases: [string, string, string][] = [
      ['private, someone else’s', `scope='private', owner_id='${A}'`, E],
      ['private, the reader’s own', `scope='private', owner_id='${E}'`, E],
      ['unreleased', 'eligible=false', E],
      ['blocked', `state='blocked'`, E],
      ['deleted', `state='deleted'`, E],
    ]
    for (const [why, set, as] of cases) {
      const note = await text(main.projectId, NOTE)
      const r = await publishReport(main.projectId, main.goalId, [note])
      await setSource(main.projectId, note, set)
      refused(await cited(r, note, as), why)
    }
  })
})

describe('getCitedReportText refuses what is not a project text kept inline', () => {
  it('refuses a web page and a search result a version cites, though inline', async () => {
    for (const kind of ['web_read', 'search_results']) {
      const page = await text(main.projectId, 'A page read from the web.')
      // A paid retrieval names its call; the call's own rows are beside the point here, so only their key is skipped
      // (replica mode skips foreign-key triggers, never the table's checks).
      await owner.query('BEGIN')
      await owner.query('SET LOCAL session_replication_role = replica')
      await owner.query(
        `INSERT INTO sophia.source_provenance(project_id,source_id,kind,provider,reservation_id,target_ref,coverage)
         VALUES($1,$2,$3,'jina',$4,$5,'complete')`,
        [main.projectId, page, kind, randomUUID(), `input:${randomUUID()}`],
      )
      await owner.query('COMMIT')
      refused(await cited(await publishReport(main.projectId, main.goalId, [page]), page, E), kind)
    }
  })

  it('refuses stored bytes with no inline text, a JSON or HTML text, and a text past 256 KiB', async () => {
    const stored = randomUUID()
    await owner.query(
      `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
       VALUES($1,$2,$3,'project',$4,'text/plain',$5,4,true,'ready')`,
      [main.projectId, stored, E, sha('none'), `projects/${main.projectId}/${stored}`],
    )
    const json = await text(main.projectId, '{"manifest":true}', 'application/json')
    const html = await text(main.projectId, '<p>page</p>', 'text/html')
    // Past 256 KiB no text is kept inline at all (source_texts' own check), so the read can never meet one.
    await assert.rejects(text(main.projectId, 'x'.repeat(262_145)), { code: '23514' })
    const atLimit = await text(main.projectId, 'y'.repeat(262_144))
    // A record that claims more bytes than the inline cap is refused even were its text to agree.
    const overstated = await text(main.projectId, 'z')
    await setSource(main.projectId, overstated, 'byte_length=262145')
    const r = await publishReport(main.projectId, main.goalId, [stored, json, html, atLimit, overstated])
    refused(await cited(r, stored, E), 'stored bytes, no inline text')
    refused(await cited(r, json, E), 'a JSON text')
    refused(await cited(r, html, E), 'an HTML text')
    refused(await cited(r, overstated, E), 'a record past 256 KiB')
    assert.equal((await cited(r, atLimit, E)).status, 200, 'exactly 256 KiB is kept inline and read')
  })

  it('never sends a text that does not match its record: another size is not found, the same size another hash is refused', async () => {
    const resized = await text(main.projectId, NOTE)
    const altered = await text(main.projectId, NOTE)
    const r = await publishReport(main.projectId, main.goalId, [resized, altered])
    await owner.query('UPDATE sophia.source_texts SET body=body||$3 WHERE project_id=$1 AND source_id=$2', [
      main.projectId,
      resized,
      '!',
    ])
    await owner.query(
      `UPDATE sophia.source_texts SET body=replace(body,'90','91') WHERE project_id=$1 AND source_id=$2`,
      [main.projectId, altered],
    )
    refused(await cited(r, resized, E), 'a text of another size than its record')
    const read = await cited(r, altered, E)
    assert.equal(read.status, 409, read.body)
    assert.ok(!read.body.includes('credits'), 'the altered text is not sent')
  })
})

describe('getCitedReportText checks again at each read', () => {
  it('a member removed after the Sources list was read reads nothing; restored, reads again', async () => {
    const note = await text(main.projectId, NOTE)
    const r = await publishReport(main.projectId, main.goalId, [note])
    assert.equal((await get(`/api/v1/artifacts/${r.artifactId}/versions/${r.versionId}/sources`, V)).status, 200)
    await owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
      main.projectId,
      V,
    ])
    try {
      refused(await cited(r, note, V), 'removed since the list')
    } finally {
      await owner.query('UPDATE sophia.project_members SET active=true WHERE project_id=$1 AND actor_id=$2', [
        main.projectId,
        V,
      ])
    }
    assert.equal((await cited(r, note, V)).status, 200)
  })

  it('a source withdrawn after the list, or one whose own source was withdrawn (transitively), reads nothing', async () => {
    const direct = await text(main.projectId, NOTE)
    const origin = await text(main.projectId, 'What the note was drawn from.')
    const derived = await text(main.projectId, 'A note drawn from another.')
    await owner.query(
      'INSERT INTO sophia.source_dependencies(project_id,source_id,derived_source_id) VALUES($1,$2,$3)',
      [main.projectId, origin, derived],
    )
    const r = await publishReport(main.projectId, main.goalId, [direct, derived])
    assert.equal((await cited(r, direct, E)).status, 200)
    assert.equal((await cited(r, derived, E)).status, 200)
    await setSource(main.projectId, direct, 'eligible=false')
    await setSource(main.projectId, origin, `state='deleted'`)
    refused(await cited(r, direct, E), 'withdrawn after the list')
    refused(await cited(r, derived, E), 'what it drew on was withdrawn')
  })
})

/** The version's own source: the report text getSourceContent serves (made by `text`, so owned by E). */
const parentOf = async (r: Report) =>
  (await one<{ source_id: string }>('SELECT source_id FROM sophia.artifact_versions WHERE id=$1', [r.versionId]))
    .source_id

/** The report's own text as `as` reads it through getSourceContent (A11): the reader the cited text follows. */
const parentRead = async (r: Report, as: string) => get(`/api/v1/sources/${await parentOf(r)}/content`, as)

describe('getCitedReportText reads only through a report the caller may still read (CITED-TEXT-R1)', () => {
  it('a version whose own source is blocked or deleted reads nothing, while the cited text stays readable elsewhere', async () => {
    for (const set of [`state='blocked'`, `state='deleted'`]) {
      const note = await text(main.projectId, NOTE)
      const r = await publishReport(main.projectId, main.goalId, [note])
      const elsewhere = await publishReport(main.projectId, main.goalId, [note])
      for (const as of [E, V]) assert.equal((await cited(r, note, as)).status, 200, `${set}: before, ${as}`)
      await setSource(main.projectId, await parentOf(r), set)
      for (const as of [E, V]) {
        assert.notEqual((await parentRead(r, as)).status, 200, `${set}: the report's own text is refused`)
        refused(await cited(r, note, as), `${set}: the report's own source, so its cited text through it`)
      }
      assert.equal((await cited(elsewhere, note, V)).status, 200, `${set}: the same note through a readable report`)
    }
  })

  it('a version whose own source is private or unreleased reads only for whom that source is readable: its owner', async () => {
    for (const set of [`scope='private'`, 'eligible=false']) {
      const note = await text(main.projectId, NOTE)
      const r = await publishReport(main.projectId, main.goalId, [note])
      assert.equal((await cited(r, note, V)).status, 200, `${set}: before`)
      await setSource(main.projectId, await parentOf(r), set)
      // The report's own text: its owner (E, who made it) still reads it; another member does not.
      assert.equal((await parentRead(r, E)).status, 200, `${set}: the owner reads the report's own text`)
      assert.equal((await cited(r, note, E)).status, 200, `${set}: so the owner reads its cited text`)
      assert.notEqual((await parentRead(r, V)).status, 200, `${set}: another member does not read the report`)
      refused(await cited(r, note, V), `${set}: nor its cited text`)
    }
  })

  it('a report whose other citation was withdrawn stays readable, and so does a cited text still released (0033 keeps history)', async () => {
    const note = await text(main.projectId, NOTE)
    const other = await text(main.projectId, 'Another cited input, withdrawn later.')
    const r = await publishReport(main.projectId, main.goalId, [note, other])
    await setSource(main.projectId, other, `state='deleted'`)
    assert.equal((await parentRead(r, V)).status, 200, 'the report itself is still readable')
    assert.equal((await cited(r, note, V)).status, 200, 'its released cited text too')
    refused(await cited(r, other, V), 'the withdrawn one is not')
  })
})

describe('0090 opens one contextual read, and getSourceContent stays as it was', () => {
  it('the API login executes cited_report_text only; source_withdrawn and the closure stay closed to it', async () => {
    const api = await pool.connect()
    try {
      const can = async (fn: string) =>
        (await api.query<{ ok: boolean }>(`SELECT has_function_privilege(to_regprocedure($1), 'EXECUTE') AS ok`, [fn]))
          .rows[0]?.ok
      assert.equal(await can('sophia.cited_report_text(uuid,uuid,uuid)'), true)
      assert.equal(await can('sophia.source_withdrawn(uuid,uuid)'), false)
      assert.equal(await can('sophia.source_closure(uuid,uuid[])'), false)
      assert.equal(await can('sophia.review_source_readable(uuid,uuid)'), false)
      const { rows } = await owner.query<{ grantee: string }>(
        `SELECT grantee FROM information_schema.routine_privileges WHERE routine_schema='sophia'
          AND routine_name='cited_report_text' AND privilege_type='EXECUTE' ORDER BY grantee`,
      )
      assert.deepEqual(
        rows.map((x) => x.grantee).filter((g) => g !== 'sophia_owner' && g !== 'postgres'),
        ['sophia_api'],
      )
    } finally {
      api.release()
    }
  })

  it('getSourceContent still refuses a cited input by its id alone, and still serves the report’s own Markdown', async () => {
    const note = await text(main.projectId, NOTE)
    const r = await publishReport(main.projectId, main.goalId, [note])
    refused(await get(`/api/v1/sources/${note}/content`, E), 'the source id alone, through getSourceContent')
    const own = await one<{ source_id: string }>('SELECT source_id FROM sophia.artifact_versions WHERE id=$1', [
      r.versionId,
    ])
    assert.equal((await get(`/api/v1/sources/${own.source_id}/content`, E)).status, 200)
  })

  it('/ready needs 0090 callable by this login', async () => {
    const ready = async () => (await app.inject({ method: 'GET', url: '/ready' })).statusCode
    assert.equal(await ready(), 200)
    await owner.query('REVOKE EXECUTE ON FUNCTION sophia.cited_report_text(uuid,uuid,uuid) FROM sophia_api')
    try {
      assert.equal(await ready(), 503)
    } finally {
      await owner.query('GRANT EXECUTE ON FUNCTION sophia.cited_report_text(uuid,uuid,uuid) TO sophia_api')
    }
    assert.equal(await ready(), 200)
  })
})
