/**
 * SDD-01 crossing: a design's render, end to end through the REAL render supervisor and the confined capture kernel
 * (capture-html.mjs on a real headless Chromium), the REAL Sophia API (A12) and PostgreSQL (0038–0041). Research with
 * HTML is admitted as start_research admits it, published through the runtime research operations, and its design
 * dispatched; the designer's operations are the runtime HTTP routes (here the test plays the designer, with a plain
 * page from @sophia/design/testing). The supervisor holds only the runner capability: it claims the capture job,
 * fetches the compiled page through the API, captures it confined at both targets, uploads every PNG its receipt
 * names and settles. What is checked: the hard gate reads the kernel's real measures; the designer's inspection hands
 * over exactly the stored PNG bytes; the candidate publishes as the report's next version with the compiled page as its
 * HTML rendition; and a Stop during a capture keeps nothing and publishes nothing.
 *
 * Needs SOPHIA_DISPOSABLE_DATABASE_URL and the confined renderer (Linux, user namespaces, the pinned headless shell);
 * skipped without them, failed without them when SOPHIA_RENDERER_REQUIRED=1.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { after, before, describe, test } from 'node:test'

const sha = (data) => createHash('sha256').update(data).digest('hex')
const env = process.getuid?.() === 0 ? { ...process.env, SOPHIA_RENDER_UID: process.env.SOPHIA_RENDER_UID ?? '1000' } : process.env

async function rendererUnavailable() {
  if (process.platform !== 'linux') return `the confined renderer runs on Linux only (here: ${process.platform})`
  const { chromiumPath } = await import('../../renderers/web/pdf/confine.mjs')
  const browser = chromiumPath(env)
  if (!existsSync(browser)) return `no headless shell at ${browser}`
  if (spawnSync('unshare', ['--user', '--map-current-user', '--net', '--pid', '--fork', 'true']).status !== 0) {
    return 'user namespaces are not available'
  }
  return null
}
const why = !process.env.SOPHIA_DISPOSABLE_DATABASE_URL ? 'needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL)' : await rendererUnavailable()
if (why && process.env.SOPHIA_RENDERER_REQUIRED === '1') throw new Error(`the design capture crossing is required here: ${why}`)

const RUNNER = `capture-runner-${randomUUID()}`
const MD_ROLE = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
const DESIGNER = { id: 'sophia-html-designer-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:designer' }
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('design capture crossing (real supervisor, capture kernel, API, PostgreSQL)', { skip: why ?? false }, () => {
  let m, db, pool, worker, owner, app, store, base, projectId, headers, rtToken, work, home, homeEnv
  const A = randomUUID()
  const E = randomUUID()
  const answered = new Set()

  before(async () => {
    const [{ buildApp }, { memoryByteStore }, persistence, testSupport, supervisor, workerPkg, testing] = await Promise.all([
      import('../../apps/api/src/app.ts'),
      import('../../apps/api/src/byte-store.ts'),
      import('../../packages/persistence/src/index.ts'),
      import('../../packages/test-support/src/index.ts'),
      import('../../renderers/web/pdf/supervisor.mjs'),
      import('../../apps/worker/src/index.ts'),
      import('../../packages/design/src/testing.ts'),
    ])
    m = { persistence, supervisor, worker: workerPkg, testing }
    // As in the PDF crossing: the supervisor finds the browser only in Playwright's default cache under its HOME.
    const { chromiumPath } = await import('../../renderers/web/pdf/confine.mjs')
    home = mkdtempSync(join(tmpdir(), 'sophia-home-'))
    chmodSync(home, 0o755)
    homeEnv = { ...env, HOME: home }
    delete homeEnv.SOPHIA_CHROMIUM_PATH
    delete homeEnv.PLAYWRIGHT_BROWSERS_PATH
    const cached = chromiumPath(homeEnv)
    mkdirSync(dirname(cached), { recursive: true, mode: 0o755 })
    symlinkSync(chromiumPath(env), cached)
    db = await testSupport.createTestDatabase()
    pool = persistence.createPool(db.apiUrl, { max: 6 })
    worker = persistence.createPool(db.workerUrl, { max: 2 })
    owner = new pg.Client({ connectionString: db.ownerUrl })
    await owner.connect()
    store = memoryByteStore()
    const verifyActor = async () => {
      throw new Error('no member calls in this crossing')
    }
    app = buildApp({ pool, verifyActor, byteStore: store })
    await app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${app.server.address().port}`
    ;({ projectId } = await testSupport.seedProject(db.ownerUrl, { admin: A, editors: [E] }))
    await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [projectId])
    await owner.query(`SELECT sophia.register_render_runner('design-crossing-runner', $1)`, [persistence.runtimeTokenHash(RUNNER)])
    const rt = await testSupport.registerRuntime(db.ownerUrl, { projectId, admin: A })
    rtToken = rt.token
    headers = { 'x-sophia-runtime-unit': rt.runtimeUnitId, 'x-sophia-bridge-instance': randomUUID(), 'x-sophia-bridge-protocol': '1' }
    assert.equal((await runtime('/v1/runtime/hello', { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD_ROLE, DESIGNER] })).status, 200)
    assert.equal((await runtime('/v1/runtime/ready', { state: 'ready', reason: null, unrecovered: [] })).status, 204)
    work = mkdtempSync(join(tmpdir(), 'sophia-design-supervisor-'))
    chmodSync(work, 0o755)
  })

  after(async () => {
    await app?.close()
    await owner?.end()
    await pool?.end()
    await worker?.end()
    await db?.drop()
    if (work) rmSync(work, { recursive: true, force: true })
    if (home) rmSync(home, { recursive: true, force: true })
  })

  async function runtime(path, body) {
    const res = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${rtToken}`, ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }

  const config = (extra = {}) => ({ apiUrl: base, token: RUNNER, workDir: work, env: homeEnv, heartbeatMs: 200, ...extra })

  /** Dispatch what is due and return the newest create for `role`, answered as delivered. */
  async function created(role) {
    await m.worker.dispatchOnce(worker, { workerId: 'crossing-worker', batchSize: 50 })
    const batch = await runtime('/v1/runtime/commands?after=0&waitMs=0')
    const command = batch.json.commands.map((q) => q.command).filter((c) => c.kind === 'create' && c.payload.role === role).at(-1)
    assert.ok(command, `a create for ${role}`)
    if (!answered.has(command.commandId)) {
      answered.add(command.commandId)
      const res = await runtime('/v1/runtime/receipts', {
        receipts: [{ commandId: command.commandId, attemptId: command.binding.attemptId, stage: 'delivered', nativeSessionId: `sophia-${command.binding.attemptId}`, nativeSequence: answered.size, evidenceRefs: [], observedAt: new Date().toISOString(), reason: null }],
      })
      assert.equal(res.status, 204, JSON.stringify(res.json))
    }
    // The goal rides along out of the request: an operation names its attempt and session only.
    return Object.defineProperty({ attemptId: command.binding.attemptId, nativeSessionId: `sophia-${command.binding.attemptId}` }, 'goalId', {
      value: command.binding.goalId,
      enumerable: false,
    })
  }

  /** Research with HTML, admitted as start_research admits it, then researched and published: its design is admitted. */
  async function published() {
    const taskId = await m.persistence.withActor(pool, E, 'write', async (c) => {
      const admission = await m.persistence.admitResearchTask(c, projectId, {
        key: randomUUID(),
        exchangeId: null,
        request: { question: `How do hosts confine a browser? ${randomUUID()}`, outputs: ['markdown'], newRequest: true },
        specialist: { role: MD_ROLE.id, route: MD_ROLE.route },
      })
      await m.persistence.requestResearchDesign(c, projectId, admission.admitted.taskId, {
        designer: { role: DESIGNER.id, route: DESIGNER.route },
        reviewer: null,
      })
      return admission.admitted.taskId
    })
    const at = await created(MD_ROLE.id)
    const reserve = await runtime('/v1/runtime/research/reserve', { ...at, callId: 'q1', kind: 'search', provider: 'tavily', amountUsd: 0.01, query: 'sandboxes' })
    const capture = await runtime('/v1/runtime/research/capture', {
      ...at, reservationId: reserve.json.reservationId, kind: 'search_results', provider: 'tavily', providerHttpStatus: 200,
      coverage: 'complete', limitations: [], results: [{ url: 'https://hosts.example.org/a', title: 'Hosts' }],
    })
    const src = String(capture.json.sourceId)
    const text = `# Sandboxed rendering\n\n## Summary\n\nHosts confine the browser [${src}].\n\n- Namespaces isolate it [${src}].\n- A seccomp filter narrows it.\n\n## Conclusion\n\nConfinement is the norm, città and señal included.\n`
    const draft = await runtime('/v1/runtime/research/draft', { ...at, callId: 'r1', expectedSha256: null, text })
    const done = await runtime('/v1/runtime/research/submit', {
      ...at, callId: 's1',
      result: { draftSha256: draft.json.sha256, title: 'Sandboxed rendering', summary: 'How hosts confine a browser.', resultSummary: 'Hosts confine it.', limitations: ['Only one host was read.'], citations: [src] },
    })
    assert.equal(done.status, 200, JSON.stringify(done.json))
    assert.equal(done.json.html?.state, 'designing', JSON.stringify(done.json))
    return { taskId, designTaskId: String(done.json.html.taskId) }
  }

  /** The designer writes the plain page and asks for its render. */
  async function rendered(at, callId) {
    const ctx = await runtime('/v1/runtime/design/context', at)
    assert.equal(ctx.status, 200, JSON.stringify(ctx.json))
    const files = m.testing.plainPage(ctx.json.package.content, { title: 'Sandboxed rendering', perSection: 2 })
    const write = await runtime('/v1/runtime/design/source', { ...at, callId: `w-${callId}`, expectedSha256: ctx.json.revision?.sha256 ?? null, files })
    assert.deepEqual([write.json.outcome, write.json.complete], ['stored', true], JSON.stringify(write.json))
    const render = await runtime('/v1/runtime/design/render', { ...at, callId: `r-${callId}`, revisionId: write.json.revisionId })
    assert.equal(render.json.state, 'queued', JSON.stringify(render.json))
    return { write: write.json, render: render.json }
  }

  test('a designed page is captured confined through the supervisor, gated on its real measures, inspected byte for byte and published', async () => {
    // The runner asks for work naming png before HTML can be offered: the supervisor's claims always name its formats.
    assert.deepEqual(await m.supervisor.runOnce(config()), { claimed: false })
    const { designTaskId } = await published()
    const at = await created(DESIGNER.id)
    const { write, render } = await rendered(at, '1')

    const lines = []
    const run = await m.supervisor.runOnce(config({ log: (l) => lines.push(l) }))
    assert.deepEqual(run, { claimed: true, jobId: render.renderJobId, outcome: 'succeeded' }, lines.join('\n'))
    assert.deepEqual(readdirSync(work), [], 'the job directory is gone')

    // The gate reads the kernel's real receipt: confined, every target and section captured, every block measured.
    const result = await runtime('/v1/runtime/design/render-result', { ...at, renderJobId: render.renderJobId })
    assert.equal(result.json.state, 'succeeded', JSON.stringify(result.json))
    assert.deepEqual(result.json.gate, { passed: true, failures: [] }, JSON.stringify(result.json.checks))
    const receipt = (await owner.query(`SELECT receipt FROM sophia.render_jobs WHERE job_id=$1`, [render.renderJobId])).rows[0].receipt
    assert.equal(receipt.sandbox.active, true, receipt.sandbox.reasons?.join('; '))
    assert.equal(receipt.renderer.kernel, 'renderers/web/pdf/capture-html.mjs')
    assert.deepEqual(receipt.targets.map((t) => t.id).toSorted(), ['w1280-light', 'w390-light'])
    for (const t of receipt.targets) {
      assert.deepEqual(t.coverage.missing, [], t.id)
      assert.deepEqual(t.page.sections.map((s) => s.id), write.sections.map((s) => s.id), t.id)
    }
    assert.deepEqual(receipt.blockedRequests, [])

    // The designer's inspection is the stored PNG, byte for byte, and the PNG is what the receipt recorded.
    const names = result.json.captures.map((c) => c.name)
    assert.ok(names.includes('w390-light.overview.1.png') && names.includes('w1280-light.overview.1.png'), names.join(', '))
    const look = await runtime('/v1/runtime/design/capture', { ...at, renderJobId: render.renderJobId, names: ['w390-light.overview.1.png'] })
    assert.equal(look.status, 200, JSON.stringify(look.json))
    const bytes = Buffer.from(look.json.captures[0].data, 'base64')
    assert.deepEqual(bytes.subarray(0, 8), PNG_SIGNATURE)
    const recorded = receipt.captures.find((c) => c.name === 'w390-light.overview.1.png')
    assert.equal(sha(bytes), recorded.sha256)
    // The overview of the 390 px target, at the scale the kernel recorded for it.
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [recorded.width, recorded.height])
    assert.equal(Math.round(recorded.width / recorded.scale), 390)

    // SDD-01-CX-0019: no reviewer runs, and measurements alone publish nothing until the designer has seen the render.
    const candidate = { revisionId: write.revisionId, renderJobId: render.renderJobId }
    const unseen = await runtime('/v1/runtime/design/submit', { ...at, callId: 'c0', candidate })
    assert.equal(unseen.json.outcome, 'refused', JSON.stringify(unseen.json))
    assert.ok(unseen.json.failures.some((f) => f.startsWith('you have not looked at')), JSON.stringify(unseen.json))
    // Every real capture is handed over, each delivery acknowledged as its own bytes (what the bundle sends once dsh's
    // content-addressed store kept the image unchanged).
    const deliveries = []
    for (let i = 0; i < names.length; i += 4) {
      const seen = await runtime('/v1/runtime/design/capture', { ...at, renderJobId: render.renderJobId, names: names.slice(i, i + 4) })
      assert.equal(seen.status, 200, JSON.stringify(seen.json))
      for (const c of seen.json.captures) assert.equal(sha(Buffer.from(c.data, 'base64')), c.sha256, c.name)
      const attachments = seen.json.captures.map((c) => ({ name: c.name, attachmentId: `sha256:${c.sha256}` }))
      const acked = await runtime('/v1/runtime/design/delivered', { ...at, deliveryId: seen.json.deliveryId, attachments })
      assert.equal(acked.status, 200, JSON.stringify(acked.json))
      deliveries.push(seen.json.deliveryId)
    }
    // #117: acknowledged but named by no submission (its submit never sent, the runtime restarted in between) counts for nothing.
    const unnamed = await runtime('/v1/runtime/design/submit', { ...at, callId: 'c0b', candidate })
    assert.equal(unnamed.json.outcome, 'refused', JSON.stringify(unnamed.json))

    // The candidate, naming its deliveries, publishes self_review_only as v2, its HTML the compiled page the kernel captured.
    const done = await runtime('/v1/runtime/design/submit', { ...at, callId: 'c1', candidate: { ...candidate, seen: deliveries } })
    assert.deepEqual([done.json.outcome, done.json.reviewState, done.json.versionNumber], ['published', 'self_review_only', 2], JSON.stringify(done.json))
    const page = (
      await owner.query(
        `SELECT so.sha256 AS page, f.sha256 AS captured FROM sophia.artifact_renditions r JOIN sophia.source_objects so ON so.id=r.source_id
           JOIN sophia.render_job_files rf ON rf.job_id=$2 AND rf.role='entry' JOIN sophia.source_objects f ON f.id=rf.source_id
          WHERE r.artifact_version_id=$1 AND r.format='html'`,
        [done.json.versionId, render.renderJobId],
      )
    ).rows[0]
    assert.equal(page.page, page.captured, 'the published page is the page the kernel captured')
    assert.equal((await owner.query(`SELECT state FROM sophia.design_tasks WHERE job_id=$1`, [designTaskId])).rows[0].state, 'published')
  })

  test('a Stop during a capture kills the kernel, keeps no capture and publishes nothing', async () => {
    const { designTaskId } = await published()
    const at = await created(DESIGNER.id)
    const { render } = await rendered(at, '2')
    const stopGoal = async () => {
      const goal = (await owner.query(`SELECT revision, authority_epoch FROM sophia.goals WHERE id=$1`, [at.goalId])).rows[0]
      await m.persistence.withActor(pool, E, 'write', (c) =>
        m.persistence.admitGoalCommand(c, projectId, randomUUID(), {
          kind: 'stop',
          goalId: at.goalId,
          expectedGoalRevision: Number(goal.revision),
          expectedAuthorityEpoch: Number(goal.authority_epoch),
          bodySourceId: null,
        }),
      )
    }
    const objects = store.objects.size
    const run = await m.supervisor.runOnce(config({ beforeRender: stopGoal }))
    assert.deepEqual(run, { claimed: true, jobId: render.renderJobId, outcome: 'cancelled' })
    const row = (await owner.query(`SELECT j.state, r.receipt FROM sophia.jobs j JOIN sophia.render_jobs r ON r.job_id=j.id WHERE j.id=$1`, [render.renderJobId])).rows[0]
    assert.deepEqual([row.state, row.receipt], ['cancelled', null])
    assert.equal(store.objects.size, objects, 'no capture was uploaded')
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM sophia.render_job_outputs WHERE job_id=$1`, [render.renderJobId])).rows[0].n, 0)
    assert.deepEqual(readdirSync(work), [])
    const late = await runtime('/v1/runtime/design/submit', { ...at, callId: 'c2', candidate: { revisionId: render.revisionId, renderJobId: render.renderJobId } })
    assert.equal(late.status, 409, JSON.stringify(late.json))
    assert.notEqual((await owner.query(`SELECT state FROM sophia.design_tasks WHERE job_id=$1`, [designTaskId])).rows[0].state, 'published')
  })
})
