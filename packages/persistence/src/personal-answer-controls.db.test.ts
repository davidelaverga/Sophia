// INC03-CC-003 A3 (migration 0103): the owner's control of an automatic Personal answer through the API login and
// withActor on a disposable PostgreSQL. Every person, key, word, payer and profile is synthetic: no key, model, provider
// or network is called. Checked here: installation read positively (its marker renamed, as a database without 0103
// would lack it; a failed read thrown, never "absent"); the typed callers and their replay; withheld late answers; the
// companion's context and every owner read of a withdrawn input and its answers; and welcome activity, TS against SQL.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import {
  beginCompanionCall,
  beginPersonalGreeting,
  claimPersonalReply,
  readCompanionContext,
  readPersonalControlledExport,
  readPersonalControlledTurns,
  readWelcomeContext,
  sendPersonalTurn,
} from './personal.ts'
import { PERSONAL_ANSWER_V1, sendPersonalAnswerInput, type PersonalAnswerProfile } from './personal-admission.ts'
import {
  beginPersonalAnswerLaunch,
  controlPersonalAnswerInput,
  personalAnswerControlled,
  personalAnswerControlsInstalled,
  readPersonalAnswerControl,
  readPersonalAnswerControlLog,
  readPersonalWithheldAnswer,
  reserveControlledPersonalAnswer,
  type PersonalAnswerExecution,
} from './personal-answer-controls.ts'
import {
  readPersonalSettledAnswer,
  recordPersonalSettledReply,
  settlePersonalCompanionAnswer,
} from './personal-usage.ts'
import { withActor } from './tx.ts'

interface World {
  db: TestDatabase
  owner: pg.Pool
  api: pg.Pool
}
let w: World

const owner = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await w.owner.query<T>(sql, params)).rows

const MARKER = 'sophia.personal_answer_controls_protocol()'
const COUNTS = { inputTokens: 1, outputTokens: 1 }

/** A person with a payer the operator admitted for them, and the profile (and execution) the settings make. */
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
const executionOf = (p: Person): PersonalAnswerExecution => ({ ...p.profile, version: 1 })

async function automatic(p: Person, text: string): Promise<{ turnId: string; inputId: string }> {
  const r = await withActor(w.api, p.id, 'write', (c) =>
    sendPersonalAnswerInput(c, randomUUID(), { contract: PERSONAL_ANSWER_V1, epoch: 0, text, profile: p.profile }),
  )
  assert.equal(r.decision.outcome, 'admitted')
  return { turnId: r.turnId, inputId: r.inputId }
}

async function legacy(p: Person, text: string): Promise<string> {
  const r = await withActor(w.api, p.id, 'write', (c) => sendPersonalTurn(c, randomUUID(), text))
  assert.ok(r.turnId)
  return r.turnId
}

async function claim(p: Person, turnId: string): Promise<string> {
  const claimed = await withActor(w.api, p.id, 'write', (c) => claimPersonalReply(c, turnId))
  assert.ok(claimed)
  return claimed
}

/** One controlled reservation under a registered call, as the live companion makes it. */
async function reserve(p: Person, turnId: string, claimed: string) {
  const callId = randomUUID()
  const r = await withActor(w.api, p.id, 'write', async (c) => {
    await beginCompanionCall(c, callId)
    return reserveControlledPersonalAnswer(
      c,
      { callId, turnId, claim: claimed },
      { payer: p.payer, routeId: 'synthetic-route', micros: 10, profile: p.profile },
      executionOf(p),
    )
  })
  return { ...r, callId }
}

/** A turn answered as the live companion answers it: reserved, granted, settled with its answer, written. */
async function answered(p: Person, turnId: string, words: string): Promise<string> {
  const claimed = await claim(p, turnId)
  const r = await reserve(p, turnId, claimed)
  assert.equal(r.outcome, 'reserved')
  assert.equal(
    await withActor(w.api, p.id, 'write', (c) => beginPersonalAnswerLaunch(c, r.callId, claimed, r.executionDigest)),
    'granted',
  )
  assert.equal(
    await withActor(w.api, p.id, 'write', (c) =>
      settlePersonalCompanionAnswer(c, r.callId, { micros: 5, counts: COUNTS }, { text: words, suggestion: null }),
    ),
    'kept',
  )
  assert.ok(await withActor(w.api, p.id, 'write', (c) => recordPersonalSettledReply(c, turnId, claimed)))
  await owner('DELETE FROM sophia.personal_companion_calls WHERE call_id=$1', [r.callId])
  return r.callId
}

const cancel = (p: Person, inputId: string, expectedRevision = 0, key = randomUUID()) =>
  withActor(w.api, p.id, 'write', (c) =>
    controlPersonalAnswerInput(
      c,
      { key, inputId, action: 'cancel', expectedRevision, epoch: 0, text: null },
      { profile: p.profile, admission: true },
    ),
  )

/** A pool whose marker read fails as a lost connection would: never to be read as "not installed". */
function failingMarker(base: pg.Pool): pg.Pool {
  const query = (...args: Parameters<pg.Pool['query']>): unknown => {
    const [first] = args
    const text = typeof first === 'string' ? first : ''
    if (text.includes('personal_answer_controls_protocol'))
      return Promise.reject(Object.assign(new Error('synthetic connection lost'), { code: '08006' }))
    return (base.query as (...a: unknown[]) => unknown)(...args)
  }
  return new Proxy(base, {
    get(target, key) {
      if (key === 'query') return query
      const value: unknown = Reflect.get(target, key)
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
    },
  })
}

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

describe('A3 installation, typed callers and replay', () => {
  it('reads installation positively: absent only when the marker is, a failed read is thrown', async () => {
    assert.equal(await personalAnswerControlsInstalled(w.api), true)
    await owner(`ALTER FUNCTION ${MARKER} RENAME TO personal_answer_controls_protocol_absent`)
    try {
      assert.equal(await personalAnswerControlsInstalled(w.api), false)
      const p = await person()
      assert.equal(await withActor(w.api, p.id, 'read', (c) => personalAnswerControlled(c)), false)
    } finally {
      await owner(
        'ALTER FUNCTION sophia.personal_answer_controls_protocol_absent() RENAME TO personal_answer_controls_protocol',
      )
    }
    await assert.rejects(personalAnswerControlsInstalled(failingMarker(w.api)), /synthetic connection lost/)
  })

  it('tags a controlled reservation, grants one launch, and remembers a control as its receipt', async () => {
    const p = await person()
    const x = await automatic(p, 'Plan my Thursday')
    const claimed = await claim(p, x.turnId)
    const r = await reserve(p, x.turnId, claimed)
    assert.equal(r.outcome, 'reserved')
    assert.match(r.executionDigest, /^sha256:[0-9a-f]{64}$/)
    const launch = (digest: string) =>
      withActor(w.api, p.id, 'write', (c) => beginPersonalAnswerLaunch(c, r.callId, claimed, digest))
    assert.equal(await launch(r.executionDigest), 'granted')
    assert.equal(await launch(r.executionDigest), 'already_launched', 'a replayed grant never launches again')
    const key = randomUUID()
    const first = await cancel(p, x.inputId, 0, key)
    assert.equal(first.replayed, false)
    assert.equal(first.receipt.outcome, 'applied')
    assert.equal(first.receipt.phase, 'after_launch')
    assert.deepEqual(first.receipt.prior, { financial: 'unresolved', effect: 'possible', answer: 'in_progress' })
    const again = await cancel(p, x.inputId, 0, key)
    assert.equal(again.replayed, true)
    assert.deepEqual(again.receipt, first.receipt, 'a replay returns the remembered receipt')
    const view = await withActor(w.api, p.id, 'read', (c) => readPersonalAnswerControl(c, x.inputId))
    assert.equal((view.control as { state: string }).state, 'withdrawn')
    const log = await withActor(w.api, p.id, 'read', (c) => readPersonalAnswerControlLog(c, 0))
    assert.equal(log.items.length, 1)
    assert.equal(log.next, null)
    // The late answer of its original call is withheld for this call; nothing is kept for publication.
    assert.equal(
      await withActor(w.api, p.id, 'write', (c) =>
        settlePersonalCompanionAnswer(c, r.callId, { micros: 6, counts: COUNTS }, { text: 'Late', suggestion: 'n' }),
      ),
      'settled',
    )
    assert.deepEqual(await withActor(w.api, p.id, 'read', (c) => readPersonalWithheldAnswer(c, r.callId)), {
      text: 'Late',
      suggestion: 'n',
    })
    assert.equal(await withActor(w.api, p.id, 'read', (c) => readPersonalSettledAnswer(c, x.turnId)), null)
    assert.equal(await withActor(w.api, p.id, 'read', (c) => personalAnswerControlled(c)), true)
  })
})

describe('A3 context and owner reads of a withdrawn input', () => {
  it('keeps a withdrawn input and its answer out of the context, before the window, and in every owner read', async () => {
    const p = await person()
    const t1 = await legacy(p, 'Earlier words')
    await answered(p, t1, 'Earlier answer')
    const x = await automatic(p, 'Withdrawn words')
    await answered(p, x.turnId, 'Answer to withdrawn')
    assert.equal((await cancel(p, x.inputId)).receipt.phase, 'after_publication')
    const t3 = await legacy(p, 'Now this')
    const claimed = await claim(p, t3)
    const context = await withActor(w.api, p.id, 'write', (c) => readCompanionContext(c, t3, claimed, 2))
    assert.ok(context)
    const texts = context.history.map((h) => h.text)
    assert.ok(!texts.includes('Withdrawn words') && !texts.includes('Answer to withdrawn'), 'no withdrawn context')
    assert.deepEqual(texts, ['Earlier answer', 'Now this'], 'the window is filled from eligible turns only')

    const page = await withActor(w.api, p.id, 'read', (c) => readPersonalControlledTurns(c, {}))
    const xTurn = page.turns.find((t) => t.id === x.turnId)
    const xReply = page.turns.find((t) => t.replyTo === x.turnId)
    assert.ok(xTurn && xReply)
    assert.equal(xTurn.reply, 'answered', 'an answered input stays answered')
    assert.deepEqual(xTurn.input, { inputId: x.inputId, control: 'withdrawn', revision: 1 })
    assert.equal(xTurn.prompt, 'excluded')
    assert.equal(xTurn.activity, true)
    assert.equal(xReply.prompt, 'excluded')
    assert.equal(page.turns.find((t) => t.id === t1)?.prompt, 'eligible')
    const later = await withActor(w.api, p.id, 'read', (c) => readPersonalControlledTurns(c, { after: 0 }))
    assert.equal(later.turns.length, page.turns.length)
    const exported = await withActor(w.api, p.id, 'read', (c) => readPersonalControlledExport(c, 0))
    assert.equal(exported.turns.length, page.turns.length)
    assert.equal(exported.inputs.length, 1)
    assert.equal(exported.next, null)

    // Positively without 0103 the context is b760's: the same read then includes the input (the branch is real).
    await owner(`ALTER FUNCTION ${MARKER} RENAME TO personal_answer_controls_protocol_absent`)
    try {
      const old = await withActor(w.api, p.id, 'write', (c) => readCompanionContext(c, t3, claimed, 20))
      assert.ok(old?.history.some((h) => h.text === 'Withdrawn words'))
    } finally {
      await owner(
        'ALTER FUNCTION sophia.personal_answer_controls_protocol_absent() RENAME TO personal_answer_controls_protocol',
      )
    }
  })
})

describe('A3 welcome activity: the TS and SQL gates agree', () => {
  /** SQL 0099's gate for the person, as begin and record greeting call it. */
  const sqlDue = async (p: Person): Promise<boolean> => {
    const c = await w.owner.connect()
    try {
      await c.query('BEGIN')
      await c.query(`SELECT set_config('sophia.actor_id', $1, true)`, [p.id])
      const { rows } = await c.query<{ due: boolean }>('SELECT sophia.personal_welcome_due() AS due')
      await c.query('ROLLBACK')
      return rows[0]?.due ?? false
    } finally {
      c.release()
    }
  }
  /** The TS gate: a welcome claim (SQL's gate) and then readWelcomeContext's own WELCOME_DUE. */
  const tsDue = (p: Person) =>
    withActor(w.api, p.id, 'write', async (c) => {
      const begun = await beginPersonalGreeting(c, randomUUID(), null)
      if (typeof begun !== 'object' || !('claim' in begun)) return { claimed: false, context: null }
      return { claimed: true, context: await readWelcomeContext(c, begun.claim) }
    })
  const age = (ids: string[]) =>
    owner(`UPDATE sophia.personal_turns SET created_at=now()-interval '2 hours' WHERE id=ANY($1::uuid[])`, [ids])

  it('counts a withdrawn admitted input as activity, but not in the welcome context', async () => {
    const p = await person()
    const x = await automatic(p, 'An old withdrawn wish')
    await cancel(p, x.inputId)
    await age([x.turnId])
    assert.equal(await sqlDue(p), true)
    const ts = await tsDue(p)
    assert.ok(ts.claimed && ts.context, 'both gates: due')
    assert.ok(!ts.context.history.some((h) => h.text === 'An old withdrawn wish'))
  })

  it('does not count a never-admitted cancelled replacement, kept recorded, as activity', async () => {
    const p = await person()
    const t1 = await legacy(p, 'Long ago')
    await answered(p, t1, 'Long ago answer')
    const x = await automatic(p, 'To replace')
    await answered(p, x.turnId, 'Its answer')
    const replaced = await withActor(w.api, p.id, 'write', (c) =>
      controlPersonalAnswerInput(
        c,
        { key: randomUUID(), inputId: x.inputId, action: 'replace', expectedRevision: 0, epoch: 0, text: 'Newer' },
        { profile: p.profile, admission: false },
      ),
    )
    const y = replaced.receipt.replacement
    assert.ok(y && y.state === 'held' && y.heldReason === 'admission_off')
    await cancel(p, y.inputId, 1)
    const [row] = await owner<{ reply: string }>('SELECT reply FROM sophia.personal_turns WHERE id=$1', [y.turnId])
    assert.equal(row?.reply, 'recorded', 'a never-admitted cancelled replacement stays recorded')
    // Everything but the cancelled replacement is old: it is the newest turn, and must not count as activity.
    const [old] = await owner<{ ids: string[] }>(
      `SELECT array_agg(id) AS ids FROM sophia.personal_turns WHERE owner_id=$1 AND id<>$2`,
      [p.id, y.turnId],
    )
    await age(old?.ids ?? [])
    assert.equal(await sqlDue(p), true)
    const ts = await tsDue(p)
    assert.ok(ts.claimed && ts.context, 'both gates: due, the cancelled replacement not counted')
  })

  it('counts an admitted replacement as activity: no welcome is due right after it', async () => {
    const p = await person()
    const x = await automatic(p, 'First wish')
    await answered(p, x.turnId, 'First answer')
    await withActor(w.api, p.id, 'write', (c) =>
      controlPersonalAnswerInput(
        c,
        { key: randomUUID(), inputId: x.inputId, action: 'replace', expectedRevision: 0, epoch: 0, text: 'Second' },
        { profile: p.profile, admission: true },
      ),
    )
    const [old] = await owner<{ ids: string[] }>(
      `SELECT array_agg(id) AS ids FROM sophia.personal_turns WHERE owner_id=$1 AND body<>'Second'`,
      [p.id],
    )
    await age(old?.ids ?? [])
    assert.equal(await sqlDue(p), false)
    assert.equal((await tsDue(p)).claimed, false)
  })
})
