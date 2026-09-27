/**
 * S1-05A crossing: the real pinned dsh runtime and its control bridge against
 * the REAL Sophia service — the Fastify API's /v1/runtime/* (A04) and member
 * routes (A05) on PostgreSQL, with the worker's runtime dispatch in between.
 * No fixture service is involved. The model is the keyless mock
 * (tests/support/mock-llm.mjs) on the real pi-ai adapter path, so this is
 * evidence for the service ↔ runtime crossing, never for a live provider.
 *
 * Needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL); the suite is
 * skipped without one. CI runs it in the database job.
 */

import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { RUNTIME_DIR } from '../../scripts/lib/common.mjs'
import { assertRecordedArtifacts, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { launchRuntime } from '../../scripts/lib/runtime.mjs'
import { mockRouteOverlay, startMockLlm } from '../support/mock-llm.mjs'
import { sleep, unit, userTexts } from '../support/harness.mjs'

const enabled = Boolean(process.env.SOPHIA_DISPOSABLE_DATABASE_URL)
const skip = enabled ? false : 'needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL)'

/** Loaded only when enabled: the TypeScript service code runs through Node's type stripping. */
async function service() {
  const [{ buildApp }, persistence, testSupport, worker] = await Promise.all([
    import('../../apps/api/src/app.ts'),
    import('../../packages/persistence/src/index.ts'),
    import('../../packages/test-support/src/index.ts'),
    import('../../apps/worker/src/index.ts'),
  ])
  return { buildApp, persistence, testSupport, worker }
}

const BRIEF = [
  '## Intended outcome',
  'A real voice in the shared room [input:first].',
  '## Retained decisions',
  '- Keep the floor (A01).',
  '## Proposed next implementation step',
  'Close the runtime crossing.',
  '## Open questions',
  '- None yet.',
  '## Cited inputs',
  '- first, second',
].join('\n')

describe('runtime service crossing (real API, PostgreSQL, worker, pinned dsh)', { skip }, () => {
  let s, db, pool, workerPool, app, base, dispatcher, scratch, pristine
  let counter = 0
  const A = crypto.randomUUID()
  const E = crypto.randomUUID()

  before(async () => {
    s = await service()
    db = await s.testSupport.createTestDatabase()
    pool = s.persistence.createPool(db.apiUrl, { max: 8 })
    workerPool = s.persistence.createPool(db.workerUrl, { max: 3 })
    // Test verifier: "Bearer test-actor:<uuid>" stands in for Supabase Auth, as the API DB tests' HS256 tokens do.
    const verifyActor = async (authorization) => {
      const id = /^Bearer test-actor:([0-9a-f-]{36})$/.exec(authorization ?? '')?.[1]
      if (!id) throw new Error('no test actor')
      return { id, name: null, anonymous: false }
    }
    app = s.buildApp({ pool, verifyActor })
    await app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${app.server.address().port}`
    dispatcher = new s.worker.RuntimeDispatcher(workerPool, { workerId: 'crossing-worker', idleMs: 250 })
    dispatcher.start()
    scratch = mkdtempSync(join(tmpdir(), 'sophia-crossing-'))
    pristine = homeLayout(join(scratch, 'pristine'))
    assertRecordedArtifacts(unit, RUNTIME_DIR)
    installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: pristine })
  })

  after(async () => {
    await dispatcher?.stop()
    await app?.close()
    await pool?.end()
    await workerPool?.end()
    await db?.drop()
    if (scratch) rmSync(scratch, { recursive: true, force: true })
  })

  async function api(actor, method, path, body, key) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer test-actor:${actor}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(key ? { 'idempotency-key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }

  const owner = async (sql, params) => {
    const pg = (await import('pg')).default
    const c = new pg.Client({ connectionString: db.ownerUrl })
    await c.connect()
    try {
      return (await c.query(sql, params)).rows
    } finally {
      await c.end()
    }
  }

  /** A project with a registered runtime, a fresh profile home, a mock model and a runtime process. */
  async function world(t, { runtimeUnitId = unit.id } = {}) {
    const project = await s.testSupport.seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const rt = await s.testSupport.registerRuntime(db.ownerUrl, { projectId: project.projectId, admin: A, runtimeUnitId })
    const layout = homeLayout(join(scratch, `case-${counter++}`))
    cpSync(pristine.root, layout.root, { recursive: true, verbatimSymlinks: true })
    const llm = await startMockLlm()
    let runtime = null
    const w = {
      project,
      rt,
      llm,
      async start() {
        runtime = launchRuntime({
          unit,
          runtimeDir: RUNTIME_DIR,
          layout,
          bridge: { url: base, token: rt.token },
          overlays: [mockRouteOverlay(llm.baseURL)],
          extraEnv: { MOCK_LLM_KEY: 'mock' },
        })
      },
      stop: (signal) => runtime?.stop(signal),
      stderr: () => runtime?.stderr() ?? '',
      async until(predicate, what, timeoutMs = 30000) {
        const deadline = Date.now() + timeoutMs
        for (;;) {
          const value = await predicate()
          if (value) return value
          if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}\n${w.stderr().slice(-3000)}`)
          await sleep(150)
        }
      },
      ready: () => w.until(() => /readiness=ready/.test(w.stderr()), 'bridge readiness'),
      say: async (text) =>
        (await api(E, 'POST', `/api/v1/projects/${project.projectId}/contributions`, { source: null, text, threadId: null, artifactVersionId: null, intent: 'discuss' }, crypto.randomUUID())).json,
      task: async (taskId) => (await api(E, 'GET', `/api/v1/projects/${project.projectId}/native-tasks/${taskId}`)).json,
      stages: async (taskId) =>
        (await owner(
          `SELECT rc.kind, rr.stage FROM sophia.runtime_receipts rr JOIN sophia.runtime_commands rc ON rc.project_id=rr.project_id AND rc.id=rr.runtime_command_id
            JOIN sophia.jobs j ON j.project_id=rc.project_id AND j.attempt_id=rc.attempt_id WHERE j.id=$1 ORDER BY rr.recorded_at`,
          [taskId],
        )).map((r) => `${r.kind}:${r.stage}`),
    }
    t.after(async () => {
      await runtime?.stop()
      await llm.close()
    })
    return w
  }

  async function admitBrief(w, inputs, key = crypto.randomUUID()) {
    const res = await api(E, 'POST', `/api/v1/projects/${w.project.projectId}/native-tasks`, {
      kind: 'draft_brief',
      instruction: 'Draft the implementation brief for the room slice.',
      contributionIds: inputs,
      expectedMissionRevision: 1,
    }, key)
    assert.equal(res.status, 202, JSON.stringify(res.json))
    return res.json
  }

  async function control(w, receipt, kind, epoch, bodySourceId = null) {
    const res = await api(E, 'POST', `/api/v1/projects/${w.project.projectId}/commands`, {
      kind,
      goalId: receipt.goalId,
      expectedGoalRevision: 1,
      expectedAuthorityEpoch: epoch,
      bodySourceId,
    }, crypto.randomUUID())
    assert.equal(res.status, 202, JSON.stringify(res.json))
    return res.json
  }

  test('A02/A03: discussion and one draft_brief run through the real service; the brief is kept with its model identity', async (t) => {
    const w = await world(t)
    w.llm.script({ text: BRIEF })
    await w.start()
    await w.ready()
    const first = await w.say('Keep the room and the floor; add a real voice.')
    const second = await w.say('The brief should name the runtime crossing first.')
    const key = crypto.randomUUID()
    const receipt = await admitBrief(w, [first.contributionId, second.contributionId], key)
    assert.deepEqual(await admitBrief(w, [first.contributionId, second.contributionId], key), receipt, 'a retry is the same admission')
    const done = await w.until(async () => {
      const d = await w.task(receipt.taskId)
      return d.task.phase === 'result_ready' && d
    }, 'the captured brief')
    assert.equal(done.result.markdown, BRIEF)
    assert.deepEqual([done.result.provider, done.result.model], ['mock', 'mock-model'], 'model identity as the runtime reported it')
    assert.equal(w.llm.requests.length, 1, 'admitted once, run once')
    const sent = userTexts(w.llm.requests[0]).join('\n')
    assert.match(sent, /Keep the room and the floor; add a real voice\./, 'the chosen input reached the model')
    assert.match(sent, /sophia\.context-manifest\.v1/)
    assert.equal((w.llm.requests[0].tools ?? []).length, 0, 'the brief role offers the model no tool')
    assert.deepEqual((await w.stages(receipt.taskId)).slice(0, 2), ['create:delivered', 'create:incorporation_observed'])
    const events = await owner(`SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id=$1 AND type='native_task.result_ready'`, [w.project.projectId])
    assert.equal(events[0].n, 1, 'surfaced once')
  })

  test('A02 adverse: a capability registered for another runtime unit is refused, and the bridge stays not ready', async (t) => {
    const w = await world(t, { runtimeUnitId: 'another-runtime-unit' })
    await w.start()
    await w.until(() => /readiness=not_ready reason="Sophia service hello failed: POST \/v1\/runtime\/hello answered 403/.test(w.stderr()), 'the refused hello')
    assert.doesNotMatch(w.stderr(), /readiness=ready/)
  })

  test('A07: a steer during a controlled model step is delivered, then incorporated at the next native step', async (t) => {
    const w = await world(t)
    w.llm.script({ text: 'drafting', chunks: 40, delayMs: 100 }, { text: BRIEF })
    await w.start()
    await w.ready()
    const input = await w.say('Input for the steer test.')
    const receipt = await admitBrief(w, [input.contributionId])
    await w.until(() => w.llm.active > 0, 'the first model stream')
    const steerText = await w.say('STEER-5A07: lead with the runtime crossing.')
    await control(w, receipt, 'steer', 1, steerText.sourceId)
    await w.until(async () => (await w.stages(receipt.taskId)).includes('steer:delivered'), 'steer delivered')
    const whileStreaming = await w.stages(receipt.taskId)
    assert.equal(whileStreaming.includes('steer:incorporation_observed'), false, 'delivery is not incorporation')
    assert.equal(w.llm.requests.length, 1, 'delivered while the first step still streams')
    await w.until(async () => (await w.stages(receipt.taskId)).includes('steer:incorporation_observed'), 'steer incorporated')
    await w.until(() => w.llm.requests.length >= 2, 'the steered step')
    assert.equal(userTexts(w.llm.requests[0]).some((x) => x.includes('STEER-5A07')), false)
    assert.equal(userTexts(w.llm.requests[1]).some((x) => x.includes('STEER-5A07')), true)
  })

  test('A08: Stop during work fences it; the aborted turn publishes nothing and the goal settles stopped', async (t) => {
    const w = await world(t)
    w.llm.script({ text: 'long draft', chunks: 60, delayMs: 100 })
    await w.start()
    await w.ready()
    const input = await w.say('Input for the stop test.')
    const receipt = await admitBrief(w, [input.contributionId])
    await w.until(() => w.llm.active > 0, 'the first model stream')
    await control(w, receipt, 'stop', 1)
    const stopped = await w.until(async () => {
      const d = await w.task(receipt.taskId)
      return d.task.phase === 'stopped' && d
    }, 'the settled stop')
    assert.equal(stopped.result, null)
    assert.equal(stopped.task.state, 'cancelled')
    assert.ok((await w.stages(receipt.taskId)).includes('stop:checked'))
    const calls = w.llm.requests.length
    await sleep(1500)
    assert.equal(w.llm.requests.length, calls, 'nothing runs after the stop')
    const late = await api(E, 'POST', `/api/v1/projects/${w.project.projectId}/commands`, {
      kind: 'resume', goalId: receipt.goalId, expectedGoalRevision: 1, expectedAuthorityEpoch: 2, bodySourceId: null,
    }, crypto.randomUUID())
    assert.equal(late.status, 409, 'a stopped goal cannot be resumed')
  })

  test('A14: a runtime restart mid-work keeps the admitted work and its identity; nothing is admitted or run twice', async (t) => {
    const w = await world(t)
    w.llm.script({ text: 'before the crash', chunks: 60, delayMs: 100 }, { text: BRIEF })
    await w.start()
    await w.ready()
    const input = await w.say('Input for the restart test.')
    const receipt = await admitBrief(w, [input.contributionId])
    await w.until(() => w.llm.active > 0, 'the first model stream')
    await w.stop('SIGKILL')
    await w.start()
    await w.until(() => /reconciled [0-9a-f-]{36}: fence=active/.test(w.stderr()), 'reconciliation of the binding')
    const creates = await owner(`SELECT count(*)::int AS n FROM sophia.runtime_commands rc JOIN sophia.jobs j ON j.attempt_id=rc.attempt_id WHERE j.id=$1 AND rc.kind='create'`, [receipt.taskId])
    assert.equal(creates[0].n, 1, 'one create, ever')
    const helloBindings = await owner(`SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id=$1 AND type='runtime.hello'`, [w.project.projectId])
    assert.equal(helloBindings[0].n, 2, 'two leases: before and after the restart')
    const task = await w.task(receipt.taskId)
    assert.equal(task.task.id, receipt.taskId)
    assert.equal(task.task.attemptId, receipt.attemptId, 'the same attempt, not a new one')
  })
})
