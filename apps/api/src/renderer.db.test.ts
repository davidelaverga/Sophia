// SMC-M03 S5a part 2: the render runner's endpoints through real HTTP (level: sql-run, amendment A11, migration
// 0030). The runner proves only its capability: it claims a job under a lease, reads each file of the package
// through the API (checked against the package's hash, never a storage URL), uploads one PDF and settles with the
// kernel's receipt. A research task is admitted for real; its package is an inline HTML entry and a byte-stored
// image in an in-memory byte store.
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RenderClaim, RenderReceipt } from '@sophia/contracts'
import {
  admitResearchTask,
  createPool,
  enqueueRenderJob,
  recordRuntimeReady,
  runtimeHello,
  runtimeTokenHash,
  withActor,
  withService,
} from '@sophia/persistence'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { memoryByteStore, objectPath } from './byte-store.ts'

const A = randomUUID()
const E = randomUUID()
const RUNNER = 'render-runner-api-test-0123456789abcdef'
const HTML = '<html lang="en"><body><h1>Report</h1><img src="img/a.png"></body></html>'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const PDF = Buffer.from('%PDF-1.4\n%fake but signed\n%%EOF\n')
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')

let db: TestDatabase
let pool: pg.Pool
let owner: pg.Client
let app: FastifyInstance
let base: string
const store = memoryByteStore()
let projectId = ''
let jobId = ''
let imageId = ''
let manifest = ''

async function call(
  path: string,
  init: { method?: string; token?: string | null; lease?: string; body?: unknown; pdf?: Buffer } = {},
) {
  const headers: Record<string, string> = {}
  const token = init.token === undefined ? RUNNER : init.token
  if (token) headers.authorization = `Bearer ${token}`
  if (init.lease) headers['x-sophia-render-lease'] = init.lease
  let body: string | Buffer | undefined
  if (init.pdf) {
    headers['content-type'] = 'application/pdf'
    body = init.pdf
  } else if (init.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(init.body)
  }
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'POST',
    headers,
    ...(body === undefined ? {} : { body }),
  })
  const bytes = Buffer.from(await res.arrayBuffer())
  const json = res.headers.get('content-type')?.startsWith('application/json')
    ? (JSON.parse(bytes.toString()) as unknown)
    : null
  return { status: res.status, json, bytes, type: res.headers.get('content-type') }
}

const receipt = (outputSha: string): RenderReceipt => ({
  schema: 'sophia.pdf-render-receipt.v1',
  jobId,
  status: 'succeeded',
  error: null,
  renderer: {
    kernel: 'renderers/web/pdf/render-html.mjs',
    rendererSha256: 'f'.repeat(64),
    donor: { repository: 'davidelaverga/Sophia-Agent', commit: 'd'.repeat(40), path: 'p', blob: 'b'.repeat(40) },
    playwrightCore: '1.56.1',
    browser: 'HeadlessChrome/141.0.7390.37',
  },
  source: {
    manifestSha256: manifest,
    entry: { path: 'report.html', sha256: sha(HTML) },
    assets: [{ path: 'img/a.png', sha256: sha(PNG) }],
  },
  language: 'en',
  sandbox: { active: true, reasons: [], browserUid: 1000, renderers: 1, gpuSeccomp: 0 },
  output: {
    path: 'report.pdf',
    sha256: outputSha,
    bytes: PDF.byteLength,
    header: '%PDF-1.4',
    eof: true,
    pageCount: 1,
    pdfImages: 1,
  },
  measurements: { overflow: { measurement: 'measured', px: 0, elements: [] }, svgVisuals: 0, domImages: 1 },
  undeclaredAssets: [],
  blockedRequests: [],
  checks: [{ name: 'sandbox_active', outcome: 'passed', detail: null }],
  warnings: [],
  elapsedMs: 420,
})

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  owner = new pg.Client({ connectionString: db.ownerUrl })
  await owner.connect()
  app = buildApp({
    pool,
    verifyActor: createActorVerifier({
      issuer: 'https://x.test/auth/v1',
      audience: 'authenticated',
      secret: 'x'.repeat(40),
    }),
    byteStore: store,
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  ;({ projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] }))
  const rt = await registerRuntime(db.ownerUrl, { projectId, admin: A })
  const who = {
    tokenSha256: runtimeTokenHash(rt.token),
    runtimeUnitId: rt.runtimeUnitId,
    bridgeInstanceId: randomUUID(),
  }
  const role = { id: 'sophia-research-pdf-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:pdf' }
  await withService(pool, (c) =>
    runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [role] }),
  )
  await withService(pool, (c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
  await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  await withActor(pool, E, 'write', (c) =>
    admitResearchTask(c, projectId, {
      key: randomUUID(),
      exchangeId: null,
      request: { question: 'Which hosts render PDFs in a sandbox?', outputs: ['markdown', 'pdf'] },
      specialist: { role: role.id, route: role.route },
    }),
  )
  const task = (
    await owner.query<{ job_id: string }>(`SELECT job_id FROM sophia.research_tasks WHERE project_id=$1`, [projectId])
  ).rows[0]!
  const entry = (
    await owner.query<{ id: string }>(`SELECT id FROM sophia.put_text_source($1, $2, 'text/html; charset=utf-8', $3)`, [
      projectId,
      E,
      HTML,
    ])
  ).rows[0]!
  imageId = randomUUID()
  await owner.query(
    `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
      VALUES($1,$2,$3,'project',$4,'image/png',$5,$6,true,'ready')`,
    [projectId, imageId, E, sha(PNG), `objects/${projectId}/${imageId}`, PNG.byteLength],
  )
  await store.put(objectPath(projectId, imageId), PNG, 'image/png')
  await owner.query(`SELECT sophia.register_render_runner('api-test-runner', $1)`, [runtimeTokenHash(RUNNER)])
  const queued = await enqueueRenderJob(owner, projectId, task.job_id, 'en', [
    { path: 'report.html', role: 'entry', sourceId: entry.id },
    { path: 'img/a.png', role: 'asset', sourceId: imageId },
  ])
  jobId = queued.jobId
  manifest = queued.manifestSha256
})

after(async () => {
  await app.close()
  await owner.end()
  await pool.end()
  await db.drop()
})

describe('render runner endpoints (A11, 0030)', () => {
  let lease = ''

  it('claims only with the runner capability, and returns the job with its package', async () => {
    assert.equal((await call('/v1/renderer/claim', { token: null })).status, 401)
    assert.equal((await call('/v1/renderer/claim', { token: 'not-a-runner-but-long-enough-0123456789' })).status, 401)
    const claimed = await call('/v1/renderer/claim')
    assert.equal(claimed.status, 200, JSON.stringify(claimed.json))
    const job = (claimed.json as RenderClaim).job!
    assert.deepEqual([job.jobId, job.sourceManifestHash], [jobId, manifest])
    assert.deepEqual(
      job.files.map((f) => [f.path, f.sha256, f.byteLength]),
      [
        ['report.html', sha(HTML), Buffer.byteLength(HTML)],
        ['img/a.png', sha(PNG), PNG.byteLength],
      ],
    )
    lease = job.leaseToken
    assert.deepEqual((await call('/v1/renderer/claim')).json, { job: null }, 'nothing else to claim')
  })

  it('serves each file as bytes under the lease, checked against the package', async () => {
    const file = (path: string, l = lease) =>
      call(`/v1/renderer/jobs/${jobId}/file?path=${encodeURIComponent(path)}`, { method: 'GET', lease: l })
    const html = await file('report.html')
    assert.deepEqual([html.status, html.type, html.bytes.toString()], [200, 'application/octet-stream', HTML])
    const image = await file('img/a.png')
    assert.deepEqual([image.status, sha(image.bytes)], [200, sha(PNG)])
    assert.equal((await file('img/b.png')).status, 422, 'not in the package')
    assert.equal((await file('report.html', randomUUID())).status, 409, 'another lease')
    assert.equal(
      (await call(`/v1/renderer/jobs/${jobId}/file?path=report.html`, { method: 'GET' })).status,
      422,
      'no lease',
    )
    // Stored bytes that no longer match their record are never sent.
    store.objects.set(objectPath(projectId, imageId), Buffer.from('tampered'))
    try {
      assert.equal((await file('img/a.png')).status, 503)
    } finally {
      store.objects.set(objectPath(projectId, imageId), PNG)
    }
  })

  it('keeps the lease alive with heartbeats', async () => {
    const beat = await call(`/v1/renderer/jobs/${jobId}/heartbeat`, { body: { leaseToken: lease } })
    assert.deepEqual([beat.status, (beat.json as { state: string }).state], [200, 'continue'])
  })

  it('stores one PDF as the job output, refusing anything else and a second upload', async () => {
    const put = (pdf: Buffer) => call(`/v1/renderer/jobs/${jobId}/output`, { method: 'PUT', lease, pdf })
    assert.equal((await put(Buffer.from('<html>not a pdf</html>'))).status, 422)
    const stored = await put(PDF)
    assert.equal(stored.status, 200, JSON.stringify(stored.json))
    const out = stored.json as { sourceId: string; sha256: string; byteLength: number }
    assert.deepEqual([out.sha256, out.byteLength], [sha(PDF), PDF.byteLength])
    assert.deepEqual(store.objects.get(objectPath(projectId, out.sourceId)), PDF)
    assert.equal((await put(PDF)).status, 409, 'once')
  })

  it('settles with a receipt the contract validates', async () => {
    const settle = (body: unknown) => call(`/v1/renderer/jobs/${jobId}/settle`, { body })
    assert.equal((await settle({ leaseToken: lease, receipt: { ...receipt(sha(PDF)), status: 'done' } })).status, 422)
    assert.equal((await settle({ leaseToken: lease, receipt: { ...receipt(sha(PDF)), extra: 1 } })).status, 422)
    const done = await settle({ leaseToken: lease, receipt: receipt(sha(PDF)) })
    assert.deepEqual([done.status, done.json], [200, { state: 'succeeded', reason: null }])
  })
})
