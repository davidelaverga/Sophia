// SDD-01 through real HTTP (level: sql-run): HTML asked for at start_research, the design admitted with the report's
// publication, the designer's and reviewer's runtime operations (A12), the capture job through the renderer's routes,
// the hard gate, the review loop and publication. The capture receipt and its PNGs here are synthetic, so the service
// side is exercised exactly; the real confined capture kernel against this API is tests/integration's crossing.
import { createHash, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand } from '@sophia/contracts'
import { plainPage } from '@sophia/design/testing'
import type { ContentPackage } from '@sophia/design'
import {
  createPool,
  readNativeTask,
  readSnapshot,
  runtimeTokenHash,
  startExchange,
  withActor,
} from '@sophia/persistence'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { dispatchOnce } from '@sophia/worker'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { memoryByteStore } from './byte-store.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MEDIA_TOKEN = 'media-bridge-capability-for-design-tests-0001'
const RUNNER = `capture-runner-capability-${randomUUID()}`
const A = randomUUID()
const E = randomUUID()
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
)
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')
const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

const MD_ROLE = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const DESIGNER = { id: 'sophia-html-designer-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:designer' }
const REVIEWER = { id: 'sophia-visual-review-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:reviewer' }

let db: TestDatabase
let pool: pg.Pool
let worker: pg.Pool
let app: FastifyInstance
let base: string

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type Body = any

interface CallInit {
  bearer?: string
  body?: unknown
  headers?: Record<string, string>
  method?: string
  raw?: Buffer
  type?: string
}

const headersOf = (init: CallInit): Record<string, string> => ({
  ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
  ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
  ...(init.raw === undefined ? {} : { 'content-type': init.type ?? 'application/octet-stream' }),
  ...init.headers,
})

async function call(path: string, init: CallInit = {}) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? (init.body === undefined && init.raw === undefined ? 'GET' : 'POST'),
    headers: headersOf(init),
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    ...(init.raw === undefined ? {} : { body: Uint8Array.from(init.raw) }),
  })
  const text = await res.text()
  const contentType = res.headers.get('content-type') ?? ''
  const json: Body = text && contentType.includes('json') ? JSON.parse(text) : text
  return { status: res.status, json }
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  worker = createPool(db.workerUrl, { max: 2 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
  app = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, byteStore: memoryByteStore() })
  await app.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const admin = new pg.Client({ connectionString: db.ownerUrl })
  await admin.connect()
  await admin.query(`SELECT sophia.register_render_runner('design-test-runner', $1)`, [runtimeTokenHash(RUNNER)])
  await admin.end()
})
after(async () => {
  await app.close()
  await pool.end()
  await worker.end()
  await db.drop()
})

const dispatchDue = () => dispatchOnce(worker, { workerId: 'test-worker', batchSize: 50 })
const runner = (path: string, init: CallInit = {}) => call(path, { bearer: RUNNER, ...init })
/** The capture runner asks for work, naming png: HTML design can be offered from now. */
async function captureRunnerSeen() {
  const res = await runner('/v1/renderer/claim', { body: { formats: ['pdf', 'png'] } })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return res
}

async function world(roles = [MD_ROLE, DESIGNER, REVIEWER], runtimeUnitId?: string) {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [] })
  const admin = new pg.Client({ connectionString: db.ownerUrl })
  await admin.connect()
  await admin.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  await admin.end()
  const rt = await registerRuntime(db.ownerUrl, { projectId, admin: A, ...(runtimeUnitId ? { runtimeUnitId } : {}) })
  const headers = {
    'x-sophia-runtime-unit': rt.runtimeUnitId,
    'x-sophia-bridge-instance': randomUUID(),
    'x-sophia-bridge-protocol': '1',
  }
  const runtime = (path: string, body?: unknown) => call(path, { bearer: rt.token, headers, body })
  const hello = await runtime('/v1/runtime/hello', { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles })
  assert.equal(hello.status, 200, JSON.stringify(hello.json))
  assert.equal((await runtime('/v1/runtime/ready', { state: 'ready', reason: null, unrecovered: [] })).status, 204)
  const snap = await withActor(pool, E, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const exchange = await withActor(pool, E, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return { projectId, runtime, exchangeId: exchange.exchangeId }
}
type World = Awaited<ReturnType<typeof world>>

let n = 0
async function startResearch(w: World, args: object) {
  n += 1
  const res = await call('/v1/media/tool-calls', {
    bearer: MEDIA_TOKEN,
    body: {
      exchangeId: w.exchangeId,
      connectionGeneration: 1,
      callId: `d-${String(n)}`,
      name: 'start_research',
      args,
      inputEpoch: 1,
      actorId: E,
      guide: 'v1.2',
    },
  })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return res.json as { status: string; output: Body }
}

/** The create (or input) command the dispatcher sent a session, and the operation context of that session. */
async function sent(w: World, kind: 'create' | 'input', role?: string) {
  await dispatchDue()
  const batch = await w.runtime('/v1/runtime/commands?after=0&waitMs=0')
  const command = (batch.json.commands as Array<{ command: RuntimeCommand }>)
    .map((q) => q.command)
    .filter((cmd) => cmd.kind === kind && (role === undefined || cmd.payload.role === role))
    .at(-1)
  assert.ok(command, `a ${kind}${role ? ` for ${role}` : ''} was sent`)
  return {
    command,
    at: { attemptId: command.binding.attemptId, nativeSessionId: `sophia-${command.binding.attemptId}` },
  }
}

/** Research the Markdown report and publish it; HTML was asked for, so its design is admitted with it. */
async function published(w: World): Promise<Body> {
  const { at } = await sent(w, 'create', MD_ROLE.id)
  const reserve = await w.runtime('/v1/runtime/research/reserve', {
    ...at,
    callId: 'q1',
    kind: 'search',
    provider: 'tavily',
    amountUsd: 0.01,
    query: 'sandboxes',
  })
  const capture = await w.runtime('/v1/runtime/research/capture', {
    ...at,
    reservationId: reserve.json.reservationId,
    kind: 'search_results',
    provider: 'tavily',
    providerHttpStatus: 200,
    coverage: 'complete',
    limitations: [],
    results: [{ url: 'https://hosts.example.org/a', title: 'Hosts' }],
  })
  const src = String(capture.json.sourceId)
  const text = `# Sandboxed rendering\n\n## Summary\n\nHosts confine the browser [${src}].\n\n- Namespaces isolate it [${src}].\n- A seccomp filter narrows it.\n\n## Conclusion\n\nConfinement is the norm.\n`
  const draft = await w.runtime('/v1/runtime/research/draft', { ...at, callId: 'r1', expectedSha256: null, text })
  const done = await w.runtime('/v1/runtime/research/submit', {
    ...at,
    callId: 's1',
    result: {
      draftSha256: draft.json.sha256,
      title: 'Sandboxed rendering',
      summary: 'How hosts confine a browser.',
      resultSummary: 'Hosts confine it.',
      limitations: ['Only one host was read.'],
      citations: [src],
    },
  })
  assert.equal(done.status, 200, JSON.stringify(done.json))
  return { ...done.json, citedSourceId: src }
}

const check = (name: string, target: string | null, outcome = 'passed') => ({ name, target, outcome, detail: null })

interface CaptureOptions {
  /** Issues the kernel reports per block. */
  readonly issues?: Record<string, string[]>
  /** The page source, to place each block in its section (all in the first one otherwise). */
  readonly html?: string
  /** Every section after the first moves down this far, its blocks with it: reflow. */
  readonly shift?: number
  /** Blocks that render this much taller than the others. */
  readonly grow?: Record<string, number>
}

/** Each block's section in a page source: the data-section it sits in. */
function blockSections(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of html.split('<section ').slice(1)) {
    const id = /data-section="([^"]+)"/.exec(part)?.[1]
    if (id) for (const m of part.matchAll(/data-block="([^"]+)"/g)) out.set(m[1] ?? '', id)
  }
  return out
}

/** The capture runner claims the queued capture. */
async function claimCapture(): Promise<Body> {
  const claimed = await captureRunnerSeen()
  const job = claimed.json.job
  assert.equal(job?.format, 'png', JSON.stringify(claimed.json))
  return job
}

/** The capture runner claims the queued capture, uploads one PNG per name and settles with a receipt. */
async function captured(pkg: ContentPackage, sections: string[], opts: CaptureOptions = {}) {
  return settleCapture(await claimCapture(), pkg, sections, opts)
}

/** The block measures of a page: each block in its section, one under another, the section's own place applied. */
function blockMeasures(pkg: ContentPackage, sections: string[], opts: CaptureOptions) {
  const placed = opts.html ? blockSections(opts.html) : new Map<string, string>()
  const top = (id: string) => sections.indexOf(id) * 500 + (sections.indexOf(id) > 0 ? (opts.shift ?? 0) : 0)
  const seen = new Map<string, number>()
  return pkg.blocks.map((b) => {
    const section = placed.get(b.id) ?? sections[0] ?? 's1'
    const k = seen.get(section) ?? 0
    seen.set(section, k + 1)
    return {
      id: b.id,
      section,
      box: { x: 0, y: top(section) + 30 * k, width: 300, height: 20 + (opts.grow?.[b.id] ?? 0) },
      fontPx: 18,
      issues: opts.issues?.[b.id] ?? [],
      contrast: { ratio: 12, floor: 4.5, large: false, detail: null },
    }
  })
}

/** Upload one PNG per name for a claimed capture and settle it with a receipt; the settle's answer comes back too. */
async function settleCapture(job: Body, pkg: ContentPackage, sections: string[], opts: CaptureOptions = {}) {
  const issues = opts.issues ?? {}
  const lease = { 'x-sophia-render-lease': job.leaseToken }
  const entry = await runner(`/v1/renderer/jobs/${String(job.jobId)}/file?path=index.html`, { headers: lease })
  assert.equal(entry.status, 200)
  const targets = job.targets as string[]
  const names = targets.flatMap((t) => [`${t}.overview.1.png`, ...sections.map((s) => `${t}.section.${s}.1.png`)])
  for (const name of names) {
    const put = await runner(`/v1/renderer/jobs/${String(job.jobId)}/captures/${name}`, {
      method: 'PUT',
      raw: PNG,
      type: 'image/png',
      headers: lease,
    })
    assert.equal(put.status, 200, JSON.stringify(put.json))
  }
  const receipt = {
    schema: 'sophia.html-capture-receipt.v1',
    jobId: job.jobId,
    status: 'succeeded',
    error: null,
    renderer: {
      kernel: 'renderers/web/pdf/capture-html.mjs',
      rendererSha256: sha('kernel'),
      playwrightCore: '1.56.1',
      browser: '141.0',
    },
    source: { manifestSha256: job.sourceManifestHash, entry: { path: 'index.html', sha256: job.files[0].sha256 } },
    language: 'en',
    sandbox: { active: true },
    fonts: ['Liberation Serif'],
    targets: targets.map((id) => ({
      id,
      width: id === 'w390-light' ? 390 : 1280,
      height: 844,
      scheme: 'light',
      page: {
        width: 390,
        height: 2000,
        viewportWidth: 390,
        viewportHeight: 844,
        overflowPx: 0,
        overflowing: [],
        sections: sections.map((s, i) => ({
          id: s,
          x: 0,
          y: i * 500 + (i > 0 ? (opts.shift ?? 0) : 0),
          width: 390,
          height: 500,
        })),
        blocks: blockMeasures(pkg, sections, opts),
      },
      coverage: { requested: null, captured: sections, missing: [], margins: 0, marginsCaptured: 0, truncated: false },
    })),
    captures: names.map((name) => {
      const [target = '', kind = '', section] = name.split('.')
      return {
        name,
        target,
        kind,
        section: kind === 'section' ? section : null,
        tile: 1,
        tiles: 1,
        clip: { x: 0, y: 0, width: 390, height: 500 },
        scale: 1,
        width: 2,
        height: 2,
        sha256: sha(PNG),
        bytes: PNG.byteLength,
      }
    }),
    blockedRequests: [],
    checks: [
      check('source_verified', null),
      check('sandbox_active', null),
      check('requests_contained', null),
      check('source_unchanged', null),
      ...targets.flatMap((t) => [
        check('layout_overflow', t),
        check('blocks_visible', t, Object.keys(issues).length > 0 ? 'failed' : 'passed'),
        check('contrast', t),
        check('captures_complete', t),
      ]),
    ],
    warnings: [],
    elapsedMs: 10,
  }
  const settled = await runner(`/v1/renderer/jobs/${String(job.jobId)}/settle`, {
    body: { leaseToken: job.leaseToken, receipt },
  })
  assert.equal(settled.status, 200, JSON.stringify(settled.json))
  const reply: Body = settled.json
  return { jobId: String(job.jobId), names, settled: reply }
}

const PAGE_TITLE = 'Sandboxed rendering'

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

describe('HTML at admission (SDD-01, 0040)', () => {
  it('is refused, and nothing admitted, without a designer or a capture renderer; recorded on the task with both', async () => {
    const without = await world([MD_ROLE])
    const noDesigner = await startResearch(without, {
      question: 'How do hosts confine a browser?',
      outputs: ['markdown', 'html'],
    })
    assert.deepEqual([noDesigner.status, noDesigner.output.code], ['refused', 'not_started:html_unavailable'])
    assert.match(noDesigner.output.reason, /A Markdown report can be asked for instead/)
    const w = await world()
    await owner((c) => c.query(`UPDATE sophia.render_runners SET seen_at=NULL`))
    const noRenderer = await startResearch(w, {
      question: 'How do hosts confine a browser?',
      outputs: ['markdown', 'html'],
    })
    assert.deepEqual([noRenderer.status, noRenderer.output.code], ['refused', 'not_started:html_unavailable'])
    const tasks = await owner((c) =>
      c.query(`SELECT count(*)::int AS n FROM sophia.research_tasks WHERE project_id=$1`, [w.projectId]),
    )
    assert.equal(tasks.rows[0].n, 0, 'nothing was admitted')
    await captureRunnerSeen()
    const ok = await startResearch(w, { question: 'How do hosts confine a browser?', outputs: ['markdown', 'html'] })
    assert.equal(ok.status, 'admitted', JSON.stringify(ok))
    assert.match(ok.output.note, /HTML page is designed after the report is published/)
    const req = await owner((c) =>
      c.query(`SELECT design_request FROM sophia.research_tasks WHERE job_id=$1`, [ok.output.taskId]),
    )
    assert.deepEqual(req.rows[0].design_request.designer, { role: DESIGNER.id, route: DESIGNER.route })
    assert.deepEqual(req.rows[0].design_request.reviewer, { role: REVIEWER.id, route: REVIEWER.route })
  })
})

describe('the design, its review and its publication (SDD-01, 0038–0040)', () => {
  it('designs, gates, reviews, repairs once and publishes the reviewed page as the next version', async () => {
    const w = await world()
    await captureRunnerSeen()
    assert.equal(
      (await startResearch(w, { question: 'How do hosts confine a browser?', outputs: ['markdown', 'html'] })).status,
      'admitted',
    )
    const submission = await published(w)
    assert.equal(submission.html?.state, 'designing', JSON.stringify(submission))
    const designTask = String(submission.html.taskId)

    // The design is dispatched to the designer with its statement; its package is frozen.
    const { command, at } = await sent(w, 'create', DESIGNER.id)
    assert.match(String(command.payload.text), /^HTML design task\./)
    const ctx = await w.runtime('/v1/runtime/design/context', at)
    assert.equal(ctx.status, 200, JSON.stringify(ctx.json))
    const pkg = ctx.json.package.content as ContentPackage
    assert.ok(pkg.blocks.length >= 4, 'paragraphs, items and the limitation are blocks')
    assert.equal(ctx.json.request.title, PAGE_TITLE)

    // Unsafe source is refused and nothing is stored; a plain complete page is stored.
    const unsafe = await w.runtime('/v1/runtime/design/source', {
      ...at,
      callId: 'w0',
      expectedSha256: null,
      files: [{ path: 'index.html', text: '<!doctype html><html><body><script>alert(1)</script></body></html>' }],
    })
    assert.equal(unsafe.json.outcome, 'refused', JSON.stringify(unsafe.json))
    const files = plainPage(pkg, { title: PAGE_TITLE })
    const write = await w.runtime('/v1/runtime/design/source', { ...at, callId: 'w1', expectedSha256: null, files })
    assert.equal(write.status, 200, JSON.stringify(write.json))
    assert.deepEqual([write.json.outcome, write.json.complete, write.json.seq], ['stored', true, 1])

    // A render: compiled by the API and captured; a gate failure refuses the candidate and records nothing.
    const render1 = await w.runtime('/v1/runtime/design/render', {
      ...at,
      callId: 'r1',
      revisionId: write.json.revisionId,
    })
    assert.equal(render1.json.state, 'queued', JSON.stringify(render1.json))
    const sections = (write.json.sections as Array<{ id: string }>).map((s) => s.id)
    const firstBlock = pkg.blocks[0]?.id ?? 'b1'
    await captured(pkg, sections, { issues: { [firstBlock]: ['clipped'] } })
    const refused = await w.runtime('/v1/runtime/design/submit', {
      ...at,
      callId: 'c0',
      candidate: { revisionId: write.json.revisionId, renderJobId: render1.json.renderJobId },
    })
    assert.equal(refused.json.outcome, 'refused', JSON.stringify(refused.json))
    assert.ok((refused.json.failures as string[]).some((f) => f.includes('blocks_visible')))

    // A clean render passes; the candidate goes to an independent reviewer.
    const render2 = await w.runtime('/v1/runtime/design/render', {
      ...at,
      callId: 'r2',
      revisionId: write.json.revisionId,
    })
    const shots = await captured(pkg, sections)
    const result = await w.runtime('/v1/runtime/design/render-result', { ...at, renderJobId: render2.json.renderJobId })
    assert.equal(result.json.gate?.passed, true, JSON.stringify(result.json))
    const look = await w.runtime('/v1/runtime/design/capture', {
      ...at,
      renderJobId: render2.json.renderJobId,
      names: [shots.names[0]],
    })
    assert.equal(look.status, 200, JSON.stringify(look.json))
    assert.equal(
      Buffer.from(String(look.json.captures[0].data), 'base64').equals(PNG),
      true,
      'the actual bytes, checked',
    )
    const candidate1 = await w.runtime('/v1/runtime/design/submit', {
      ...at,
      callId: 'c1',
      candidate: {
        revisionId: write.json.revisionId,
        renderJobId: render2.json.renderJobId,
        summary: 'Mine is great.',
      },
    })
    assert.equal(candidate1.json.outcome, 'reviewing', JSON.stringify(candidate1.json))

    // The reviewer sees the candidate, never the author's summary; a pass needs real inspection.
    const review = await sent(w, 'create', REVIEWER.id)
    const rctx = await w.runtime('/v1/runtime/review/context', review.at)
    assert.equal(rctx.status, 200, JSON.stringify(rctx.json))
    assert.equal(
      JSON.stringify(rctx.json).includes('Mine is great.'),
      false,
      'the author’s summary stays with the author',
    )
    const early = await w.runtime('/v1/runtime/review/submit', {
      ...review.at,
      callId: 'v0',
      result: { verdict: 'pass', findings: [] },
    })
    assert.equal(early.json.outcome, 'coverage_incomplete', JSON.stringify(early.json))
    for (let i = 0; i < shots.names.length; i += 4) {
      const seen = await w.runtime('/v1/runtime/review/capture', { ...review.at, names: shots.names.slice(i, i + 4) })
      assert.equal(seen.status, 200, JSON.stringify(seen.json))
    }
    const revise = await w.runtime('/v1/runtime/review/submit', {
      ...review.at,
      callId: 'v1',
      result: {
        verdict: 'needs_revision',
        findings: [{ severity: 'major', issue: 'The summary is buried.', fix: 'Lead with it.' }],
      },
    })
    assert.equal(revise.json.decision?.outcome, 'revision_requested', JSON.stringify(revise.json))

    // The designer gets the findings as an input, patches inside its scope, renders and submits again.
    const repair = await sent(w, 'input')
    assert.match(String(repair.command.payload.text), /The summary is buried\./)
    const html = files.find((f) => f.path === 'index.html')?.text ?? ''
    const patch = await w.runtime('/v1/runtime/design/patch', {
      ...at,
      callId: 'p1',
      expectedSha256: write.json.sha256,
      edits: [{ path: 'styles.css', find: 'max-width: 42rem;', replace: 'max-width: 40rem;' }],
    })
    assert.deepEqual([patch.json.outcome, patch.json.seq], ['stored', 2], JSON.stringify(patch.json))
    assert.match(String(patch.json.diff), /-body \{ font: 18px\/1\.6 Georgia, serif; margin: 0 auto; max-width: 42rem;/)
    assert.ok(html.length > 0)
    const render3 = await w.runtime('/v1/runtime/design/render', {
      ...at,
      callId: 'r3',
      revisionId: patch.json.revisionId,
    })
    const shots3 = await captured(pkg, sections)
    const candidate2 = await w.runtime('/v1/runtime/design/submit', {
      ...at,
      callId: 'c2',
      candidate: { revisionId: patch.json.revisionId, renderJobId: render3.json.renderJobId },
    })
    assert.deepEqual(
      [candidate2.json.outcome, candidate2.json.round],
      ['reviewing', 2],
      JSON.stringify(candidate2.json),
    )

    const review2 = await sent(w, 'create', REVIEWER.id)
    for (let i = 0; i < shots3.names.length; i += 4) {
      await w.runtime('/v1/runtime/review/capture', { ...review2.at, names: shots3.names.slice(i, i + 4) })
    }
    const pass = await w.runtime('/v1/runtime/review/submit', {
      ...review2.at,
      callId: 'v2',
      result: { verdict: 'pass', findings: [] },
    })
    assert.equal(pass.json.decision?.outcome, 'published', JSON.stringify(pass.json))

    // The reviewed page is v2's HTML rendition; v1's Markdown is unchanged; the design and the goal are done.
    const rows = await owner((c) =>
      c.query(
        `SELECT v.version_number, v.source_hash, r.format, r.review_state, j.state AS job, g.status AS goal
           FROM sophia.design_tasks t JOIN sophia.artifact_versions v ON v.id=t.published_version_id
           JOIN sophia.artifact_renditions r ON r.artifact_version_id=v.id AND r.format='html'
           JOIN sophia.jobs j ON j.id=t.job_id JOIN sophia.work_attempts a ON a.id=j.attempt_id JOIN sophia.goals g ON g.id=a.goal_id
          WHERE t.job_id=$1`,
        [designTask],
      ),
    )
    assert.deepEqual(rows.rows[0], {
      version_number: 2,
      source_hash: submission.sha256,
      format: 'html',
      review_state: 'reviewed',
      job: 'succeeded',
      goal: 'completed',
    })
  })

  it('publishes as self_review_only, labelled, when no reviewer is advertised', async () => {
    const w = await world([MD_ROLE, DESIGNER])
    await captureRunnerSeen()
    assert.equal(
      (await startResearch(w, { question: 'Which hosts confine a browser?', outputs: ['markdown', 'html'] })).status,
      'admitted',
    )
    const submission = await published(w)
    const { at } = await sent(w, 'create', DESIGNER.id)
    const pkg = (await w.runtime('/v1/runtime/design/context', at)).json.package.content as ContentPackage
    const write = await w.runtime('/v1/runtime/design/source', {
      ...at,
      callId: 'w1',
      expectedSha256: null,
      files: plainPage(pkg),
    })
    const render = await w.runtime('/v1/runtime/design/render', {
      ...at,
      callId: 'r1',
      revisionId: write.json.revisionId,
    })
    await captured(
      pkg,
      (write.json.sections as Array<{ id: string }>).map((s) => s.id),
    )
    const done = await w.runtime('/v1/runtime/design/submit', {
      ...at,
      callId: 'c1',
      candidate: { revisionId: write.json.revisionId, renderJobId: render.json.renderJobId },
    })
    assert.deepEqual(
      [done.json.outcome, done.json.reviewState, done.json.versionNumber],
      ['published', 'self_review_only', 2],
      JSON.stringify(done.json),
    )
    const r = await owner((c) =>
      c.query(
        `SELECT r.limitations FROM sophia.artifact_renditions r JOIN sophia.artifact_versions v ON v.id=r.artifact_version_id
                WHERE v.id=$1 AND r.format='html'`,
        [done.json.versionId],
      ),
    )
    assert.match(String(r.rows[0].limitations[0]), /not by a separate visual reviewer/)
    assert.ok(submission.versionNumber === 1)
  })
})

// --- the lifecycle after admission (0041) ------------------------------------------------------------------------------

let callN = 0
/** A guide call for the editor E, as the voice guide makes it. */
async function guideCall(w: World, name: string, args: object, guide = 'v1.2') {
  callN += 1
  const res = await call('/v1/media/tool-calls', {
    bearer: MEDIA_TOKEN,
    body: {
      exchangeId: w.exchangeId,
      connectionGeneration: 1,
      callId: `g-${String(callN)}`,
      name,
      args,
      inputEpoch: 1,
      actorId: E,
      guide,
    },
  })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return res.json as { status: string; output: Body }
}
const control = (w: World, taskId: string, action: string, brief?: string) =>
  guideCall(w, 'control_work', { taskId, action, ...(brief ? { brief } : {}) })

const answered = new Set<string>()
let nativeSeq = 0
/**
 * Dispatch what is due, then answer at `stage` every runtime command of `kind` not answered yet (for one attempt when
 * named), as the runtime does: a create delivered, a Hold's (kind hold) or a Stop's or revocation's (kind stop) native
 * stop checked. Returns the commands.
 */
async function answer(w: World, kind: string, stage: 'delivered' | 'checked', attemptId?: string) {
  await dispatchDue()
  const batch = await w.runtime('/v1/runtime/commands?after=0&waitMs=0')
  const commands = (batch.json.commands as Array<{ command: RuntimeCommand }>)
    .map((q) => q.command)
    .filter((c) => c.kind === kind && !answered.has(c.commandId))
    .filter((c) => attemptId === undefined || c.binding.attemptId === attemptId)
  for (const c of commands) {
    nativeSeq += 1
    const res = await w.runtime('/v1/runtime/receipts', {
      receipts: [
        {
          commandId: c.commandId,
          attemptId: c.binding.attemptId,
          stage,
          nativeSessionId: `sophia-${c.binding.attemptId}`,
          nativeSequence: nativeSeq,
          evidenceRefs: [],
          observedAt: new Date().toISOString(),
          reason: null,
        },
      ],
    })
    assert.equal(res.status, 204, JSON.stringify(res.json))
    answered.add(c.commandId)
  }
  return commands
}

const erase = (projectId: string, sourceId: string) =>
  owner((c) => c.query(`SELECT sophia.mission_erase_source($1, $2)`, [projectId, sourceId]))

/** As the owner: a design task, its job, attempt and goal, and its research task's HTML state. */
async function designRow(taskId: string): Promise<Body> {
  const { rows } = await owner((c) =>
    c.query(
      `SELECT t.state, t.reason, j.state AS job, a.state AS attempt, g.status AS goal, rt.design_state, rt.design_reason,
              (SELECT array_agg(c.state ORDER BY c.round) FROM sophia.design_candidates c WHERE c.design_job_id=t.job_id) AS candidates,
              (SELECT count(*)::int FROM sophia.artifact_versions v WHERE v.artifact_id=t.artifact_id) AS versions
         FROM sophia.design_tasks t JOIN sophia.jobs j ON j.id=t.job_id JOIN sophia.work_attempts a ON a.id=j.attempt_id
         JOIN sophia.goals g ON g.id=a.goal_id JOIN sophia.research_tasks rt ON rt.job_id=t.research_job_id WHERE t.job_id=$1`,
      [taskId],
    ),
  )
  return rows[0]
}

/** As the owner: a review's job and attempt. */
async function reviewRow(attemptId: string): Promise<Body> {
  const { rows } = await owner((c) =>
    c.query(
      `SELECT j.state AS job, a.state AS attempt FROM sophia.jobs j JOIN sophia.work_attempts a ON a.id=j.attempt_id
        WHERE j.attempt_id=$1 AND j.kind='design_review'`,
      [attemptId],
    ),
  )
  return rows[0]
}

/** HTML research admitted, published, and its design dispatched to the designer (delivered unless told otherwise). */
async function designing(roles?: (typeof MD_ROLE)[], opts: { deliver?: boolean; unit?: string } = {}) {
  const w = await world(roles, opts.unit)
  await captureRunnerSeen()
  const admitted = await startResearch(w, {
    question: 'How do hosts confine a browser?',
    outputs: ['markdown', 'html'],
  })
  assert.equal(admitted.status, 'admitted', JSON.stringify(admitted))
  const submission = await published(w)
  const taskId = String(submission.html.taskId)
  const { at } = await sent(w, 'create', DESIGNER.id)
  if (opts.deliver !== false) await answer(w, 'create', 'delivered', at.attemptId)
  return { w, submission, taskId, at }
}

/** The designer writes a plain page and renders it; the runner captures it unless told not to. */
async function drafted(w: World, at: Body, opts: { perSection?: number; capture?: boolean; callId?: string } = {}) {
  const ctx = await w.runtime('/v1/runtime/design/context', at)
  assert.equal(ctx.status, 200, JSON.stringify(ctx.json))
  const pkg = ctx.json.package.content as ContentPackage
  const files = plainPage(pkg, { title: PAGE_TITLE, ...(opts.perSection ? { perSection: opts.perSection } : {}) })
  const write = await w.runtime('/v1/runtime/design/source', {
    ...at,
    callId: opts.callId ?? 'w1',
    expectedSha256: null,
    files,
  })
  assert.equal(write.json.outcome, 'stored', JSON.stringify(write.json))
  const sections = (write.json.sections as Array<{ id: string }>).map((x) => x.id)
  const render = await w.runtime('/v1/runtime/design/render', {
    ...at,
    callId: 'r1',
    revisionId: write.json.revisionId,
  })
  assert.equal(render.status, 200, JSON.stringify(render.json))
  const html = files.find((f) => f.path === 'index.html')?.text ?? ''
  const shots = opts.capture === false ? null : await captured(pkg, sections, { html })
  const stored: Body = write.json
  const queued: Body = render.json
  return { pkg, files, html, write: stored, render: queued, sections, shots }
}

/** Submit the drafted page as a candidate. */
const submitCandidate = (w: World, at: Body, d: Body, callId = 'c1') =>
  w.runtime('/v1/runtime/design/submit', {
    ...at,
    callId,
    candidate: { revisionId: d.write.revisionId, renderJobId: d.render.renderJobId },
  })

/** The reviewer inspects every capture it must. */
async function inspectAll(w: World, at: Body, names: string[]) {
  for (let i = 0; i < names.length; i += 4) {
    const seen = await w.runtime('/v1/runtime/review/capture', { ...at, names: names.slice(i, i + 4) })
    assert.equal(seen.status, 200, JSON.stringify(seen.json))
  }
}

describe('SDD-01-RF-0003: a withdrawn source stops design and review (0041)', () => {
  it('revokes the running design and its review in the erasing transaction; nothing reads, reserves, writes, renders, reviews or publishes; incurred usage settles', async () => {
    const { w, submission, taskId, at } = await designing()
    const reserved = await w.runtime('/v1/runtime/design/reserve', {
      ...at,
      callId: 'm1',
      kind: 'model',
      provider: 'openai',
      amountUsd: 0.01,
    })
    assert.equal(reserved.json.state, 'reserved', JSON.stringify(reserved.json))
    const d = await drafted(w, at)
    const shots = d.shots?.names ?? []
    assert.equal((await submitCandidate(w, at, d)).json.outcome, 'reviewing')
    const review = await sent(w, 'create', REVIEWER.id)
    await answer(w, 'create', 'delivered', review.at.attemptId)
    assert.equal((await w.runtime('/v1/runtime/review/context', review.at)).status, 200)

    // CX-0003's reproduction: a cited research source is erased after the design froze its package.
    await erase(w.projectId, submission.citedSourceId)

    const row = await designRow(taskId)
    assert.deepEqual([row.state, row.job, row.attempt, row.design_state], ['failed', 'failed', 'revoked', 'failed'])
    assert.match(row.reason, /^revoked: a source the report drew on was withdrawn/)
    assert.match(row.design_reason, /^The HTML was not published: revoked/)
    assert.deepEqual(row.candidates, ['failed'])
    assert.deepEqual(await reviewRow(review.at.attemptId), { job: 'failed', attempt: 'revoked' })

    // Every fenced operation of either role is refused, and a render's result is not read.
    const refusals: Array<[string, object]> = [
      ['/v1/runtime/design/context', at],
      ['/v1/runtime/design/reserve', { ...at, callId: 'm2', kind: 'model', provider: 'openai', amountUsd: 0.01 }],
      ['/v1/runtime/design/record', { ...at, callId: 'k1', entries: [{ kind: 'note', body: 'x' }] }],
      ['/v1/runtime/design/source', { ...at, callId: 'w9', expectedSha256: d.write.sha256, files: d.files }],
      ['/v1/runtime/design/render', { ...at, callId: 'r9', revisionId: d.write.revisionId }],
      ['/v1/runtime/design/render-result', { ...at, renderJobId: d.render.renderJobId }],
      ['/v1/runtime/design/capture', { ...at, renderJobId: d.render.renderJobId, names: [shots[0]] }],
      [
        '/v1/runtime/design/submit',
        { ...at, callId: 'c9', candidate: { revisionId: d.write.revisionId, renderJobId: d.render.renderJobId } },
      ],
      [
        '/v1/runtime/design/reserve',
        { ...review.at, callId: 'm3', kind: 'model', provider: 'openai', amountUsd: 0.01 },
      ],
      ['/v1/runtime/review/context', review.at],
      ['/v1/runtime/review/capture', { ...review.at, names: [shots[0]] }],
      ['/v1/runtime/review/submit', { ...review.at, callId: 'v9', result: { verdict: 'pass', findings: [] } }],
    ]
    for (const [path, body] of refusals) {
      const res = await w.runtime(path, body)
      assert.equal(res.status, 409, `${path}: ${JSON.stringify(res.json)}`)
      assert.match(String(res.json.message), /a source it drew on was withdrawn/, path)
    }

    // What was already incurred settles: settle is never fenced.
    const settled = await w.runtime('/v1/runtime/design/settle', {
      ...at,
      reservationId: reserved.json.reservationId,
      outcome: 'settled',
      costUsd: 0.004,
    })
    assert.deepEqual([settled.status, settled.json.state], [200, 'settled'], JSON.stringify(settled.json))

    // A restarted runtime is told both sessions are stopped, never to load them; then it reports ready again.
    const hello = await w.runtime('/v1/runtime/hello', {
      bundle: 'test',
      protocolVersion: 1,
      dshVersion: 'x',
      roles: [MD_ROLE, DESIGNER, REVIEWER],
    })
    const states = Object.fromEntries((hello.json.bindings as Body[]).map((b) => [b.attemptId, b.state]))
    assert.deepEqual(
      [states[at.attemptId], states[review.at.attemptId]],
      ['stopped', 'stopped'],
      JSON.stringify(hello.json.bindings),
    )
    assert.equal((await w.runtime('/v1/runtime/ready', { state: 'ready', reason: null, unrecovered: [] })).status, 204)

    // Both sessions are stopped through native stops; once checked, nothing is under way and nothing was published.
    const stops = await answer(w, 'stop', 'checked')
    assert.deepEqual(
      stops.map((c) => c.binding.attemptId).toSorted(),
      [at.attemptId, review.at.attemptId].toSorted(),
      'a native stop for the designer and for the reviewer',
    )
    const settledRow = await designRow(taskId)
    assert.deepEqual([settledRow.goal, settledRow.versions], ['completed', 1], 'the report keeps its one version')
  })

  it('revokes a design that has not started, and one on a held goal; Resume never restarts it and the goal completes', async () => {
    // Not started: its create is superseded and never sent.
    const fresh = await designing(undefined, { deliver: false })
    await erase(fresh.w.projectId, fresh.submission.citedSourceId)
    assert.deepEqual(
      [(await designRow(fresh.taskId)).state, (await designRow(fresh.taskId)).attempt],
      ['failed', 'revoked'],
    )
    const { rows } = await owner((c) =>
      c.query(
        `SELECT o.state FROM sophia.outbox o JOIN sophia.execution_bindings b ON b.id=o.binding_id WHERE b.attempt_id=$1 AND o.destination='native.create'`,
        [fresh.at.attemptId],
      ),
    )
    assert.ok(
      rows.every((r: Body) => r.state !== 'pending'),
      JSON.stringify(rows),
    )

    // Held: the Hold settles, the source goes, the Resume completes the goal with nothing to resume.
    const { w, submission, taskId, at } = await designing()
    assert.equal((await control(w, taskId, 'hold')).status, 'ok')
    await answer(w, 'hold', 'checked')
    assert.equal((await designRow(taskId)).goal, 'held')
    await erase(w.projectId, submission.citedSourceId)
    assert.deepEqual([(await designRow(taskId)).state, (await designRow(taskId)).attempt], ['failed', 'revoked'])
    assert.equal((await control(w, taskId, 'resume')).status, 'ok')
    await dispatchDue()
    const batch = await w.runtime('/v1/runtime/commands?after=0&waitMs=0')
    const resumed = (batch.json.commands as Array<{ command: RuntimeCommand }>).filter(
      (q) => q.command.kind === 'resume' && q.command.binding.attemptId === at.attemptId,
    )
    assert.equal(resumed.length, 0, 'the revoked session is never resumed')
    assert.equal((await designRow(taskId)).goal, 'completed')
  })
})

describe('Hold, Resume and Stop of a design (B-20, 0041)', () => {
  it('a render under way during a Hold waits; a late operation is refused; after Resume the render and the review finish and publish', async () => {
    const { w, taskId, at } = await designing()
    const d = await drafted(w, at, { capture: false })
    const job = await claimCapture()
    assert.equal((await control(w, taskId, 'hold')).status, 'ok')
    // The render settles while held: queued again for after Resume, not settled.
    const held = await settleCapture(job, d.pkg, d.sections, { html: d.html })
    assert.deepEqual([held.settled.state, held.settled.reason], ['pending', 'held: queued again for after Resume'])
    const late = await w.runtime('/v1/runtime/design/render', { ...at, callId: 'r2', revisionId: d.write.revisionId })
    assert.equal(late.status, 409, JSON.stringify(late.json))
    await answer(w, 'hold', 'checked')
    assert.equal((await designRow(taskId)).goal, 'held')
    assert.equal((await captureRunnerSeen()).json.job ?? null, null, 'a held goal’s render is not handed out')

    assert.equal((await control(w, taskId, 'resume')).status, 'ok')
    await answer(w, 'resume', 'delivered')
    const shots = await captured(d.pkg, d.sections, { html: d.html })
    assert.equal((await submitCandidate(w, at, d)).json.outcome, 'reviewing')

    // A Hold during the review: the reviewer's verdict is refused until Resume, then publishes.
    const review = await sent(w, 'create', REVIEWER.id)
    await answer(w, 'create', 'delivered', review.at.attemptId)
    await inspectAll(w, review.at, shots.names)
    assert.equal((await control(w, taskId, 'hold')).status, 'ok')
    const verdict = { ...review.at, callId: 'v1', result: { verdict: 'pass', findings: [] } }
    const refused = await w.runtime('/v1/runtime/review/submit', verdict)
    assert.equal(refused.status, 409, JSON.stringify(refused.json))
    await answer(w, 'hold', 'checked')
    assert.equal((await control(w, taskId, 'resume')).status, 'ok')
    await answer(w, 'resume', 'delivered')
    const pass = await w.runtime('/v1/runtime/review/submit', verdict)
    assert.equal(pass.json.decision?.outcome, 'published', JSON.stringify(pass.json))
    assert.deepEqual([(await designRow(taskId)).state, (await designRow(taskId)).versions], ['published', 2])
  })

  it('a Stop during the review: the late verdict is refused, nothing is published, the report stays done', async () => {
    const { w, taskId, at } = await designing()
    const d = await drafted(w, at)
    assert.equal((await submitCandidate(w, at, d)).json.outcome, 'reviewing')
    const review = await sent(w, 'create', REVIEWER.id)
    await answer(w, 'create', 'delivered', review.at.attemptId)
    await inspectAll(w, review.at, d.shots?.names ?? [])
    assert.equal((await control(w, taskId, 'stop')).status, 'ok')
    await answer(w, 'stop', 'checked')
    const late = await w.runtime('/v1/runtime/review/submit', {
      ...review.at,
      callId: 'v1',
      result: { verdict: 'pass', findings: [] },
    })
    assert.equal(late.status, 409, JSON.stringify(late.json))
    const row = await designRow(taskId)
    assert.deepEqual([row.state, row.job, row.versions, row.goal], ['cancelled', 'cancelled', 1, 'completed'])
    assert.deepEqual(row.candidates, ['failed'])
  })

  it('Resume starts a review that was admitted but never started before the Hold', async () => {
    const { w, taskId, at } = await designing()
    const d = await drafted(w, at)
    assert.equal((await submitCandidate(w, at, d)).json.outcome, 'reviewing')
    // Held before the review's create is sent: its binding settles with no session to fence.
    assert.equal((await control(w, taskId, 'hold')).status, 'ok')
    await answer(w, 'hold', 'checked')
    assert.equal((await designRow(taskId)).goal, 'held')
    const held = await w.runtime('/v1/runtime/commands?after=0&waitMs=0')
    const reviewCreates = (b: Body) =>
      (b.json.commands as Array<{ command: RuntimeCommand }>).filter(
        (q) => q.command.kind === 'create' && q.command.payload.role === REVIEWER.id,
      )
    assert.equal(reviewCreates(held).length, 0)
    assert.equal((await control(w, taskId, 'resume')).status, 'ok')
    await dispatchDue()
    const resumed = await w.runtime('/v1/runtime/commands?after=0&waitMs=0')
    assert.equal(reviewCreates(resumed).length, 1, 'the review is queued at Resume and sent')
  })
})

describe('a steer reaches the running designer (B-15)', () => {
  it('is the speaker’s contribution, delivered to the design’s own session, which can still act on it', async () => {
    const { w, taskId, at } = await designing()
    const d = await drafted(w, at, { capture: false })
    const brief = 'Lead with the conclusion, then the summary.'
    const steer = await control(w, taskId, 'steer', brief)
    assert.equal(steer.status, 'ok', JSON.stringify(steer))
    const delivered = await answer(w, 'steer', 'delivered', at.attemptId)
    assert.equal(delivered.length, 1, 'the steer reached the designer’s session')
    assert.equal(delivered[0]?.payload.text, brief)
    // The designer acts on it: its operations stay authorized under the steer.
    const patch = await w.runtime('/v1/runtime/design/patch', {
      ...at,
      callId: 'p1',
      expectedSha256: d.write.sha256,
      edits: [{ path: 'styles.css', find: 'max-width: 42rem;', replace: 'max-width: 40rem;' }],
    })
    assert.deepEqual([patch.status, patch.json.outcome, patch.json.seq], [200, 'stored', 2], JSON.stringify(patch.json))
    const said = await owner((c) =>
      c.query(
        `SELECT count(*)::int AS n FROM sophia.contributions c JOIN sophia.source_texts t ON t.source_id=c.source_id
          WHERE c.project_id=$1 AND c.actor_id=$2 AND t.body=$3`,
        [w.projectId, E, brief],
      ),
    )
    assert.equal(said.rows[0].n, 1, 'kept as the speaker’s own contribution')
  })
})

describe('a scoped edit of a published page (B-16..B-18, 0041)', () => {
  /** A report whose page was designed in three sections and published (no reviewer, so self_review_only). */
  async function publishedPage() {
    const { w, submission, taskId, at } = await designing([MD_ROLE, DESIGNER])
    const d = await drafted(w, at, { perSection: 2 })
    const done = await submitCandidate(w, at, d)
    assert.deepEqual([done.json.outcome, done.json.versionNumber], ['published', 2], JSON.stringify(done.json))
    return { w, submission, designTask: taskId, d, versionId: String(done.json.versionId) }
  }

  const edit = async (w: World, key: string, body: object, actor = E) =>
    call(`/api/v1/projects/${w.projectId}/html-edits`, {
      bearer: await token(actor),
      body,
      headers: { 'idempotency-key': key },
    })

  it('is refused, with nothing admitted, for a stale version, a section the page lacks, or a viewer’s request', async () => {
    const { w, submission, d, versionId } = await publishedPage()
    const stale = await edit(w, 'e-0', {
      versionId: submission.versionId,
      sections: ['s1'],
      instruction: 'Tighten it.',
    })
    assert.deepEqual([stale.status, stale.json.code], [409, 'stale_revision'], JSON.stringify(stale.json))
    const missing = await edit(w, 'e-1', { versionId, sections: ['nope'], instruction: 'Tighten it.' })
    assert.equal(missing.status, 422, JSON.stringify(missing.json))
    assert.match(missing.json.message, /The page has no section nope/)
    const tasks = await owner((c) =>
      c.query(
        `SELECT count(*)::int AS n FROM sophia.design_tasks WHERE artifact_id=(SELECT artifact_id FROM sophia.artifact_versions WHERE id=$1)`,
        [versionId],
      ),
    )
    assert.equal(tasks.rows[0].n, 1, 'only the first design')
    assert.ok(d.sections.includes('s2'))
  })

  it('is asked for by voice with guide v1.3, from the sections project_status lists; v1.2 does not declare it', async () => {
    const { w, submission } = await publishedPage()
    const researchTask = String(submission.taskId)
    // The bridge checks the API's surface for its version before it connects: v1.3 is v1.2's eight and the edit.
    const surface = await call('/v1/media/tool-surface?guide=v1.3', { bearer: MEDIA_TOKEN })
    const names = surface.json.names as string[]
    assert.deepEqual(names.slice(-3), ['start_research', 'render_research', 'revise_html_page'])
    assert.equal(names.length, 9)
    const status = await guideCall(w, 'project_status', {}, 'v1.3')
    const row = (status.output.work as Body[]).find((x) => x.taskId === researchTask)
    assert.deepEqual(
      [row?.htmlPage?.versionNumber, row?.htmlPage?.sections, row?.htmlPage?.reviewState],
      [2, ['s1', 's2', 's3', 'sources'], 'self_review_only'],
      JSON.stringify(row),
    )
    assert.deepEqual(status.output.operations.revise_html_page, { available: true, reason: null })
    const args = { taskId: researchTask, sections: ['s2'], instruction: 'Turn the second section into a short list.' }
    const older = await guideCall(w, 'revise_html_page', args, 'v1.2')
    assert.deepEqual([older.status, older.output.code], ['refused', 'not_started:not_declared'])
    const asked = await guideCall(w, 'revise_html_page', args, 'v1.3')
    assert.equal(asked.status, 'admitted', JSON.stringify(asked))
    assert.match(asked.output.note, /^Admitted, not revised yet: only s2 can change\./)
    const { command } = await sent(w, 'create', DESIGNER.id)
    assert.match(String(command.payload.text), /Turn the second section into a short list\./)
    const busy = await guideCall(w, 'revise_html_page', { ...args, sections: ['s1'] }, 'v1.3')
    assert.equal(busy.status, 'refused', JSON.stringify(busy))
  })

  it('revises only the named section: protected sections, the shell and the stylesheet are refused; a stale base conflicts; the published page is next version', async () => {
    const { w, d, versionId } = await publishedPage()
    const asked = await edit(w, 'e-1', {
      versionId,
      sections: ['s2'],
      instruction: 'Make the second section a short list.',
    })
    assert.equal(asked.status, 202, JSON.stringify(asked.json))
    assert.deepEqual(
      [asked.json.state, asked.json.sections, asked.json.shell, asked.json.styles],
      ['designing', ['s2'], false, false],
    )
    const again = await edit(w, 'e-1', {
      versionId,
      sections: ['s2'],
      instruction: 'Make the second section a short list.',
    })
    assert.equal(again.json.taskId, asked.json.taskId, 'the same key is the same edit')
    const other = await edit(w, 'e-2', { versionId, sections: ['s1'], instruction: 'Something else.' })
    assert.equal(other.status, 409, 'one design of a page at a time')

    // The edit is dispatched with the person's words and its scope; it starts from the published page.
    const { command, at } = await sent(w, 'create', DESIGNER.id)
    assert.match(String(command.payload.text), /^HTML edit task\./)
    assert.match(String(command.payload.text), /Make the second section a short list\./)
    assert.match(String(command.payload.text), /Change only the sections s2\./)
    await answer(w, 'create', 'delivered', at.attemptId)
    const ctx = await w.runtime('/v1/runtime/design/context', at)
    assert.equal(ctx.status, 200, JSON.stringify(ctx.json))
    assert.deepEqual(
      [ctx.json.mode, ctx.json.scope.sections, ctx.json.request.instruction],
      ['edit', ['s2'], 'Make the second section a short list.'],
    )
    assert.deepEqual(
      [ctx.json.revision.seq, ctx.json.revision.sha256],
      [1, d.write.sha256],
      'revision 1 is the published page',
    )

    // The gate refuses a candidate that changes nothing.
    const unchanged = await w.runtime('/v1/runtime/design/render', {
      ...at,
      callId: 'r0',
      revisionId: ctx.json.revision.revisionId,
    })
    await captured(d.pkg, d.sections, { html: d.html })
    const same = await w.runtime('/v1/runtime/design/submit', {
      ...at,
      callId: 'c0',
      candidate: { revisionId: ctx.json.revision.revisionId, renderJobId: unchanged.json.renderJobId },
    })
    assert.equal(same.json.outcome, 'refused', JSON.stringify(same.json))
    assert.ok(
      (same.json.failures as string[]).some((f) => f.startsWith('the source is unchanged from the published page')),
    )

    // B-17: a protected section, the stylesheet or a whole rewrite is refused, and nothing is stored.
    const s1 = /<section id="s1"[\s\S]*?<\/section>/.exec(d.html)?.[0] ?? ''
    const s2 = /<section id="s2"[\s\S]*?<\/section>/.exec(d.html)?.[0] ?? ''
    const protectedEdit = await w.runtime('/v1/runtime/design/patch', {
      ...at,
      callId: 'p1',
      expectedSha256: d.write.sha256,
      edits: [
        {
          path: 'index.html',
          find: s1,
          replace: s1.replace('<section id="s1" data-section="s1">', '<section id="s1" data-section="s1" class="x">'),
        },
      ],
    })
    assert.equal(protectedEdit.json.outcome, 'refused', JSON.stringify(protectedEdit.json))
    assert.ok((protectedEdit.json.findings as Array<{ code: string }>).some((f) => f.code === 'scope_section_changed'))
    const restyle = await w.runtime('/v1/runtime/design/patch', {
      ...at,
      callId: 'p2',
      expectedSha256: d.write.sha256,
      edits: [{ path: 'styles.css', find: 'max-width: 42rem;', replace: 'max-width: 30rem;' }],
    })
    assert.ok(
      (restyle.json.findings as Array<{ code: string }>).some((f) => f.code === 'scope_styles_changed'),
      JSON.stringify(restyle.json),
    )
    const rewrite = await w.runtime('/v1/runtime/design/source', {
      ...at,
      callId: 'w2',
      expectedSha256: d.write.sha256,
      files: d.files.map((f) =>
        f.path === 'index.html' ? { ...f, text: f.text.replace(s1, s1.replace('<p ', '<p class="lead" ')) } : f,
      ),
    })
    assert.equal(rewrite.json.outcome, 'refused', 'a whole write is held to the scope too')

    // An in-scope patch is stored; B-18: a patch against the old base afterwards conflicts.
    const inScope = await w.runtime('/v1/runtime/design/patch', {
      ...at,
      callId: 'p3',
      expectedSha256: d.write.sha256,
      edits: [
        {
          path: 'index.html',
          find: s2,
          replace: s2.replace(
            '<section id="s2" data-section="s2">',
            '<section id="s2" data-section="s2" class="list">',
          ),
        },
      ],
    })
    assert.deepEqual([inScope.json.outcome, inScope.json.seq], ['stored', 2], JSON.stringify(inScope.json))
    const staleBase = await w.runtime('/v1/runtime/design/patch', {
      ...at,
      callId: 'p4',
      expectedSha256: d.write.sha256,
      edits: [{ path: 'index.html', find: '<main>', replace: '<main class="m">' }],
    })
    assert.deepEqual([staleBase.status, staleBase.json.code], [409, 'stale_revision'], JSON.stringify(staleBase.json))

    // The gate: a protected section that renders differently is refused; reflow is not.
    const firstS1Block = [...blockSections(d.html)].find(([, sec]) => sec === 's1')?.[0] ?? ''
    const changed = await w.runtime('/v1/runtime/design/render', {
      ...at,
      callId: 'r1',
      revisionId: inScope.json.revisionId,
    })
    await captured(d.pkg, d.sections, { html: d.html, grow: { [firstS1Block]: 12 } })
    const refused = await w.runtime('/v1/runtime/design/submit', {
      ...at,
      callId: 'c1',
      candidate: { revisionId: inScope.json.revisionId, renderJobId: changed.json.renderJobId },
    })
    assert.equal(refused.json.outcome, 'refused', JSON.stringify(refused.json))
    assert.ok(
      (refused.json.failures as string[]).some((f) => f.startsWith('protected section s1 changed at')),
      JSON.stringify(refused.json),
    )
    const reflowed = await w.runtime('/v1/runtime/design/render', {
      ...at,
      callId: 'r2',
      revisionId: inScope.json.revisionId,
    })
    await captured(d.pkg, d.sections, { html: d.html, shift: 40 })
    const done = await w.runtime('/v1/runtime/design/submit', {
      ...at,
      callId: 'c2',
      candidate: { revisionId: inScope.json.revisionId, renderJobId: reflowed.json.renderJobId },
    })
    assert.deepEqual(
      [done.json.outcome, done.json.reviewState, done.json.versionNumber],
      ['published', 'self_review_only', 3],
      JSON.stringify(done.json),
    )

    const v3 = await owner((c) =>
      c.query(`SELECT change_note, trigger FROM sophia.artifact_versions WHERE id=$1`, [done.json.versionId]),
    )
    assert.match(v3.rows[0].change_note, /^Revises the designed HTML page \(s2\)/)
    assert.deepEqual([v3.rows[0].trigger.mode, v3.rows[0].trigger.sections], ['edit', ['s2']])
    // The research task's HTML state is the first design's; the edit is a design task of its own.
    const progress = await withActor(pool, E, 'read', (c) => readNativeTask(c, w.projectId, String(asked.json.taskId)))
    assert.deepEqual(
      [progress.design?.mode, progress.design?.scope?.sections, progress.design?.state],
      ['edit', ['s2'], 'published'],
    )
  })
})

describe('a runtime unit’s terminal bindings are closed through the native boundary before cutover (CX-0006, 0041)', () => {
  it('stops each binding whose work and goal ended, settles it on the old runtime’s receipt, and changes nothing else', async () => {
    // A unit of its own: the function closes every terminal binding of the unit it names, in every project.
    const unit = `sophia-runtime-cutover-${randomUUID().slice(0, 8)}`
    const { w, at } = await designing([MD_ROLE, DESIGNER], { unit })
    const d = await drafted(w, at)
    assert.equal((await submitCandidate(w, at, d)).json.outcome, 'published')
    // A second project's design still at work on the same unit is left alone.
    const busy = await designing([MD_ROLE, DESIGNER], { unit })
    const ledger = () =>
      owner((c) =>
        c.query(
          `SELECT b.state AS binding, a.state AS attempt, g.status AS goal, j.state AS job,
                  (SELECT array_agg(r.state ORDER BY r.id) FROM sophia.research_reservations r WHERE r.project_id=b.project_id) AS reservations
             FROM sophia.execution_bindings b JOIN sophia.work_attempts a ON a.id=b.attempt_id JOIN sophia.goals g ON g.id=a.goal_id
             JOIN sophia.jobs j ON j.attempt_id=b.attempt_id AND j.parent_job_id IS NULL WHERE b.project_id=$1 ORDER BY j.kind`,
          [w.projectId],
        ),
      )
    type Row = { binding: string; attempt: string; goal: string; job: string; reservations: string[] | null }
    const opened: Row[] = (await ledger()).rows
    // Publication leaves both sessions open (0012), so the unit's guard could never be met on its own.
    assert.deepEqual(
      opened.map((r) => [['launching', 'running'].includes(r.binding), r.attempt, r.goal, r.job]),
      [
        [true, 'accepted', 'completed', 'succeeded'],
        [true, 'accepted', 'completed', 'succeeded'],
      ],
    )
    const done = (await owner((c) => c.query(`SELECT sophia.reconcile_terminal_bindings($1) AS r`, [unit]))).rows[0].r
    assert.equal(done.stopping.length, 2, JSON.stringify(done))
    // Run again before the runtime answers: the stops in flight are left to it.
    const again = (await owner((c) => c.query(`SELECT sophia.reconcile_terminal_bindings($1) AS r`, [unit]))).rows[0].r
    assert.deepEqual([again.stopping, again.inFlight], [[], 2])
    const stops = await answer(w, 'stop', 'checked')
    assert.equal(stops.length, 2)
    const closed: Row[] = (await ledger()).rows
    assert.deepEqual(
      closed.map((r) => [r.binding, r.attempt, r.goal, r.job]),
      [
        ['settled', 'accepted', 'completed', 'succeeded'],
        ['settled', 'accepted', 'completed', 'succeeded'],
      ],
    )
    assert.deepEqual(closed[0]?.reservations, opened[0]?.reservations, 'every usage record kept as it was')
    const untouched = await owner((c) =>
      c.query(`SELECT b.state FROM sophia.execution_bindings b WHERE b.project_id=$1`, [busy.w.projectId]),
    )
    assert.ok(
      untouched.rows.every((r: Body) => r.state !== 'stopping' && r.state !== 'settled'),
      JSON.stringify(untouched.rows),
    )
    // No role may call it: an operator runs it as the owner.
    const granted = await owner((c) =>
      c.query(
        `SELECT has_function_privilege('sophia_api', 'sophia.reconcile_terminal_bindings(text)', 'EXECUTE') AS api`,
      ),
    )
    assert.equal(granted.rows[0].api, false)
  })
})
