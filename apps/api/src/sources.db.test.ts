// SMC-M03 getSourceContent through real HTTP (level: sql-run, amendment A11): a member reads a report's Markdown kept
// inline as text, and its stored PDF through a URL the API signs per read; nobody else reads either. The report rows
// are made as the table owner, as a later release's publication writes them. Synthetic HS256 tokens stand in for
// Supabase Auth; the byte store is in memory.
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { parseSourceContent } from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type SeededProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { memoryByteStore, objectPath, storedKey } from './byte-store.ts'
import { CONTENT_URL_SECONDS } from './routes/sources.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const A = randomUUID()
const E = randomUUID()
const C = randomUUID()
const PDF = new TextEncoder().encode('%PDF-1.7 stand-in bytes')
const MARKDOWN = '# Sandboxed PDF rendering\n\nRender on a host with the sandbox on.'

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Client
const store = memoryByteStore()
const apps: FastifyInstance[] = []
let seed: SeededProject
let report: { markdownId: string; pdfId: string; plainId: string }

async function token(sub: string): Promise<string> {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
}

async function serve(withStore: boolean): Promise<string> {
  const app = buildApp({
    pool,
    verifyActor: createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET }),
    byteStore: withStore ? store : null,
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  apps.push(app)
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
}

async function read(base: string, sourceId: string, actor: string | null, disposition?: string) {
  const query = disposition ? `?disposition=${disposition}` : ''
  const res = await fetch(`${base}/api/v1/sources/${sourceId}/content${query}`, {
    headers: actor ? { authorization: `Bearer ${await token(actor)}` } : {},
  })
  const text = await res.text()
  return {
    status: res.status,
    cache: res.headers.get('cache-control'),
    json: text ? (JSON.parse(text) as unknown) : null,
  }
}

const one = async <T>(sql: string, params: unknown[]): Promise<T> => (await owner.query(sql, params)).rows[0] as T

/** A published v2 report: its Markdown inline, its PDF rendition in the byte store, and an unrelated source. */
async function publish(projectId: string, goalId: string) {
  const text = (body: string, mime: string) =>
    one<{ id: string }>(`SELECT (sophia.put_text_source($1, $2, $3, $4)).id`, [projectId, A, mime, body])
  const markdown = await text(MARKDOWN, 'text/markdown')
  const plain = await text('A note, not a report.', 'text/plain')
  const pdfId = randomUUID()
  await owner.query(
    `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
     VALUES($1,$2,$3,'project',$4,'application/pdf',$5,$6,true,'ready')`,
    [projectId, pdfId, A, createHash('sha256').update(PDF).digest('hex'), storedKey(projectId, pdfId), PDF.length],
  )
  await store.put(objectPath(projectId, pdfId), PDF, 'application/pdf')
  const artifact = await one<{ id: string }>(
    `INSERT INTO sophia.artifacts(project_id,title,format) VALUES($1,'Sandboxed PDF rendering','markdown') RETURNING id`,
    [projectId],
  )
  const version = await one<{ id: string }>(
    `INSERT INTO sophia.artifact_versions(project_id,artifact_id,source_id,source_hash,goal_id,goal_revision,
       authority_epoch,state,version_number)
     SELECT $1,$2,s.id,s.sha256,$3,1,1,'stable',2 FROM sophia.source_objects s WHERE s.project_id=$1 AND s.id=$4
     RETURNING id`,
    [projectId, artifact.id, goalId, markdown.id],
  )
  await owner.query(
    `INSERT INTO sophia.artifact_renditions(project_id,artifact_version_id,format,source_id,page_count)
     VALUES($1,$2,'pdf',$3,1)`,
    [projectId, version.id, pdfId],
  )
  return { markdownId: markdown.id, pdfId, plainId: plain.id }
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  seed = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
  report = await publish(seed.projectId, seed.goalId)
})
after(async () => {
  for (const app of apps) await app.close()
  await owner.end()
  await pool.end()
  await db.drop()
})

describe('getSourceContent (A11)', () => {
  it('answers a member with the inline Markdown itself, its hash and its file name, never cached', async () => {
    const base = await serve(true)
    const res = await read(base, report.markdownId, E)
    assert.equal(res.status, 200)
    assert.equal(res.cache, 'no-store')
    const content = parseSourceContent(res.json)
    assert.equal(content.text, MARKDOWN)
    assert.equal(content.sha256, createHash('sha256').update(MARKDOWN).digest('hex'), 'the hash is of these bytes')
    assert.equal(content.byteLength, Buffer.byteLength(MARKDOWN))
    assert.deepEqual(
      [content.filename, content.disposition, content.downloadUrl, content.expiresAt],
      ['sandboxed-pdf-rendering-v2.md', 'inline', null, null],
    )
  })

  it('answers the stored PDF with a URL that expires, saving it under its name only on request', async () => {
    const base = await serve(true)
    const asked = Date.now()
    const shown = parseSourceContent((await read(base, report.pdfId, E)).json)
    const saved = parseSourceContent((await read(base, report.pdfId, A, 'attachment')).json)
    assert.equal(shown.text, undefined)
    assert.equal(shown.filename, 'sandboxed-pdf-rendering-v2.pdf')
    assert.equal(shown.sha256, createHash('sha256').update(PDF).digest('hex'))
    assert.match(
      shown.downloadUrl ?? '',
      new RegExp(`/${seed.projectId}/${report.pdfId}\\?expires=${CONTENT_URL_SECONDS}$`),
    )
    assert.match(saved.downloadUrl ?? '', /&download=sandboxed-pdf-rendering-v2\.pdf$/)
    const expires = Date.parse(shown.expiresAt ?? '')
    assert.ok(expires >= asked + CONTENT_URL_SECONDS * 1000 && expires <= Date.now() + CONTENT_URL_SECONDS * 1000)
  })

  it('serves nobody else, and only report sources', async () => {
    const base = await serve(true)
    assert.equal((await read(base, report.pdfId, C)).status, 422, 'an outsider: not found, as for any unknown id')
    assert.equal((await read(base, report.pdfId, null)).status, 401)
    assert.equal((await read(base, report.plainId, E)).status, 422, 'a source that is not a report is not served here')
    assert.equal((await read(base, randomUUID(), E)).status, 422)
    assert.equal((await read(base, report.pdfId, E, 'download')).status, 422, 'an unknown disposition is refused')
  })

  it('never serves a version that was not published', async () => {
    const base = await serve(true)
    const draft = await one<{ id: string; sha256: string }>(
      `SELECT (s).id, (s).sha256 FROM (SELECT sophia.put_text_source($1, $2, 'text/markdown', '# Draft') AS s) x`,
      [seed.projectId, A],
    )
    const artifact = await one<{ artifact_id: string }>(
      `SELECT artifact_id FROM sophia.artifact_versions WHERE project_id = $1 AND source_id = $2`,
      [seed.projectId, report.markdownId],
    )
    for (const state of ['candidate', 'rejected']) {
      await owner.query(
        `INSERT INTO sophia.artifact_versions(project_id,artifact_id,source_id,source_hash,goal_id,goal_revision,
           authority_epoch,state) VALUES($1,$2,$3,$4,$5,1,1,$6)`,
        [seed.projectId, artifact.artifact_id, draft.id, draft.sha256, seed.goalId, state],
      )
      assert.equal((await read(base, draft.id, A)).status, 422, `a ${state} version`)
      await owner.query(`DELETE FROM sophia.artifact_versions WHERE project_id = $1 AND source_id = $2`, [
        seed.projectId,
        draft.id,
      ])
    }
  })

  it('gives no new URL for a source that is no longer ready, and says when the store is missing', async () => {
    const p = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const r = await publish(p.projectId, p.goalId)
    const withStore = await serve(true)
    await owner.query(`UPDATE sophia.source_objects SET state='deleted' WHERE project_id=$1 AND id=$2`, [
      p.projectId,
      r.pdfId,
    ])
    assert.equal((await read(withStore, r.pdfId, A)).status, 409)
    const without = await serve(false)
    assert.equal((await read(without, report.pdfId, E)).status, 503, 'stored bytes need the store')
    assert.equal((await read(without, report.markdownId, E)).status, 200, 'inline text does not')
  })
})
