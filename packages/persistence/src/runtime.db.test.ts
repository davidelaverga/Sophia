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

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 4 })
  worker = createPool(db.workerUrl, { max: 2 })
})
after(async () => {
  await pool.end()
  await worker.end()
  await db.drop()
})

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

    assert.deepEqual(
      (await dispatchAll(project.projectId)).map((o) => o.result),
      ['deferred'],
      'registered, never connected',
    )
    assert.deepEqual(await phase(), ['queued', "waiting for Sophia's runtime to connect"])
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

    await withService(pool, (c) => runtimePoll(c, who, 0))
    await dueNow()
    assert.deepEqual(
      (await dispatchAll(project.projectId)).map((o) => o.result),
      ['enqueued'],
      'a poll shows it is there',
    )
    assert.deepEqual(await phase(), ['dispatched', null], 'the waiting reason is cleared once it is sent')
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
