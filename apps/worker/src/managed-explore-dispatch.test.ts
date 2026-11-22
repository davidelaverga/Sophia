import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { dispatchManagedExploreOnce, dispatchManagedExplorePass } from './managed-explore-dispatch.ts'
import type {
  ManagedExploreDispatchContinuationStore,
  ManagedExploreDispatchLease,
  ManagedExploreDispatchStore,
} from './managed-explore-dispatch.ts'
import { ManagedExploreProviderError } from './managed-explore-provider.ts'
import type { ManagedExploreRootTurn, ManagedExploreSession } from './managed-explore-provider.ts'

const SCOPE = {
  routeId: 'test-route',
  credentialGeneration: 3,
  providerOrg: 'org_fixture',
  providerProject: 'project_fixture',
  workerId: 'worker_fixture',
  leaseSeconds: 60,
  allowSend: true,
}
const SEED = 'Preserve this exact fictional input.\r\n'
const INPUT_SHA256 = createHash('sha256').update(SEED).digest('hex')
const SESSION: ManagedExploreSession = {
  id: 'sess_fixture',
  environmentId: 'env_fixture',
  operationId: 'op_fixture',
  model: 'model_fixture',
  status: 'idle',
  createdAt: 1,
  spendControl: { limitCents: 500, consumedCents: null },
}
const NOW = Date.parse('2026-11-22T17:00:00Z')
const LEASE_UNTIL = '2026-11-22T17:01:00Z'
const POSSIBLE_AT = '2026-11-22T17:00:00Z'
const BASE = {
  projectId: 'project_owner_fixture',
  turnId: 'local_turn_fixture',
  leaseToken: 'lease_fixture',
  turnKind: 'text',
  leaseUntil: LEASE_UNTIL,
  allowSend: true,
  createOperationId: 'op_fixture',
  model: 'model_fixture',
  sessionLimitCents: 500,
  createPossibleAt: null,
  createRejectedAt: null,
  providerSessionId: null,
  environmentId: null,
  environmentStatus: null,
  sessionRefusalStatus: null,
  submissionId: 'event_fixture',
  eventPossibleAt: null,
  previousRootId: null,
  rootId: null,
  rootStatus: null,
  rootCompletedSeenAt: null,
  payloadSha256: null,
} satisfies ManagedExploreDispatchLease
const EVENT_READY = {
  ...BASE,
  createPossibleAt: POSSIBLE_AT,
  providerSessionId: SESSION.id,
  environmentId: SESSION.environmentId,
  environmentStatus: 'connected',
  previousRootId: 'turn_previous',
} satisfies ManagedExploreDispatchLease
const EVENT_PREPARED = {
  ...EVENT_READY,
  eventPossibleAt: POSSIBLE_AT,
  payloadSha256: INPUT_SHA256,
} satisfies ManagedExploreDispatchLease

type Provider = Parameters<typeof dispatchManagedExploreOnce>[1]['provider']
type Observation = Parameters<ManagedExploreDispatchStore['recordManagedExploreDispatch']>[1]
type Retain = NonNullable<Parameters<typeof dispatchManagedExploreOnce>[1]['retainOutput']>

function root(id = 'turn_fixture', status: ManagedExploreRootTurn['status'] = 'completed'): ManagedExploreRootTurn {
  return { id, sessionId: SESSION.id, createdAt: 3, startedAt: 3, completedAt: 4, status, usage: null, failure: null }
}

function receipt<T>(value: T) {
  return Promise.resolve({ value, requestId: 'req_fixture' })
}

function fixture(initial: ManagedExploreDispatchLease) {
  const state = { claim: initial, expired: false, claims: 0, reads: 0 }
  const observations: Observation[] = []
  const outputs: Parameters<Retain>[1][] = []
  const preparations: string[] = []
  const store: ManagedExploreDispatchContinuationStore = {
    claimManagedExploreDispatch: () => {
      state.claims += 1
      return Promise.resolve(state.claim)
    },
    readManagedExploreDispatch: (identity) => {
      state.reads += 1
      assert.deepEqual(identity, { projectId: BASE.projectId, turnId: BASE.turnId, leaseToken: BASE.leaseToken })
      return Promise.resolve(state.claim)
    },
    prepareManagedExploreDispatch: (claim, action) => {
      if (state.expired || claim !== state.claim) return Promise.resolve({ kind: 'observe' })
      preparations.push(action.kind)
      if (action.kind === 'create' && state.claim.createRejectedAt) return Promise.resolve({ kind: 'denied' })
      if (action.kind === 'create' && !state.claim.createPossibleAt) {
        state.claim = { ...state.claim, createPossibleAt: POSSIBLE_AT }
        return Promise.resolve({
          kind: 'create',
          operationId: state.claim.createOperationId,
          model: state.claim.model,
          sessionLimitCents: state.claim.sessionLimitCents,
          leaseUntil: LEASE_UNTIL,
        })
      }
      const { providerSessionId } = state.claim
      if (action.kind === 'event' && !state.claim.eventPossibleAt && providerSessionId) {
        state.claim = { ...state.claim, eventPossibleAt: POSSIBLE_AT, payloadSha256: INPUT_SHA256 }
        return Promise.resolve({
          kind: 'event',
          providerSessionId,
          previousRootId: action.predecessorRootId,
          submissionId: state.claim.submissionId,
          instruction: SEED,
          payloadSha256: INPUT_SHA256,
          leaseUntil: LEASE_UNTIL,
        })
      }
      return Promise.resolve({ kind: 'observe' })
    },
    recordManagedExploreDispatch: (_claim, observation) => {
      if (state.expired) return Promise.reject(new Error('lease expired'))
      observations.push(observation)
      if (observation.kind === 'created') {
        state.claim = {
          ...EVENT_READY,
          turnKind: state.claim.turnKind,
          previousRootId: null,
          environmentStatus: null,
        }
      }
      if (observation.kind === 'environment') {
        state.claim = { ...state.claim, environmentStatus: observation.status }
      }
      if (observation.kind === 'root') {
        state.claim = {
          ...state.claim,
          rootId: observation.rootId,
          rootStatus: observation.status,
          rootCompletedSeenAt: observation.status === 'completed' ? new Date(NOW).toISOString() : null,
        }
      }
      return Promise.resolve()
    },
  }
  const retainOutput: Retain = (_claim, output) => {
    if (state.expired) return Promise.reject(new Error('lease expired'))
    outputs.push(output)
    return Promise.resolve('settled')
  }
  return {
    state,
    store,
    observations,
    outputs,
    preparations,
    retainOutput,
    instructions: 'Fiction only.',
    now: () => NOW,
  }
}

function fakeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    createSession: () => assert.fail('unexpected create'),
    findSessionByOperation: () => assert.fail('unexpected session reconciliation'),
    readSession: () => receipt(SESSION),
    readEnvironment: () => receipt({ id: SESSION.environmentId, status: 'connected' as const }),
    submitText: () => assert.fail('unexpected event submission'),
    listRootTurns: () => receipt([]),
    readRootTurn: (_sessionId, turnId) => receipt(root(turnId)),
    readTurnInputDigest: () => receipt(INPUT_SHA256),
    readTurnText: () => assert.fail('unexpected text read'),
    downloadPrototype: () => assert.fail('unexpected prototype download'),
    ...overrides,
  }
}

test('create is fenced before contact and an uncertain create recovers by exact metadata only', async () => {
  const f = fixture(BASE)
  let creates = 0
  let match: ManagedExploreSession | null = null
  const provider = fakeProvider({
    createSession: (input) => {
      creates += 1
      assert.equal(f.state.claim.createPossibleAt, POSSIBLE_AT)
      assert.deepEqual(input, {
        operationId: BASE.createOperationId,
        instructions: 'Fiction only.',
        model: BASE.model,
        sessionLimitCents: BASE.sessionLimitCents,
      })
      return Promise.reject(new ManagedExploreProviderError('delivery_unknown', 'reconcile'))
    },
    findSessionByOperation: (id) => {
      assert.equal(id, BASE.createOperationId)
      return receipt(match)
    },
  })
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'unknown')
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'unknown')
  match = SESSION
  assert.equal(await dispatchManagedExploreOnce({ ...SCOPE, allowSend: false }, { ...f, provider }), 'progressed')
  assert.equal(creates, 1)
  assert.deepEqual(f.preparations, ['create'])
  assert.deepEqual(
    f.observations.map(({ kind }) => kind),
    ['defer', 'defer', 'created'],
  )
})

test('create reconciliation keeps ambiguous, unbound or mismatched results fenced', async (t) => {
  const cases = [
    { expected: 'ambiguous_session', session: null },
    { expected: 'session_identity_mismatch', session: { ...SESSION, model: 'wrong-model' } },
  ]
  for (const scenario of cases) {
    await t.test(scenario.expected, async () => {
      const f = fixture({ ...BASE, createPossibleAt: POSSIBLE_AT })
      const provider = fakeProvider({
        findSessionByOperation: () =>
          scenario.session
            ? receipt(scenario.session)
            : Promise.reject(new ManagedExploreProviderError('ambiguous_session', 'reconcile')),
        readSession: () => receipt(scenario.session ?? SESSION),
      })
      assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'unknown')
      assert.deepEqual(f.preparations, [])
      assert.deepEqual(f.observations, [{ kind: 'defer', delaySeconds: 5 }])
    })
  }
})

test('202 records acceptance, then a uniquely matching saved root settles on a later claim', async () => {
  const f = fixture(EVENT_READY)
  let sends = 0
  const provider = fakeProvider({
    submitText: (input) => {
      sends += 1
      assert.equal(f.state.claim.eventPossibleAt, POSSIBLE_AT)
      assert.deepEqual(input, { sessionId: SESSION.id, idempotencyKey: 'event_fixture', text: SEED })
      return receipt('accepted')
    },
    listRootTurns: (sessionId, predecessor) => {
      assert.equal(sessionId, SESSION.id)
      assert.equal(predecessor, EVENT_READY.previousRootId)
      return receipt(sends ? [root()] : [])
    },
    readTurnText: () => receipt('Retained assistant reply.'),
  })
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'progressed')
  assert.deepEqual(
    f.observations.map(({ kind }) => kind),
    ['eventAccepted'],
  )
  assert.equal(f.outputs.length, 0)
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'progressed')
  assert.deepEqual(
    f.observations.map(({ kind }) => kind),
    ['eventAccepted', 'root'],
  )
  assert.equal(f.outputs.length, 0)
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'settled')
  assert.equal(f.outputs.length, 0)
  const settled = f.observations.at(-1)
  assert.ok(settled?.kind === 'settle')
  assert.equal(settled.reply, 'Retained assistant reply.')
  assert.equal(sends, 1)
})

test('possible submission is observed only, even with no root, several roots, or a mismatched digest', async (t) => {
  const cases = [
    { roots: [], digest: INPUT_SHA256, reason: 'root_unresolved' },
    { roots: [root(), root('turn_other')], digest: INPUT_SHA256, reason: 'root_unresolved' },
    { roots: [root()], digest: 'wrong', reason: 'root_input_unresolved' },
  ]
  for (const [index, scenario] of cases.entries()) {
    await t.test(`${index} ${scenario.reason}`, async () => {
      const f = fixture(EVENT_PREPARED)
      const provider = fakeProvider({
        listRootTurns: () => receipt(scenario.roots),
        readTurnInputDigest: () => receipt(scenario.digest),
      })
      assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'unknown')
      assert.deepEqual(f.preparations, [])
      assert.equal(f.outputs.length, 0)
      assert.deepEqual(f.observations, [{ kind: 'defer', delaySeconds: 5 }])
    })
  }
})

test('a lost send or acknowledgement store write leaves the immutable event fenced', async () => {
  const f = fixture(EVENT_READY)
  let sends = 0
  const provider = fakeProvider({
    submitText: () => {
      sends += 1
      return receipt('accepted')
    },
  })
  const unavailable: ManagedExploreDispatchStore = {
    ...f.store,
    recordManagedExploreDispatch: () => Promise.reject(new Error('store unavailable')),
  }
  await assert.rejects(dispatchManagedExploreOnce(SCOPE, { ...f, store: unavailable, provider }), /store unavailable/)
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'unknown')
  assert.equal(f.state.claim.eventPossibleAt, POSSIBLE_AT)
  assert.deepEqual(f.preparations, ['event'])
  assert.equal(sends, 1)
})

test('send-disabled and stale lease result in zero provider writes', async () => {
  const f = fixture(EVENT_READY)
  const provider = fakeProvider()
  assert.equal(await dispatchManagedExploreOnce({ ...SCOPE, allowSend: false }, { ...f, provider }), 'waiting')
  f.state.expired = true
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'waiting')
  assert.deepEqual(f.preparations, [])
})

test('a wrong provider session, unsettled predecessor or untracked root blocks event preparation', async (t) => {
  const cases = [
    { provider: { readSession: () => receipt({ ...SESSION, environmentId: 'wrong_env' }) }, status: 'unknown' },
    { provider: { readRootTurn: () => receipt(root('turn_previous', 'in_progress')) }, status: 'waiting' },
    { provider: { listRootTurns: () => receipt([root('turn_untracked')]) }, status: 'unknown' },
  ] satisfies { provider: Partial<Provider>; status: string }[]
  for (const [index, scenario] of cases.entries()) {
    await t.test(`${index} ${scenario.status}`, async () => {
      const f = fixture(EVENT_READY)
      assert.equal(
        await dispatchManagedExploreOnce(SCOPE, { ...f, provider: fakeProvider(scenario.provider) }),
        scenario.status,
      )
      assert.deepEqual(f.preparations, [])
    })
  }
})

test('a recovered completed revision uses its exact provider root and environment for artifact retention', async () => {
  const f = fixture({ ...EVENT_PREPARED, turnKind: 'revision', rootId: 'turn_fixture', rootStatus: 'completed' })
  const bytes = Buffer.from('<!doctype html><button>Explain</button>')
  const artifact = {
    artifactId: 'artifact_fixture',
    sessionId: SESSION.id,
    environmentId: SESSION.environmentId,
    turnId: 'turn_fixture',
    path: '/workspace/outputs/index.html',
    mimeType: 'text/html; charset=utf-8',
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
  } as const
  const provider = fakeProvider({
    downloadPrototype: (sessionId, turnId, environmentId) => {
      assert.deepEqual([sessionId, turnId, environmentId], [SESSION.id, 'turn_fixture', SESSION.environmentId])
      return receipt(artifact)
    },
  })
  assert.equal(await dispatchManagedExploreOnce({ ...SCOPE, allowSend: false }, { ...f, provider }), 'settled')
  assert.deepEqual(f.outputs, [
    {
      kind: 'revision',
      root: root(),
      environmentId: SESSION.environmentId,
      rootRequestId: 'req_fixture',
      outputRequestId: 'req_fixture',
      artifact,
      event: {
        payloadSha256: INPUT_SHA256,
        previousRootId: EVENT_READY.previousRootId,
        providerSessionId: SESSION.id,
        submissionId: EVENT_READY.submissionId,
      },
    },
  ])
  const pending = fixture({
    ...EVENT_PREPARED,
    turnKind: 'revision',
    rootId: 'turn_fixture',
    rootStatus: 'completed',
    rootCompletedSeenAt: new Date(NOW - 600_000).toISOString(),
  })
  assert.equal(
    await dispatchManagedExploreOnce(SCOPE, {
      provider,
      store: pending.store,
      instructions: pending.instructions,
      now: pending.now,
    }),
    'retention_pending',
  )
  assert.deepEqual(pending.observations, [{ kind: 'defer', delaySeconds: 5 }])
})

test('a cancelled, failed, or unrelated root never reaches output publication', async (t) => {
  const cases = [
    { root: root('turn_fixture', 'cancelled'), result: 'settled', observation: 'settle' },
    { root: root('turn_fixture', 'failed'), result: 'settled', observation: 'settle' },
    { root: root('turn_previous'), result: 'unknown', observation: 'defer' },
  ]
  for (const scenario of cases) {
    await t.test(scenario.observation, async () => {
      const f = fixture({
        ...EVENT_PREPARED,
        turnKind: 'prototype',
        rootId: 'turn_fixture',
        rootStatus: scenario.root.status,
      })
      const provider = fakeProvider({ readRootTurn: () => receipt(scenario.root) })
      assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), scenario.result)
      assert.equal(f.outputs.length, 0)
      assert.deepEqual(
        f.observations.map(({ kind }) => kind),
        [scenario.observation],
      )
    })
  }
})

test('the newly prepared lease must still be current when sending', async () => {
  const f = fixture(BASE)
  const store: ManagedExploreDispatchStore = {
    ...f.store,
    prepareManagedExploreDispatch: (identity, action) =>
      f.store
        .prepareManagedExploreDispatch(identity, action)
        .then((prepared) => (prepared.kind === 'create' ? { ...prepared, leaseUntil: POSSIBLE_AT } : prepared)),
  }
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, store, provider: fakeProvider() }), 'waiting')
  assert.equal(f.state.claim.createPossibleAt, POSSIBLE_AT)
  assert.equal(f.observations.length, 0)
})

test('a valid directions root waits for authenticated retention before settling', async () => {
  const f = fixture({ ...EVENT_PREPARED, turnKind: 'directions', rootId: 'turn_fixture', rootStatus: 'completed' })
  const { retainOutput, ...dependencies } = f
  assert.equal(typeof retainOutput, 'function')
  assert.equal(
    await dispatchManagedExploreOnce(SCOPE, {
      ...dependencies,
      provider: fakeProvider({ readTurnText: () => receipt('Two complete directions.') }),
    }),
    'retention_pending',
  )
  assert.deepEqual(f.observations, [{ kind: 'defer', delaySeconds: 5 }])
  assert.equal(f.outputs.length, 0)
})

test('environment readiness is recorded before event preparation', async () => {
  const f = fixture({ ...EVENT_READY, environmentStatus: 'pending' })
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider: fakeProvider() }), 'progressed')
  assert.deepEqual(f.observations, [
    { kind: 'environment', environmentId: SESSION.environmentId, providerSessionId: SESSION.id, status: 'connected' },
  ])
  assert.deepEqual(f.preparations, [])
})

test('a completed immutable artifact rejected by provider validation settles immediately', async () => {
  const f = fixture({ ...EVENT_PREPARED, turnKind: 'prototype', rootId: 'turn_fixture', rootStatus: 'completed' })
  const provider = fakeProvider({
    downloadPrototype: () => Promise.reject(new ManagedExploreProviderError('artifact_invalid', 'terminal')),
  })
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'settled')
  assert.deepEqual(f.observations, [
    {
      kind: 'outputRejected',
      rootId: 'turn_fixture',
      providerSessionId: SESSION.id,
      submissionId: EVENT_READY.submissionId,
      payloadSha256: INPUT_SHA256,
      previousRootId: EVENT_READY.previousRootId,
      reason: 'output_invalid',
    },
  ])
  assert.equal(f.outputs.length, 0)
  assert.deepEqual(f.preparations, [])
})

test('a missing artifact waits for the bound measured from the first durable completed observation', async (t) => {
  const cases = [
    { label: 'unrecorded DB time', seenAt: null, result: 'unknown' },
    { label: 'invalid DB time', seenAt: 'invalid', result: 'unknown' },
    { label: 'one second inside the window', seenAt: new Date(NOW - 299_000).toISOString(), result: 'unknown' },
    { label: 'at the window boundary', seenAt: new Date(NOW - 300_000).toISOString(), result: 'settled' },
  ]
  for (const scenario of cases) {
    await t.test(scenario.label, async () => {
      const f = fixture({
        ...EVENT_PREPARED,
        turnKind: 'revision',
        rootId: 'turn_fixture',
        rootStatus: 'completed',
        rootCompletedSeenAt: scenario.seenAt,
      })
      const provider = fakeProvider({
        downloadPrototype: () => Promise.reject(new ManagedExploreProviderError('artifact_missing', 'retry_read')),
      })
      assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), scenario.result)
      const observation = f.observations[0]
      if (scenario.result === 'settled') {
        assert.ok(observation?.kind === 'outputRejected')
        assert.equal(observation.reason, 'output_missing')
      } else {
        assert.equal(observation?.kind, 'defer')
      }
      assert.equal(f.outputs.length, 0)
      assert.deepEqual(f.preparations, [])
    })
  }
})

test('known empty saved text settles only after the output window', async () => {
  const f = fixture({
    ...EVENT_PREPARED,
    rootId: 'turn_fixture',
    rootStatus: 'completed',
    rootCompletedSeenAt: new Date(NOW - 300_000).toISOString(),
  })
  const provider = fakeProvider({ readTurnText: () => receipt(' \r\n') })
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'settled')
  const observation = f.observations[0]
  assert.ok(observation?.kind === 'outputRejected')
  assert.equal(observation.reason, 'output_missing')
})

test('a transient artifact read stays unknown beyond the missing-output window', async () => {
  const f = fixture({
    ...EVENT_PREPARED,
    turnKind: 'prototype',
    rootId: 'turn_fixture',
    rootStatus: 'completed',
    rootCompletedSeenAt: new Date(NOW - 360_000).toISOString(),
  })
  const provider = fakeProvider({
    downloadPrototype: () => Promise.reject(new ManagedExploreProviderError('transient', 'retry_read')),
  })
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'unknown')
  assert.deepEqual(f.observations, [{ kind: 'defer', delaySeconds: 5 }])
  assert.equal(f.outputs.length, 0)
  assert.deepEqual(f.preparations, [])
})

test('settles text at the exact SQL byte limit and rejects larger retained text', async () => {
  const atLimit = 'é'.repeat(32_768)
  for (const [text, kind] of [
    [atLimit, 'settle'],
    [atLimit + 'a', 'outputRejected'],
  ] as const) {
    const f = fixture({
      ...EVENT_PREPARED,
      rootId: 'turn_fixture',
      rootStatus: 'completed',
      rootCompletedSeenAt: new Date(NOW).toISOString(),
    })
    const provider = fakeProvider({ readTurnText: () => receipt(text) })
    assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'settled')
    const observation = f.observations[0]
    assert.equal(observation?.kind, kind)
    if (observation?.kind === 'outputRejected') assert.equal(observation.reason, 'output_invalid')
  }
})

test('bounded pass continues committed progress under one lease through exact text settlement', async () => {
  const f = fixture(BASE)
  let creates = 0
  let sends = 0
  const provider = fakeProvider({
    createSession: () => {
      creates += 1
      assert.equal(f.state.claim.createPossibleAt, POSSIBLE_AT)
      return receipt(SESSION)
    },
    submitText: ({ text, idempotencyKey }) => {
      sends += 1
      assert.equal(f.state.claim.eventPossibleAt, POSSIBLE_AT)
      assert.equal(text, SEED)
      assert.equal(idempotencyKey, EVENT_READY.submissionId)
      return receipt('accepted')
    },
    listRootTurns: () => receipt(sends ? [root()] : []),
    readTurnText: () => receipt('Exact output.'),
  })
  assert.equal(await dispatchManagedExplorePass(SCOPE, { ...f, provider }), 'settled')
  assert.equal(f.state.claims, 1)
  assert.equal(f.state.reads, 4)
  assert.equal(creates, 1)
  assert.equal(sends, 1)
  assert.deepEqual(
    f.observations.map(({ kind }) => kind),
    ['created', 'environment', 'eventAccepted', 'root', 'settle'],
  )
})

test('pass stops on an ambiguous event even when send remains enabled', async () => {
  const f = fixture(EVENT_READY)
  let sends = 0
  const provider = fakeProvider({
    submitText: () => {
      sends += 1
      return Promise.reject(new ManagedExploreProviderError('delivery_unknown', 'retry_same_key'))
    },
  })
  assert.equal(await dispatchManagedExplorePass(SCOPE, { ...f, provider }), 'unknown')
  assert.equal(await dispatchManagedExplorePass(SCOPE, { ...f, provider }), 'unknown')
  assert.equal(sends, 1)
  assert.equal(f.state.reads, 0)
  assert.deepEqual(f.preparations, ['event'])
})

test('pass stops when the same lease cannot be read safely', async (t) => {
  for (const fault of ['replaced', 'expired', 'database_error'] as const) {
    await t.test(fault, async () => {
      const f = fixture({ ...EVENT_READY, environmentStatus: 'pending' })
      let sessionReads = 0
      const provider = fakeProvider({
        readSession: () => {
          sessionReads += 1
          return receipt(SESSION)
        },
      })
      const store: ManagedExploreDispatchContinuationStore = {
        ...f.store,
        readManagedExploreDispatch: () => {
          if (fault === 'database_error') return Promise.reject(new Error('read failed'))
          const lease = fault === 'replaced' ? { leaseToken: 'another_lease' } : { leaseUntil: POSSIBLE_AT }
          return Promise.resolve({ ...f.state.claim, ...lease })
        },
      }
      const pass = dispatchManagedExplorePass(SCOPE, { ...f, store, provider })
      if (fault === 'database_error') await assert.rejects(pass, /read failed/)
      else assert.equal(await pass, 'waiting')
      assert.equal(sessionReads, 1)
      assert.deepEqual(
        f.observations.map(({ kind }) => kind),
        ['environment'],
      )
      assert.deepEqual(f.preparations, [])
    })
  }
})

test('pass yields the lease at its step limit without extra provider work', async () => {
  const f = fixture({ ...EVENT_READY, environmentStatus: 'pending' })
  const provider = fakeProvider({
    readEnvironment: () =>
      receipt({
        id: SESSION.environmentId,
        status: f.state.claim.environmentStatus === 'pending' ? 'provisioning' : 'pending',
      }),
  })
  assert.equal(await dispatchManagedExplorePass(SCOPE, { ...f, provider }), 'progressed')
  assert.equal(f.state.claims, 1)
  assert.equal(f.state.reads, 5)
  assert.equal(f.observations.filter(({ kind }) => kind === 'environment').length, 6)
  assert.deepEqual(f.observations.at(-1), { kind: 'defer', delaySeconds: 5 })
  assert.deepEqual(f.preparations, [])
})

test('a terminal environment observation settles without rereading its released lease', async () => {
  const f = fixture({ ...EVENT_READY, environmentStatus: 'pending' })
  const provider = fakeProvider({ readEnvironment: () => receipt({ id: SESSION.environmentId, status: 'expired' }) })
  assert.equal(await dispatchManagedExplorePass(SCOPE, { ...f, provider }), 'settled')
  assert.equal(f.state.reads, 0)
  assert.deepEqual(
    f.observations.map(({ kind }) => kind),
    ['environment'],
  )
  assert.deepEqual(f.preparations, [])
})

test('drain fences create and event mutations even when it starts during committed send preparation', async () => {
  for (const [initial, action] of [
    [BASE, 'create'],
    [EVENT_READY, 'event'],
  ] as const) {
    const f = fixture(initial)
    let open = true
    const store: ManagedExploreDispatchContinuationStore = {
      ...f.store,
      prepareManagedExploreDispatch: async (identity, requested) => {
        const prepared = await f.store.prepareManagedExploreDispatch(identity, requested)
        assert.equal(prepared.kind, action)
        open = false
        return prepared
      },
    }
    const provider = fakeProvider({
      createSession: () => assert.fail('mutation called during drain'),
      submitText: () => assert.fail('mutation called during drain'),
    })
    assert.equal(await dispatchManagedExplorePass(SCOPE, { ...f, store, provider, maySend: () => open }), 'unknown')
    assert.deepEqual(f.preparations, [action])
    assert.deepEqual(f.observations, [{ kind: 'defer', delaySeconds: 5 }])
  }
})

test('callback output rejection settles only the recorded root and uses the existing missing-output window', async () => {
  for (const [result, elapsed, expected] of [
    ['invalid', 0, 'settled'],
    ['missing', 0, 'unknown'],
    ['missing', 300_000, 'settled'],
  ] as const) {
    const f = fixture({
      ...EVENT_PREPARED,
      turnKind: 'directions',
      rootId: 'turn_fixture',
      rootStatus: 'completed',
      rootCompletedSeenAt: new Date(NOW - elapsed).toISOString(),
    })
    const provider = fakeProvider({ readTurnText: () => receipt('fixture') })
    assert.equal(
      await dispatchManagedExplorePass(SCOPE, {
        ...f,
        provider,
        retainOutput: () => Promise.resolve(result),
      }),
      expected,
    )
    const observation = f.observations[0]
    if (expected === 'settled') {
      assert.equal(observation?.kind, 'outputRejected')
      assert.equal(observation.rootId, f.state.claim.rootId)
      assert.equal(observation.reason, `output_${result}`)
    } else {
      assert.deepEqual(f.observations, [{ kind: 'defer', delaySeconds: 5 }])
    }
  }
})

test('a confirmed provider failure or session budget pause refuses an unsent event without preparing it', async () => {
  for (const status of ['failed', 'budget_reached'] as const) {
    const f = fixture(EVENT_READY)
    const provider = fakeProvider({
      readSession: () => receipt({ ...SESSION, status }),
      readEnvironment: () => assert.fail('session refusal must precede environment read'),
    })
    assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'settled')
    assert.deepEqual(f.preparations, [])
    assert.deepEqual(f.observations, [
      {
        kind: 'sessionRefused',
        providerSessionId: SESSION.id,
        environmentId: SESSION.environmentId,
        status,
        requestId: 'req_fixture',
      },
    ])
  }
})

test('a durable session refusal carries forward to unsent successors, while a possible event reconciles from its root', async () => {
  const refusal = { sessionRefusalStatus: 'budget_reached' } as const
  const provider = fakeProvider({
    readSession: () => assert.fail('durable session state should require no provider session read'),
    readEnvironment: () => assert.fail('unexpected environment metadata read'),
    listRootTurns: () => receipt([root()]),
  })
  const unsent = fixture({ ...EVENT_READY, ...refusal })
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...unsent, provider }), 'settled')
  assert.equal(unsent.observations[0]?.kind, 'sessionRefused')
  assert.deepEqual(unsent.preparations, [])
  const sent = fixture({ ...EVENT_PREPARED, ...refusal })
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...sent, provider }), 'progressed')
  assert.equal(sent.observations[0]?.kind, 'root')
  assert.deepEqual(sent.preparations, [])
})

test('a failed status from a mismatched provider session is unresolved', async () => {
  const f = fixture(EVENT_READY)
  const provider = fakeProvider({
    readSession: () => receipt({ ...SESSION, operationId: 'different_operation', status: 'failed' }),
  })
  assert.equal(await dispatchManagedExploreOnce(SCOPE, { ...f, provider }), 'unknown')
  assert.deepEqual(
    f.observations.map(({ kind }) => kind),
    ['defer'],
  )
  assert.deepEqual(f.preparations, [])
})

test('matching create or create-recovery receipt already reporting failure settles before an input read', async () => {
  for (const recovering of [false, true]) {
    const f = fixture(recovering ? { ...BASE, createPossibleAt: POSSIBLE_AT } : BASE)
    const failed = { ...SESSION, status: 'failed' } as const
    const provider = fakeProvider({
      createSession: () => receipt(failed),
      findSessionByOperation: () => receipt(failed),
      readSession: () => receipt(failed),
    })
    assert.equal(await dispatchManagedExplorePass(SCOPE, { ...f, provider }), 'settled')
    assert.equal(f.state.reads, 0)
    assert.deepEqual(f.preparations, recovering ? [] : ['create'])
    assert.equal(f.observations[0]?.kind, 'created')
    assert.equal(f.observations[0]?.refusalStatus, 'failed')
  }
})

test('a definitive create rejection drains the unsent successor without any provider lookup', async () => {
  const f = fixture({ ...BASE, createPossibleAt: POSSIBLE_AT, createRejectedAt: POSSIBLE_AT, allowSend: false })
  const provider = fakeProvider({ findSessionByOperation: () => assert.fail('rejected create was searched') })
  assert.equal(await dispatchManagedExplorePass({ ...SCOPE, allowSend: false }, { ...f, provider }), 'settled')
  assert.deepEqual(f.preparations, ['create'])
  assert.deepEqual(f.observations, [])
  assert.equal(f.state.reads, 0)
})

test('a previously recorded terminal environment settles an unsent successor without provider I/O', async () => {
  for (const status of ['expired', 'failed'] as const) {
    const f = fixture({ ...EVENT_READY, environmentStatus: status, allowSend: false })
    const provider = fakeProvider({
      readSession: () => assert.fail('unexpected session read'),
      readEnvironment: () => assert.fail('unexpected environment read'),
    })
    assert.equal(await dispatchManagedExplorePass({ ...SCOPE, allowSend: false }, { ...f, provider }), 'settled')
    assert.deepEqual(f.preparations, [])
    assert.deepEqual(f.observations, [
      {
        kind: 'environment',
        providerSessionId: SESSION.id,
        environmentId: SESSION.environmentId,
        status,
      },
    ])
  }
})

test('a possible event still reconciles its exact saved root after an environment becomes terminal', async () => {
  const f = fixture({ ...EVENT_PREPARED, environmentStatus: 'expired', allowSend: false })
  const provider = fakeProvider({
    readSession: () => assert.fail('unexpected session read'),
    readEnvironment: () => assert.fail('unexpected environment read'),
    listRootTurns: () => receipt([root()]),
    readTurnText: () => receipt('Recovered the saved answer.'),
  })
  assert.equal(await dispatchManagedExplorePass({ ...SCOPE, allowSend: false }, { ...f, provider }), 'settled')
  assert.deepEqual(f.preparations, [])
  assert.deepEqual(
    f.observations.map(({ kind }) => kind),
    ['root', 'settle'],
  )
})
