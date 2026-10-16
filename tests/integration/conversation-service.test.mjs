/**
 * CON-01 B2 crossing (FND-B2-CON-SERVICE): a conversation reply in SERVICE mode through the real pinned dsh runtime and
 * its control bridge (ReplyServiceExecutor over the public prepareCall/stream, the real pi-ai adapter and OpenAI SDK),
 * the bridge's ServiceTransport and generated validators, the real Fastify API's /v1/runtime/conversation/* and
 * conversation routes, the worker's dispatcher, and PostgreSQL under its restricted logins. No fixture service.
 *
 * The provider is a local Responses test double (tests/support/mock-responses.mjs) on the route's own provider alias,
 * reached with a dummy key: this is evidence for the crossing and for what the adapter sends, never for a live
 * provider. The service mode is enabled only here, by a test overlay naming the operator's digest variable; the
 * committed bridge row enables no reply mode. The context is assembled by owner-run setup through the S3 compiler
 * (as the runtime DB tests do): there is no production assembler driver yet, and nothing here claims one.
 *
 * Needs SOPHIA_DISPOSABLE_DATABASE_URL; skipped without one.
 */

import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { stringify } from 'yaml'
import { REPO_ROOT, RUNTIME_DIR } from '../../scripts/lib/common.mjs'
import { parseCordisYaml } from '../../scripts/lib/patch-lint.mjs'
import { assertRecordedArtifacts, homeLayout, installProfile } from '../../scripts/lib/profile.mjs'
import { launchRuntime } from '../../scripts/lib/runtime.mjs'
import { sleep, unit } from '../support/harness.mjs'
import { conversationRouteOverlay, startMockResponses } from '../support/mock-responses.mjs'

const enabled = Boolean(process.env.SOPHIA_DISPOSABLE_DATABASE_URL)
const skip = enabled ? false : 'needs SOPHIA_DISPOSABLE_DATABASE_URL (a disposable PostgreSQL)'

const ROUTE = 'conversation-service-luna-high-v1'
const DUMMY_KEY = 'sk-sophia-conversation-service-dummy'
/** The operator's pin: the recorded bundle archive digest, a build receipt from outside the running bundle. */
const DIGEST = unit.sophia_bundle.archive_sha256
const OTHER_DIGEST = 'b'.repeat(64)
const CONTEXT_CANARY = 'CANARY-CONTEXT-7f3a'
const ANSWER_CANARY = 'CANARY-ANSWER-91c2'
const OTHER_CANARY = 'CANARY-OTHER-CONVERSATION-5d0e'
const bundlePatch = readFileSync(join(REPO_ROOT, 'packages', 'dsh-bundle', 'cordis.patch.yml'), 'utf8')

/** Test overlay: the conversation alias pointed at the double, and the bridge row restated whole with service mode on. */
function serviceOverlay(baseURL) {
  const rows = parseCordisYaml(bundlePatch)
  const bridge = rows.flatMap((row) => row.insert ?? []).find((row) => row.id === 'sophia-control-bridge')?.config
  assert.ok(bridge && !('replies' in bridge), 'the committed bridge row enables no reply mode')
  const replies = { mode: 'service', routeId: ROUTE, executorDigestEnv: 'SOPHIA_EXECUTOR_DIGEST' }
  return `${conversationRouteOverlay(bundlePatch, baseURL)}\n${stringify([{ id: 'sophia-control-bridge', config: { ...bridge, replies } }])}`
}

async function modules() {
  const [{ buildApp }, persistence, assembly, testSupport, worker] = await Promise.all([
    import('../../apps/api/src/app.ts'),
    import('../../packages/persistence/src/index.ts'),
    import('../../packages/persistence/src/conversation-assembly.ts'),
    import('../../packages/test-support/src/index.ts'),
    import('../../apps/worker/src/index.ts'),
  ])
  return { buildApp, persistence, assembly, testSupport, worker }
}

/** Every file under `dir` (bounded), for privacy scans of the runtime's home. */
function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const s = statSync(path, { throwIfNoEntry: false })
    if (!s) continue
    if (s.isDirectory()) files(path, out)
    else if (s.isFile() && s.size < 8_000_000) out.push(path)
  }
  return out
}

describe('conversation service crossing (real dsh service executor, API, worker, PostgreSQL)', { skip }, () => {
  let m, db, pool, workerPool, ownerPool, app, base, dispatcher, scratch, pristine
  let counter = 0
  const A = crypto.randomUUID()
  const E = crypto.randomUUID()

  before(async () => {
    m = await modules()
    db = await m.testSupport.createTestDatabase()
    pool = m.persistence.createPool(db.apiUrl, { max: 8 })
    workerPool = m.persistence.createPool(db.workerUrl, { max: 3 })
    ownerPool = m.persistence.createPool(db.ownerUrl, { max: 3 })
    const verifyActor = async (authorization) => {
      const id = /^Bearer test-actor:([0-9a-f-]{36})$/.exec(authorization ?? '')?.[1]
      if (!id) throw new Error('no test actor')
      return { id, name: null, anonymous: false }
    }
    app = m.buildApp({ pool, verifyActor, conversations: true })
    await app.listen({ host: '127.0.0.1', port: 0 })
    base = `http://127.0.0.1:${app.server.address().port}`
    dispatcher = new m.worker.RuntimeDispatcher(workerPool, { workerId: 'conversation-crossing', idleMs: 200 })
    dispatcher.start()
    scratch = mkdtempSync(join(tmpdir(), 'sophia-con-service-'))
    pristine = homeLayout(join(scratch, 'pristine'))
    assertRecordedArtifacts(unit, RUNTIME_DIR)
    installProfile({ unit, runtimeDir: RUNTIME_DIR, layout: pristine })
  })

  after(async () => {
    await dispatcher?.stop()
    await app?.close()
    await pool?.end()
    await workerPool?.end()
    await ownerPool?.end()
    await db?.drop()
    if (scratch) rmSync(scratch, { recursive: true, force: true })
  })

  async function api(actor, method, path, body) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer test-actor:${actor}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(method === 'POST' ? { 'idempotency-key': crypto.randomUUID() } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }

  const owner = async (sql, params) => (await ownerPool.query(sql, params)).rows

  /**
   * A project with conversations on, a runtime registered, a grant lineage on the service route pinned (unless `pin`
   * is null) to `pin`, a fresh profile home, the Responses double and the runtime process.
   */
  async function world(t, { pin = DIGEST, runtimeDigest = DIGEST, grant = {} } = {}) {
    const project = await m.testSupport.seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const projectId = project.projectId
    await owner("SELECT sophia.set_conversation_settings($1,'enabled','con01-b2-crossing')", [projectId])
    const rt = await m.testSupport.registerRuntime(db.ownerUrl, { projectId, admin: A, runtimeUnitId: unit.id })
    const lineage = await owner('SELECT sophia.conversation_new_lineage($1,$2::jsonb) AS v', [projectId, {
      unit: 'calls_tokens', routeId: ROUTE, credentialRef: 'openai-api-key', ownerResourceRef: 'b2-crossing-owner',
      approvalRef: `b2-crossing-${crypto.randomUUID()}`, expiresAt: new Date(Date.now() + 900_000).toISOString(),
      maxCallsPerReply: 1, totalCallCap: 10, replyTokenCap: 200_000, totalTokenCap: 2_000_000, subjects: [E], ...grant,
    }])
    const lineageId = (await owner('SELECT lineage_id FROM sophia.conversation_grants WHERE project_id=$1 AND current', [projectId]))[0].lineage_id
    assert.ok(lineage.length === 1 && lineageId)
    if (pin) {
      await owner('SELECT sophia.conversation_pin_execution($1,$2::jsonb)', [projectId, {
        lineageId, execution: 'service', routeId: ROUTE, executorArtifactDigest: pin, approvalRef: `b2-pin-${crypto.randomUUID()}`,
      }])
    }
    const layout = homeLayout(join(scratch, `case-${counter++}`))
    cpSync(pristine.root, layout.root, { recursive: true, verbatimSymlinks: true })
    const llm = await startMockResponses()
    let runtime = null
    const w = {
      projectId,
      layout,
      llm,
      async start() {
        runtime = launchRuntime({
          unit, runtimeDir: RUNTIME_DIR, layout, bridge: { url: base, token: rt.token },
          overlays: [serviceOverlay(llm.baseURL)],
          extraEnv: { OPENAI_API_KEY: DUMMY_KEY, SOPHIA_EXECUTOR_DIGEST: runtimeDigest },
        })
        await w.until(() => /readiness=ready/.test(w.stderr()), 'bridge readiness')
      },
      stop: (signal) => runtime?.stop(signal),
      stderr: () => runtime?.stderr() ?? '',
      async until(predicate, what, timeoutMs = 45_000) {
        const deadline = Date.now() + timeoutMs
        for (;;) {
          const value = await predicate()
          if (value) return value
          if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}\n${w.stderr().slice(-3000)}`)
          await sleep(150)
        }
      },
      /** E asks Sophia in a new conversation; the owner-run S3 compiler records its context (no production driver). */
      async ask(text = `Please summarize. ${CONTEXT_CANARY}`) {
        const started = await api(E, 'POST', `/api/v1/projects/${projectId}/conversations`, { title: 'Crossing', text: 'Opening note.', askSophia: false })
        assert.equal(started.status, 202, JSON.stringify(started.json))
        const conversationId = started.json.conversation.id
        // 0064 denies (never defers) a create whose context is not yet recorded, and the ask writes that create's outbox
        // row at once. Without a production assembler driver ordered before dispatch (Q13, not built), the dispatcher is
        // paused while the owner-run assembly records the context, and resumed after. Reported, not changed here.
        await dispatcher.stop()
        let replyId
        let sent
        try {
          sent = await api(E, 'POST', `/api/v1/conversations/${conversationId}/messages`, { text, askSophia: true })
          assert.equal(sent.status, 202, JSON.stringify(sent.json))
          replyId = sent.json.reply.id
          await recordContext(replyId)
        } finally {
          dispatcher = new m.worker.RuntimeDispatcher(workerPool, { workerId: 'conversation-crossing', idleMs: 200 })
          dispatcher.start()
        }
        const [attempt] = await owner(
          `SELECT a.id AS attempt_id,b.id AS binding_id FROM sophia.work_attempts a JOIN sophia.execution_bindings b
            ON b.project_id=a.project_id AND b.attempt_id=a.id WHERE a.project_id=$1 AND a.conversation_reply_id=$2`, [projectId, replyId])
        assert.ok(attempt, 'the recorded context admits one reply-owned attempt')
        return { conversationId, messageId: sent.json.message.id, replyId, ...attempt }
      },
      reply: async (r) => (await owner('SELECT state,reason,answer_id FROM sophia.conversation_replies WHERE id=$1', [r.replyId]))[0],
      reservations: async (r) => owner(
        'SELECT call_ordinal,state,amount_calls,amount_tokens,used_calls,used_tokens FROM sophia.conversation_reservations WHERE reply_id=$1 ORDER BY call_ordinal', [r.replyId]),
      grant: async () => (await owner(
        `SELECT reserved_calls,reserved_tokens,spent_calls,spent_tokens,uncertain_calls,uncertain_tokens FROM sophia.conversation_grants
          WHERE project_id=$1 AND current`, [projectId]))[0],
      stages: async (r) => (await owner(
        `SELECT rc.kind,rr.stage,rr.reason,rr.executor FROM sophia.runtime_receipts rr JOIN sophia.runtime_commands rc
          ON rc.project_id=rr.project_id AND rc.id=rr.runtime_command_id WHERE rc.project_id=$1 AND rc.attempt_id=$2 ORDER BY rr.recorded_at`,
        [projectId, r.attempt_id])),
      binding: async (r) => (await owner('SELECT state FROM sophia.execution_bindings WHERE id=$1', [r.binding_id]))[0].state,
      creates: async (r) => (await owner(`SELECT count(*)::int AS n FROM sophia.runtime_commands WHERE attempt_id=$1 AND kind='create'`, [r.attempt_id]))[0].n,
      claims: async (r) => (await owner('SELECT count(*)::int AS n FROM sophia.conversation_executions WHERE attempt_id=$1', [r.attempt_id]))[0].n,
      answers: async (r) => owner(
        `SELECT m.id,m.body FROM sophia.conversation_messages m JOIN sophia.conversation_replies r ON r.answer_id=m.id WHERE r.id=$1`, [r.replyId]),
      /** The runtime home and its log hold none of the context, answer or reasoning. */
      assertPrivate() {
        for (const canary of [CONTEXT_CANARY, ANSWER_CANARY]) {
          assert.ok(!w.stderr().includes(canary), `the runtime log never carries ${canary}`)
          const hit = files(layout.dshHome).find((path) => readFileSync(path, 'latin1').includes(canary))
          assert.equal(hit, undefined, `no file in the runtime home carries ${canary}`)
        }
      },
    }
    t.after(async () => {
      await runtime?.stop()
      await llm.close()
    })
    return w
  }

  /**
   * Migration-owner setup of the S3 record (the runtime DB tests' recordScene): claim, begin, render, record. Begin runs
   * under REPEATABLE READ and locks the project row, which the live runtime and worker keep updating: a serialization
   * failure is retried as the design says, by a new claim once the short lease has passed (the claims count it).
   */
  async function recordContext(replyId) {
    for (let attempt = 1; ; attempt++) {
      const c = await ownerPool.connect()
      try {
        const claim = (await c.query('SELECT sophia.conversation_assembly_claim($1,1500) AS v', [replyId])).rows[0].v
        if (claim.verdict === 'assembly_in_progress') {
          await sleep(500)
          continue
        }
        if (claim.verdict !== 'claimed') {
          const why = await owner('SELECT state,reason FROM sophia.conversation_replies WHERE id=$1', [replyId])
          const claims = await owner('SELECT attempt,outcome,outcome_reason FROM sophia.conversation_assembly_claims WHERE reply_id=$1', [replyId])
          assert.fail(`assembly claim ${JSON.stringify(claim)} at try ${attempt}: ${JSON.stringify(why)} ${JSON.stringify(claims)}`)
        }
        await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
        const binding = (await c.query('SELECT sophia.conversation_assembly_begin($1,$2,$3) AS v', [replyId, claim.attempt, claim.token])).rows[0].v
        assert.equal(binding.verdict, 'begun')
        const rendered = await m.assembly.renderBound(c, binding)
        await c.query('SELECT sophia.conversation_record_context($1,$2,$3,$4::jsonb)', [replyId, claim.attempt, claim.token, m.assembly.recordPayload(rendered)])
        await c.query('COMMIT')
        return
      } catch (error) {
        await c.query('ROLLBACK')
        if (error.code !== '40001' || attempt >= 4) throw error
        await sleep(1600)
      } finally {
        c.release()
      }
    }
  }

  const SERVICE_TUPLE = { execution: 'service', routeId: ROUTE, executorArtifactDigest: DIGEST }

  test('a complete allowed answer: one request on the pinned route, no session or tools, settled, published once, retired', async (t) => {
    const w = await world(t)
    w.llm.script({ text: `The summary. ${ANSWER_CANARY}`, usage: { input_tokens: 900, output_tokens: 40 } })
    await w.start()
    assert.match(w.stderr(), /readiness=ready/)
    const other = await api(E, 'POST', `/api/v1/projects/${w.projectId}/conversations`, { title: 'Elsewhere', text: `Another thread. ${OTHER_CANARY}`, askSophia: false })
    assert.equal(other.status, 202)
    const r = await w.ask()
    await w.until(async () => (await w.reply(r)).state === 'answered', 'the published answer')
    const answers = await w.answers(r)
    assert.equal(answers.length, 1)
    assert.equal(answers[0].body, `The summary. ${ANSWER_CANARY}`)
    // One HTTP request, exactly the pinned route, carrying the recorded context and nothing of a session or tool.
    assert.equal(w.llm.requests.length, 1)
    const [request] = w.llm.requests
    assert.equal(request.url, '/v1/responses')
    assert.equal(request.headers.authorization, `Bearer ${DUMMY_KEY}`)
    assert.equal(request.body.model, 'gpt-6-luna')
    assert.equal(request.body.reasoning?.effort, 'high')
    assert.equal(request.body.max_output_tokens, 4096)
    assert.ok(!request.body.tools || request.body.tools.length === 0, 'no tools')
    assert.equal(request.body.prompt_cache_key, undefined, 'no session-derived cache key')
    assert.equal(request.body.previous_response_id, undefined)
    assert.match(JSON.stringify(request.body.input), new RegExp(CONTEXT_CANARY), 'the recorded context is the input')
    assert.doesNotMatch(JSON.stringify(request.body), new RegExp(OTHER_CANARY), 'another conversation of the project is absent')
    // Counted before, settled from usage; the server's terminal and cleanup ran; the retire names this executor.
    assert.deepEqual((await w.reservations(r)).map((v) => [v.state, v.used_calls]), [['settled', '1']])
    await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
    const stages = await w.stages(r)
    assert.deepEqual(stages.map((s) => `${s.kind}:${s.stage}`), ['create:delivered', 'retire:checked'])
    assert.deepEqual(stages.at(-1).executor, SERVICE_TUPLE)
    assert.equal(await w.creates(r), 1)
    w.assertPrivate()
    await sleep(1000)
    assert.equal(w.llm.requests.length, 1, 'nothing more is sent')
  })

  for (const status of [429, 503]) {
    test(`a provider ${status} is one SDK request, no retry: no answer, the reservation stays counted as uncertain`, async (t) => {
      const w = await world(t)
      w.llm.script({ status }, { text: `must never be sent ${ANSWER_CANARY}` })
      await w.start()
      const r = await w.ask()
      await w.until(async () => (await w.reply(r)).state === 'failed', 'the failed reply')
      await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
      await sleep(2500)
      assert.equal(w.llm.requests.length, 1, 'exactly one HTTP request: no adapter, SDK or bridge retry')
      assert.deepEqual(await w.answers(r), [])
      assert.equal((await w.reply(r)).reason, 'runtime_failed', 'failed by the runtime receipt, not a turn end')
      assert.deepEqual((await w.reservations(r)).map((v) => v.state), ['uncertain'])
      const grant = await w.grant()
      assert.equal(grant.uncertain_calls, '1')
      assert.equal(grant.spent_calls, '0')
      const stages = await w.stages(r)
      assert.deepEqual(stages.map((s) => `${s.kind}:${s.stage}:${s.reason ?? ''}`), ['create:delivered:', 'create:failed:call_failed', 'retire:checked:'])
      w.assertPrivate()
    })
  }

  test('wrong scope: a grant pinned to another executor artifact dispatches nothing to the provider', async (t) => {
    const w = await world(t, { pin: OTHER_DIGEST })
    await w.start()
    const r = await w.ask()
    await w.until(async () => (await w.reply(r)).state === 'failed', 'the refused reply')
    assert.equal((await w.reply(r)).reason, 'runtime_rejected')
    assert.equal(await w.claims(r), 0, 'never claimed')
    assert.deepEqual(await w.reservations(r), [])
    assert.equal(w.llm.requests.length, 0, 'zero provider requests')
    assert.deepEqual((await w.stages(r)).map((s) => `${s.kind}:${s.stage}:${s.reason ?? ''}`).slice(0, 1), ['create:rejected:reply_executor_mismatch'])
  })

  test('an unpinned (native) lineage is not served by the service executor either', async (t) => {
    const w = await world(t, { pin: null })
    await w.start()
    const r = await w.ask()
    await w.until(async () => (await w.reply(r)).state === 'failed', 'the refused reply')
    assert.equal(await w.claims(r), 0)
    assert.equal(w.llm.requests.length, 0)
  })

  for (const [name, act] of [
    ['withdrawal of the question', (w, r) => api(E, 'POST', `/api/v1/conversations/${r.conversationId}/messages/${r.messageId}/withdrawal`)],
    ['erasure of the conversation', (w, r) => api(A, 'POST', `/api/v1/conversations/${r.conversationId}/erasure`)],
    ['revocation of the asker', (w) => api(A, 'POST', `/api/v1/projects/${w.projectId}/members/${E}/removal`, {})],
  ]) {
    test(`late ${name} during the call: no answer is ever published; the call is stopped and counted`, async (t) => {
      const w = await world(t)
      w.llm.script({ text: `late answer ${ANSWER_CANARY}`, delayMs: 6000 })
      await w.start()
      const r = await w.ask()
      await w.until(() => w.llm.active > 0, 'the provider call in flight')
      const done = await act(w, r)
      assert.ok(done.status < 300, JSON.stringify(done.json))
      await w.until(async () => !['pending', 'running'].includes((await w.reply(r)).state), 'the ended reply')
      await sleep(7000)
      assert.deepEqual(await w.answers(r), [], 'no answer, even after the provider finished')
      assert.equal(w.llm.requests.length, 1)
      assert.notEqual((await w.reply(r)).state, 'answered')
      const states = (await w.reservations(r)).map((v) => v.state)
      assert.ok(states.length === 1 && ['uncertain', 'settled'].includes(states[0]), `the call stays counted (${states})`)
      w.assertPrivate()
    })
  }

  test('restart mid-call: the same artifact adopts the attempt from hello, never dispatches again, retires it; uncertain kept', async (t) => {
    const w = await world(t)
    w.llm.script({ text: `before the crash ${ANSWER_CANARY}`, delayMs: 20_000 })
    await w.start()
    const r = await w.ask()
    await w.until(() => w.llm.active > 0, 'the provider call in flight')
    await w.until(async () => (await w.reservations(r)).length === 1, 'the reservation')
    await w.stop('SIGKILL')
    const grantBefore = await w.grant()
    await w.start()
    await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
    const reply = await w.reply(r)
    assert.deepEqual([reply.state, reply.reason], ['outcome_unknown', 'runtime_lease_lost'])
    assert.deepEqual((await w.reservations(r)).map((v) => v.state), ['uncertain'])
    const grantAfter = await w.grant()
    assert.deepEqual(
      [grantAfter.uncertain_calls, grantAfter.uncertain_tokens, grantAfter.spent_calls],
      [String(Number(grantBefore.uncertain_calls) + Number(grantBefore.reserved_calls)), String(Number(grantBefore.uncertain_tokens) + Number(grantBefore.reserved_tokens)), '0'],
    )
    assert.equal(await w.creates(r), 1, 'one create, ever')
    assert.equal(w.llm.requests.length, 1, 'no redispatch to the provider')
    const retire = (await w.stages(r)).find((s) => s.kind === 'retire')
    assert.deepEqual(retire.executor, SERVICE_TUPLE)
    assert.doesNotMatch(w.stderr().split('readiness=ready').at(-1), new RegExp(`unrecovered=.*${r.attempt_id}`), 'adopted, not unrecovered')
    w.assertPrivate()
  })

  test('restart with zero reservation: a refused reservation made no call; the restarted executor retires it', async (t) => {
    const w = await world(t, { grant: { replyTokenCap: 64 } })
    await w.start()
    const r = await w.ask()
    await w.until(async () => (await w.reply(r)).state === 'failed', 'the failed reply')
    assert.deepEqual(await w.reservations(r), [], 'no reservation was made')
    await w.stop('SIGKILL')
    await w.start()
    await w.until(async () => (await w.binding(r)) === 'retired', 'the retired binding')
    assert.equal(w.llm.requests.length, 0, 'zero provider requests, before and after the restart')
    assert.equal(await w.creates(r), 1)
  })

  test('a restarted runtime under another artifact digest adopts nothing and answers no retire', async (t) => {
    const w = await world(t, { runtimeDigest: OTHER_DIGEST })
    // Pinned to DIGEST, run under OTHER_DIGEST: the create is refused before claim; its retire is left unanswered.
    await w.start()
    const r = await w.ask()
    await w.until(async () => (await w.reply(r)).state === 'failed', 'the refused reply')
    await sleep(3000)
    assert.notEqual(await w.binding(r), 'retired', 'the cleanup obligation stays')
    assert.equal((await w.stages(r)).filter((s) => s.kind === 'retire').length, 0)
    assert.equal(w.llm.requests.length, 0)
  })
})
