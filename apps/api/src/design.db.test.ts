// SDD-01 through real HTTP (level: sql-run): HTML asked for at start_research, the design admitted with the report's
// publication, the designer's and reviewer's runtime operations (A12), the capture job through the renderer's routes,
// the hard gate, the review loop and publication. The capture receipt and its PNGs here are synthetic, so the service
// side is exercised exactly; the real confined capture kernel against this API is tests/integration's crossing.
import { createHash, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeCommand } from '@sophia/contracts'
import { plainPage } from '@sophia/design/testing'
import type { ContentPackage } from '@sophia/design'
import { createPool, readSnapshot, runtimeTokenHash, startExchange, withActor } from '@sophia/persistence'
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

async function world(roles = [MD_ROLE, DESIGNER, REVIEWER]) {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [] })
  const admin = new pg.Client({ connectionString: db.ownerUrl })
  await admin.connect()
  await admin.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
    projectId,
  ])
  await admin.end()
  const rt = await registerRuntime(db.ownerUrl, { projectId, admin: A })
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
  return done.json
}

const check = (name: string, target: string | null, outcome = 'passed') => ({ name, target, outcome, detail: null })

/** The capture runner claims the queued capture, uploads one PNG per name and settles with a receipt. */
async function captured(pkg: ContentPackage, sections: string[], issues: Record<string, string[]> = {}) {
  const claimed = await captureRunnerSeen()
  assert.equal(claimed.status, 200, JSON.stringify(claimed.json))
  const job = claimed.json.job
  assert.equal(job?.format, 'png', JSON.stringify(claimed.json))
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
        sections: sections.map((s, i) => ({ id: s, x: 0, y: i * 500, width: 390, height: 500 })),
        blocks: pkg.blocks.map((b) => ({
          id: b.id,
          section: sections[0] ?? null,
          box: { x: 0, y: 0, width: 300, height: 20 },
          fontPx: 18,
          issues: issues[b.id] ?? [],
          contrast: { ratio: 12, floor: 4.5, large: false, detail: null },
        })),
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
  return { jobId: String(job.jobId), names }
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
    await captured(pkg, sections, { [firstBlock]: ['clipped'] })
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
