// S1-05A runtime service, discussion and native tasks (migration 0012, amendments A04 and A05), level: sql-run.
// Member calls use the non-owner sophia_api login with a transaction-local actor, runtime calls the same login
// with no actor, dispatch the sophia_worker login: exactly the production split. That the real bridge accepts
// every command the service queues is proven by tests/integration/runtime-service.test.mjs, which runs them.
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { NativeTaskRequest, RuntimeCommand, RuntimeReceipt } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import {
  registerRuntime,
  createTestDatabase,
  seedProject,
  type RegisteredRuntime,
  type SeededProject,
  type TestDatabase,
} from '@sophia/test-support'
import {
  admitGoalCommand,
  admitNativeTask,
  claimRuntimeOutbox,
  createPool,
  dispatchRuntimeOutbox,
  readNativeTask,
  readSnapshot,
  reconcileRuntimeOutbox,
  recordRuntimeObservations,
  recordRuntimeReceipts,
  recordRuntimeReady,
  runtimeHello,
  runtimePoll,
  runtimeTokenHash,
  submitContribution,
  withActor,
  withService,
  type RuntimeCaller,
} from './index.ts'

const A = randomUUID() // admin
const E = randomUUID() // editor
const V = randomUUID() // viewer
const C = randomUUID() // outsider

let db: TestDatabase
let pool: pg.Pool
let worker: pg.Pool

/** Close this file's current fixture: its pools, then its database and logins. Each fixture is closed once. */
let closed = false
async function closeFixture() {
  if (closed) return
  closed = true
  await pool.end()
  await worker.end()
  await db.drop()
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  worker = createPool(db.workerUrl, { max: 2 })
})
after(closeFixture)

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof DomainError ? err.code : `raw:${String(err)}`
  }
}

async function owner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

const one = async <T>(sql: string, params: unknown[]): Promise<T> =>
  owner(async (c) => (await c.query(sql, params)).rows[0] as T)

const say = (actor: string, projectId: string, text: string, key = randomUUID()) =>
  withActor(pool, actor, 'write', (c) =>
    submitContribution(c, projectId, key, {
      source: null,
      text,
      threadId: null,
      artifactVersionId: null,
      intent: 'discuss',
    }),
  )

const brief = (
  actor: string,
  projectId: string,
  contributionIds: string[],
  key = randomUUID(),
  missionRevision = 1,
) => {
  const request: NativeTaskRequest = {
    kind: 'draft_brief',
    instruction: 'Draft the implementation brief for the room slice.',
    contributionIds,
    expectedMissionRevision: missionRevision,
  }
  return withActor(pool, actor, 'write', (c) => admitNativeTask(c, projectId, key, request))
}

const caller = (rt: RegisteredRuntime, bridge: string, token = rt.token): RuntimeCaller => ({
  tokenSha256: runtimeTokenHash(token),
  runtimeUnitId: rt.runtimeUnitId,
  bridgeInstanceId: bridge,
})

/** Claim and dispatch everything pending (every test's rows); the outcomes for `projectId`, in claim order. */
async function dispatchAll(projectId: string) {
  const rows = await claimRuntimeOutbox(worker, 'test-worker', 50, 30)
  const outcomes = []
  for (const row of rows) {
    const outcome = await dispatchRuntimeOutbox(worker, row.project_id, row.id, row.lease_token!)
    if (row.project_id === projectId) outcomes.push(outcome)
  }
  return outcomes
}

const receipt = (
  command: RuntimeCommand,
  stage: RuntimeReceipt['stage'],
  extra: Partial<RuntimeReceipt> = {},
): RuntimeReceipt => ({
  commandId: command.commandId,
  attemptId: command.binding.attemptId,
  stage,
  nativeSessionId: `sophia-${command.binding.attemptId}`,
  nativeSequence: 3,
  evidenceRefs: [],
  observedAt: new Date().toISOString(),
  reason: null,
  ...extra,
})

const observation = (command: RuntimeCommand, rt: RegisteredRuntime, seq: number, type: string, data: unknown) => ({
  runtimeUnitId: rt.runtimeUnitId,
  attemptId: command.binding.attemptId,
  nativeSessionId: `sophia-${command.binding.attemptId}`,
  nativeSeq: seq,
  type,
  durable: true as const,
  data,
})

/** One research-route model call's usage, as the bridge reports it (SMC-M03). */
const call = (inputTokens: number, extra: Record<string, unknown>) => ({
  provider: 'openai-research',
  model: 'gpt-6.1-sol',
  inputTokens,
  outputTokens: 40,
  ...extra,
})

/** A project with a registered runtime, two contributions and a live lease; returns what the tests need. */
async function world() {
  const project: SeededProject = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
  const rt = await registerRuntime(db.ownerUrl, { projectId: project.projectId, admin: A })
  const bridge = randomUUID()
  await withService(pool, (c) =>
    runtimeHello(c, caller(rt, bridge), { bundle: 'test', protocolVersion: 1, dshVersion: 'x' }),
  )
  // As the supervisor does after recovery: nothing is dispatched to a runtime that has not reported ready.
  await withService(pool, (c) =>
    recordRuntimeReady(c, caller(rt, bridge), { state: 'ready', reason: null, unrecovered: [] }),
  )
  const first = await say(E, project.projectId, 'Keep the room and the floor; add a real voice.')
  const second = await say(A, project.projectId, 'The brief should name the runtime crossing first.')
  return { project, rt, bridge, who: caller(rt, bridge), inputs: [first.contributionId, second.contributionId] }
}

async function admittedAndQueued(w: Awaited<ReturnType<typeof world>>, actor = E) {
  const admitted = await brief(actor, w.project.projectId, w.inputs)
  const [outcome] = await dispatchAll(w.project.projectId)
  assert.equal(outcome?.result, 'enqueued')
  const batch = await withService(pool, (c) => runtimePoll(c, w.who, 0))
  const create = batch.commands.at(-1)?.command as RuntimeCommand
  return { admitted, create, batch }
}

describe('discussion', () => {
  it('is recorded with its author, is idempotent per person and key, and never starts work', async () => {
    const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E], viewers: [V] })
    const key = randomUUID()
    const text = 'Discussion only: nothing here should start work.'
    const r1 = await say(E, projectId, text, key)
    assert.equal(r1.stage, 'recorded')
    assert.equal(r1.sha256, createHash('sha256').update(text).digest('hex'))
    assert.deepEqual(await say(E, projectId, text, key), r1, 'a retry returns the first receipt')
    assert.equal(await codeOf(say(E, projectId, 'something else', key)), 'idempotency_conflict')
    assert.equal((await say(V, projectId, 'A viewer may discuss.')).stage, 'recorded')
    assert.equal(await codeOf(say(C, projectId, 'An outsider may not.')), 'forbidden')
    const counts = await one<{ commands: number; jobs: number }>(
      `SELECT (SELECT count(*) FROM sophia.commands WHERE project_id=$1)::int AS commands,
              (SELECT count(*) FROM sophia.jobs WHERE project_id=$1)::int AS jobs`,
      [projectId],
    )
    assert.deepEqual(counts, { commands: 0, jobs: 0 })
    const snap = await withActor(pool, V, 'read', (c) => readSnapshot(c, projectId))
    assert.deepEqual(
      snap?.discussion.map((d) => [d.actorId, d.text, d.origin]),
      [
        [E, text, 'composer'],
        [V, 'A viewer may discuss.', 'composer'],
      ],
    )
  })
})

describe('draft_brief admission', () => {
  it('admits once with the ordinary records and a source-bound manifest; a retry returns the same receipt', async () => {
    const w = await world()
    const key = randomUUID()
    const receipt1 = await brief(E, w.project.projectId, w.inputs, key)
    assert.deepEqual(await brief(E, w.project.projectId, w.inputs, key), receipt1)
    assert.equal(await codeOf(brief(E, w.project.projectId, [w.inputs[0]!], key)), 'idempotency_conflict')
    const rows = await one<Record<string, unknown>>(
      `SELECT g.status, a.state AS attempt, b.state AS binding, b.native_session_id, j.state AS job, c.kind,
              (SELECT count(*) FROM sophia.outbox o WHERE o.command_id=c.id AND o.destination='native.create')::int AS creates,
              t.body AS manifest
         FROM sophia.jobs j JOIN sophia.commands c ON c.project_id=j.project_id AND c.id=j.command_id
         JOIN sophia.goals g ON g.project_id=c.project_id AND g.id=c.goal_id
         JOIN sophia.work_attempts a ON a.project_id=j.project_id AND a.id=j.attempt_id
         JOIN sophia.execution_bindings b ON b.project_id=a.project_id AND b.attempt_id=a.id
         JOIN sophia.source_texts t ON t.project_id=j.project_id AND t.source_id=j.input_source_id
        WHERE j.project_id=$1 AND j.id=$2`,
      [w.project.projectId, receipt1.taskId],
    )
    const manifest = JSON.parse(rows.manifest as string) as {
      inputs: { id: string; sha256: string }[]
      unknown: string[]
    }
    delete rows.manifest
    assert.deepEqual(rows, {
      status: 'ready',
      attempt: 'admitted',
      binding: 'created',
      native_session_id: `sophia-${receipt1.attemptId}`,
      job: 'pending',
      kind: 'native_task',
      creates: 1,
    })
    assert.deepEqual(
      manifest.inputs.map((i) => i.id),
      w.inputs,
      'inputs by id, in the order chosen',
    )
    assert.ok(manifest.inputs.every((i) => /^[0-9a-f]{64}$/.test(i.sha256)))
    assert.deepEqual(manifest.unknown, ['mission', 'accepted_decisions'], 'missing facts stay unknown')
    const snap = await withActor(pool, V, 'read', (c) => readSnapshot(c, w.project.projectId))
    assert.deepEqual(
      snap?.work.map((t) => [t.id, t.phase, t.inputSourceIds.length]),
      [[receipt1.taskId, 'queued', 2]],
    )
  })

  it('refuses viewers, outsiders, a stale mission, foreign inputs and a project without a runtime', async () => {
    const w = await world()
    assert.equal(await codeOf(brief(V, w.project.projectId, w.inputs)), 'forbidden')
    assert.equal(await codeOf(brief(C, w.project.projectId, w.inputs)), 'forbidden')
    assert.equal(await codeOf(brief(E, w.project.projectId, w.inputs, randomUUID(), 2)), 'stale_revision')
    const other = await world()
    assert.equal(await codeOf(brief(E, w.project.projectId, [other.inputs[0]!])), 'source_ineligible')
    const bare = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    assert.equal(await codeOf(brief(E, bare.projectId, [])), 'native_capability_unavailable')
  })
})

describe('dispatch waits for a ready runtime', () => {
  it('defers a delivery until the runtime is connected, ready and recently seen; the task stays queued, saying why', async () => {
    const project = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
    const rt = await registerRuntime(db.ownerUrl, { projectId: project.projectId, admin: A })
    const said = await say(E, project.projectId, 'Only the brief, please.')
    const admitted = await brief(E, project.projectId, [said.contributionId])
    const phase = async () => {
      const t = await withActor(pool, E, 'read', (c) => readNativeTask(c, project.projectId, admitted.taskId))
      return [t.task.phase, t.task.reason]
    }
    const dueNow = () =>
      owner((c) => c.query(`UPDATE sophia.outbox SET available_at = now() WHERE project_id = $1`, [project.projectId]))
    // What the room is shown of the runtime follows the same rule as dispatch.
    const host = async () => {
      const snap = await withActor(pool, E, 'read', (c) => readSnapshot(c, project.projectId))
      const runtime = snap?.resources.find((r) => r.harness === 'dsh')
      return [runtime?.hostState, runtime?.nativeState]
    }

    assert.deepEqual(
      (await dispatchAll(project.projectId)).map((o) => o.result),
      ['deferred'],
      'registered, never connected',
    )
    assert.deepEqual(await phase(), ['queued', "waiting for Sophia's runtime to connect"])
    assert.deepEqual(await host(), ['unknown', 'unknown'], 'never said ready: unknown, not offline')
    assert.deepEqual(await dispatchAll(project.projectId), [], 'retried after a short wait, not at once')

    const bridge = randomUUID()
    const who = caller(rt, bridge)
    await withService(pool, (c) => runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x' }))
    await dueNow()
    assert.deepEqual(
      (await dispatchAll(project.projectId)).map((o) => o.result),
      ['deferred'],
      'hello alone is not ready',
    )
    assert.equal((await phase())[1], "waiting for Sophia's runtime to report ready")

    await withService(pool, (c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
    await owner((c) =>
      c.query(`UPDATE sophia.runtime_instances SET seen_at = now() - interval '2 minutes' WHERE id = $1`, [
        rt.runtimeId,
      ]),
    )
    await dueNow()
    assert.deepEqual(
      (await dispatchAll(project.projectId)).map((o) => o.result),
      ['deferred'],
      'ready, but not seen for two minutes',
    )
    assert.equal((await phase())[1], "waiting for Sophia's runtime to reconnect")
    assert.deepEqual(await host(), ['offline', 'unknown'], 'a ready report is not online once the runtime is gone')

    await withService(pool, (c) => runtimePoll(c, who, 0))
    await dueNow()
    assert.deepEqual(
      (await dispatchAll(project.projectId)).map((o) => o.result),
      ['enqueued'],
      'a poll shows it is there',
    )
    assert.deepEqual(await phase(), ['dispatched', null], 'the waiting reason is cleared once it is sent')
    assert.deepEqual(await host(), ['online', 'running'], 'seen again: online, and the sent brief is running')
  })
})

describe('the runtime service', () => {
  it('queues exactly one contract-valid create, and delivery moves the task to running', async () => {
    const w = await world()
    const { admitted, create, batch } = await admittedAndQueued(w)
    assert.equal(create.kind, 'create')
    assert.equal(create.payload.role, 'sophia-brief-v1')
    assert.match(create.payload.text!, /## Retained decisions/)
    assert.match(create.payload.text!, /Keep the room and the floor/)
    assert.equal(batch.cursor, 1)
    assert.deepEqual(await dispatchAll(w.project.projectId), [], 'nothing else to dispatch: no duplicate create')
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered')]))
    assert.equal(
      await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered')])),
      0,
      'a repeated stage changes nothing',
    )
    const task = await withActor(pool, E, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.equal(task.task.phase, 'running')
    assert.equal(task.instruction, 'Draft the implementation brief for the room slice.')
    const hello = await withService(pool, (c) =>
      runtimeHello(c, caller(w.rt, randomUUID()), { bundle: 'test', protocolVersion: 1, dshVersion: 'x' }),
    )
    assert.equal(hello.cursor, 1, 'answered commands are not replayed')
    assert.deepEqual(hello.bindings, [
      {
        attemptId: admitted.attemptId,
        nativeSessionId: `sophia-${admitted.attemptId}`,
        authorityEpoch: 1,
        state: 'active',
      },
    ])
    assert.equal(
      await codeOf(withService(pool, (c) => runtimePoll(c, w.who, 0))),
      'invalid_state',
      'the old lease is fenced',
    )
  })

  it('refuses foreign commands, attempts, sessions, units and unknown or revoked capabilities', async () => {
    const w = await world()
    const { create } = await admittedAndQueued(w)
    const other = await world()
    const { create: foreign } = await admittedAndQueued(other)
    const refuse = (r: unknown, who = w.who) =>
      codeOf(withService(pool, (c) => recordRuntimeReceipts(c, who, [r as never])))
    assert.equal(await refuse(receipt(foreign, 'delivered')), 'forbidden', 'another runtime’s command')
    assert.equal(await refuse(receipt(create, 'delivered', { attemptId: foreign.binding.attemptId })), 'forbidden')
    assert.equal(await refuse(receipt(create, 'delivered', { nativeSessionId: 'sophia-elsewhere' })), 'forbidden')
    const wrongUnit = { ...w.who, runtimeUnitId: 'another-unit' }
    assert.equal(await codeOf(withService(pool, (c) => runtimePoll(c, wrongUnit, 0))), 'forbidden')
    const unknown = { ...w.who, tokenSha256: runtimeTokenHash('not-a-capability') }
    assert.equal(await codeOf(withService(pool, (c) => runtimePoll(c, unknown, 0))), 'runtime_capability_required')
    const obs = observation(foreign, w.rt, 1, 'turn/start', { turn: 1 })
    assert.equal(await codeOf(withService(pool, (c) => recordRuntimeObservations(c, w.who, [obs]))), 'forbidden')
    // With a valid capability and lease, a call that carries a member identity is still refused.
    const member = withActor(pool, A, 'write', (c) => runtimePoll(c, w.who, 0))
    assert.equal(await codeOf(member), 'forbidden', 'a runtime call never carries a member identity')
    await registerRuntime(db.ownerUrl, { projectId: w.project.projectId, admin: A, runtimeUnitId: w.rt.runtimeUnitId })
    assert.equal(await codeOf(withService(pool, (c) => runtimePoll(c, w.who, 0))), 'forbidden', 'a revoked capability')
  })

  it('captures the result of a completed turn once, with the model identity and usage the runtime reported', async () => {
    const w = await world()
    const { admitted, create } = await admittedAndQueued(w)
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered')]))
    const markdown = '## Intended outcome\nA real voice in the room [input:x]\n## Cited inputs\n- x'
    const observations = [
      observation(create, w.rt, 4, 'turn/start', { turn: 1 }),
      observation(create, w.rt, 7, 'assistant/message', {
        text: markdown,
        truncated: false,
        provider: 'openai',
        model: 'gpt-6-luna',
        inputTokens: 1200,
        outputTokens: 340,
        interrupted: false,
      }),
      observation(create, w.rt, 8, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ]
    assert.equal(await withService(pool, (c) => recordRuntimeObservations(c, w.who, observations)), 3)
    assert.equal(await withService(pool, (c) => recordRuntimeObservations(c, w.who, observations)), 0)
    const detail = await withActor(pool, V, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.equal(detail.task.phase, 'result_ready')
    assert.deepEqual(
      { ...detail.result, capturedAt: typeof detail.result?.capturedAt, sourceId: typeof detail.result?.sourceId },
      {
        sourceId: 'string',
        sha256: createHash('sha256').update(markdown).digest('hex'),
        markdown,
        provider: 'openai',
        model: 'gpt-6-luna',
        inputTokens: 1200,
        outputTokens: 340,
        capturedAt: 'string',
      },
    )
    const events = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id=$1 AND type='native_task.result_ready'`,
      [w.project.projectId],
    )
    assert.equal(events.n, 1, 'announced once')
  })

  it('records the cache counters a call reported, and compaction calls apart from the turn that produced the result (SMC-M03)', async () => {
    const w = await world()
    const { admitted, create } = await admittedAndQueued(w)
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered')]))
    const observations = [
      observation(create, w.rt, 4, 'turn/start', { turn: 1 }),
      observation(create, w.rt, 5, 'compaction/summary', {
        compactionId: 'c1',
        ...call(9000, { cacheReadTokens: 100 }),
      }),
      observation(create, w.rt, 7, 'assistant/message', {
        text: '## Intended outcome\nCached',
        truncated: false,
        interrupted: false,
        ...call(300, { cacheReadTokens: 900, cacheWriteTokens: 120 }),
      }),
      observation(create, w.rt, 8, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ]
    // A later batch: its compaction is the attempt's newest call, recorded after the result.
    const later = [
      observation(create, w.rt, 9, 'compaction/summary', { compactionId: 'c2', ...call(8000, {}) }),
      observation(create, w.rt, 10, 'compaction/summary', null),
    ]
    assert.equal(await withService(pool, (c) => recordRuntimeObservations(c, w.who, observations)), 4)
    assert.equal(await withService(pool, (c) => recordRuntimeObservations(c, w.who, later)), 2)
    const rows = await owner(
      async (c) =>
        (
          await c.query<{ call: string; purpose: string; input: string; read: string | null; write: string | null }>(
            `SELECT split_part(provider_call_id, '#', 2) AS call, purpose, input_tokens AS input, cache_read_tokens AS read,
                    cache_write_tokens AS write
               FROM sophia.usage_records WHERE project_id = $1 ORDER BY (split_part(provider_call_id, '#', 2))::int`,
            [w.project.projectId],
          )
        ).rows,
    )
    assert.deepEqual(
      rows.map((r) => [
        r.call,
        r.purpose,
        Number(r.input),
        r.read === null ? null : Number(r.read),
        r.write === null ? null : Number(r.write),
      ]),
      [
        ['5', 'compaction', 9000, 100, null],
        ['7', 'turn', 300, 900, 120],
        ['9', 'compaction', 8000, null, null],
      ],
      'one row per call; a counter not reported stays null; a summary without usage records nothing',
    )
    const detail = await withActor(pool, V, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.deepEqual(
      [detail.result?.inputTokens, detail.result?.cacheReadTokens, detail.result?.cacheWriteTokens],
      [300, 900, 120],
      'the result reports the turn that produced it, not a later compaction',
    )
  })

  it('captures a brief once: a later turn on the same session, such as a steer after the result, never replaces it', async () => {
    const w = await world()
    const { admitted, create } = await admittedAndQueued(w)
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered')]))
    const briefText = '## Intended outcome\nThe brief the task asked for'
    await withService(pool, (c) =>
      recordRuntimeObservations(c, w.who, [
        observation(create, w.rt, 7, 'assistant/message', { text: briefText, interrupted: false }),
        observation(create, w.rt, 8, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      ]),
    )
    const steerSource = await say(E, w.project.projectId, 'STEER: shorter, please.')
    await withActor(pool, E, 'write', (c) =>
      admitGoalCommand(c, w.project.projectId, randomUUID(), {
        kind: 'steer',
        goalId: admitted.goalId,
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        bodySourceId: steerSource.sourceId,
      }),
    )
    assert.deepEqual(
      (await dispatchAll(w.project.projectId)).map((o) => o.result),
      ['enqueued'],
    )
    await withService(pool, (c) =>
      recordRuntimeObservations(c, w.who, [
        observation(create, w.rt, 10, 'assistant/message', { text: 'Noted: shorter.', interrupted: false }),
        observation(create, w.rt, 11, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
      ]),
    )
    const detail = await withActor(pool, E, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.deepEqual([detail.task.phase, detail.result?.markdown], ['result_ready', briefText])
    const job = await one<{ revision: number; announced: number }>(
      `SELECT j.result_revision::int AS revision, (SELECT count(*)::int FROM sophia.project_events e
        WHERE e.project_id=j.project_id AND e.type='native_task.result_ready') AS announced
       FROM sophia.jobs j WHERE j.project_id=$1 AND j.kind='draft_brief'`,
      [w.project.projectId],
    )
    assert.deepEqual(job, { revision: 1, announced: 1 })
  })

  it('an uncertain delivery whose turn did complete is still captured', async () => {
    const w = await world()
    const { admitted, create } = await admittedAndQueued(w)
    await withService(pool, (c) =>
      recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered'), receipt(create, 'outcome_unknown')]),
    )
    let detail = await withActor(pool, E, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.equal(detail.task.state, 'outcome_unknown')
    await withService(pool, (c) =>
      recordRuntimeObservations(c, w.who, [
        observation(create, w.rt, 7, 'assistant/message', { text: '## Intended outcome\nIt ran', interrupted: false }),
        observation(create, w.rt, 8, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      ]),
    )
    detail = await withActor(pool, E, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.deepEqual([detail.task.phase, detail.task.state], ['result_ready', 'succeeded'])
  })

  it('Stop fences the work: a completion that arrives afterwards is withheld and the goal settles stopped', async () => {
    const w = await world()
    const { admitted, create } = await admittedAndQueued(w)
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered')]))
    const goal = await withActor(pool, E, 'write', (c) =>
      admitGoalCommand(c, w.project.projectId, randomUUID(), {
        kind: 'stop',
        goalId: admitted.goalId,
        expectedGoalRevision: 1,
        expectedAuthorityEpoch: 1,
        bodySourceId: null,
      }),
    )
    assert.equal(goal.authorityEpoch, 2)
    const [stopOutcome] = await dispatchAll(w.project.projectId)
    assert.equal(stopOutcome?.result, 'enqueued')
    const stop = (await withService(pool, (c) => runtimePoll(c, w.who, 1))).commands[0]?.command as RuntimeCommand
    assert.deepEqual([stop.kind, stop.binding.authorityEpoch], ['stop', 2])
    await withService(pool, (c) =>
      recordRuntimeObservations(c, w.who, [
        observation(create, w.rt, 7, 'assistant/message', { text: 'LATE brief', interrupted: false }),
        observation(create, w.rt, 8, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      ]),
    )
    let detail = await withActor(pool, E, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.equal(detail.result, null, 'no candidate under the stopping authority')
    assert.match(detail.task.reason ?? '', /withheld/)
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(stop, 'checked')]))
    detail = await withActor(pool, E, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.deepEqual([detail.task.phase, detail.task.state], ['stopped', 'cancelled'])
  })

  it('Hold settles only on the runtime’s check; Resume and a source-backed steer go to the same binding', async () => {
    const w = await world()
    const { admitted, create } = await admittedAndQueued(w)
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered')]))
    const control = (kind: 'hold' | 'resume' | 'steer', epoch: number, bodySourceId: string | null = null) =>
      withActor(pool, E, 'write', (c) =>
        admitGoalCommand(c, w.project.projectId, randomUUID(), {
          kind,
          goalId: admitted.goalId,
          expectedGoalRevision: 1,
          expectedAuthorityEpoch: epoch,
          bodySourceId,
        }),
      )
    await control('hold', 1)
    await dispatchAll(w.project.projectId)
    const hold = (await withService(pool, (c) => runtimePoll(c, w.who, 1))).commands[0]?.command as RuntimeCommand
    assert.equal(hold.kind, 'hold')
    assert.equal(await codeOf(control('resume', 2)), 'invalid_state', 'not held until the runtime says so')
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(hold, 'checked')]))
    await control('resume', 2)
    const steerSource = await say(E, w.project.projectId, 'STEER: lead with the runtime crossing.')
    await control('steer', 3, steerSource.sourceId)
    assert.deepEqual(
      (await dispatchAll(w.project.projectId)).map((o) => o.result),
      ['enqueued', 'enqueued'],
    )
    const later = (await withService(pool, (c) => runtimePoll(c, w.who, 2))).commands.map(
      (q) => q.command as RuntimeCommand,
    )
    assert.deepEqual(
      later.map((cmd) => [cmd.kind, cmd.binding.authorityEpoch, cmd.expectedNativeSessionId, cmd.payload.text ?? null]),
      [
        ['resume', 3, `sophia-${admitted.attemptId}`, null],
        ['steer', 3, null, 'STEER: lead with the runtime crossing.'],
      ],
    )
    const steer = later[1]!
    await withService(pool, (c) =>
      recordRuntimeReceipts(c, w.who, [receipt(steer, 'delivered'), receipt(steer, 'incorporation_observed')]),
    )
    const state = await one<{ state: string }>(
      `SELECT state FROM sophia.commands WHERE project_id=$1 AND kind='steer'`,
      [w.project.projectId],
    )
    assert.equal(state.state, 'checked', 'delivered and incorporated are distinct, and both were recorded')
  })

  it('a result from before a Hold, replayed after the Resume, stays withheld; a turn under the Resume is captured', async () => {
    const w = await world()
    const { admitted, create } = await admittedAndQueued(w)
    await withService(pool, (c) =>
      recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered', { nativeSequence: 3 })]),
    )
    const control = (kind: 'hold' | 'resume', epoch: number) =>
      withActor(pool, E, 'write', (c) =>
        admitGoalCommand(c, w.project.projectId, randomUUID(), {
          kind,
          goalId: admitted.goalId,
          expectedGoalRevision: 1,
          expectedAuthorityEpoch: epoch,
          bodySourceId: null,
        }),
      )
    await control('hold', 1)
    await dispatchAll(w.project.projectId)
    const hold = (await withService(pool, (c) => runtimePoll(c, w.who, 1))).commands[0]?.command as RuntimeCommand
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(hold, 'checked', { nativeSequence: 9 })]))
    // Resumed while the runtime was away: the goal runs again under epoch 3, and nothing has been delivered yet.
    await control('resume', 2)
    // The runtime comes back and replays a turn it finished before the Hold and never had acknowledged.
    await withService(pool, (c) =>
      recordRuntimeObservations(c, w.who, [
        observation(create, w.rt, 7, 'assistant/message', { text: 'PRE-HOLD brief', interrupted: false }),
        observation(create, w.rt, 8, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      ]),
    )
    const read = () => withActor(pool, E, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    let detail = await read()
    assert.equal(detail.result, null, 'the retired authority’s result is not published')
    assert.match(detail.task.reason ?? '', /earlier authority/)
    await dispatchAll(w.project.projectId)
    const resume = (await withService(pool, (c) => runtimePoll(c, w.who, 2))).commands[0]?.command as RuntimeCommand
    assert.equal(resume.kind, 'resume')
    await withService(pool, (c) =>
      recordRuntimeReceipts(c, w.who, [receipt(resume, 'delivered', { nativeSequence: 12 })]),
    )
    assert.equal((await read()).result, null, 'the Resume’s receipt judges the old turn again, and still withholds it')
    await withService(pool, (c) =>
      recordRuntimeObservations(c, w.who, [
        observation(create, w.rt, 14, 'assistant/message', { text: 'POST-RESUME brief', interrupted: false }),
        observation(create, w.rt, 15, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
      ]),
    )
    detail = await read()
    assert.deepEqual([detail.task.phase, detail.result?.markdown], ['result_ready', 'POST-RESUME brief'])
  })

  it('a completed turn that arrives before its command’s receipt is captured once the receipt is recorded', async () => {
    const w = await world()
    const { admitted, create } = await admittedAndQueued(w)
    await withService(pool, (c) =>
      recordRuntimeObservations(c, w.who, [
        observation(create, w.rt, 7, 'assistant/message', { text: 'Out of order brief', interrupted: false }),
        observation(create, w.rt, 8, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      ]),
    )
    const read = () => withActor(pool, E, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.equal((await read()).result, null, 'nothing is decided before the command that began the turn has settled')
    // A new session reports no position yet: its create settles before anything in it.
    await withService(pool, (c) =>
      recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered', { nativeSequence: null })]),
    )
    assert.equal((await read()).result?.markdown, 'Out of order brief')
  })

  it('a bridge superseded while its poll is under way never reads the queue', async () => {
    const w = await world()
    await brief(E, w.project.projectId, w.inputs)
    await dispatchAll(w.project.projectId)
    const hello = new pg.Client({ connectionString: db.ownerUrl })
    await hello.connect()
    try {
      // A hello for a replacement bridge, mid-flight: it holds the instance row and has moved the lease.
      await hello.query('BEGIN')
      await hello.query(
        `UPDATE sophia.runtime_instances SET bridge_instance_id=$2, lease_epoch=lease_epoch+1 WHERE token_sha256=$1`,
        [runtimeTokenHash(w.rt.token), randomUUID()],
      )
      const polled = codeOf(withService(pool, (c) => runtimePoll(c, w.who, 0)))
      for (let i = 0; i < 200; i += 1) {
        const waiting = await one<{ n: number }>(`SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted`, [])
        if (waiting.n > 0) break
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      await hello.query('COMMIT')
      assert.equal(
        await polled,
        'invalid_state',
        'the superseded bridge is told to say hello again, and gets no command',
      )
    } finally {
      await hello.end()
    }
  })

  it('the manifest carries only accepted decisions from released project sources, and each one is a dependency', async () => {
    const w = await world()
    const shared = await say(E, w.project.projectId, 'DECISION: the room ships first.')
    const mine = await say(A, w.project.projectId, 'PRIVATE: only my own notes.')
    await owner(async (c) => {
      await c.query(`UPDATE sophia.source_objects SET scope='private', eligible=false WHERE project_id=$1 AND id=$2`, [
        w.project.projectId,
        mine.sourceId,
      ])
      // No write path makes decisions yet (they arrive with S1-08): seeded here as accepted.
      await c.query(
        `INSERT INTO sophia.decisions(project_id,kind,state,body_source_id,accepted_by)
         VALUES ($1,'product','accepted',$2,$4), ($1,'product','accepted',$3,$4)`,
        [w.project.projectId, shared.sourceId, mine.sourceId, A],
      )
    })
    const admitted = await brief(E, w.project.projectId, w.inputs)
    const manifest = await one<{ body: string; shared: boolean }>(
      `SELECT t.body, EXISTS(SELECT 1 FROM sophia.source_dependencies d WHERE d.project_id=t.project_id
         AND d.source_id=$3 AND d.derived_source_id=t.source_id) AS shared
       FROM sophia.source_texts t WHERE t.project_id=$1 AND t.source_id=$2`,
      [w.project.projectId, admitted.contextSourceId, shared.sourceId],
    )
    assert.match(manifest.body, /the room ships first/)
    assert.doesNotMatch(manifest.body, /only my own notes/, 'another person’s private source never reaches the model')
    assert.equal(manifest.shared, true, 'the decision it carries is a dependency')
    await owner((c) =>
      c.query(`UPDATE sophia.source_objects SET state='blocked' WHERE project_id=$1 AND id=$2`, [
        w.project.projectId,
        shared.sourceId,
      ]),
    )
    assert.deepEqual(await dispatchAll(w.project.projectId), [
      { result: 'denied', reason: 'an input it was admitted with is no longer eligible' },
    ])
  })

  it('denies a queued delivery that became ineligible, explicitly, instead of leaving it pending', async () => {
    const w = await world()
    const admitted = await brief(E, w.project.projectId, w.inputs)
    await owner((c) =>
      c.query(`UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2`, [
        w.project.projectId,
        E,
      ]),
    )
    const [outcome] = await dispatchAll(w.project.projectId)
    assert.deepEqual(outcome, { result: 'denied', reason: 'the person who admitted it can no longer start work here' })
    assert.deepEqual(await dispatchAll(w.project.projectId), [], 'not claimed again')
    const detail = await withActor(pool, A, 'read', (c) => readNativeTask(c, w.project.projectId, admitted.taskId))
    assert.deepEqual([detail.task.phase, detail.task.state], ['denied', 'cancelled'])
    const second = await world()
    await brief(E, second.project.projectId, second.inputs)
    await owner((c) =>
      c.query(
        `UPDATE sophia.source_objects SET eligible=false WHERE project_id=$1 AND owner_id=$2 AND mime LIKE 'text/plain%'
               AND id=(SELECT source_id FROM sophia.contributions WHERE id=$3)`,
        [second.project.projectId, A, second.inputs[1]],
      ),
    )
    assert.deepEqual(await dispatchAll(second.project.projectId), [
      { result: 'denied', reason: 'an input it was admitted with is no longer eligible' },
    ])
  })

  it('reconciles an uncertain dispatch from the database and never queues it twice', async () => {
    const w = await world()
    await dispatchAll(w.project.projectId) // leaves no other test's row pending
    await brief(E, w.project.projectId, w.inputs)
    const [claimed] = await claimRuntimeOutbox(worker, 'crashed-worker', 5, 30)
    await owner((c) =>
      c.query(`UPDATE sophia.outbox SET lease_until=now()-interval '1 second' WHERE id=$1`, [claimed!.id]),
    )
    assert.equal(
      await codeOf(dispatchRuntimeOutbox(worker, claimed!.project_id, claimed!.id, claimed!.lease_token!)),
      'resolved',
    )
    assert.equal(
      (await one<{ state: string }>(`SELECT state FROM sophia.outbox WHERE id=$1`, [claimed!.id])).state,
      'outcome_unknown',
    )
    assert.equal(await reconcileRuntimeOutbox(worker), 1)
    assert.equal(
      (await one<{ state: string }>(`SELECT state FROM sophia.outbox WHERE id=$1`, [claimed!.id])).state,
      'pending',
    )
    await owner((c) => c.query(`UPDATE sophia.outbox SET available_at=now() WHERE id=$1`, [claimed!.id]))
    assert.equal((await dispatchAll(w.project.projectId))[0]?.result, 'enqueued')
    await owner((c) => c.query(`UPDATE sophia.outbox SET state='outcome_unknown' WHERE id=$1`, [claimed!.id]))
    await reconcileRuntimeOutbox(worker)
    const settled = await one<{ state: string; queued: number }>(
      `SELECT o.state, (SELECT count(*) FROM sophia.runtime_commands r WHERE r.outbox_id=o.id)::int AS queued
         FROM sophia.outbox o WHERE o.id=$1`,
      [claimed!.id],
    )
    assert.deepEqual(settled, { state: 'acknowledged', queued: 1 })
  })
})

// CON-01 Phase A (0053; Q12, CX-0116 and its recheck): the reconcile pass counts only the rows it changes, and rows it
// can't change (a command answered failed or outcome_unknown) never fill its window ahead of one it can. On a database
// of its own: the pass is global, so no other test's rows share its window.
// It is the file's last group: the file's fixture is closed before this one is made, so two migrated installations of
// the cluster-global assembler role (0070) never overlap.
describe('reconcile: an honest count, and no row starved behind rows it cannot change', () => {
  before(async () => {
    await closeFixture()
    db = await createTestDatabase()
    pool = createPool(db.apiUrl, { max: 4 })
    worker = createPool(db.workerUrl, { max: 2 })
    closed = false
  })

  type Stage = RuntimeReceipt['stage']

  const outboxOf = async (command: RuntimeCommand) =>
    (await one<{ outbox_id: string }>(`SELECT outbox_id FROM sophia.runtime_commands WHERE id=$1`, [command.commandId]))
      .outbox_id

  /** A native row whose runtime command was answered `stage` by a real receipt; the outbox row as the receipt left it. */
  async function answered(stage: Stage) {
    const w = await world()
    const { create } = await admittedAndQueued(w)
    await withService(pool, (c) =>
      recordRuntimeReceipts(c, w.who, [receipt(create, stage, { reason: `the runtime answered ${stage}` })]),
    )
    return { w, id: await outboxOf(create) }
  }

  /** The head: rows left outcome_unknown by a failed and an outcome_unknown receipt, in turn, oldest first. */
  async function head(count: number) {
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      const { id } = await answered(i % 2 === 0 ? 'failed' : 'outcome_unknown')
      await owner((c) =>
        c.query(`UPDATE sophia.outbox SET created_at=now()-interval '1 day'+$2*interval '1 second' WHERE id=$1`, [
          id,
          i,
        ]),
      )
      ids.push(id)
    }
    return ids
  }

  /** The tail, newer than the head: a row the pass can change, of each kind its mapping moves. */
  async function tail(kind: 'no command' | 'unanswered' | 'delivered' | 'checked' | 'rejected') {
    let projectId: string
    let id: string
    if (kind === 'no command') {
      const w = await world()
      projectId = w.project.projectId
      await brief(E, projectId, w.inputs)
      const claimed = (await claimRuntimeOutbox(worker, 'crashed-worker', 50, 30)).find(
        (r) => r.project_id === projectId,
      )
      id = claimed!.id
      await owner((c) => c.query(`UPDATE sophia.outbox SET lease_until=now()-interval '1 second' WHERE id=$1`, [id]))
      assert.equal(await codeOf(dispatchRuntimeOutbox(worker, projectId, id, claimed!.lease_token!)), 'resolved')
    } else if (kind === 'unanswered') {
      const w = await world()
      projectId = w.project.projectId
      id = await outboxOf((await admittedAndQueued(w)).create)
    } else {
      const made = await answered(kind)
      projectId = made.w.project.projectId
      id = made.id
    }
    // As a lost receipt or an expired lease leaves it: uncertain, whatever its command says.
    await owner((c) => c.query(`UPDATE sophia.outbox SET state='outcome_unknown', created_at=now() WHERE id=$1`, [id]))
    return { projectId, id }
  }

  /** Everything a pass could touch for a row: the outbox row, its runtime commands, its command and its job. */
  const recorded = (ids: string[]) =>
    one<{ rows: unknown }>(
      `SELECT jsonb_agg(jsonb_build_object('outbox',to_jsonb(o),
          'runtime',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM sophia.runtime_commands r WHERE r.outbox_id=o.id),
          'command',(SELECT to_jsonb(c) FROM sophia.commands c WHERE c.project_id=o.project_id AND c.id=o.command_id),
          'job',(SELECT to_jsonb(j) FROM sophia.jobs j WHERE j.project_id=o.project_id AND j.command_id=o.command_id))
          ORDER BY o.created_at) AS rows
         FROM sophia.outbox o WHERE o.id=ANY($1::uuid[])`,
      [ids],
    ).then((r) => r.rows)

  const stateOf = (id: string) =>
    one<{ state: string; commands: number }>(
      `SELECT o.state, (SELECT count(*) FROM sophia.runtime_commands r WHERE r.outbox_id=o.id)::int AS commands
         FROM sophia.outbox o WHERE o.id=$1`,
      [id],
    )

  it('a row left uncertain by a failed or an outcome_unknown receipt is never counted, and a delivered one is not either', async () => {
    const failed = await answered('failed')
    const unknown = await answered('outcome_unknown')
    const delivered = await answered('delivered')
    const was = await recorded([failed.id, unknown.id, delivered.id])
    for (let pass = 1; pass <= 3; pass++) assert.equal(await reconcileRuntimeOutbox(worker), 0, `pass ${pass} counts 0`)
    assert.deepEqual(await recorded([failed.id, unknown.id, delivered.id]), was, 'nothing about them changed')
    assert.deepEqual(await stateOf(failed.id), { state: 'outcome_unknown', commands: 1 })
    assert.deepEqual(await stateOf(unknown.id), { state: 'outcome_unknown', commands: 1 })
    assert.deepEqual(await stateOf(delivered.id), { state: 'settled', commands: 1 })
  })

  for (const L of [2, 50]) {
    it(`at p_limit ${String(L)}, a recoverable row behind ${String(L)} rows the pass can't change is reached on the first pass, counted once, then 0`, async () => {
      const older = await head(L)
      const was = await recorded(older)
      const { projectId, id } = await tail('no command')
      assert.deepEqual(await stateOf(id), { state: 'outcome_unknown', commands: 0 })
      // L = 50 is the worker's own call: reconcileRuntimeOutbox(pool), whose default limit is 50.
      const pass = () => (L === 50 ? reconcileRuntimeOutbox(worker) : reconcileRuntimeOutbox(worker, L))
      assert.equal(await pass(), 1, 'the first pass reaches the tail and counts it alone')
      assert.deepEqual(await stateOf(id), { state: 'pending', commands: 0 }, 'returned to pending, no command written')
      assert.equal(await pass(), 0, 'the next pass counts 0')
      assert.equal(await pass(), 0, 'and the one after it')
      assert.deepEqual(await recorded(older), was, 'every older row unchanged: state, reason, command, job')
      // Dispatched by the ordinary path: its first and only runtime command; no older row gets a second.
      await owner((c) => c.query(`UPDATE sophia.outbox SET available_at=now() WHERE id=$1`, [id]))
      assert.deepEqual(
        (await dispatchAll(projectId)).map((o) => o.result),
        ['enqueued'],
      )
      assert.deepEqual(await stateOf(id), { state: 'acknowledged', commands: 1 })
      assert.equal(await pass(), 0)
      assert.deepEqual(await recorded(older), was, 'still unchanged after the tail was dispatched')
    })
  }

  it('each other recoverable row behind the same head is reached and moved by the unchanged mapping, counted once', async () => {
    const cases = [
      ['unanswered', 'acknowledged'],
      ['delivered', 'settled'],
      ['checked', 'settled'],
      ['rejected', 'denied'],
    ] as const
    for (const [kind, moved] of cases) {
      const older = await head(2)
      const was = await recorded(older)
      const { id } = await tail(kind)
      assert.equal(await reconcileRuntimeOutbox(worker, 2), 1, `${kind}: counted once`)
      assert.deepEqual(await stateOf(id), { state: moved, commands: 1 }, `${kind}: moved, never queued again`)
      assert.equal(await reconcileRuntimeOutbox(worker, 2), 0, `${kind}: then 0`)
      assert.deepEqual(await recorded(older), was, `${kind}: the head unchanged`)
    }
  })

  it('keeps the function as it was: signature, default, SECURITY DEFINER, search_path, owner and grants', async () => {
    const fn = await one<{ args: string; secdef: boolean; config: string[]; same_owner: boolean; grantees: string[] }>(
      `SELECT pg_get_function_arguments(p.oid) AS args, p.prosecdef AS secdef, p.proconfig AS config,
              p.proowner=(SELECT proowner FROM pg_proc WHERE oid='sophia.claim_runtime_outbox(text,integer,integer)'::regprocedure) AS same_owner,
              (SELECT array_agg(a.grantee::regrole::text||':'||a.privilege_type ORDER BY 1) FROM aclexplode(p.proacl) a
                WHERE a.grantee<>p.proowner) AS grantees
         FROM pg_proc p WHERE p.oid='sophia.reconcile_runtime_outbox(integer)'::regprocedure`,
      [],
    )
    assert.deepEqual(fn, {
      args: 'p_limit integer DEFAULT 50',
      secdef: true,
      config: ['search_path=pg_catalog, sophia'],
      same_owner: true,
      grantees: ['sophia_worker:EXECUTE'],
    })
    // The API's login may not run it, as before.
    await assert.rejects(pool.query(`SELECT sophia.reconcile_runtime_outbox(1)`), { code: '42501' })
  })
})

describe('completed-goal session retirement (migration 0075, A41)', () => {
  const LIVE = 'stopped; the native driver is idle and the handle is released'
  const RESTOP = 'stopped; the stopped epoch stands'
  type GoalRow = { status: string; revision: string; authority_epoch: string; state_revision: string }
  const goalRow = (projectId: string, goalId: string) =>
    one<GoalRow>(
      'SELECT status, revision::text, authority_epoch::text, state_revision::text FROM sophia.goals WHERE project_id=$1 AND id=$2',
      [projectId, goalId],
    )
  /** What retirement must never change: the goal's work, jobs, attempts and costs (their states, as rows). */
  const untouched = (projectId: string, goalId: string) =>
    one<{ state: unknown }>(
      `SELECT jsonb_build_object(
         'attempts', (SELECT jsonb_agg(jsonb_build_array(id, state) ORDER BY id) FROM sophia.work_attempts WHERE project_id=$1 AND goal_id=$2),
         'jobs', (SELECT jsonb_agg(jsonb_build_array(j.id, j.state) ORDER BY j.id) FROM sophia.jobs j
                   JOIN sophia.work_attempts a ON a.project_id=j.project_id AND a.id=j.attempt_id WHERE a.project_id=$1 AND a.goal_id=$2)) AS state`,
      [projectId, goalId],
    )
  const bindingStates = async (projectId: string, goalId: string) =>
    owner(async (c) => {
      const { rows } = await c.query<{ id: string; state: string }>(
        `SELECT a.id, b.state FROM sophia.execution_bindings b JOIN sophia.work_attempts a ON a.project_id=b.project_id AND a.id=b.attempt_id
          WHERE a.project_id=$1 AND a.goal_id=$2 ORDER BY b.id`,
        [projectId, goalId],
      )
      return Object.fromEntries(rows.map((r) => [r.id, r.state]))
    })
  const retire = (
    actor: string,
    projectId: string,
    goalId: string,
    [revision, epoch]: readonly [number, number],
    key = randomUUID(),
  ) =>
    withActor(pool, actor, 'write', (c) =>
      admitGoalCommand(c, projectId, key, {
        kind: 'retire_sessions',
        goalId,
        expectedGoalRevision: revision,
        expectedAuthorityEpoch: epoch,
        bodySourceId: null,
      }),
    )

  /**
   * A goal with two bindings, completed. FIXTURE, labelled: the brief's own binding is real (admitted, dispatched,
   * delivered); a second attempt and binding on the same goal (a later attempt, as the recorded production pair has)
   * and the completed status are written by the owner, since this file has no review flow to complete a goal.
   */
  async function completedWithTwo(w: Awaited<ReturnType<typeof world>>, secondState = 'idle') {
    const { admitted, create } = await admittedAndQueued(w)
    await withService(pool, (c) => recordRuntimeReceipts(c, w.who, [receipt(create, 'delivered')]))
    const p = w.project.projectId
    const attempt = randomUUID()
    const binding = randomUUID()
    await owner(async (c) => {
      await c.query(
        `INSERT INTO sophia.work_attempts(project_id,id,goal_id,goal_revision,authority_epoch,context_source_id,state)
         SELECT project_id,$2,goal_id,goal_revision,authority_epoch,context_source_id,'failed' FROM sophia.work_attempts
          WHERE project_id=$1 AND goal_id=$3 LIMIT 1`,
        [p, attempt, admitted.goalId],
      )
      await c.query(
        `INSERT INTO sophia.execution_bindings(project_id,id,attempt_id,resource_id,native_session_id,runtime_unit_id,continuation_owner,state)
         SELECT b.project_id,$2::uuid,$3::uuid,b.resource_id,$6::text,b.runtime_unit_id,b.continuation_owner,$5::text FROM sophia.execution_bindings b
          JOIN sophia.work_attempts a ON a.project_id=b.project_id AND a.id=b.attempt_id WHERE a.project_id=$1 AND a.goal_id=$4 AND a.id<>$3::uuid LIMIT 1`,
        [p, binding, attempt, admitted.goalId, secondState, `sophia-${attempt}`],
      )
      await c.query(
        `UPDATE sophia.goals SET status='completed', state_revision=state_revision+1 WHERE project_id=$1 AND id=$2`,
        [p, admitted.goalId],
      )
    })
    return { goalId: admitted.goalId, taskId: admitted.taskId, create, second: { attempt, binding } }
  }

  /** The runtime's view of a project's bindings, as a restarted bridge would read them. */
  const helloStates = async (w: Awaited<ReturnType<typeof world>>) => {
    const reply = await withService(pool, (c) =>
      runtimeHello(c, w.who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x' }),
    )
    await withService(pool, (c) => recordRuntimeReady(c, w.who, { state: 'ready', reason: null, unrecovered: [] }))
    return Object.fromEntries(reply.bindings.map((b) => [b.attemptId, b.state]))
  }

  it('an admin retires every remaining session of a completed goal; the goal stays completed and nothing else moves', async () => {
    const w = await world()
    const p = w.project.projectId
    const { goalId, create, second } = await completedWithTwo(w)
    const was = await goalRow(p, goalId)
    const kept = await untouched(p, goalId)
    // Completion alone is no fence: a restarted bridge would read both sessions active.
    let hello = await helloStates(w)
    assert.deepEqual([hello[create.binding.attemptId], hello[second.attempt]], ['active', 'active'])
    // Ordinary Stop still refuses a completed goal (unchanged).
    assert.notEqual(
      await codeOf(
        withActor(pool, A, 'write', (c) =>
          admitGoalCommand(c, p, randomUUID(), {
            kind: 'stop',
            goalId,
            expectedGoalRevision: Number(was.revision),
            expectedAuthorityEpoch: Number(was.authority_epoch),
            bodySourceId: null,
          }),
        ),
      ),
      'resolved',
    )
    const key = randomUUID()
    const admitted = await retire(A, p, goalId, [Number(was.revision), Number(was.authority_epoch)], key)
    assert.equal(admitted.stage, 'admitted')
    assert.equal(admitted.goalRevision, Number(was.revision))
    assert.equal(admitted.authorityEpoch, Number(was.authority_epoch) + 1)
    assert.deepEqual(
      (admitted.targets ?? []).map((t) => t.attemptId).toSorted(),
      [create.binding.attemptId, second.attempt].toSorted(),
    )
    const now = await goalRow(p, goalId)
    assert.deepEqual(
      [now.status, now.revision, now.authority_epoch, now.state_revision],
      ['completed', was.revision, String(Number(was.authority_epoch) + 1), String(Number(was.state_revision) + 1)],
    )
    // The same key and request answer the same receipt; the same key with another request is a conflict.
    assert.deepEqual(await retire(A, p, goalId, [Number(was.revision), Number(was.authority_epoch)], key), admitted)
    assert.equal(
      await codeOf(retire(A, p, goalId, [Number(was.revision), Number(now.authority_epoch)], key)),
      'idempotency_conflict',
    )
    // Admitted, not yet settled: the fence already holds for a restarted bridge.
    hello = await helloStates(w)
    assert.deepEqual([hello[create.binding.attemptId], hello[second.attempt]], ['stopped', 'stopped'])
    // Each target goes to the runtime as its existing stop, under the new epoch.
    const outcomes = await dispatchAll(p)
    assert.deepEqual(
      outcomes.map((o) => o.result),
      ['enqueued', 'enqueued'],
    )
    const stops = (await withService(pool, (c) => runtimePoll(c, w.who, 0))).commands
      .map((x) => x.command as RuntimeCommand)
      .filter((x) => x.kind === 'stop')
    assert.deepEqual(
      stops
        .map((s) => [s.binding.attemptId, s.binding.authorityEpoch])
        .toSorted((x, y) => String(x[0]).localeCompare(String(y[0]))),
      [
        [create.binding.attemptId, admitted.authorityEpoch],
        [second.attempt, admitted.authorityEpoch],
      ].toSorted((x, y) => String(x[0]).localeCompare(String(y[0]))),
    )
    const [live, durable] = stops.toSorted((a) => (a.binding.attemptId === create.binding.attemptId ? -1 : 1))
    await withService(pool, (c) =>
      recordRuntimeReceipts(c, w.who, [
        receipt(live!, 'checked', { reason: LIVE }),
        receipt(durable!, 'checked', { reason: RESTOP, nativeSessionId: `sophia-${second.attempt}` }),
      ]),
    )
    assert.deepEqual(await bindingStates(p, goalId), {
      [create.binding.attemptId]: 'settled',
      [second.attempt]: 'settled',
    })
    // Each settlement keeps what the runtime said: a live idle fence apart from a durable-only restop.
    const reasons = await owner(async (c) => {
      const { rows } = await c.query<{ reason: string }>(
        `SELECT r.reason FROM sophia.runtime_receipts r JOIN sophia.runtime_commands rc ON rc.project_id=r.project_id AND rc.id=r.runtime_command_id
          WHERE rc.project_id=$1 AND rc.command_id=$2 ORDER BY r.reason`,
        [p, admitted.commandId],
      )
      return rows.map((r) => r.reason)
    })
    assert.deepEqual(reasons, [LIVE, RESTOP].toSorted())
    const done = await goalRow(p, goalId)
    assert.deepEqual([done.status, done.revision], ['completed', was.revision])
    assert.deepEqual(await untouched(p, goalId), kept, 'attempts and jobs are exactly as they were')
    const cmd = await one<{ state: string; kind: string }>(
      'SELECT state, kind FROM sophia.commands WHERE project_id=$1 AND id=$2',
      [p, admitted.commandId],
    )
    assert.deepEqual([cmd.kind, cmd.state], ['retire_sessions', 'checked'])
    // Settled sessions are no longer the runtime's to recover.
    hello = await helloStates(w)
    assert.deepEqual([hello[create.binding.attemptId], hello[second.attempt]], [undefined, undefined])
  })

  it('refuses everyone but an admin, a goal that is not completed, and a stale revision or epoch', async () => {
    const w = await world()
    const p = w.project.projectId
    const { goalId } = await completedWithTwo(w)
    const g = await goalRow(p, goalId)
    const [rev, epoch] = [Number(g.revision), Number(g.authority_epoch)]
    for (const actor of [E, V, C])
      assert.equal(await codeOf(retire(actor, p, goalId, [rev, epoch])), 'forbidden', actor)
    assert.equal(await codeOf(retire(A, p, goalId, [rev, epoch + 1])), 'stale_revision')
    assert.equal(await codeOf(retire(A, p, goalId, [rev + 1, epoch])), 'stale_revision')
    // A goal still running is not this command's (Stop and Hold are).
    const running = await admittedAndQueued(w)
    const r = await goalRow(p, running.admitted.goalId)
    assert.equal(
      await codeOf(retire(A, p, running.admitted.goalId, [Number(r.revision), Number(r.authority_epoch)])),
      'invalid_state',
    )
    assert.deepEqual(await goalRow(p, goalId), g, 'nothing refused moved the goal')
  })

  it('keeps an unconfirmed retirement visible and fenced, and a lost binding is settled without the runtime', async () => {
    const w = await world()
    const p = w.project.projectId
    const { goalId, create, second } = await completedWithTwo(w, 'lost')
    const g = await goalRow(p, goalId)
    const admitted = await retire(A, p, goalId, [Number(g.revision), Number(g.authority_epoch)])
    const outcomes = await dispatchAll(p)
    assert.deepEqual(outcomes.map((o) => o.result).toSorted(), ['enqueued', 'settled'])
    assert.ok(outcomes.some((o) => o.result === 'settled' && o.reason === 'no native session to fence'))
    const [stop] = (await withService(pool, (c) => runtimePoll(c, w.who, 0))).commands
      .map((x) => x.command as RuntimeCommand)
      .filter((x) => x.kind === 'stop' && x.binding.authorityEpoch === admitted.authorityEpoch)
    await withService(pool, (c) =>
      recordRuntimeReceipts(c, w.who, [
        receipt(stop!, 'outcome_unknown', { reason: 'stopped; cancellation did not settle in time' }),
      ]),
    )
    // Not settled, and said so; a restart still reads it stopped, never active.
    assert.deepEqual(await bindingStates(p, goalId), {
      [create.binding.attemptId]: 'stopping',
      [second.attempt]: 'lost',
    })
    const hello = await helloStates(w)
    assert.equal(hello[create.binding.attemptId], 'stopped')
    // The command row's one state is not per-target truth (unchanged 0064 paths, ordinary Stop alike): the lost
    // target's settlement marks it checked first. The truth per target is its binding and its own receipt, as above.
    assert.deepEqual(
      [(await goalRow(p, goalId)).status, (await goalRow(p, goalId)).revision],
      ['completed', g.revision],
    )
  })
})
