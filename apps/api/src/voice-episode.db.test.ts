// The G7 episode's withdrawal and Stop through real HTTP (A15, migration 0046; docs/plans/voice-qualification-g7.md),
// level: sql-run, no provider. Research and design run on the runtime's routes as design.db.test.ts drives them (its
// helpers are repeated here, trimmed: a test file cannot import another's); the voice steps are the media bridge's tool
// calls under a grant; the note, its withdrawal and every read are a member's own routes. The capture receipt and its
// PNGs are synthetic.
import { createHash, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it, type TestContext } from 'node:test'
import type { RuntimeCommand } from '@sophia/contracts'
import { plainPage } from '@sophia/design/testing'
import type { ContentPackage } from '@sophia/design'
import { createPool, readSnapshot, runtimeTokenHash, shownReach, startExchange, withActor } from '@sophia/persistence'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import { dispatchOnce } from '@sophia/worker'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { memoryByteStore } from './byte-store.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MEDIA_TOKEN = 'media-bridge-capability-for-episode-tests-01'
const RUNNER = `capture-runner-capability-${randomUUID()}`
const A = randomUUID() // admin
const E = randomUUID() // the grant's principal, an editor
const O = randomUUID() // a member of no project here
const RUN = 'ab'.repeat(32)
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
const REVOKED = 'revoked: a source the report drew on was withdrawn'

let db: TestDatabase
let pool: pg.Pool
let worker: pg.Pool
let app: FastifyInstance
/** The same API with voice qualification off, its default. */
let off: FastifyInstance
let base: string
let offBase: string

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type Body = any

interface CallInit {
  bearer?: string
  body?: unknown
  headers?: Record<string, string>
  method?: string
  raw?: Buffer
  type?: string
  at?: string
}

const headersOf = (init: CallInit): Record<string, string> => ({
  ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
  ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
  ...(init.raw === undefined ? {} : { 'content-type': init.type ?? 'application/octet-stream' }),
  ...init.headers,
})

async function call(path: string, init: CallInit = {}) {
  const res = await fetch(`${init.at ?? base}${path}`, {
    method: init.method ?? (init.body === undefined && init.raw === undefined ? 'GET' : 'POST'),
    headers: headersOf(init),
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    ...(init.raw === undefined ? {} : { body: Uint8Array.from(init.raw) }),
  })
  const text = await res.text()
  const json: Body = text && (res.headers.get('content-type') ?? '').includes('json') ? JSON.parse(text) : text
  return { status: res.status, json }
}

/** A member's own request: a read, or a write under a fresh idempotency key. */
const member = async (actor: string, path: string, body?: unknown, at?: string) =>
  call(path, {
    bearer: await token(actor),
    ...(body === undefined ? {} : { body, headers: { 'idempotency-key': randomUUID() } }),
    ...(at ? { at } : {}),
  })

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  worker = createPool(db.workerUrl, { max: 2 })
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  const mediaBridgeTokenSha256 = createHash('sha256').update(MEDIA_TOKEN, 'utf8').digest()
  const byteStore = memoryByteStore()
  app = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, byteStore, voiceQualification: true })
  off = buildApp({ pool, verifyActor, mediaBridgeTokenSha256, byteStore })
  await app.listen({ port: 0, host: '127.0.0.1' })
  await off.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  offBase = `http://127.0.0.1:${String((off.server.address() as AddressInfo).port)}`
  await owner((c) =>
    c.query(`SELECT sophia.register_render_runner('episode-test-runner', $1)`, [runtimeTokenHash(RUNNER)]),
  )
})
after(async () => {
  await app.close()
  await off.close()
  await pool.end()
  await worker.end()
  await db.drop()
})

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

const dispatchDue = () => dispatchOnce(worker, { workerId: 'test-worker', batchSize: 50 })
const runner = (path: string, init: CallInit = {}) => call(path, { bearer: RUNNER, ...init })

/**
 * A project with research enabled, a runtime advertising the Markdown researcher and the designer (no reviewer: a page
 * publishes as self_review_only), the capture runner seen, a voice qualification grant whose principal is E, and an
 * exchange E opened under it.
 */
async function world() {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [] })
  await owner(async (c) => {
    await c.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      projectId,
    ])
    await c.query(`SELECT sophia.voice_qualification_grant($1,$2,$3,'synthetic-approval',900,3,20,1000,200000,3600)`, [
      projectId,
      E,
      RUN,
    ])
  })
  const rt = await registerRuntime(db.ownerUrl, { projectId, admin: A })
  const headers = {
    'x-sophia-runtime-unit': rt.runtimeUnitId,
    'x-sophia-bridge-instance': randomUUID(),
    'x-sophia-bridge-protocol': '1',
  }
  const runtime = (path: string, body?: unknown) => call(path, { bearer: rt.token, headers, body })
  const hello = await runtime('/v1/runtime/hello', {
    bundle: 'test',
    protocolVersion: 1,
    dshVersion: 'x',
    roles: [MD_ROLE, DESIGNER],
  })
  assert.equal(hello.status, 200, JSON.stringify(hello.json))
  assert.equal((await runtime('/v1/runtime/ready', { state: 'ready', reason: null, unrecovered: [] })).status, 204)
  assert.equal((await runner('/v1/renderer/claim', { body: { formats: ['pdf', 'png'] } })).status, 200)
  const snap = await withActor(pool, E, 'read', (c) => readSnapshot(c, projectId))
  assert.ok(snap)
  const opened = await withActor(pool, E, 'write', (c) =>
    startExchange(c, snap.room.id, randomUUID(), { expectedRoomRevision: snap.room.revision, allowVision: false }),
  )
  return { projectId, runtime, exchangeId: opened.exchangeId }
}
type World = Awaited<ReturnType<typeof world>>

let callN = 0
/** A voice tool call of the principal's, as the media bridge sends it, in the world's exchange under its grant. */
async function voice(w: World, name: string, args: object) {
  callN += 1
  const res = await call('/v1/media/tool-calls', {
    bearer: MEDIA_TOKEN,
    body: {
      exchangeId: w.exchangeId,
      connectionGeneration: 1,
      callId: `v-${String(callN)}`,
      name,
      args,
      inputEpoch: 1,
      actorId: E,
      guide: 'v1.3',
    },
  })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return res.json as { status: string; output: Body }
}

/** The principal records a mission note through their own route: its record_note receipt. */
async function note(w: World, text: string): Promise<Body> {
  const res = await member(E, `/api/v1/projects/${w.projectId}/mission/entries`, {
    kind: 'observation',
    epistemic: 'observed',
    text,
  })
  assert.equal(res.status, 202, JSON.stringify(res.json))
  return res.json
}

/** The principal forgets a note: the preview of what goes with it, then the withdrawal of exactly that. */
async function forget(w: World, entryId: string): Promise<Body> {
  const path = `/api/v1/projects/${w.projectId}/mission/entries/${entryId}/withdrawal`
  const preview = await member(E, path)
  assert.equal(preview.status, 200, JSON.stringify(preview.json))
  const gone = await member(E, path, shownReach(preview.json))
  assert.equal(gone.status, 202, JSON.stringify(gone.json))
  return gone.json
}

/** The create (or other) command the dispatcher sent last for a role, and the operation context of its session. */
async function sent(w: World, kind: string, role?: string) {
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

const answered = new Set<string>()
let nativeSeq = 0
/** Answer at `stage` every runtime command of `kind` not answered yet, as the runtime does. Returns them. */
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

/** The researcher writes and submits its report; HTML was asked for, so the report's design is admitted with it. */
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

/** Research by voice, with HTML, drawing on `inputs`, published; its design dispatched and delivered to the designer. */
async function designing(w: World, question: string, inputs: string[]) {
  const asked = await voice(w, 'start_research', {
    question,
    outputs: ['markdown', 'html'],
    inputSourceIds: inputs,
  })
  assert.equal(asked.status, 'admitted', JSON.stringify(asked))
  const researchTask = String(asked.output.taskId)
  const submission = await published(w)
  const designTask = String(submission.html.taskId)
  const { at } = await sent(w, 'create', DESIGNER.id)
  await answer(w, 'create', 'delivered', at.attemptId)
  return { researchTask, designTask, at, submission }
}

/** A task's detail as a member reads it (the voice API unless told otherwise). */
async function detail(w: World, taskId: string, actor = E, at?: string): Promise<Body> {
  const res = await member(actor, `/api/v1/projects/${w.projectId}/native-tasks/${taskId}`, undefined, at)
  return { status: res.status, ...res.json }
}

/** As the owner: a design task's state and reason, its job and attempt, and its goal. */
async function designRow(taskId: string): Promise<Body> {
  const { rows } = await owner((c) =>
    c.query(
      `SELECT t.state, t.reason, t.mode, j.state AS job, a.state AS attempt, g.status AS goal
         FROM sophia.design_tasks t JOIN sophia.jobs j ON j.id=t.job_id JOIN sophia.work_attempts a ON a.id=j.attempt_id
         JOIN sophia.goals g ON g.id=a.goal_id WHERE t.job_id=$1`,
      [taskId],
    ),
  )
  return rows[0]
}

/** As the owner: a goal's status and every task of it still under way (pending, running or outcome unknown). */
async function goalOf(taskId: string): Promise<{ status: string; live: string[] }> {
  const { rows } = await owner((c) =>
    c.query(
      `SELECT g.status, array(SELECT jj.kind||':'||jj.state FROM sophia.jobs jj JOIN sophia.work_attempts aa
          ON aa.project_id=jj.project_id AND aa.id=jj.attempt_id WHERE aa.goal_id=g.id
          AND jj.state IN ('pending','running','outcome_unknown') ORDER BY jj.created_at) AS live
         FROM sophia.jobs j JOIN sophia.work_attempts a ON a.id=j.attempt_id JOIN sophia.goals g ON g.id=a.goal_id
        WHERE j.id=$1`,
      [taskId],
    ),
  )
  return { status: String(rows[0].status), live: rows[0].live as string[] }
}

/** The page's sections, from a page source: each block's data-section. */
function blockSections(html: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of html.split('<section ').slice(1)) {
    const id = /data-section="([^"]+)"/.exec(part)?.[1]
    if (id) for (const m of part.matchAll(/data-block="([^"]+)"/g)) out.set(m[1] ?? '', id)
  }
  return out
}

const check = (name: string, target: string | null) => ({ name, target, outcome: 'passed', detail: null })

/** The capture runner claims the queued capture, uploads one PNG per name and settles it with a passing receipt. */
async function captured(pkg: ContentPackage, sections: string[], html: string) {
  const claimed = await runner('/v1/renderer/claim', { body: { formats: ['pdf', 'png'] } })
  const job = claimed.json.job
  assert.equal(job?.format, 'png', JSON.stringify(claimed.json))
  const lease = { 'x-sophia-render-lease': job.leaseToken }
  assert.equal(
    (await runner(`/v1/renderer/jobs/${String(job.jobId)}/file?path=index.html`, { headers: lease })).status,
    200,
  )
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
  const placed = blockSections(html)
  const seen = new Map<string, number>()
  const blocks = pkg.blocks.map((b) => {
    const section = placed.get(b.id) ?? sections[0] ?? 's1'
    const k = seen.get(section) ?? 0
    seen.set(section, k + 1)
    return {
      id: b.id,
      section,
      box: { x: 0, y: sections.indexOf(section) * 500 + 30 * k, width: 300, height: 20 },
      fontPx: 18,
      issues: [],
      contrast: { ratio: 12, floor: 4.5, large: false, detail: null },
    }
  })
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
        blocks,
      },
      coverage: { requested: null, captured: sections, missing: [], margins: 0, marginsCaptured: 0, truncated: false },
    })),
    captures: names.map((name) => {
      const [target = '', kind = '', part] = name.split('.')
      return {
        name,
        target,
        kind,
        section: kind === 'overview' ? null : part,
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
      check('widths_visible', null),
      ...targets.flatMap((t) => [
        check('layout_overflow', t),
        check('blocks_visible', t),
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
  return names
}

/** The designer writes a page in sections, renders it, looks at every capture and submits it: published. */
async function publishPage(w: World, at: Body): Promise<Body> {
  const ctx = await w.runtime('/v1/runtime/design/context', at)
  assert.equal(ctx.status, 200, JSON.stringify(ctx.json))
  const pkg = ctx.json.package.content as ContentPackage
  const files = plainPage(pkg, { title: 'Sandboxed rendering', perSection: 2 })
  const write = await w.runtime('/v1/runtime/design/source', { ...at, callId: 'w1', expectedSha256: null, files })
  assert.equal(write.json.outcome, 'stored', JSON.stringify(write.json))
  const sections = (write.json.sections as Array<{ id: string }>).map((x) => x.id)
  const render = await w.runtime('/v1/runtime/design/render', {
    ...at,
    callId: 'r1',
    revisionId: write.json.revisionId,
  })
  assert.equal(render.status, 200, JSON.stringify(render.json))
  const names = await captured(pkg, sections, files.find((f) => f.path === 'index.html')?.text ?? '')
  const seen: string[] = []
  for (let i = 0; i < names.length; i += 4) {
    const body = { ...at, renderJobId: render.json.renderJobId, names: names.slice(i, i + 4) }
    const shown = await w.runtime('/v1/runtime/design/capture', body)
    assert.equal(shown.status, 200, JSON.stringify(shown.json))
    const ack = await w.runtime('/v1/runtime/design/delivered', {
      ...at,
      deliveryId: String(shown.json.deliveryId),
      attachments: (shown.json.captures as Body[]).map((c) => ({
        name: String(c.name),
        attachmentId: `sha256:${String(c.sha256)}`,
      })),
    })
    assert.equal(ack.status, 200, JSON.stringify(ack.json))
    seen.push(String(shown.json.deliveryId))
  }
  const done = await w.runtime('/v1/runtime/design/submit', {
    ...at,
    callId: 'c1',
    candidate: { revisionId: write.json.revisionId, renderJobId: render.json.renderJobId, seen },
  })
  assert.equal(done.json.outcome, 'published', JSON.stringify(done.json))
  return done.json
}

describe('what a withdrawal reached of a task: withdrawnSourceIds (A15, 0046)', () => {
  it('a design under way that drew on note N: [] before; after N is forgotten, revoked, listing exactly N’s source; a design that did not draw on N stays [] and live', async () => {
    const w = await world()
    const n = await note(w, 'Hosts confine the browser with namespaces.')
    assert.equal(n.operation, 'record_note')
    const drew = await designing(w, 'How do hosts confine a browser?', [String(n.sourceId)])
    const other = await designing(w, 'Which fonts render best in a sandbox?', [])
    for (const task of [drew.designTask, drew.researchTask, other.designTask])
      assert.deepEqual((await detail(w, task)).withdrawnSourceIds, [], 'nothing withdrawn yet')

    await forget(w, String(n.entryId))

    const ended = await detail(w, drew.designTask)
    assert.deepEqual([ended.task.phase, ended.task.reason], ['failed', REVOKED])
    assert.equal(ended.design.state, 'failed')
    assert.deepEqual(ended.withdrawnSourceIds, [n.sourceId], 'exactly the note’s source, the record_note receipt’s')
    const research = await detail(w, drew.researchTask)
    assert.deepEqual([research.task.phase, research.withdrawnSourceIds], ['result_ready', [n.sourceId]])
    const untouched = await detail(w, other.designTask)
    assert.deepEqual([untouched.design.state, untouched.withdrawnSourceIds], ['designing', []])

    // The design's own closure, not its research's: the report version it lays out is in the first and not the second.
    // No member flow erases a published version; the owner does it here only to tell the two closures apart.
    const version = await owner(async (c) => {
      const { rows } = await c.query(`SELECT source_id FROM sophia.artifact_versions WHERE id=$1`, [
        other.submission.versionId,
      ])
      return String(rows[0].source_id)
    })
    await owner((c) => c.query(`SELECT sophia.mission_erase_source($1, $2)`, [w.projectId, version]))
    assert.deepEqual((await detail(w, other.designTask)).withdrawnSourceIds, [version])
    // (Its research's own detail no longer reads, its text erased: the function answers it directly.)
    const researchList = await withActor(pool, E, 'read', (c) =>
      c.query<{ ids: string[] }>(`SELECT sophia.task_withdrawn_sources($1, $2) AS ids`, [
        w.projectId,
        other.researchTask,
      ]),
    )
    assert.deepEqual(researchList.rows[0]?.ids, [])

    // Off, the field is absent; another project's member finds no task at all (not_found, 422).
    const offRead = await detail(w, drew.designTask, E, offBase)
    assert.equal(offRead.status, 200)
    assert.ok(!('withdrawnSourceIds' in offRead), 'an API with voice qualification off serves none of it')
    const outsider = await detail(w, drew.designTask, O)
    assert.deepEqual([outsider.status, outsider.code], [422, 'not_found'])
    const direct = await withActor(pool, O, 'read', (c) =>
      c.query(`SELECT sophia.task_withdrawn_sources($1, $2)`, [w.projectId, drew.designTask]),
    ).then(
      () => 'answered',
      (err: unknown) => (err as { code?: string }).code,
    )
    assert.equal(direct, 'not_found', 'the function itself answers no outsider')
  })

  it('a design Stopped before the withdrawal is not failed again; it lists N’s source all the same (computed live)', async () => {
    const w = await world()
    const n = await note(w, 'Seccomp narrows the browser.')
    const drew = await designing(w, 'How do hosts narrow a browser?', [String(n.sourceId)])
    assert.equal((await voice(w, 'control_work', { taskId: drew.designTask, action: 'stop' })).status, 'ok')
    await answer(w, 'stop', 'checked')
    const stopped = await designRow(drew.designTask)
    assert.deepEqual([stopped.state, stopped.job, stopped.goal], ['cancelled', 'cancelled', 'completed'])
    await forget(w, String(n.entryId))
    const later = await designRow(drew.designTask)
    assert.deepEqual([later.state, later.reason], [stopped.state, stopped.reason], 'the withdrawal ended nothing here')
    assert.deepEqual((await detail(w, drew.designTask)).withdrawnSourceIds, [n.sourceId])
  })
})

/** As the owner: a task's job state and reason. */
async function jobOf(taskId: string): Promise<{ state: string; reason: string | null }> {
  const { rows } = await owner((c) => c.query(`SELECT state, reason FROM sophia.jobs WHERE id=$1`, [taskId]))
  return { state: String(rows[0].state), reason: rows[0].reason as string | null }
}

/** Each of the principal's calls in the exchange: its tool, the command it admitted, the task it created, its outcome. */
async function callsOf(w: World): Promise<Array<[string, string | null, string | null, string | null]>> {
  const res = await member(E, `/api/v1/exchanges/${w.exchangeId}/calls`)
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return (res.json.calls as Body[]).map((c) => [c.tool, c.command?.kind ?? null, c.taskId, c.outcome])
}

/** Every state the Lab relies on, as observed: asserted, and reported in the test's own words. */
function observe(t: TestContext, step: string, state: unknown): void {
  t.diagnostic(`${step}: ${JSON.stringify(state)}`)
}

describe('the G7 episode’s lifecycle, as the Lab relies on it (A15, 0046)', () => {
  it('create with HTML from a note, Hold and Resume, the page published, an edit, the note forgotten, Stop after it, and a Stop sub-episode', async (t) => {
    const w = await world()

    // 1. The principal records note N; research by voice, with HTML, draws on it; published; its first design under way.
    const n = await note(w, 'Hosts confine the browser with namespaces.')
    const entry = await owner((c) => c.query(`SELECT source_id FROM sophia.mission_entries WHERE id=$1`, [n.entryId]))
    assert.deepEqual(
      [n.operation, entry.rows[0].source_id],
      ['record_note', n.sourceId],
      'the receipt names the note’s version',
    )
    const first = await designing(w, 'How do hosts confine a browser?', [String(n.sourceId)])
    const input = await owner((c) =>
      c.query(
        `SELECT EXISTS(SELECT 1 FROM sophia.jobs j JOIN sophia.source_dependencies d ON d.derived_source_id=j.input_source_id
          WHERE j.id=$1 AND d.source_id=$2) AS held`,
        [first.researchTask, n.sourceId],
      ),
    )
    assert.equal(input.rows[0].held, true, 'the research manifest holds the note’s version as an input')
    const researchRead = await detail(w, first.researchTask)
    const firstDesign = await detail(w, first.designTask)
    const step1 = {
      research: researchRead.task.phase,
      html: researchRead.research.html,
      researchExchange: researchRead.task.exchangeId === w.exchangeId,
      design: [firstDesign.design.state, firstDesign.design.mode, firstDesign.task.phase],
      designResearchTaskId: firstDesign.design.researchTaskId === first.researchTask,
      designExchange: 'exchangeId' in firstDesign.task,
      goal: await goalOf(first.researchTask),
    }
    observe(t, '1', step1)
    assert.deepEqual(step1, {
      research: 'result_ready',
      html: { state: 'designing', designTaskId: first.designTask },
      researchExchange: true,
      design: ['designing', 'create', 'running'],
      designResearchTaskId: true,
      designExchange: false,
      goal: { status: 'running', live: ['design:running'] },
    })

    // 2. Hold, then Resume, by voice, on that goal while the design is under way.
    const hold = await voice(w, 'control_work', { taskId: first.designTask, action: 'hold' })
    const holding = { result: hold.status, goal: await goalOf(first.designTask) }
    const holds = await answer(w, 'hold', 'checked')
    const attempts = new Map([
      [String(researchRead.task.attemptId), 'research'],
      [String(firstDesign.task.attemptId), 'design'],
    ])
    const held = {
      holdsChecked: holds.map((c) => attempts.get(c.binding.attemptId) ?? c.binding.attemptId).toSorted(),
      goal: await goalOf(first.designTask),
      design: await designRow(first.designTask),
      phase: (await detail(w, first.designTask)).task.phase,
    }
    const resume = await voice(w, 'control_work', { taskId: first.designTask, action: 'resume' })
    const resuming = { result: resume.status, goal: await goalOf(first.designTask) }
    const resumes = await answer(w, 'resume', 'delivered')
    const resumed = {
      resumesDelivered: resumes.map((c) => attempts.get(c.binding.attemptId) ?? c.binding.attemptId).toSorted(),
      goal: await goalOf(first.designTask),
      design: await designRow(first.designTask),
      phase: (await detail(w, first.designTask)).task.phase,
    }
    observe(t, '2 hold asked', holding)
    observe(t, '2 hold checked', held)
    observe(t, '2 resume asked', resuming)
    observe(t, '2 resume delivered', resumed)
    const live = { reason: null, mode: 'create', job: 'running', attempt: 'running' }
    assert.deepEqual(holding, { result: 'ok', goal: { status: 'holding', live: ['design:running'] } })
    assert.deepEqual(held, {
      holdsChecked: ['design', 'research'],
      goal: { status: 'held', live: ['design:running'] },
      design: { state: 'designing', ...live, goal: 'held' },
      phase: 'held',
    })
    assert.deepEqual(resuming, { result: 'ok', goal: { status: 'running', live: ['design:running'] } })
    assert.deepEqual(resumed, {
      resumesDelivered: ['design', 'research'],
      goal: { status: 'running', live: ['design:running'] },
      design: { state: 'designing', ...live, goal: 'running' },
      phase: 'running',
    })

    // 3. No edit while the first design is live: the page exists only once it publishes. Then one, by voice.
    const revise = {
      taskId: first.researchTask,
      sections: ['s2'],
      instruction: 'Turn the second section into a short list.',
    }
    const early = await voice(w, 'revise_html_page', revise)
    const page = await publishPage(w, first.at)
    const pagePublished = {
      outcome: page.outcome,
      versionNumber: page.versionNumber,
      design: await designRow(first.designTask),
      goal: await goalOf(first.researchTask),
    }
    const edit = await voice(w, 'revise_html_page', revise)
    const editTask = String(edit.output.taskId)
    const editAt = (await sent(w, 'create', DESIGNER.id)).at
    await answer(w, 'create', 'delivered', editAt.attemptId)
    const another = await voice(w, 'revise_html_page', { ...revise, sections: ['s1'] })
    const editRead = await detail(w, editTask)
    const editLive = {
      edit: await designRow(editTask),
      sameGoal: editRead.task.goalId === firstDesign.task.goalId,
      researchTaskId: editRead.design.researchTaskId === first.researchTask,
      actor: editRead.task.actorId === E,
      editExchange: 'exchangeId' in editRead.task,
      withdrawnSourceIds: editRead.withdrawnSourceIds,
      goal: await goalOf(editTask),
    }
    observe(t, '3 edit while the first design is live', early)
    observe(t, '3 first design published', pagePublished)
    observe(t, '3 edit asked', edit)
    observe(t, '3 edit live', editLive)
    observe(t, '3 another edit while it is live', another)
    assert.deepEqual(early, {
      status: 'refused',
      output: { code: 'not_started:no_html_page', reason: 'That report has no designed HTML page to revise.' },
    })
    assert.deepEqual(pagePublished, {
      outcome: 'published',
      versionNumber: 2,
      design: {
        state: 'published',
        reason: null,
        mode: 'create',
        job: 'succeeded',
        attempt: 'accepted',
        goal: 'completed',
      },
      goal: { status: 'completed', live: [] },
    })
    assert.equal(edit.status, 'admitted')
    assert.deepEqual(editLive, {
      edit: { state: 'designing', reason: null, mode: 'edit', job: 'running', attempt: 'running', goal: 'running' },
      sameGoal: true,
      researchTaskId: true,
      actor: true,
      editExchange: false,
      withdrawnSourceIds: [],
      goal: { status: 'running', live: ['design:running'] },
    })
    assert.equal(another.status, 'refused', 'one design of a page at a time')

    // 4. N forgotten while the edit is live: the edit is revoked; the report, its page and its research are untouched.
    const gone = await forget(w, String(n.entryId))
    const ended = await detail(w, editTask)
    const withdrawn = {
      receipt: [gone.operation, gone.sourceId === n.sourceId],
      edit: [ended.task.phase, ended.task.reason, ended.design.state],
      withdrawnSourceIds: ended.withdrawnSourceIds,
      row: await designRow(editTask),
      research: (await detail(w, first.researchTask)).task.phase,
      firstDesign: (await designRow(first.designTask)).state,
      goal: await goalOf(editTask),
    }
    const revocationStops = await answer(w, 'stop', 'checked')
    const afterStops = {
      stops: revocationStops.map((c) => c.binding.attemptId === editAt.attemptId),
      goal: await goalOf(editTask),
    }
    observe(t, '4 withdrawn', withdrawn)
    observe(t, '4 the revocation’s native stop checked', afterStops)
    assert.deepEqual(withdrawn, {
      receipt: ['withdraw_note', true],
      edit: ['failed', REVOKED, 'failed'],
      withdrawnSourceIds: [n.sourceId],
      row: { state: 'failed', reason: REVOKED, mode: 'edit', job: 'failed', attempt: 'revoked', goal: 'completed' },
      research: 'result_ready',
      firstDesign: 'published',
      goal: { status: 'completed', live: [] },
    })
    assert.deepEqual(afterStops, { stops: [true], goal: { status: 'completed', live: [] } })

    // 5. Stop by voice on that goal after the withdrawal: refused, nothing admitted, nothing changed.
    const lateStop = await voice(w, 'control_work', { taskId: editTask, action: 'stop' })
    const lateStopped = {
      result: lateStop,
      edit: await jobOf(editTask),
      goal: await goalOf(editTask),
      call: (await callsOf(w)).at(-1),
    }
    observe(t, '5 stop after the withdrawal', lateStopped)
    assert.deepEqual(lateStopped.result.status, 'refused')
    assert.deepEqual(lateStopped.edit, { state: 'failed', reason: REVOKED }, 'the withdrawal’s end stands')
    assert.deepEqual(lateStopped.goal, { status: 'completed', live: [] })
    assert.deepEqual(lateStopped.call, ['control_work', null, null, 'refused'], 'the call admitted no command')
    // The same Stop through the principal's own route: the database's refusal, verbatim.
    const snap = await withActor(pool, E, 'read', (c) => readSnapshot(c, w.projectId))
    const goal = snap?.goals.find((g) => g.id === editRead.task.goalId)
    assert.ok(goal)
    const direct = await member(E, `/api/v1/projects/${w.projectId}/commands`, {
      kind: 'stop',
      goalId: goal.id,
      expectedGoalRevision: goal.revision,
      expectedAuthorityEpoch: goal.authorityEpoch,
      bodySourceId: null,
    })
    observe(t, '5 stop through the member route', {
      status: direct.status,
      code: direct.json.code,
      message: direct.json.message,
    })
    assert.deepEqual(
      [direct.status, direct.json.code, direct.json.message],
      [409, 'invalid_state', 'Goal already terminal or stopping'],
    )

    // 6. The Stop sub-episode: a second research by voice, on a new goal, Stopped while pending; a third while running.
    const pending = await voice(w, 'start_research', { question: 'Which fonts render best in a sandbox?' })
    const pendingTask = String(pending.output.taskId)
    const beforePending = { phase: (await detail(w, pendingTask)).task.phase, goal: await goalOf(pendingTask) }
    const stopPending = await voice(w, 'control_work', { taskId: pendingTask, action: 'stop' })
    const stoppingPending = { result: stopPending.status, goal: await goalOf(pendingTask) }
    const pendingStops = await answer(w, 'stop', 'checked')
    const stoppedPending = {
      nativeStops: pendingStops.length,
      phase: (await detail(w, pendingTask)).task.phase,
      job: await jobOf(pendingTask),
      goal: await goalOf(pendingTask),
    }
    observe(t, '6 pending research', beforePending)
    observe(t, '6 stop asked', stoppingPending)
    observe(t, '6 stopped', stoppedPending)

    const running = await voice(w, 'start_research', { question: 'Which seccomp filters do renderers ship?' })
    const runningTask = String(running.output.taskId)
    const runningAt = (await sent(w, 'create', MD_ROLE.id)).at
    await answer(w, 'create', 'delivered', runningAt.attemptId)
    const beforeRunning = { phase: (await detail(w, runningTask)).task.phase, goal: await goalOf(runningTask) }
    const stopRunning = await voice(w, 'control_work', { taskId: runningTask, action: 'stop' })
    const stoppingRunning = { result: stopRunning.status, goal: await goalOf(runningTask) }
    const runningStops = await answer(w, 'stop', 'checked')
    const stoppedRunning = {
      nativeStops: runningStops.map((c) => c.binding.attemptId === runningAt.attemptId),
      phase: (await detail(w, runningTask)).task.phase,
      job: await jobOf(runningTask),
      goal: await goalOf(runningTask),
    }
    observe(t, '6 running research', beforeRunning)
    observe(t, '6 stop asked (running)', stoppingRunning)
    observe(t, '6 stopped (running)', stoppedRunning)

    const names = new Map([
      [first.researchTask, 'first'],
      [pendingTask, 'pending'],
      [runningTask, 'running'],
    ])
    const calls = (await callsOf(w)).map(([tool, command, task, outcome]) => [
      tool,
      command,
      task === null ? null : (names.get(task) ?? task),
      outcome,
    ])
    const exchanges = await Promise.all(
      [first.researchTask, pendingTask, runningTask, first.designTask, editTask].map(
        async (task): Promise<string | null> => String((await detail(w, task)).task.exchangeId ?? '') || null,
      ),
    )
    observe(t, '6 calls', calls)
    observe(
      t,
      '6 exchanges',
      exchanges.map((x) => (x === w.exchangeId ? 'this exchange' : x)),
    )
    assert.deepEqual(beforePending, { phase: 'queued', goal: { status: 'ready', live: ['research:pending'] } })
    assert.deepEqual(stoppingPending, { result: 'ok', goal: { status: 'stopping', live: ['research:pending'] } })
    assert.deepEqual(stoppedPending, {
      nativeStops: 0,
      phase: 'stopped',
      job: { state: 'cancelled', reason: 'stopped' },
      goal: { status: 'stopped', live: [] },
    })
    assert.deepEqual(beforeRunning, { phase: 'running', goal: { status: 'running', live: ['research:running'] } })
    assert.deepEqual(stoppingRunning, { result: 'ok', goal: { status: 'stopping', live: ['research:running'] } })
    assert.deepEqual(stoppedRunning, {
      nativeStops: [true],
      phase: 'stopped',
      job: { state: 'cancelled', reason: 'stopped' },
      goal: { status: 'stopped', live: [] },
    })
    // The calls certify each step: a create names its task; a Stop that ended live work admitted a stop command, the
    // one after the withdrawal admitted none. The edit's call names no command or task (see the plan: a gap).
    assert.deepEqual(calls, [
      ['start_research', 'native_task', 'first', 'admitted'],
      ['control_work', 'hold', null, 'ok'],
      ['control_work', 'resume', null, 'ok'],
      ['revise_html_page', null, null, 'refused'],
      ['revise_html_page', null, null, 'admitted'],
      ['revise_html_page', null, null, 'refused'],
      ['control_work', null, null, 'refused'],
      ['start_research', 'native_task', 'pending', 'admitted'],
      ['control_work', 'stop', null, 'ok'],
      ['start_research', 'native_task', 'running', 'admitted'],
      ['control_work', 'stop', null, 'ok'],
    ])
    assert.deepEqual(
      exchanges.map((x) => (x === w.exchangeId ? 'this exchange' : x)),
      ['this exchange', 'this exchange', 'this exchange', null, null],
      'the research tasks name the exchange; the first design and the edit name none',
    )
  })
})
