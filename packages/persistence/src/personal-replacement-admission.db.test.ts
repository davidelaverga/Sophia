// A payer can be reassigned after the replacement precheck but before its actual admission. Only a disposable DB's
// private precheck is paused; the operator performs a real owner update, and both public mutators run via API login.
// A refused admission must leave no decision: the held replacement must still be admitted later at seq 1.
import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { sendPersonalAnswerInput, PERSONAL_ANSWER_V1, type PersonalAnswerProfile } from './personal-admission.ts'
import {
  admitPersonalAnswerInput,
  controlPersonalAnswerInput,
  type PersonalAnswerControlResult,
} from './personal-answer-controls.ts'
import { withActor } from './tx.ts'
import { pgError } from './errors.ts'

let db: TestDatabase
let owner: pg.Pool
let api: pg.Pool
const HOLD = 'sophia.personal_answer_replacement_hold(uuid,bigint,jsonb,boolean)'
const BOUND = 8000

async function within<T>(label: string, promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new assert.AssertionError({ message: `${label} exceeded its bound` })), BOUND)
  })
  try {
    return await Promise.race([promise, expired])
  } finally {
    clearTimeout(timer)
  }
}

before(async () => {
  db = await createTestDatabase(undefined, { assembler: false })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
  api = new pg.Pool({ connectionString: db.apiUrl, max: 4 })
})
after(async () => {
  await Promise.all([owner.end(), api.end()])
  await db.drop()
})

async function person() {
  const id = randomUUID()
  const payer = `p-${randomUUID().slice(0, 8)}`
  await owner.query(
    'INSERT INTO sophia.personal_companion_payers(payer,owner_id,allowance_micros) VALUES($1,$2,1000000)',
    [payer, id],
  )
  const profile: PersonalAnswerProfile = {
    version: 1,
    owner: id,
    payer,
    routeId: 'synthetic-route',
    roleDigest: `sha256:${'c'.repeat(64)}`,
    provider: 'synthetic-provider',
    model: 'synthetic-model',
    reasoningEffort: 'medium',
    maxTokens: 512,
    prices: { input: 1, cacheRead: 0, cacheWrite: 0, output: 2 },
  }
  const sent = await withActor(api, id, 'write', (c) =>
    sendPersonalAnswerInput(c, randomUUID(), {
      contract: PERSONAL_ANSWER_V1,
      epoch: 0,
      text: 'The original question',
      profile,
    }),
  )
  assert.equal(sent.decision.outcome, 'admitted')
  return { id, payer, profile, inputId: sent.inputId }
}
type Person = Awaited<ReturnType<typeof person>>

const replace = (c: pg.PoolClient, p: Person, key: string, admission: boolean) =>
  controlPersonalAnswerInput(
    c,
    {
      key,
      inputId: p.inputId,
      action: 'replace',
      expectedRevision: 0,
      epoch: 0,
      text: 'The replacement question',
    },
    { profile: p.profile, admission },
  )

function heldReplacement(r: PersonalAnswerControlResult) {
  const replacement = r.receipt.replacement
  assert.ok(replacement)
  return replacement
}

const admit = (c: pg.PoolClient, p: Person, replacement: PersonalAnswerControlResult, key: string) =>
  admitPersonalAnswerInput(
    c,
    {
      key,
      inputId: heldReplacement(replacement).inputId,
      controlId: replacement.receipt.controlId,
      expectedRevision: 1,
      epoch: 0,
    },
    { profile: p.profile, admission: true },
  )

async function functionBody(signature: string): Promise<string> {
  const { rows } = await owner.query<{ body: string }>('SELECT pg_get_functiondef($1::regprocedure) AS body', [
    signature,
  ])
  const row = rows[0]
  assert.ok(row)
  return row.body
}

/** Pause only after every real precheck has passed. CREATE OR REPLACE preserves its effective role and ACL. */
async function pausePositiveCheck(key: number) {
  const original = await functionBody(HOLD)
  const tail = ' RETURN NULL;\nEND'
  assert.equal(original.split(tail).length, 2)
  await owner.query(original.replace(tail, ` PERFORM pg_catalog.pg_advisory_xact_lock(718,${String(key)});\n${tail}`))
  return async () => {
    await owner.query(original)
    assert.equal(await functionBody(HOLD), original, 'the disposable seam is restored exactly')
  }
}

async function waitsFor(pid: number, blocker: number) {
  const deadline = Date.now() + BOUND
  while (Date.now() < deadline) {
    const { rows } = await within(
      'lock observation',
      owner.query<{ blocked: boolean }>(
        `SELECT wait_event='advisory' AND $2::int=ANY(pg_blocking_pids(pid)) AS blocked
       FROM pg_stat_activity WHERE pid=$1`,
        [pid, blocker],
      ),
    )
    if (rows[0]?.blocked) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.fail('The mutation never reached the specific advisory barrier')
}

/** The mutation cannot continue until a real operator reassignment has committed between its two eligibility reads. */
async function acrossReassignment(p: Person, mutate: (c: pg.PoolClient) => Promise<PersonalAnswerControlResult>) {
  const key = randomInt(1, 2_000_000_000)
  const restore = await pausePositiveCheck(key)
  const gate = await owner.connect()
  const started = Promise.withResolvers<number>()
  let operation: Promise<PersonalAnswerControlResult> | undefined
  try {
    await gate.query('BEGIN')
    await gate.query("SET LOCAL statement_timeout='10s'")
    const { rows } = await gate.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
    const blocker = rows[0]?.pid
    assert.ok(blocker)
    await gate.query('SELECT pg_advisory_xact_lock(718,$1)', [key])
    operation = withActor(api, p.id, 'write', async (c) => {
      await c.query("SET LOCAL statement_timeout='10s'")
      const pid = (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid
      assert.ok(pid)
      started.resolve(pid)
      return mutate(c)
    })
    void operation.catch((err: unknown) => started.reject(err))
    await waitsFor(await within('mutation start', started.promise), blocker)
    await gate.query('UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1', [p.payer, randomUUID()])
    await gate.query('COMMIT')
    return await within('mutation completion', operation)
  } finally {
    try {
      await gate.query('ROLLBACK')
      if (operation)
        await within(
          'mutation drain',
          operation.catch(() => undefined),
        )
    } finally {
      gate.release()
      await restore()
    }
  }
}

async function heldState(p: Person, inputId: string) {
  const { rows } = await owner.query<{
    state: string
    revision: number
    held_reason: string | null
    reply: string
    decisions: number
  }>(
    `SELECT c.state,c.revision,c.held_reason,t.reply,
      (SELECT count(*)::int FROM sophia.personal_input_decisions d WHERE d.owner_id=c.owner_id AND d.input_id=c.input_id) AS decisions
     FROM sophia.personal_answer_controls c JOIN sophia.personal_turns t ON t.id=c.turn_id AND t.owner_id=c.owner_id
     WHERE c.owner_id=$1 AND c.input_id=$2`,
    [p.id, inputId],
  )
  return rows[0]
}

async function recover(p: Person, replacement: PersonalAnswerControlResult) {
  await owner.query('UPDATE sophia.personal_companion_payers SET owner_id=$2 WHERE payer=$1', [p.payer, p.id])
  const admitted = await withActor(api, p.id, 'write', (c) => admit(c, p, replacement, randomUUID()))
  assert.equal(admitted.receipt.outcome, 'applied')
  assert.deepEqual(await heldState(p, heldReplacement(replacement).inputId), {
    state: 'active',
    revision: 2,
    held_reason: null,
    reply: 'pending',
    decisions: 1,
  })
  const { rows } = await owner.query<{ seq: number; outcome: string }>(
    'SELECT seq,outcome FROM sophia.personal_input_decisions WHERE owner_id=$1 AND input_id=$2',
    [p.id, heldReplacement(replacement).inputId],
  )
  assert.deepEqual(rows, [{ seq: 1, outcome: 'admitted' }])
}

describe('replacement admission is decided, not inferred from an earlier payer check', () => {
  it('C2 holds after payer reassignment, leaves no waiting decision and later admits at seq 1', async () => {
    const p = await person()
    const key = randomUUID()
    const first = await acrossReassignment(p, (c) => replace(c, p, key, true))
    const y = heldReplacement(first)
    assert.equal(y.state, 'held')
    assert.equal(y.heldReason, 'payer_unavailable')
    assert.equal(y.decision, null, 'no rolled-back decision may escape in the receipt')
    assert.deepEqual(await heldState(p, y.inputId), {
      state: 'held',
      revision: 1,
      held_reason: 'payer_unavailable',
      reply: 'recorded',
      decisions: 0,
    })
    await recover(p, first)
    const replay = await withActor(api, p.id, 'write', (c) => replace(c, p, key, true))
    assert.equal(replay.replayed, true)
    assert.deepEqual(replay.receipt, first.receipt, 'the historical held receipt does not change after admission')
  })

  it('C3 refuses after payer reassignment without advancing control or space revision and can retry seq 1', async () => {
    const p = await person()
    const replacement = await withActor(api, p.id, 'write', (c) => replace(c, p, randomUUID(), false))
    const key = randomUUID()
    const first = await acrossReassignment(p, (c) => admit(c, p, replacement, key))
    assert.equal(first.receipt.outcome, 'refused')
    assert.equal(first.receipt.revision, replacement.receipt.revision)
    assert.equal(first.receipt.revisionBefore, 1)
    assert.equal(first.receipt.revisionAfter, 1)
    assert.equal(first.receipt.heldReason, 'payer_unavailable')
    assert.equal(first.receipt.decision, null)
    assert.deepEqual(await heldState(p, heldReplacement(replacement).inputId), {
      state: 'held',
      revision: 1,
      held_reason: 'admission_off',
      reply: 'recorded',
      decisions: 0,
    })
    await recover(p, replacement)
    const replay = await withActor(api, p.id, 'write', (c) => admit(c, p, replacement, key))
    assert.equal(replay.replayed, true)
    assert.deepEqual(replay.receipt, first.receipt, 'the refused receipt is remembered even after later admission')
  })
})

for (const mode of ['C2', 'C3'] as const) {
  it(`${mode} propagates an unexpected decision insertion failure without keeping a partial control or receipt`, async () => {
    const p = await person()
    const replacement =
      mode === 'C3' ? await withActor(api, p.id, 'write', (c) => replace(c, p, randomUUID(), false)) : null
    const key = randomUUID()
    const previous = await owner.query('SELECT revision FROM sophia.personal_spaces WHERE owner_id=$1', [p.id])
    // A real failing CHECK exercises an unexpected SQLSTATE inside the admission subtransaction.
    // NOT VALID keeps the admitted original while checking every subsequent decision insertion.
    await owner.query(`ALTER TABLE sophia.personal_input_decisions ADD CONSTRAINT synthetic_decision_failure
      CHECK(profile->>'payer'<>'${p.payer}') NOT VALID`)
    let failure: unknown
    try {
      await assert.rejects(
        withActor(api, p.id, 'write', async (c) => {
          try {
            return await (replacement ? admit(c, p, replacement, key) : replace(c, p, key, true))
          } catch (err: unknown) {
            failure = err
            throw err
          }
        }),
      )
      assert.equal(pgError(failure).code, '23514')
    } finally {
      await owner.query('ALTER TABLE sophia.personal_input_decisions DROP CONSTRAINT synthetic_decision_failure')
    }
    assert.deepEqual(
      (await owner.query('SELECT revision FROM sophia.personal_spaces WHERE owner_id=$1', [p.id])).rows,
      previous.rows,
    )
    const requests = await owner.query(
      'SELECT FROM sophia.personal_requests WHERE owner_id=$1 AND idempotency_key=$2',
      [p.id, key],
    )
    assert.equal(requests.rowCount, 0)
    if (replacement) await recover(p, replacement)
    else {
      const result = await withActor(api, p.id, 'write', (c) => replace(c, p, key, true))
      assert.equal(result.replayed, false)
      assert.equal(heldReplacement(result).state, 'active')
    }
  })
}

it('keeps both mutators under their original owner, SECURITY DEFINER, search path and API-only grants', async () => {
  for (const signature of [
    'sophia.control_personal_answer_input(text,uuid,text,integer,bigint,text,jsonb,boolean)',
    'sophia.admit_personal_answer_input(text,uuid,uuid,integer,bigint,jsonb,boolean)',
  ]) {
    const { rows } = await owner.query<{
      definer: boolean
      owner: boolean
      config: string[]
      api: boolean
      worker: boolean
      public: boolean
    }>(
      `SELECT p.prosecdef AS definer,p.proowner=n.nspowner AS owner,p.proconfig AS config,
       has_function_privilege('sophia_api',p.oid,'EXECUTE') AS api,
       has_function_privilege('sophia_worker',p.oid,'EXECUTE') AS worker,
       EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
         WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.oid=$1::regprocedure`,
      [signature],
    )
    assert.deepEqual(rows, [
      {
        definer: true,
        owner: true,
        config: ['search_path=pg_catalog, sophia, pg_temp'],
        api: true,
        worker: false,
        public: false,
      },
    ])
  }
})
