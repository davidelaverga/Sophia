/**
 * SMC-M02 G5 preflight (CC-0004): the permitted settlement of an old-unit binding whose brief is already result_ready.
 *
 * Copy this file into `tests/integration/` of the checkout whose unit is to be shown, and run it with
 * SOPHIA_DISPOSABLE_DATABASE_URL set (a disposable PostgreSQL):
 *
 *   node --test tests/integration/settlement.test.mjs
 *
 * Its setup is runtime-service.test.mjs's, byte for byte (the real Fastify API, PostgreSQL with the checkout's
 * migrations, the worker's RuntimeDispatcher, and the pinned dsh unit with its control bridge); only the cases differ.
 * The keyless mock model stands in for the provider, so this is evidence for the service ↔ runtime crossing only.
 *
 * Each case brings one brief to the state production's two bindings are in: a completed turn captured as the result,
 * the job `succeeded`, the goal `checking`, and the binding still `running` (nothing but Hold or Stop moves a binding
 * out of `running` once its create is delivered). It then sends the goal command through the member route that the
 * Studio's Hold and Stop buttons use, and records what it settles and what it leaves. Nothing is written by hand.
 */

import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

describe('G5 settlement of a result_ready binding (real API, PostgreSQL, worker, pinned dsh)', { skip }, () => {
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

  /**
   * A brief as one admitted before SMC-M01. New admission over HTTP is retired (410, checked here every time); the
   * runtime must keep dispatching, restoring and controlling briefs that already exist, so they are created through
   * the database function production already ran, on the API's own login and actor.
   */
  async function admitBrief(w, inputs, key = crypto.randomUUID()) {
    const request = {
      kind: 'draft_brief',
      instruction: 'Draft the implementation brief for the room slice.',
      contributionIds: inputs,
      expectedMissionRevision: 1,
    }
    const retired = await api(E, 'POST', `/api/v1/projects/${w.project.projectId}/native-tasks`, request, key)
    assert.equal(retired.status, 410, JSON.stringify(retired.json))
    return s.persistence.withActor(pool, E, 'write', (c) => s.persistence.admitNativeTask(c, w.project.projectId, key, request))
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

  /** The rows G5's P3 counts, and the rows a settlement must keep. */
  async function rows(w, receipt) {
    const [r] = await owner(
      `SELECT b.state AS binding, b.runtime_unit_id AS unit, g.status AS goal, a.state AS attempt, j.state AS job,
              j.result_source_id::text AS result, j.result_revision::int AS revision,
              (SELECT count(*)::int FROM sophia.source_objects s WHERE s.project_id=j.project_id AND s.id=j.result_source_id) AS result_sources,
              (SELECT count(*)::int FROM sophia.execution_bindings eb WHERE eb.project_id=b.project_id AND eb.runtime_unit_id=b.runtime_unit_id
                 AND eb.state IN ('created','launching','running','idle','stopping')) AS p3_live_bindings,
              (SELECT count(*)::int FROM sophia.outbox o WHERE o.project_id=b.project_id AND o.destination LIKE 'native.%'
                 AND o.state NOT IN ('settled','denied','superseded')) AS p3_open_native_outbox,
              (SELECT count(*)::int FROM sophia.runtime_commands rc WHERE rc.project_id=b.project_id AND rc.answered_stage IS NULL
                 AND rc.kind<>'inspect') AS p3_unanswered_commands
         FROM sophia.jobs j JOIN sophia.work_attempts a ON a.project_id=j.project_id AND a.id=j.attempt_id
         JOIN sophia.goals g ON g.project_id=a.project_id AND g.id=a.goal_id
         JOIN sophia.execution_bindings b ON b.project_id=a.project_id AND b.attempt_id=a.id
        WHERE j.id=$1`,
      [receipt.taskId],
    )
    return r
  }

  /** One brief, run to result_ready: production's state before settlement. */
  async function resultReady(w) {
    w.llm.script({ text: BRIEF })
    await w.start()
    await w.ready()
    const input = await w.say('Input for the settlement rehearsal.')
    const receipt = await admitBrief(w, [input.contributionId])
    const done = await w.until(async () => {
      const d = await w.task(receipt.taskId)
      return d.task.phase === 'result_ready' && d
    }, 'the captured brief')
    const before = await rows(w, receipt)
    assert.deepEqual([before.binding, before.goal, before.job, before.p3_live_bindings], ['running', 'checking', 'succeeded', 1],
      'the state CX-0006 read: result ready, binding still running')
    return { receipt, done, before }
  }

  const evidence = {}
  after(() => {
    if (process.env.SOPHIA_SETTLEMENT_OUT) writeFileSync(process.env.SOPHIA_SETTLEMENT_OUT, `${JSON.stringify({ unit: unit.id, dsh: unit.dsh.package_version, ...evidence }, null, 2)}\n`)
  })

  test('Stop after result_ready: the binding settles on its own unit, the result is kept and readable, P3 reaches 0', async (t) => {
    const w = await world(t)
    const { receipt, done, before } = await resultReady(w)
    const calls = w.llm.requests.length
    await control(w, receipt, 'stop', 1)
    const stopped = await w.until(async () => {
      const d = await w.task(receipt.taskId)
      return d.task.phase === 'stopped' && d
    }, 'the settled stop')
    await sleep(1000)
    const settled = await rows(w, receipt)
    const stages = await w.stages(receipt.taskId)
    assert.ok(stages.includes('stop:checked'), stages.join(','))
    assert.equal(settled.binding, 'settled')
    assert.equal(settled.goal, 'stopped')
    assert.equal(settled.job, 'succeeded', 'Stop cancels only pending or running jobs')
    assert.equal(settled.result, before.result, 'the same result source')
    assert.equal(settled.revision, before.revision)
    assert.equal(settled.result_sources, 1)
    assert.equal(stopped.result.markdown, done.result.markdown, 'still readable through the member route')
    assert.equal(stopped.result.sourceId, done.result.sourceId)
    assert.deepEqual([stopped.result.provider, stopped.result.model], [done.result.provider, done.result.model])
    assert.deepEqual([settled.p3_live_bindings, settled.p3_open_native_outbox, settled.p3_unanswered_commands], [0, 0, 0])
    assert.equal(w.llm.requests.length, calls, 'no model call')
    evidence.stop = { before, after: settled, stages, phase: stopped.task.phase, resultKept: true, modelCalls: w.llm.requests.length - calls }
  })

  test('Hold after result_ready: the result is kept, but the binding stays idle on the old unit and P3 does not reach 0', async (t) => {
    const w = await world(t)
    const { receipt, done, before } = await resultReady(w)
    const calls = w.llm.requests.length
    await control(w, receipt, 'hold', 1)
    const held = await w.until(async () => {
      const d = await w.task(receipt.taskId)
      return d.task.phase === 'held' && d
    }, 'the settled hold')
    const afterHold = await rows(w, receipt)
    const stages = await w.stages(receipt.taskId)
    assert.ok(stages.includes('hold:checked'), stages.join(','))
    assert.deepEqual([afterHold.binding, afterHold.goal, afterHold.job, afterHold.result], ['idle', 'held', 'succeeded', before.result])
    assert.equal(held.result.markdown, done.result.markdown)
    assert.equal(afterHold.p3_live_bindings, 1, 'an idle binding is resumable, and only on its own unit')
    assert.equal(w.llm.requests.length, calls, 'no model call')
    evidence.hold = { before, after: afterHold, stages, phase: held.task.phase, resultKept: true, modelCalls: w.llm.requests.length - calls }
  })
})
