// S1-05A through real HTTP (level: sql-run): the runtime routes (A04) authenticate a runtime capability and
// nothing else, the member routes (A05) record discussion and admit one draft_brief, and a waiting command poll
// wakes when the worker dispatches. Synthetic HS256 tokens stand in for Supabase Auth.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import type pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it, type TestContext } from 'node:test'
import { parseContributionReceipt, parseNativeTaskDetail, parseSnapshot } from '@sophia/contracts/validate'
import {
  admitNativeTask,
  createPool,
  sendConversationMessage,
  startConversation,
  withdrawConversationMessage,
  withActor,
} from '@sophia/persistence'
import { recordPayload, renderBound, type Binding } from '../../../packages/persistence/src/conversation-assembly.ts'
import {
  createTestDatabase,
  registerRuntime,
  seedProject,
  type RegisteredRuntime,
  type SeededProject,
  type TestDatabase,
} from '@sophia/test-support'
import { dispatchOnce } from '@sophia/worker'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const A = randomUUID()
const E = randomUUID()
const V = randomUUID()

let db: TestDatabase
let pool: pg.Pool
let worker: pg.Pool
let app: FastifyInstance
let base: string
let seed: SeededProject
let rt: RegisteredRuntime

async function token(sub: string, anonymous = false): Promise<string> {
  return new SignJWT({ role: 'authenticated', ...(anonymous ? { is_anonymous: true } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
}

// oxlint-disable-next-line typescript/no-explicit-any -- test helper over heterogeneous response bodies
type ResponseBody = any

async function call(
  path: string,
  init: { method?: string; bearer?: string; body?: unknown; headers?: Record<string, string> },
) {
  const res = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.bearer ? { authorization: `Bearer ${init.bearer}` } : {}),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  const json: ResponseBody = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

const bridgeHeaders = (bridge: string, unit = rt.runtimeUnitId) => ({
  'x-sophia-runtime-unit': unit,
  'x-sophia-bridge-instance': bridge,
  'x-sophia-bridge-protocol': '1',
})

const hello = (bearer: string, bridge: string, unit?: string) =>
  call('/v1/runtime/hello', {
    method: 'POST',
    bearer,
    headers: bridgeHeaders(bridge, unit),
    body: { bundle: '@sophia/dsh-bundle@test', protocolVersion: 1, dshVersion: '0.1.7-rc.1' },
  })

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  worker = createPool(db.workerUrl, { max: 2 })
  app = buildApp({
    pool,
    verifyActor: createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET }),
    // The CON reply runtime's routes are served only with conversations on (#385 review).
    conversations: true,
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  seed = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
  rt = await registerRuntime(db.ownerUrl, { projectId: seed.projectId, admin: A })
})
after(async () => {
  await app.close()
  await pool.end()
  await worker.end()
  await db.drop()
})

describe('runtime route authentication (A04)', () => {
  it('takes a runtime capability on the runtime routes only, and refuses member tokens there', async () => {
    assert.equal((await hello('', randomUUID())).status, 401, 'no capability')
    const member = await hello(await token(A), randomUUID())
    assert.equal(member.status, 401, 'a member JWT is not a runtime capability')
    assert.equal(member.json.code, 'runtime_capability_required')
    assert.equal((await hello(rt.token, randomUUID(), 'another-unit')).status, 403, 'another runtime unit')
    const onMemberRoute = await call(`/api/v1/projects/${seed.projectId}/snapshot`, { bearer: rt.token })
    assert.equal(onMemberRoute.status, 401, 'a runtime capability is not a member token')
    const ok = await hello(rt.token, randomUUID())
    assert.equal(ok.status, 200)
    assert.deepEqual(Object.keys(ok.json).toSorted(), ['authorityEpoch', 'bindings', 'cursor', 'leaseId', 'projectId'])
  })

  it('fences a superseded lease and refuses a runtime route that forgets the transport headers', async () => {
    const first = randomUUID()
    await hello(rt.token, first)
    await hello(rt.token, randomUUID())
    const stale = await call('/v1/runtime/commands?after=0&waitMs=0', {
      bearer: rt.token,
      headers: bridgeHeaders(first),
    })
    assert.equal(stale.status, 409)
    const bare = await call('/v1/runtime/commands?after=0&waitMs=0', { bearer: rt.token })
    assert.equal(bare.status, 422)
  })
})

describe('discussion and a draft_brief through the API (A05)', () => {
  it('records discussion; new briefs are retired (410); an existing brief still dispatches and wakes the runtime poll', async () => {
    const said = await call(`/api/v1/projects/${seed.projectId}/contributions`, {
      method: 'POST',
      bearer: await token(E),
      headers: { 'idempotency-key': randomUUID() },
      body: {
        source: null,
        text: 'Say what the room needs first.',
        threadId: null,
        artifactVersionId: null,
        intent: 'discuss',
      },
    })
    assert.equal(said.status, 202)
    const contribution = parseContributionReceipt(said.json)
    const request = {
      kind: 'draft_brief' as const,
      instruction: 'Draft the brief.',
      contributionIds: [contribution.contributionId],
      expectedMissionRevision: 1,
    }
    const admit = async (actor: string) =>
      call(`/api/v1/projects/${seed.projectId}/native-tasks`, {
        method: 'POST',
        bearer: await token(actor),
        headers: { 'idempotency-key': randomUUID() },
        body: request,
      })
    for (const actor of [V, E]) {
      const refused = await admit(actor)
      assert.deepEqual([refused.status, refused.json.code], [410, 'native_task_retired'], 'SMC-M01 retired new briefs')
    }
    // A brief admitted before SMC-M01: created through the database function production already ran, which the
    // runtime must keep dispatching, restoring and controlling while it exists.
    const receipt = await withActor(pool, E, 'write', (c) => admitNativeTask(c, seed.projectId, randomUUID(), request))

    const bridge = randomUUID()
    const opened = await hello(rt.token, bridge)
    const ready = await call('/v1/runtime/ready', {
      method: 'POST',
      bearer: rt.token,
      headers: bridgeHeaders(bridge),
      body: { state: 'ready', reason: null, unrecovered: [] },
    })
    assert.equal(ready.status, 204, 'nothing is dispatched to a runtime that has not reported ready')
    const waiting = call(`/v1/runtime/commands?after=${opened.json.cursor}&waitMs=10000`, {
      bearer: rt.token,
      headers: bridgeHeaders(bridge),
    })
    const started = Date.now()
    await new Promise((resolve) => setTimeout(resolve, 300))
    const pass = await dispatchOnce(worker, { workerId: 'api-test' })
    assert.deepEqual(
      pass.outcomes.map((o) => o.result),
      ['enqueued'],
    )
    const batch = await waiting
    assert.equal(batch.status, 200)
    assert.ok(Date.now() - started < 5000, 'the poll woke on the dispatch, not the timeout')
    assert.equal(batch.json.commands.length, 1)
    assert.equal(batch.json.commands[0].command.kind, 'create')
    assert.equal(batch.json.commands[0].command.binding.attemptId, receipt.attemptId)

    const detail = await call(`/api/v1/projects/${seed.projectId}/native-tasks/${receipt.taskId}`, {
      bearer: await token(V),
    })
    assert.equal(parseNativeTaskDetail(detail.json).task.phase, 'dispatched')
    const snap = parseSnapshot(
      (await call(`/api/v1/projects/${seed.projectId}/snapshot`, { bearer: await token(V) })).json,
    )
    assert.equal(snap.discussion.at(-1)?.text, 'Say what the room needs first.')
    const runtime = snap.resources.find((r) => r.harness === 'dsh')
    assert.deepEqual(
      [runtime?.hostState, runtime?.nativeState],
      ['online', 'running'],
      'its ready report reaches the room',
    )
  })

  it('keeps guests out of discussion and work', async () => {
    const guest = await token(randomUUID(), true)
    const said = await call(`/api/v1/projects/${seed.projectId}/contributions`, {
      method: 'POST',
      bearer: guest,
      headers: { 'idempotency-key': randomUUID() },
      body: { source: null, text: 'hello', threadId: null, artifactVersionId: null, intent: 'discuss' },
    })
    assert.equal(said.status, 403)
  })
})

// CON Step2: real HTTP/PG, synthetic admission/context only; these routes never execute a native/provider call.
const CONVERSATION_OPERATIONS = ['claim', 'go', 'reserve', 'settle', 'acknowledged'] as const

async function recordConversationContext(owner: pg.Pool, replyId: string) {
  const claim = (
    await owner.query<{ v: { attempt: number; token: string } }>(
      'SELECT sophia.conversation_assembly_claim($1,8000) AS v',
      [replyId],
    )
  ).rows[0]?.v
  assert.ok(claim)
  const c = await owner.connect()
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    const binding = (
      await c.query<{ v: Binding }>('SELECT sophia.conversation_assembly_begin($1,$2,$3) AS v', [
        replyId,
        claim.attempt,
        claim.token,
      ])
    ).rows[0]?.v
    assert.ok(binding)
    await c.query('SELECT sophia.conversation_record_context($1,$2,$3,$4::jsonb)', [
      replyId,
      claim.attempt,
      claim.token,
      recordPayload(await renderBound(c, binding)),
    ])
    await c.query('COMMIT')
  } finally {
    await c.query('ROLLBACK')
    c.release()
  }
}

async function conversationWorld(t: TestContext) {
  const project = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
  const runtime = await registerRuntime(db.ownerUrl, { projectId: project.projectId, admin: A })
  const bridge = randomUUID()
  const owner = createPool(db.ownerUrl, { max: 3 })
  t.after(() => owner.end())
  const headers = bridgeHeaders(bridge, runtime.runtimeUnitId)
  const announced = await call('/v1/runtime/hello', {
    method: 'POST',
    bearer: runtime.token,
    headers,
    body: {
      bundle: '@sophia/dsh-bundle@test',
      dshVersion: '0.2.0-rc.2',
      protocolVersion: 1,
      roles: [{ id: 'sophia-conversation-v1', route: 'route-test', presetDigest: 'synthetic' }],
    },
  })
  assert.equal(announced.status, 200)
  assert.equal(
    (
      await call('/v1/runtime/ready', {
        method: 'POST',
        bearer: runtime.token,
        headers,
        body: { state: 'ready', reason: null, unrecovered: [] },
      })
    ).status,
    204,
  )
  await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','con01-runtime-http-local-test')", [
    project.projectId,
  ])
  await owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
    project.projectId,
    {
      unit: 'calls_tokens',
      routeId: 'route-test',
      credentialRef: 'synthetic-credential-ref',
      ownerResourceRef: 'synthetic-owner-resource-ref',
      approvalRef: 'synthetic-http-test',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxCallsPerReply: 2,
      totalCallCap: 10,
      replyTokenCap: 1000,
      totalTokenCap: 5000,
      subjects: [E],
    },
  ])
  const first = await withActor(pool, E, 'write', (c) =>
    startConversation(
      c,
      project.projectId,
      randomUUID(),
      { title: 'Runtime HTTP test', text: 'Synthetic context', askSophia: false },
      'E',
    ),
  )
  const asked = await withActor(pool, E, 'write', (c) =>
    sendConversationMessage(
      c,
      first.conversationId,
      randomUUID(),
      { text: 'Synthetic question', askSophia: true },
      'E',
    ),
  )
  assert.ok(asked.replyId)
  await recordConversationContext(owner, asked.replyId)
  await dispatchOnce(worker, { workerId: 'conversation-http-test' })
  const command = (
    await owner.query<{ id: string; attempt_id: string; binding_id: string }>(
      "SELECT id,attempt_id,binding_id FROM sophia.runtime_commands WHERE project_id=$1 AND kind='create'",
      [project.projectId],
    )
  ).rows[0]
  assert.ok(command)
  return {
    projectId: project.projectId,
    replyId: asked.replyId,
    conversationId: first.conversationId,
    firstId: first.messageId,
    runtime,
    bridge,
    headers,
    owner,
    command,
    request: { attemptId: command.attempt_id, commandId: command.id, authorityEpoch: 1, leaseId: bridge },
  }
}

type ConversationWorld = Awaited<ReturnType<typeof conversationWorld>>

const conversationCall = (w: ConversationWorld, operation: (typeof CONVERSATION_OPERATIONS)[number], body: unknown) =>
  call(`/v1/runtime/conversation/${operation}`, { method: 'POST', bearer: w.runtime.token, headers: w.headers, body })

const syntheticCall = {
  routeId: 'route-test',
  credentialRef: 'synthetic-credential-ref',
  ownerResourceRef: 'synthetic-owner-resource-ref',
  unit: 'calls_tokens',
  tokens: 100,
  priceMicros: 0,
}
const journalKeys = { observations: [], usage: [], ordinals: [], hasTurnEnd: false }
const operationBody = (w: ConversationWorld, operation: (typeof CONVERSATION_OPERATIONS)[number]) => ({
  ...w.request,
  ...(operation === 'reserve' ? { ordinal: 1, call: syntheticCall } : {}),
  ...(operation === 'settle' ? { ordinal: 1, used: { calls: 1, tokens: 10, priceMicros: 0 } } : {}),
  ...(operation === 'acknowledged' ? { keys: journalKeys } : {}),
})

describe('CON runtime HTTP routes (L1, actual capability/lease/PG; no model)', () => {
  it('dispatch stores original reserve references and ACK reads actual settled amounts', async (t) => {
    const w = await conversationWorld(t)
    const stored = await w.owner.query<{ payload: { conversation: unknown } }>(
      "SELECT body->'payload' AS payload FROM sophia.runtime_commands WHERE project_id=$1 AND id=$2",
      [w.projectId, w.command.id],
    )
    assert.deepEqual(stored.rows[0]?.payload.conversation, {
      credentialRef: syntheticCall.credentialRef,
      ownerResourceRef: syntheticCall.ownerResourceRef,
      unit: syntheticCall.unit,
    })
    assert.equal((await conversationCall(w, 'claim', w.request)).status, 200)
    assert.equal((await conversationCall(w, 'go', w.request)).status, 200)
    for (const field of ['credentialRef', 'ownerResourceRef']) {
      const forged = { ...operationBody(w, 'reserve'), call: { ...syntheticCall, [field]: 'another-reference' } }
      assert.equal((await conversationCall(w, 'reserve', forged)).status, 403)
    }
    assert.equal((await conversationCall(w, 'reserve', operationBody(w, 'reserve'))).status, 200)
    const pending = await conversationCall(w, 'acknowledged', operationBody(w, 'acknowledged'))
    assert.deepEqual(pending.json.predicates.reservations.states, [
      { ordinal: 1, state: 'reserved', unit: 'calls_tokens', used: null },
    ])
    assert.equal((await conversationCall(w, 'settle', operationBody(w, 'settle'))).status, 200)
    const settled = await conversationCall(w, 'acknowledged', operationBody(w, 'acknowledged'))
    assert.deepEqual(settled.json.predicates.reservations.states, [
      { ordinal: 1, state: 'settled', unit: 'calls_tokens', used: { calls: 1, tokens: 10, priceMicros: 0 } },
    ])
    const actual = await w.owner.query<{ used_tokens: string }>(
      'SELECT used_tokens FROM sophia.conversation_reservations WHERE project_id=$1 AND reply_id=$2',
      [w.projectId, w.replyId],
    )
    assert.equal(actual.rows[0]?.used_tokens, '10')
  })

  it('claims/goes once, reserves/settles idempotently and returns all eight actual durable predicates', async (t) => {
    const w = await conversationWorld(t)
    assert.deepEqual(await conversationCall(w, 'claim', w.request), { status: 200, json: { result: 'first' } })
    assert.deepEqual(await conversationCall(w, 'claim', w.request), {
      status: 200,
      json: { result: 'refused', code: 'already_claimed' },
    })
    assert.deepEqual(await conversationCall(w, 'go', w.request), { status: 200, json: { result: 'go' } })
    const reserved = await conversationCall(w, 'reserve', operationBody(w, 'reserve'))
    assert.equal(reserved.status, 200)
    assert.equal(reserved.json.state, 'reserved')
    assert.equal(reserved.json.replyId, w.replyId)
    assert.deepEqual(await conversationCall(w, 'reserve', operationBody(w, 'reserve')), reserved)
    const settled = await conversationCall(w, 'settle', operationBody(w, 'settle'))
    assert.equal(settled.status, 200)
    assert.equal(settled.json.state, 'settled')
    assert.deepEqual(await conversationCall(w, 'settle', operationBody(w, 'settle')), settled)
    const ack = await conversationCall(w, 'acknowledged', operationBody(w, 'acknowledged'))
    assert.equal(ack.status, 200)
    assert.deepEqual(Object.keys(ack.json.predicates).toSorted(), [
      'capture',
      'createAnswered',
      'observations',
      'payloadScrubbed',
      'reservations',
      'terminalState',
      'terminalWriter',
      'usage',
    ])
    assert.equal(ack.json.predicates.terminalState.met, false)
    assert.equal(
      (
        await w.owner.query(
          'SELECT spent_calls,reserved_calls FROM sophia.conversation_grants WHERE project_id=$1 AND current',
          [w.projectId],
        )
      ).rows[0]?.spent_calls,
      '1',
    )
  })

  for (const operation of CONVERSATION_OPERATIONS) {
    it(`fences ${operation}: capability, headers, actor/project fields, foreign attempt and replaced lease`, async (t) => {
      const w = await conversationWorld(t)
      const body = operationBody(w, operation)
      const path = `/v1/runtime/conversation/${operation}`
      for (const bearer of ['', await token(A)])
        assert.equal((await call(path, { method: 'POST', bearer, headers: w.headers, body })).status, 401)
      assert.equal((await call(path, { method: 'POST', bearer: w.runtime.token, body })).status, 422)
      assert.equal(
        (
          await call(path, {
            method: 'POST',
            bearer: w.runtime.token,
            headers: { ...w.headers, 'x-sophia-runtime-unit': 'foreign-unit' },
            body,
          })
        ).status,
        403,
      )
      for (const field of ['actorId', 'projectId'])
        assert.equal((await conversationCall(w, operation, { ...body, [field]: randomUUID() })).status, 422)
      assert.equal((await conversationCall(w, operation, { ...body, attemptId: randomUUID() })).status, 403)
      assert.equal((await conversationCall(w, operation, { ...body, leaseId: randomUUID() })).status, 403)
      assert.equal((await hello(w.runtime.token, randomUUID(), w.runtime.runtimeUnitId)).status, 200)
      assert.equal((await conversationCall(w, operation, body)).status, 409)
      assert.equal(
        (
          await w.owner.query('SELECT count(*)::int AS n FROM sophia.conversation_reservations WHERE reply_id=$1', [
            w.replyId,
          ])
        ).rows[0]?.n,
        0,
      )
    })
  }
})

/** Actual intake, not a synthesized ACK response: the SQL receipt is compared with the complete HTTP body. */
async function conversationAnswer(w: ConversationWorld) {
  const binding = (
    await w.owner.query<{ native_session_id: string }>(
      'SELECT native_session_id FROM sophia.execution_bindings WHERE project_id=$1 AND id=$2',
      [w.projectId, w.command.binding_id],
    )
  ).rows[0]
  assert.ok(binding)
  assert.equal(
    (
      await call('/v1/runtime/observations', {
        method: 'POST',
        bearer: w.runtime.token,
        headers: w.headers,
        body: {
          observations: [
            {
              runtimeUnitId: w.runtime.runtimeUnitId,
              attemptId: w.command.attempt_id,
              nativeSessionId: binding.native_session_id,
              nativeSeq: 1,
              durable: true,
              type: 'assistant/message',
              data: {
                text: 'Synthetic native intake answer',
                length: 30,
                oversize: false,
                invalidText: false,
                interrupted: false,
                provider: null,
                model: null,
                inputTokens: null,
                outputTokens: null,
                ordinal: 1,
              },
            },
            {
              runtimeUnitId: w.runtime.runtimeUnitId,
              attemptId: w.command.attempt_id,
              nativeSessionId: binding.native_session_id,
              nativeSeq: 2,
              durable: true,
              type: 'turn/end',
              data: { reason: { kind: 'completed' } },
            },
          ],
        },
      })
    ).status,
    204,
  )
}

describe('CON runtime HTTP durable ACK variants (L1 actual intake, no model)', () => {
  for (const kind of ['capture', 'receipt', 'hello', 'withdrawal', 'capture_privacy']) {
    it(`serializes the full actual ${kind} provenance without dropping a predicate or field`, async (t) => {
      let w = await conversationWorld(t)
      assert.equal((await conversationCall(w, 'claim', w.request)).status, 200)
      assert.equal((await conversationCall(w, 'go', w.request)).status, 200)
      if (kind === 'capture' || kind === 'capture_privacy') {
        if (kind === 'capture_privacy')
          await w.owner.query('UPDATE sophia.projects SET audience_revision=audience_revision+1 WHERE id=$1', [
            w.projectId,
          ])
        await conversationAnswer(w)
      } else if (kind === 'receipt') {
        const binding = (
          await w.owner.query<{ native_session_id: string }>(
            'SELECT native_session_id FROM sophia.execution_bindings WHERE project_id=$1 AND id=$2',
            [w.projectId, w.command.binding_id],
          )
        ).rows[0]
        assert.ok(binding)
        assert.equal(
          (
            await call('/v1/runtime/receipts', {
              method: 'POST',
              bearer: w.runtime.token,
              headers: w.headers,
              body: {
                receipts: [
                  {
                    commandId: w.command.id,
                    attemptId: w.command.attempt_id,
                    nativeSessionId: binding.native_session_id,
                    stage: 'failed',
                    nativeSequence: null,
                    evidenceRefs: [],
                    reason: null,
                    observedAt: new Date().toISOString(),
                  },
                ],
              },
            })
          ).status,
          204,
        )
      } else if (kind === 'withdrawal') {
        await withActor(pool, E, 'write', (c) =>
          withdrawConversationMessage(c, w.conversationId, w.firstId, randomUUID()),
        )
      } else {
        const bridge = randomUUID()
        assert.equal((await hello(w.runtime.token, bridge, w.runtime.runtimeUnitId)).status, 200)
        w = {
          ...w,
          bridge,
          headers: bridgeHeaders(bridge, w.runtime.runtimeUnitId),
          request: { ...w.request, leaseId: bridge },
        }
      }
      const ack = await conversationCall(w, 'acknowledged', operationBody(w, 'acknowledged'))
      assert.equal(ack.status, 200)
      const expected = (
        await w.owner.query<{ value: unknown }>('SELECT sophia.conversation_acknowledged($1,$2::jsonb) AS value', [
          w.command.attempt_id,
          journalKeys,
        ])
      ).rows[0]?.value
      assert.equal(ack.json.predicates.terminalState.met, true)
      assert.equal(ack.json.predicates.terminalWriter.met, true)
      assert.equal(
        ack.json.predicates.terminalWriter.key.kind,
        kind === 'withdrawal' || kind === 'capture_privacy' ? 'cancellation' : kind,
      )
      assert.deepEqual(ack.json, expected)
    })
  }
})

describe('CON runtime HTTP closed projection', () => {
  it('refuses raw native content at real HTTP/SQL intake, then captures a valid bounded answer', async (t) => {
    const w = await conversationWorld(t)
    assert.equal((await conversationCall(w, 'claim', w.request)).status, 200)
    assert.equal((await conversationCall(w, 'go', w.request)).status, 200)
    const session = (
      await w.owner.query<{ native_session_id: string }>(
        'SELECT native_session_id FROM sophia.execution_bindings WHERE id=$1',
        [w.command.binding_id],
      )
    ).rows[0]
    assert.ok(session)
    for (const [type, data] of [
      ['system/message', { text: 'SYNTHETIC PRIVATE CANARY' }],
      ['user/message', { id: 'synthetic', length: 1, text: 'SYNTHETIC PRIVATE CANARY' }],
      ['assistant/message', { text: 'prefix', interrupted: 'true' }],
    ]) {
      const result = await call('/v1/runtime/observations', {
        method: 'POST',
        bearer: w.runtime.token,
        headers: w.headers,
        body: {
          observations: [
            {
              runtimeUnitId: w.runtime.runtimeUnitId,
              attemptId: w.command.attempt_id,
              nativeSessionId: session.native_session_id,
              nativeSeq: 1,
              durable: true,
              type,
              data,
            },
          ],
        },
      })
      assert.equal(result.status, 422)
      assert.equal(
        (
          await w.owner.query('SELECT count(*)::int AS n FROM sophia.native_observations WHERE binding_id=$1', [
            w.command.binding_id,
          ])
        ).rows[0]?.n,
        0,
      )
      assert.equal(
        (
          await w.owner.query('SELECT count(*)::int AS n FROM sophia.usage_records WHERE attempt_id=$1', [
            w.command.attempt_id,
          ])
        ).rows[0]?.n,
        0,
      )
    }
    await conversationAnswer(w)
    assert.equal(
      (await w.owner.query('SELECT state FROM sophia.conversation_replies WHERE id=$1', [w.replyId])).rows[0]?.state,
      'answered',
    )
  })
})
