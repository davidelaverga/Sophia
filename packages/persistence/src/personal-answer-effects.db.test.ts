// INC03-CC-003 A2 (migration 0102): the guarded Personal answer reservation through the API login and withActor on a
// disposable PostgreSQL. Every person, key, word, payer and profile is synthetic: no key, model, provider or network is
// called. Its typed caller is checked with the guard installed, and with it absent (renamed here, as an older database
// would lack it): an automatic turn then reserves nothing, a legacy one goes to 0080 as before, and a failed read of
// either fails closed.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import { beginCompanionCall, claimPersonalReply, sendPersonalTurn } from './personal.ts'
import { PERSONAL_AUTOMATIC_V1, sendPersonalInput } from './personal-inputs.ts'
import { PERSONAL_ANSWER_V1, sendPersonalAnswerInput, type PersonalAnswerProfile } from './personal-admission.ts'
import {
  personalAnswerGuardInstalled,
  readPersonalAnswerOrigin,
  readPersonalAnswerRefusals,
  reserveGuardedPersonalAnswer,
  type PersonalAnswerEffect,
} from './personal-answer-effects.ts'
import { settlePersonalCompanionAnswer } from './personal-usage.ts'
import { withActor } from './tx.ts'

interface World {
  db: TestDatabase
  owner: pg.Pool
  api: pg.Pool
}
let w: World

const owner = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await w.owner.query<T>(sql, params)).rows

const GUARD = 'sophia.reserve_personal_answer_guarded(uuid,text,text,bigint,uuid,uuid,jsonb)'

/** A person with a fresh payer the operator admitted for them, and the trusted profile naming it. */
async function person(): Promise<{ id: string; payer: string; profile: PersonalAnswerProfile }> {
  const id = randomUUID()
  const payer = `p-${randomUUID().slice(0, 8)}`
  await owner('INSERT INTO sophia.personal_companion_payers(payer,owner_id,allowance_micros) VALUES($1,$2,1000000)', [
    payer,
    id,
  ])
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
  return { id, payer, profile }
}

type Person = Awaited<ReturnType<typeof person>>

/** An Answer input sent and admitted; its turn. */
async function automatic(p: Person, text = 'Answer me'): Promise<{ turnId: string; inputId: string }> {
  const r = await withActor(w.api, p.id, 'write', (c) =>
    sendPersonalAnswerInput(c, randomUUID(), { contract: PERSONAL_ANSWER_V1, epoch: 0, text, profile: p.profile }),
  )
  assert.equal(r.decision.outcome, 'admitted')
  return { turnId: r.turnId, inputId: r.inputId }
}

async function legacy(p: Person): Promise<string> {
  const r = await withActor(w.api, p.id, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'Hello'))
  assert.ok(r.turnId)
  return r.turnId
}

/** The turn claimed as the companion claims it. */
async function claim(p: Person, turnId: string): Promise<string> {
  const claimed = await withActor(w.api, p.id, 'write', (c) => claimPersonalReply(c, turnId))
  assert.ok(claimed)
  return claimed
}

/** One guarded reservation under a registered call, as the live companion makes it. */
async function reserve(
  p: Person,
  turnId: string,
  claimed: string,
  profile: PersonalAnswerProfile | null = p.profile,
): Promise<{ outcome: PersonalAnswerEffect; callId: string }> {
  const callId = randomUUID()
  const outcome = await withActor(w.api, p.id, 'write', async (c) => {
    await beginCompanionCall(c, callId)
    return reserveGuardedPersonalAnswer(
      c,
      { callId, turnId, claim: claimed },
      { payer: p.payer, routeId: 'synthetic-route', micros: 10, profile },
    )
  })
  return { outcome, callId }
}

/** What the person's payer has reserved, and which turns are bound to a call: nothing else is an effect here. */
const effects = async (p: Person) => ({
  usage: Number(
    (
      await owner<{ n: string }>('SELECT count(*) AS n FROM sophia.personal_companion_usage WHERE owner_id=$1', [p.id])
    )[0]?.n,
  ),
  bound: Number(
    (await owner<{ n: string }>('SELECT count(*) AS n FROM sophia.personal_answer_calls WHERE owner_id=$1', [p.id]))[0]
      ?.n,
  ),
})

before(async () => {
  const db = await createTestDatabase(undefined, { assembler: false })
  w = {
    db,
    owner: new pg.Pool({ connectionString: db.ownerUrl, max: 4 }),
    api: new pg.Pool({ connectionString: db.apiUrl, max: 8 }),
  }
})
after(async () => {
  await Promise.all([w.owner.end(), w.api.end()])
  await w.db.drop()
})

describe('the guarded reservation, 0102 installed', () => {
  it('reserves a matched automatic turn and a legacy one, each bound to its turn', async () => {
    const a = await person()
    const { turnId } = await automatic(a)
    assert.equal(await withActor(w.api, a.id, 'read', (c) => readPersonalAnswerOrigin(c, turnId)), 'automatic')
    const matched = await reserve(a, turnId, await claim(a, turnId))
    assert.equal(matched.outcome, 'reserved')
    assert.deepEqual(await effects(a), { usage: 1, bound: 1 })

    const b = await person()
    const turn = await legacy(b)
    assert.equal(await withActor(w.api, b.id, 'read', (c) => readPersonalAnswerOrigin(c, turn)), 'legacy')
    // A legacy turn is 0080's whatever the fresh profile (none here).
    assert.equal((await reserve(b, turn, await claim(b, turn), null)).outcome, 'reserved')
    assert.deepEqual(await effects(b), { usage: 1, bound: 1 })
    assert.deepEqual(await withActor(w.api, b.id, 'read', (c) => readPersonalAnswerRefusals(c)), [])
  })

  it('refuses a changed profile before any reservation, once per decision, with names only', async () => {
    const p = await person()
    const { turnId, inputId } = await automatic(p)
    const claimed = await claim(p, turnId)
    for (const change of [{ model: 'synthetic-model-2' }, { reasoningEffort: 'high' }, { maxTokens: 511 }]) {
      assert.equal((await reserve(p, turnId, claimed, { ...p.profile, ...change })).outcome, 'profile_mismatch')
    }
    assert.equal((await reserve(p, turnId, claimed, null)).outcome, 'profile_unsupported')
    assert.deepEqual(await effects(p), { usage: 0, bound: 0 })
    const refusals = await withActor(w.api, p.id, 'read', (c) => readPersonalAnswerRefusals(c))
    assert.equal(refusals.length, 1)
    const [r] = refusals
    assert.ok(r)
    assert.deepEqual(
      { inputId: r.inputId, turnId: r.turnId, seq: r.decisionSeq, reason: r.reason, attempts: r.attempts },
      { inputId, turnId, seq: 1, reason: 'profile_unsupported', attempts: 4 },
    )
    // Another owner reads none of it.
    const q = await person()
    assert.deepEqual(await withActor(w.api, q.id, 'read', (c) => readPersonalAnswerRefusals(c)), [])
    // The matching profile reserves still.
    assert.equal((await reserve(p, turnId, claimed)).outcome, 'reserved')
  })

  it('a record-only input is automatic and never paid: not_admitted, a no-decision diagnostic', async () => {
    const p = await person()
    const r = await withActor(w.api, p.id, 'write', (c) =>
      sendPersonalInput(c, randomUUID(), { contract: PERSONAL_AUTOMATIC_V1, epoch: 0, text: 'Held' }),
    )
    // Forged pending (no writer makes a record-only turn pending), as a fail-closed control.
    await owner(`UPDATE sophia.personal_turns SET reply='pending', asked_at=now() WHERE id=$1`, [r.turnId])
    const claimed = await claim(p, r.turnId)
    assert.equal((await reserve(p, r.turnId, claimed)).outcome, 'not_admitted')
    assert.equal((await reserve(p, r.turnId, claimed)).outcome, 'not_admitted')
    assert.deepEqual(await effects(p), { usage: 0, bound: 0 })
    const [refusal, ...more] = await withActor(w.api, p.id, 'read', (c) => readPersonalAnswerRefusals(c))
    assert.equal(more.length, 0)
    assert.deepEqual(
      [refusal?.reason, refusal?.decisionSeq, refusal?.attempts, refusal?.fields],
      ['no_decision', 0, 2, []],
    )
  })
})

describe('the guarded reservation, 0102 absent: positive origin, fail closed', () => {
  before(async () => {
    await owner(`ALTER FUNCTION ${GUARD} RENAME TO reserve_personal_answer_guarded_absent`)
  })
  after(async () => {
    await owner(
      `ALTER FUNCTION sophia.reserve_personal_answer_guarded_absent(uuid,text,text,bigint,uuid,uuid,jsonb)
        RENAME TO reserve_personal_answer_guarded`,
    )
  })

  it('an automatic turn reserves nothing (not_installed); a legacy one reserves through 0080', async () => {
    assert.equal(await personalAnswerGuardInstalled(w.api), false)
    const a = await person()
    const { turnId } = await automatic(a)
    assert.equal((await reserve(a, turnId, await claim(a, turnId))).outcome, 'not_installed')
    assert.deepEqual(await effects(a), { usage: 0, bound: 0 })

    const b = await person()
    const turn = await legacy(b)
    assert.equal((await reserve(b, turn, await claim(b, turn), null)).outcome, 'reserved')
    assert.deepEqual(await effects(b), { usage: 1, bound: 1 })
  })

  it('an automatic answer already kept is still written from what was kept: kept, nothing new reserved', async () => {
    const p = await person()
    const { turnId } = await automatic(p)
    const claimed = await claim(p, turnId)
    // Kept while the guard was there (renamed back for this one reservation), then the guard is gone again.
    await owner(
      `ALTER FUNCTION sophia.reserve_personal_answer_guarded_absent(uuid,text,text,bigint,uuid,uuid,jsonb)
        RENAME TO reserve_personal_answer_guarded`,
    )
    const first = await reserve(p, turnId, claimed)
    await owner(`ALTER FUNCTION ${GUARD} RENAME TO reserve_personal_answer_guarded_absent`)
    assert.equal(first.outcome, 'reserved')
    const kept = await withActor(w.api, p.id, 'write', (c) =>
      settlePersonalCompanionAnswer(
        c,
        first.callId,
        { micros: 3, counts: { inputTokens: 1, outputTokens: 1 } },
        { text: 'Kept', suggestion: null },
      ),
    )
    assert.equal(kept, 'kept')
    assert.equal((await reserve(p, turnId, claimed, null)).outcome, 'kept')
    assert.deepEqual(await effects(p), { usage: 1, bound: 1 })
  })

  it('a failed origin read throws: never read as legacy, nothing reserved', async () => {
    const p = await person()
    const { turnId } = await automatic(p)
    const claimed = await claim(p, turnId)
    await owner('REVOKE SELECT ON sophia.personal_inputs FROM sophia_api')
    try {
      await assert.rejects(reserve(p, turnId, claimed))
    } finally {
      await owner('GRANT SELECT ON sophia.personal_inputs TO sophia_api')
    }
    assert.deepEqual(await effects(p), { usage: 0, bound: 0 })
  })
})

describe('the guarded reservation: a failed guard fails closed', () => {
  it('a guard the API role can no longer run throws; nothing falls back to 0080', async () => {
    const p = await person()
    const turn = await legacy(p)
    const claimed = await claim(p, turn)
    await owner(`REVOKE EXECUTE ON FUNCTION ${GUARD} FROM sophia_api`)
    try {
      await assert.rejects(reserve(p, turn, claimed, null))
    } finally {
      await owner(`GRANT EXECUTE ON FUNCTION ${GUARD} TO sophia_api`)
    }
    assert.deepEqual(await effects(p), { usage: 0, bound: 0 })
  })
})
