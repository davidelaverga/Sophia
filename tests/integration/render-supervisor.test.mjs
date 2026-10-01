/**
 * SMC-M03 S5a part 2 crossing: the render supervisor against the REAL Sophia API (renderer endpoints, A11) on
 * PostgreSQL (0030), with the confined PDF kernel on a real headless Chromium. A research task is admitted for
 * real; its package is an inline HTML entry and a byte-stored image (in-memory byte store). The supervisor holds
 * only the runner capability: it claims, fetches every file through the API, renders confined, uploads the PDF
 * once and settles with the kernel's receipt. A Stop during the render kills the kernel and keeps nothing; a stored
 * file that no longer matches its record is never rendered; a host without a browser takes no job. The supervisor
 * finds the browser only in Playwright's default cache under its HOME (as on a CI runner), which the kernel's own
 * home, the job directory, does not have.
 *
 * Needs SOPHIA_DISPOSABLE_DATABASE_URL and the confined renderer (Linux, user namespaces, the pinned headless
 * shell); skipped without them, failed without them when SOPHIA_RENDERER_REQUIRED=1.
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
if (why && process.env.SOPHIA_RENDERER_REQUIRED === '1') throw new Error(`the renderer crossing is required here: ${why}`)

const RUNNER = `render-runner-${randomUUID()}`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
)
const HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><h1>Hosts</h1><p>Città, señal.</p><img src="img/chart.png" width="40" height="40"></body></html>'

describe('render supervisor crossing (real API, PostgreSQL, confined Chromium)', { skip: why ?? false }, () => {
  let s, db, pool, owner, app, store, base, projectId, who, work, home, homeEnv
  const A = randomUUID()
  const E = randomUUID()
  const ROLE = { id: 'sophia-research-pdf-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:pdf' }

  before(async () => {
    const [{ buildApp }, { memoryByteStore, objectPath }, persistence, testSupport, supervisor] = await Promise.all([
      import('../../apps/api/src/app.ts'),
      import('../../apps/api/src/byte-store.ts'),
      import('../../packages/persistence/src/index.ts'),
      import('../../packages/test-support/src/index.ts'),
      import('../../renderers/web/pdf/supervisor.mjs'),
    ])
    s = { persistence, testSupport, supervisor, objectPath }
    // A home whose default Playwright cache holds the browser, and an environment that names it no other way.
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
    const rt = await testSupport.registerRuntime(db.ownerUrl, { projectId, admin: A })
    who = { tokenSha256: persistence.runtimeTokenHash(rt.token), runtimeUnitId: rt.runtimeUnitId, bridgeInstanceId: randomUUID() }
    await persistence.withService(pool, (c) => persistence.runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [ROLE] }))
    await persistence.withService(pool, (c) => persistence.recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
    await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [projectId])
    await owner.query(`SELECT sophia.register_render_runner('crossing-runner', $1)`, [persistence.runtimeTokenHash(RUNNER)])
    work = mkdtempSync(join(tmpdir(), 'sophia-supervisor-'))
    // The render user (uid 1000 when this runs as root) must reach the job directories inside it.
    chmodSync(work, 0o755)
  })

  after(async () => {
    await app?.close()
    await owner?.end()
    await pool?.end()
    await db?.drop()
    if (work) rmSync(work, { recursive: true, force: true })
    if (home) rmSync(home, { recursive: true, force: true })
  })

  /** A new research task with a queued render of an HTML entry and one byte-stored image. */
  async function queued(html = HTML) {
    await s.persistence.withActor(pool, E, 'write', (c) =>
      s.persistence.admitResearchTask(c, projectId, {
        key: randomUUID(),
        exchangeId: null,
        request: { question: `Which hosts render PDFs? ${randomUUID()}`, outputs: ['markdown', 'pdf'], newRequest: true },
        specialist: { role: ROLE.id, route: ROLE.route },
      }),
    )
    const task = (
      await owner.query(
        `SELECT t.job_id, a.goal_id FROM sophia.research_tasks t JOIN sophia.jobs j ON j.project_id=t.project_id AND j.id=t.job_id
          JOIN sophia.work_attempts a ON a.project_id=j.project_id AND a.id=j.attempt_id WHERE t.project_id=$1 ORDER BY t.created_at DESC LIMIT 1`,
        [projectId],
      )
    ).rows[0]
    const entry = (await owner.query(`SELECT id FROM sophia.put_text_source($1, $2, 'text/html; charset=utf-8', $3)`, [projectId, E, html])).rows[0]
    const imageId = randomUUID()
    await owner.query(
      `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
        VALUES($1,$2,$3,'project',$4,'image/png',$5,$6,true,'ready')`,
      [projectId, imageId, E, sha(PNG), `objects/${projectId}/${imageId}`, PNG.byteLength],
    )
    await store.put(s.objectPath(projectId, imageId), PNG, 'image/png')
    const job = await s.persistence.enqueueRenderJob(owner, projectId, task.job_id, 'en', [
      { path: 'report.html', role: 'entry', sourceId: entry.id },
      { path: 'img/chart.png', role: 'asset', sourceId: imageId },
    ])
    return { ...job, goalId: task.goal_id, imageId }
  }

  const config = (extra = {}) => ({ apiUrl: base, token: RUNNER, workDir: work, env: homeEnv, heartbeatMs: 200, ...extra })
  const jobRow = async (jobId) =>
    (
      await owner.query(
        `SELECT j.state, j.reason, j.result_source_id, r.receipt, r.manifest_sha256 FROM sophia.jobs j
          JOIN sophia.render_jobs r ON r.project_id=j.project_id AND r.job_id=j.id WHERE j.id=$1`,
        [jobId],
      )
    ).rows[0]

  test('renders a queued package end to end: fetched through the API, confined, uploaded once and settled', async () => {
    const job = await queued()
    const lines = []
    const run = await s.supervisor.runOnce(config({ log: (l) => lines.push(l) }))
    assert.deepEqual(run, { claimed: true, jobId: job.jobId, outcome: 'succeeded' }, lines.join('\n'))
    const row = await jobRow(job.jobId)
    assert.equal(row.state, 'succeeded')
    assert.equal(row.receipt.source.manifestSha256, row.manifest_sha256, 'the kernel and the service agree on the package')
    assert.equal(row.receipt.sandbox.active, true, row.receipt.sandbox.reasons.join('; '))
    assert.ok(row.receipt.output.pdfImages >= 1)
    const pdf = store.objects.get(s.objectPath(projectId, row.result_source_id))
    assert.equal(Buffer.from(pdf).subarray(0, 5).toString('latin1'), '%PDF-')
    const source = (await owner.query(`SELECT sha256, mime FROM sophia.source_objects WHERE id=$1`, [row.result_source_id])).rows[0]
    assert.deepEqual([source.sha256, source.mime], [sha(pdf), 'application/pdf'])
    assert.deepEqual(readdirSync(work), [], 'the job directory is gone')
  })

  test('renders a report printed by the report template with nothing past the printable width (pdf-report-v1, S5b)', async () => {
    const { renderReport } = await import('../../packages/report/src/report-html.ts')
    const longUrl = `https://example.org/${'a-very-long-path-segment-'.repeat(12)}`
    const cells = (text) => Array.from({ length: 8 }, (_, i) => `${text}${i}`).join(' | ')
    const md = [
      '# Rapporto sugli host che stampano PDF',
      `## Sintesi\n\n${'Città, señal, naïve façade. '.repeat(30)}`,
      `## Tabella larga\n\n| ${cells('Colonna ')} |\n|${' --- |'.repeat(8)}\n| ${cells('valore-lungo-senza-spazi-valore-lungo-')} |`,
      `## Indirizzi\n\nVedi ${longUrl} per i dettagli, e [la fonte](${longUrl}).`,
      '## Codice\n\n```\n' + `const percorso = '${'segmento/'.repeat(30)}'` + '\n```',
      `## Conclusione\n\n${'Fine della relazione. '.repeat(20)}`,
    ].join('\n\n')
    const doc = renderReport({ markdown: md, language: 'it', title: 'Rapporto', sources: [], layout: 'standard' })
    assert.equal(doc.accepted, true, JSON.stringify(doc.checks))
    const job = await queued(doc.html)
    const lines = []
    const run = await s.supervisor.runOnce(config({ log: (l) => lines.push(l) }))
    assert.deepEqual(run, { claimed: true, jobId: job.jobId, outcome: 'succeeded' }, lines.join('\n'))
    const { receipt } = await jobRow(job.jobId)
    const unknown = new Set(['blank_pages', 'short_pages'])
    for (const c of receipt.checks) assert.equal(c.outcome, unknown.has(c.name) ? 'unknown' : 'passed', `${c.name}: ${c.detail}`)
    assert.ok(receipt.checks.some((c) => c.name === 'layout_overflow'))
    assert.deepEqual([receipt.measurements.overflow.measurement, receipt.measurements.overflow.px], ['measured', 0])
    assert.deepEqual([receipt.blockedRequests, receipt.undeclaredAssets], [[], []])
    assert.ok(receipt.output.pageCount >= 1)
  })

  test('stops the kernel at a Stop during the render and keeps nothing', async () => {
    const job = await queued()
    const objects = store.objects.size
    const stopGoal = async () => {
      const goal = (await owner.query(`SELECT revision, authority_epoch FROM sophia.goals WHERE id=$1`, [job.goalId])).rows[0]
      await s.persistence.withActor(pool, E, 'write', (c) =>
        s.persistence.admitGoalCommand(c, projectId, randomUUID(), {
          kind: 'stop',
          goalId: job.goalId,
          expectedGoalRevision: Number(goal.revision),
          expectedAuthorityEpoch: Number(goal.authority_epoch),
          bodySourceId: null,
        }),
      )
    }
    const run = await s.supervisor.runOnce(config({ beforeRender: stopGoal }))
    assert.deepEqual(run, { claimed: true, jobId: job.jobId, outcome: 'cancelled' })
    const row = await jobRow(job.jobId)
    assert.deepEqual([row.state, row.reason, row.result_source_id, row.receipt], ['cancelled', 'stopped: the work was stopped', null, null])
    assert.equal(store.objects.size, objects, 'nothing was uploaded')
    assert.deepEqual(readdirSync(work), [])
  })

  test('takes no job when the render user could not reach the work directory', { skip: process.getuid?.() !== 0 && 'not root' }, async () => {
    const closed = mkdtempSync(join(tmpdir(), 'sophia-closed-'))
    try {
      await assert.rejects(s.supervisor.runOnce(config({ workDir: closed })), /cannot reach/)
    } finally {
      rmSync(closed, { recursive: true, force: true })
    }
  })

  test('never renders a stored file that no longer matches its record', async () => {
    const job = await queued()
    store.objects.set(s.objectPath(projectId, job.imageId), Buffer.from('tampered'))
    const lines = []
    const run = await s.supervisor.runOnce(config({ log: (l) => lines.push(l) }))
    assert.deepEqual(run, { claimed: true, jobId: job.jobId, outcome: 'abandoned' })
    assert.ok(lines.some((l) => /503/.test(l)), lines.join('\n'))
    assert.equal((await jobRow(job.jobId)).result_source_id, null)
    assert.deepEqual(readdirSync(work), [])
  })

  test('takes no job when the host has no browser', async () => {
    const job = await queued()
    const missing = { ...homeEnv, SOPHIA_CHROMIUM_PATH: join(work, 'no-such-browser') }
    await assert.rejects(s.supervisor.runOnce(config({ env: missing })), /no headless shell/)
    assert.equal((await jobRow(job.jobId)).state, 'pending', 'the job is still queued')
  })
})
