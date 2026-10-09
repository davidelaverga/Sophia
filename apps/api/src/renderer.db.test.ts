// SMC-M03 S5a part 2: the render runner's endpoints through real HTTP (level: sql-run, amendment A11, migration
// 0030). The runner proves only its capability: it claims a job under a lease, reads each file of the package
// through the API (checked against the package's hash, never a storage URL), uploads one PDF and settles with the
// kernel's receipt. A research task is admitted for real; its package is an inline HTML entry and a byte-stored
// image in an in-memory byte store that replaces on a second put, as Supabase Storage's S3 PutObject does: an object
// stays as written because the API claims each key once in the database before it writes (0044, writeOnce), never
// because the store refuses.
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RenderClaim, RenderReceipt } from '@sophia/contracts'
import {
  admitResearchTask,
  claimObjectWrite,
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
import {
  ByteStoreError,
  memoryByteStore,
  objectPath,
  writeOnce,
  WriteClaimError,
  type ByteStore,
} from './byte-store.ts'

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
const memory = memoryByteStore()
/** Every key the API asked the store to write, in order. */
const written: string[] = []
/** While set, puts wait until this many have arrived, then all go on (two uploads held at once). */
let barrier: { want: number; held: (() => void)[] } | null = null
/** For each key written, whether its claim was already committed, seen from another connection, when its bytes came. */
const claimedFirst = new Map<string, boolean>()
/** While set, the next put refuses its key as the S3 adapter's HEAD does when it finds an object there. */
let refuseNext = false
/**
 * The in-memory store, except that a put replaces whatever is at its key and never refuses, as Supabase Storage's S3
 * PutObject does (it upserts and ignores If-None-Match: upstream 307c5e31, SDD-01-CX-0015).
 */
const store: ByteStore & { objects: Map<string, Uint8Array> } = {
  ...memory,
  async put(path, bytes) {
    const seen = await owner.query(`SELECT 1 FROM sophia.object_writes WHERE storage_key = $1`, [path])
    claimedFirst.set(path, seen.rowCount === 1)
    if (refuseNext) {
      refuseNext = false
      throw new ByteStoreError(409, `store put: ${path} exists`)
    }
    written.push(path)
    memory.objects.set(path, bytes)
    const held = barrier
    if (!held) return
    await new Promise<void>((resolve) => {
      held.held.push(resolve)
      if (held.held.length >= held.want) for (const go of held.held.splice(0)) go()
    })
  },
}
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

/** A write refused because its key was written before. */
const conflict = (e: unknown) => e instanceof ByteStoreError && e.status === 409

const receipt = (outputSha: string, outputBytes = PDF.byteLength): RenderReceipt => ({
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
    bytes: outputBytes,
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
  let recorded = { sourceId: '', sha256: '', byteLength: 0 }

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

  it('says why an upload was not stored: the write claim not made (nothing sent), or a key the store refuses', async () => {
    const put = () => call(`/v1/renderer/jobs/${jobId}/output`, { method: 'PUT', lease, pdf: PDF })
    const from = written.length
    await owner.query(`REVOKE EXECUTE ON FUNCTION sophia.claim_object_write(text,text,bigint) FROM sophia_api`)
    try {
      const unclaimed = await put()
      assert.deepEqual(
        [unclaimed.status, (unclaimed.json as { code: string; message: string }).message],
        [503, 'The write claim was not made'],
      )
    } finally {
      await owner.query(`GRANT EXECUTE ON FUNCTION sophia.claim_object_write(text,text,bigint) TO sophia_api`)
    }
    assert.equal(written.length, from, 'nothing was sent to the store')
    refuseNext = true
    const refused = await put()
    assert.deepEqual([refused.status, (refused.json as { code: string; message: string }).code], [409, 'invalid_state'])
    assert.equal(written.length, from)
  })

  it('stores one PDF as the job output, refusing anything else and a second upload', async () => {
    const put = (pdf: Buffer) => call(`/v1/renderer/jobs/${jobId}/output`, { method: 'PUT', lease, pdf })
    assert.equal((await put(Buffer.from('<html>not a pdf</html>'))).status, 422)
    // Two uploads at once (a runner sending again a reply it lost), both held until both reach the store: each goes
    // to a key the database minted for it, and one is recorded.
    const other = Buffer.from('%PDF-1.4\n%another rendering, longer\n%%EOF\n')
    const from = written.length
    barrier = { want: 2, held: [] }
    // Raced: an upload refused before the store would hold the other at the barrier for good.
    const LOST = Symbol('the sentinel')
    let sentinel: NodeJS.Timeout | undefined
    const both = await Promise.race([
      Promise.all([put(PDF), put(other)]),
      new Promise<typeof LOST>((resolve) => (sentinel = setTimeout(() => resolve(LOST), 20_000))),
    ]).finally(() => {
      clearTimeout(sentinel)
      for (const go of barrier?.held.splice(0) ?? []) go()
      barrier = null
    })
    if (both === LOST) assert.fail('both uploads reach the store and are answered before the sentinel')
    assert.deepEqual(
      both.map((r) => r.status).toSorted((x, y) => x - y),
      [200, 409],
      JSON.stringify(both.map((r) => r.json)),
    )
    const keys = written.slice(from)
    assert.equal(keys.length, 2, 'both uploads reached the store')
    assert.notEqual(keys[0], keys[1], 'each to its own fresh key')
    const won = both.find((r) => r.status === 200)?.json as typeof recorded
    recorded = won
    const kept = store.objects.get(objectPath(projectId, won.sourceId))
    assert.ok(kept)
    assert.deepEqual([sha(kept), kept.byteLength], [won.sha256, won.byteLength], 'the recorded object is as written')
    const [lost] = keys.filter((k) => k !== objectPath(projectId, won.sourceId))
    const named = await owner.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.source_objects WHERE project_id=$1 AND storage_key=$2`,
      [projectId, `objects/${lost ?? ''}`],
    )
    assert.equal(named.rows[0]?.n, 0, 'the other upload’s object is named by no source')
    const claimed = await owner.query<{ storage_key: string }>(
      `SELECT storage_key FROM sophia.object_writes WHERE storage_key = ANY($1) ORDER BY storage_key`,
      [keys],
    )
    assert.deepEqual(
      claimed.rows.map((r) => r.storage_key),
      keys.toSorted(),
      'each upload claimed its key before writing',
    )
    for (const key of keys) assert.equal(claimedFirst.get(key), true, 'its claim committed before its bytes were sent')
    assert.equal((await put(PDF)).status, 409, 'once')
    assert.equal(new Set(written).size, written.length, 'no key was ever written twice')
  })

  it('writes a key once: a second or racing write of other bytes is refused before the store, the first kept', async () => {
    const claim = (racers: pg.Pool) =>
      writeOnce(store, (path, digest, length) => withService(racers, (c) => claimObjectWrite(c, path, digest, length)))
    const once = claim(pool)
    const key = objectPath(projectId, randomUUID())
    const from = written.length
    await once.put(key, PDF, 'application/pdf')
    const replacing = Buffer.from('%PDF-1.4\n%other bytes for the same key\n%%EOF\n')
    await assert.rejects(once.put(key, replacing, 'application/pdf'), conflict, 'other bytes')
    await assert.rejects(once.put(key, PDF, 'application/pdf'), conflict, 'the same bytes again: once means once')
    assert.deepEqual(store.objects.get(key), PDF, 'the first bytes, unchanged')
    assert.deepEqual(written.slice(from), [key], 'only the first write reached the store')
    assert.equal(claimedFirst.get(key), true, 'the claim committed before the bytes were sent')
    // Eight writes of different bytes to one fresh key at once, over eight connections: one is written, seven are
    // refused before the store, and what is stored is the one written, with its claim.
    const racers = createPool(db.apiUrl, { max: 8 })
    try {
      const raced = objectPath(projectId, randomUUID())
      const bodies = Array.from({ length: 8 }, (_, k) => Buffer.from(`%PDF-1.4\n%rendering ${String(k)}\n%%EOF\n`))
      const at = written.length
      const results = await Promise.allSettled(bodies.map((b) => claim(racers).put(raced, b, 'application/pdf')))
      const winners = results.flatMap((r, k) => (r.status === 'fulfilled' ? [k] : []))
      assert.equal(winners.length, 1, JSON.stringify(results.map((r) => r.status)))
      for (const r of results) if (r.status === 'rejected') assert.ok(conflict(r.reason), String(r.reason))
      const first = bodies[winners[0] ?? -1]
      assert.ok(first)
      assert.deepEqual(written.slice(at), [raced], 'one write reached the store')
      assert.deepEqual(store.objects.get(raced), first)
      const row = await owner.query<{ sha256: string; byte_length: string }>(
        `SELECT sha256, byte_length FROM sophia.object_writes WHERE storage_key=$1`,
        [raced],
      )
      assert.deepEqual(row.rows, [{ sha256: sha(first), byte_length: String(first.byteLength) }])
    } finally {
      await racers.end()
    }
    // A claim that cannot be made refuses the write: nothing reaches the store unclaimed.
    const lost = objectPath(projectId, randomUUID())
    const down = writeOnce(store, () => Promise.reject(new Error('the database did not answer')))
    await assert.rejects(
      down.put(lost, PDF, 'application/pdf'),
      (e: unknown) => e instanceof WriteClaimError && /the claim was not made/u.test(e.message),
    )
    assert.equal(store.objects.has(lost), false)
  })

  it('settles with a receipt the contract validates', async () => {
    const settle = (body: unknown) => call(`/v1/renderer/jobs/${jobId}/settle`, { body })
    const ours = receipt(recorded.sha256, recorded.byteLength)
    assert.equal((await settle({ leaseToken: lease, receipt: { ...ours, status: 'done' } })).status, 422)
    assert.equal((await settle({ leaseToken: lease, receipt: { ...ours, extra: 1 } })).status, 422)
    const done = await settle({ leaseToken: lease, receipt: ours })
    assert.deepEqual([done.status, done.json], [200, { state: 'succeeded', reason: null }])
  })
})
