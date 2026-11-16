// INC03-CC-002 P2 (amendment A52, migrations 0098 and 0099), level: sql-run. POST /api/v1/personal/inputs over real
// HTTP, the real API and a disposable PostgreSQL: the owner's message kept as an automatic_v1 input, held, with no
// effect; every Personal read lists it, through the canonical generated parsers. A counting wrapper around the keyless
// rehearsal companion shows what the legacy path still asks and that nothing is asked for a held input. Every person,
// key and word is synthetic; no model, provider or network is called.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import type { PersonalInputRecorded } from '@sophia/contracts'
import {
  parsePersonalEarlierTurns,
  parsePersonalExport,
  parsePersonalReceipt,
  parsePersonalSpace,
  parsePersonalTurnPage,
} from '@sophia/contracts/validate'
import { createPool } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { rehearsalCompanion } from './companion-rehearsal.ts'
import type { Companion } from './companion.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const LEAD = randomUUID() // admin of the shared project
const LUIS = randomUUID() // a member someone names in their own space
const GUEST = randomUUID() // an anonymous guest

let db: TestDatabase
let pool: pg.Pool
let on: FastifyInstance // built with Personal inputs
let off: FastifyInstance // the same API without them (the default): also the flag rolled back
let onBase: string
let offBase: string
const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })

/** What the companion was asked, in order: its answers' contexts and its welcomes'. */
const asked: Array<{ kind: 'answer' | 'greet'; context: unknown }> = []
function countingCompanion(): Companion {
  const inner = rehearsalCompanion(0)
  return {
    mode: inner.mode,
    answer: (context, signal, companionCall) => {
      asked.push({ kind: 'answer', context })
      return inner.answer(context, signal, companionCall)
    },
    greet: (context, name, signal) => {
      asked.push({ kind: 'greet', context })
      return inner.greet(context, name, signal)
    },
  }
}

const token = (sub: string) =>
  new SignJWT({
    role: 'authenticated',
    ...(sub === GUEST ? { is_anonymous: true } : { email: `${sub.slice(0, 8)}@sophia.test` }),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

interface Call {
  as: string
  at?: string
  body?: unknown
  key?: string | null
  epoch?: number | string | null
  method?: 'GET' | 'POST'
}

async function call(path: string, init: Call): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`${init.at ?? onBase}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      authorization: `Bearer ${await token(init.as)}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.key ? { 'idempotency-key': init.key } : {}),
      ...(init.epoch === undefined || init.epoch === null ? {} : { 'x-sophia-personal-epoch': String(init.epoch) }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : null }
}

const AUTO = 'automatic_v1'
const space = async (as: string, at?: string) =>
  parsePersonalSpace((await call('/api/v1/personal', { as, ...(at ? { at } : {}) })).json)
const epochOf = async (as: string) => (await space(as)).epoch

/** A held input as a client sends it: against the epoch it last read. */
async function hold(as: string, text: string, key = randomUUID(), epoch?: number) {
  return call('/api/v1/personal/inputs', {
    as,
    key,
    epoch: epoch ?? (await epochOf(as)),
    body: { interactionContract: AUTO, text },
  })
}

/** The receipt, checked whole: its keys, its turn by the canonical PersonalTurn (through the page parser), its input. */
function recorded(r: { status: number; json: Record<string, unknown> | null }): PersonalInputRecorded {
  assert.equal(r.status, 202, JSON.stringify(r.json))
  const body = r.json
  assert.ok(body)
  assert.deepEqual(Object.keys(body).toSorted(), ['input', 'revision', 'turn'])
  const [turn] = parsePersonalTurnPage({ revision: body.revision, turns: [body.turn], pending: false }).turns
  assert.ok(turn)
  const input = body.input
  assert.ok(typeof input === 'object' && input !== null)
  assert.deepEqual(Object.keys(input).toSorted(), ['contractVersion', 'effect', 'id', 'interactionContract', 'state'])
  const ref = { ...input } as Record<string, unknown>
  assert.deepEqual([ref.interactionContract, ref.contractVersion, ref.state, ref.effect], [AUTO, 1, 'recorded', 'none'])
  assert.match(String(ref.id), /^[0-9a-f-]{36}$/)
  assert.deepEqual([turn.author, turn.reply, turn.replyTo, turn.suggestion], ['person', 'recorded', null, null])
  return { revision: Number(body.revision), turn, input: { ...input } as PersonalInputRecorded['input'] }
}

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

/** Every table of the schema, counted: what any effect would have to add a row to. */
async function everyTable(): Promise<Record<string, number>> {
  const tables = await owner<{ name: string }>(
    `SELECT format('%I.%I', schemaname, tablename) AS name FROM pg_catalog.pg_tables
      WHERE schemaname = 'sophia' ORDER BY 1`,
  )
  const counts: Record<string, number> = {}
  for (const { name } of tables)
    counts[name] = Number((await owner<{ n: string }>(`SELECT count(*) AS n FROM ${name}`))[0]?.n ?? 0)
  return counts
}

/** The tables a held write adds to, by how many rows. */
function grown(was: Record<string, number>, now: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(now)
      .filter(([t, n]) => n !== was[t])
      .map(([t, n]) => [t, n - (was[t] ?? 0)]),
  )
}

const rowsOf = async (person: string) =>
  (
    await owner<{ turns: number; inputs: number }>(
      `SELECT (SELECT count(*)::int FROM sophia.personal_turns WHERE owner_id=$1) AS turns,
              (SELECT count(*)::int FROM sophia.personal_inputs WHERE owner_id=$1) AS inputs`,
      [person],
    )
  )[0]

/**
 * A2-T01: until the person's turn `turnId` reads `answered` through the public poll (GET /api/v1/personal/turns), within
 * `ms`. A 202 commits the person's turn and starts the companion's answer; it does not wait for it. Fails by assertion
 * if the answer does not come in time.
 */
async function answeredWithin(as: string, turnId: string, ms: number, at?: string): Promise<void> {
  const end = Date.now() + ms
  for (;;) {
    const page = parsePersonalTurnPage(
      (await call('/api/v1/personal/turns?after=0', { as, ...(at ? { at } : {}) })).json,
    )
    if (page.turns.find((t) => t.id === turnId)?.reply === 'answered') return
    if (Date.now() > end) assert.fail(`turn ${turnId} was not answered within ${String(ms)} ms`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  await seedProject(db.ownerUrl, { title: 'Launch plan', admin: LEAD, editors: [LUIS] })
  on = buildApp({ pool, verifyActor, companion: countingCompanion(), personalInputs: true })
  off = buildApp({ pool, verifyActor, companion: countingCompanion() })
  await on.listen({ port: 0, host: '127.0.0.1' })
  await off.listen({ port: 0, host: '127.0.0.1' })
  onBase = `http://127.0.0.1:${String((on.server.address() as AddressInfo).port)}`
  offBase = `http://127.0.0.1:${String((off.server.address() as AddressInfo).port)}`
})
after(async () => {
  await on.close()
  await off.close()
  await pool.end()
  await db.drop()
})

describe('off by default', () => {
  it('without personalInputs the route does not exist (404) and nothing is written', async () => {
    const person = randomUUID()
    const r = await call('/api/v1/personal/inputs', {
      as: person,
      at: offBase,
      key: randomUUID(),
      epoch: 0,
      body: { interactionContract: AUTO, text: 'Not served.' },
    })
    assert.equal(r.status, 404)
    assert.deepEqual(await rowsOf(person), { turns: 0, inputs: 0 })
  })
})

describe('a held Personal input over HTTP', () => {
  it('keeps the words once, held, and answers the exact turn with no effect: nothing asked, no other table grows', async () => {
    const person = randomUUID()
    await space(person)
    const was = await everyTable()
    const calls = asked.length
    const got = recorded(await hold(person, 'Mine to keep, for now.'))
    // Read as every Personal read shows it: the same turn.
    const s = await space(person)
    assert.deepEqual(s.turns, [got.turn])
    assert.equal(got.revision, s.revision)
    assert.equal(got.turn.text, 'Mine to keep, for now.')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(asked.length, calls, 'the companion was asked nothing')
    assert.deepEqual(grown(was, await everyTable()), {
      'sophia.personal_inputs': 1,
      'sophia.personal_requests': 1,
      'sophia.personal_spaces': 1,
      'sophia.personal_turns': 1,
    })
    const poll = parsePersonalTurnPage((await call('/api/v1/personal/turns?after=0', { as: person })).json)
    assert.equal(poll.pending, false, 'a held turn is not waited for')
  })

  it('replays its key; a new key at the current epoch keeps another; other words or another operation conflict', async () => {
    const person = randomUUID()
    const key = randomUUID()
    const first = recorded(await hold(person, 'Once.', key))
    const again = recorded(await hold(person, 'Once.', key))
    assert.deepEqual(again, first)
    const second = recorded(await hold(person, 'Twice.'))
    assert.notEqual(second.turn.id, first.turn.id)
    assert.ok(second.turn.seq > first.turn.seq)
    const changed = await hold(person, 'Other words.', key)
    assert.deepEqual([changed.status, changed.json?.code], [409, 'idempotency_conflict'])
    // The one Personal key namespace: a legacy message under a held input's key, and the other way round.
    const legacyUnderHeld = await call('/api/v1/personal/turns', {
      as: person,
      key,
      epoch: await epochOf(person),
      body: { text: 'Once.' },
    })
    assert.deepEqual([legacyUnderHeld.status, legacyUnderHeld.json?.code], [409, 'idempotency_conflict'])
    const legacyKey = randomUUID()
    const legacy = await call('/api/v1/personal/turns', {
      as: person,
      key: legacyKey,
      epoch: await epochOf(person),
      body: { text: 'Asked, the legacy way.' },
    })
    const legacyReceipt = parsePersonalReceipt(legacy.json)
    assert.equal(legacyReceipt.operation, 'send_turn')
    const heldUnderLegacy = await hold(person, 'Asked, the legacy way.', legacyKey)
    assert.deepEqual([heldUnderLegacy.status, heldUnderLegacy.json?.code], [409, 'idempotency_conflict'])
    // The legacy 202 started the companion's answer without waiting for it (A2-T01): its turn is observed answered
    // before the final count, which then includes Sophia's reply.
    assert.ok(legacyReceipt.turnId)
    await answeredWithin(person, legacyReceipt.turnId, 15_000)
    assert.deepEqual(await rowsOf(person), { turns: 4, inputs: 2 })
  })

  it('a write against an older epoch, or under a key from before an erasure, is refused and writes nothing', async () => {
    const person = randomUUID()
    const key = randomUUID()
    recorded(await hold(person, 'Before erasing.', key))
    const erased = await call('/api/v1/personal/erasure', {
      as: person,
      key: randomUUID(),
      body: { confirm: 'delete' },
    })
    assert.equal(erased.status, 202, JSON.stringify(erased.json))
    assert.deepEqual(await rowsOf(person), { turns: 0, inputs: 0 })
    const stale = await hold(person, 'Issued before the erasure.', randomUUID(), 0)
    assert.deepEqual([stale.status, stale.json?.code], [409, 'request_erased'])
    const oldKey = await hold(person, 'Before erasing.', key, 1)
    assert.deepEqual([oldKey.status, oldKey.json?.code], [409, 'request_erased'])
    assert.deepEqual(await rowsOf(person), { turns: 0, inputs: 0 })
    recorded(await hold(person, 'After erasing.', randomUUID(), 1))
  })

  it('a missing, null, other or non-string contract, any other field, or a bad header is refused (422); nothing kept', async () => {
    const person = randomUUID()
    const bodies: unknown[] = [
      { text: 'No contract.' },
      { interactionContract: null, text: 'Null.' },
      { interactionContract: 'legacy_explicit_ask', text: 'Legacy.' },
      { interactionContract: 'Automatic_v1', text: 'Case.' },
      { interactionContract: 1, text: 'Number.' },
      { interactionContract: true, text: 'Boolean.' },
      { interactionContract: AUTO },
      { interactionContract: AUTO, text: '' },
      { interactionContract: AUTO, text: 'x'.repeat(4001) },
      { interactionContract: AUTO, text: 'Ask.', askSophia: true },
      { interactionContract: AUTO, text: 'Owner.', ownerId: LEAD },
      { interactionContract: AUTO, text: 'Audience.', audience: 'project' },
      { interactionContract: AUTO, text: 'Project.', projectId: randomUUID() },
      { interactionContract: AUTO, text: 'Mention.', mentions: [LUIS] },
      { interactionContract: AUTO, text: 'Context.', context: ['x'] },
      'automatic_v1',
      [{ interactionContract: AUTO, text: 'Array.' }],
    ]
    for (const body of bodies) {
      const r = await call('/api/v1/personal/inputs', { as: person, key: randomUUID(), epoch: 0, body })
      assert.equal(r.status, 422, JSON.stringify(body))
    }
    const good = { interactionContract: AUTO, text: 'Headers.' }
    for (const [key, epoch] of [
      [null, 0],
      [randomUUID(), null],
      [randomUUID(), '-1'],
      [randomUUID(), '01'],
      [randomUUID(), '1234567890123456'],
    ] as const) {
      const r = await call('/api/v1/personal/inputs', { as: person, key, epoch, body: good })
      assert.equal(r.status, 422, `${String(key)} ${String(epoch)}`)
    }
    assert.deepEqual(await rowsOf(person), { turns: 0, inputs: 0 })
  })

  it('the owner alone: a guest is refused, another person and a project admin read none of it', async () => {
    const person = randomUUID()
    await seedProject(db.ownerUrl, { title: 'Hers too', admin: LEAD, editors: [person] })
    assert.equal((await hold(GUEST, 'A guest.', randomUUID(), 0)).status, 403)
    recorded(await hold(person, 'Only mine.'))
    for (const reader of [LEAD, LUIS, randomUUID()]) {
      const s = await space(reader)
      assert.equal(JSON.stringify(s).includes('Only mine.'), false, reader)
    }
  })

  it('naming a member is not addressing them: no need, mention or notice for them, and nothing asked', async () => {
    const person = randomUUID()
    await seedProject(db.ownerUrl, { title: 'Shared', admin: person, editors: [LUIS] })
    const needs = async () => {
      const r = await call('/api/v1/me/needs', { as: LUIS })
      assert.equal(r.status, 200, JSON.stringify(r.json))
      return { ...r.json, readAt: 'x' }
    }
    const was = await needs()
    const tables = await everyTable()
    const calls = asked.length
    recorded(await hold(person, `Luis should hear about this, @Luis ${LUIS}.`))
    assert.deepEqual(await needs(), was)
    assert.equal(asked.length, calls)
    assert.deepEqual(Object.keys(grown(tables, await everyTable())).toSorted(), [
      'sophia.personal_inputs',
      'sophia.personal_requests',
      'sophia.personal_spaces',
      'sophia.personal_turns',
    ])
  })
})

describe('every Personal reader takes a held turn', () => {
  it('the space, the poll, reading back and the export all parse it with the canonical parsers', async () => {
    const person = randomUUID()
    const held = recorded(await hold(person, 'Held, then read everywhere.'))
    const legacy = await call('/api/v1/personal/turns', {
      as: person,
      key: randomUUID(),
      epoch: await epochOf(person),
      body: { text: 'A later legacy message.' },
    })
    assert.equal(legacy.status, 202)
    const s = await space(person)
    const page = parsePersonalTurnPage((await call('/api/v1/personal/turns?after=0', { as: person })).json)
    const earlier = parsePersonalEarlierTurns(
      (await call(`/api/v1/personal/turns/earlier?before=${String(held.turn.seq + 1)}`, { as: person })).json,
    )
    const exported = parsePersonalExport(
      (await call('/api/v1/personal/export?after=0', { as: person, epoch: s.epoch })).json,
    )
    for (const turns of [s.turns, page.turns, earlier.turns, exported.turns])
      assert.deepEqual(
        turns.find((t) => t.id === held.turn.id),
        held.turn,
      )
  })

  it('turned off again, the API still reads what was kept; the route is gone and writes nothing', async () => {
    const person = randomUUID()
    const held = recorded(await hold(person, 'Kept while it was on.'))
    const s = await space(person, offBase)
    assert.deepEqual(
      s.turns.find((t) => t.id === held.turn.id),
      held.turn,
    )
    const gone = await call('/api/v1/personal/inputs', {
      as: person,
      at: offBase,
      key: randomUUID(),
      epoch: s.epoch,
      body: { interactionContract: AUTO, text: 'After it was turned off.' },
    })
    assert.equal(gone.status, 404)
    assert.deepEqual(await rowsOf(person), { turns: 1, inputs: 1 })
  })
})

describe('the legacy Personal message is unchanged beside held inputs', () => {
  it('is answered by the companion, from the legacy conversation only: the held words are not in what it was asked', async () => {
    const person = randomUUID()
    recorded(await hold(person, 'Private held words.'))
    const calls = asked.length
    const sent = parsePersonalReceipt(
      (
        await call('/api/v1/personal/turns', {
          as: person,
          key: randomUUID(),
          epoch: await epochOf(person),
          body: { text: 'Please answer me.' },
        })
      ).json,
    )
    assert.equal(sent.operation, 'send_turn')
    for (let i = 0; i < 100; i += 1) {
      const page = parsePersonalTurnPage((await call('/api/v1/personal/turns?after=0', { as: person })).json)
      if (!page.pending) break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const mine = asked.slice(calls)
    assert.equal(mine.length, 1)
    assert.equal(mine[0]?.kind, 'answer')
    assert.equal(JSON.stringify(mine).includes('Private held words.'), false)
    assert.ok(JSON.stringify(mine).includes('Please answer me.'))
    const s = await space(person)
    assert.deepEqual(
      s.turns.map((t) => [t.author, t.reply]),
      [
        ['person', 'recorded'],
        ['person', 'answered'],
        ['sophia', null],
      ],
    )
  })
})

describe('a database without 0099', () => {
  it('answers projection_unavailable (503) without a database message, and writes nothing', async () => {
    const person = randomUUID()
    const [{ def } = { def: '' }] = await owner<{ def: string }>(
      "SELECT pg_get_functiondef('sophia.personal_welcome_due()'::regprocedure) AS def",
    )
    assert.ok(def.includes('recorded'))
    // 0021's helper, as a database that has not reached 0099 has it.
    await owner(def.replace("\n    AND NOT (t.author='person' AND t.reply IS NOT DISTINCT FROM 'recorded')", ''))
    try {
      const fresh = buildApp({ pool, verifyActor, personalInputs: true })
      await fresh.ready()
      const r = await fresh.inject({
        method: 'POST',
        url: '/api/v1/personal/inputs',
        headers: {
          authorization: `Bearer ${await token(person)}`,
          'idempotency-key': randomUUID(),
          'x-sophia-personal-epoch': '0',
          'content-type': 'application/json',
        },
        payload: { interactionContract: AUTO, text: 'Not here yet.' },
      })
      await fresh.close()
      assert.equal(r.statusCode, 503)
      assert.equal(r.json<{ code: string }>().code, 'projection_unavailable')
      assert.equal(r.body.includes('personal_welcome_due'), false)
      assert.deepEqual(await rowsOf(person), { turns: 0, inputs: 0 })
    } finally {
      await owner(def)
    }
  })
})

describe('A2-T01: the answer observer waits for the answer, and fails when none comes', () => {
  // A rehearsal whose answers wait at a gate, one per asked text, until the test opens it.
  const gates = new Map<string, PromiseWithResolvers<void>>()
  const gate = (text: string) => {
    let g = gates.get(text)
    if (!g) {
      g = Promise.withResolvers<void>()
      gates.set(text, g)
    }
    return g
  }
  let gated: FastifyInstance
  let gatedBase = ''
  before(async () => {
    const inner = rehearsalCompanion(0)
    const companion: Companion = {
      mode: inner.mode,
      answer: async (context, signal, companionCall) => {
        await gate(context.asked.text).promise
        return inner.answer(context, signal, companionCall)
      },
      greet: (context, name, signal) => inner.greet(context, name, signal),
    }
    gated = buildApp({ pool, verifyActor, companion, personalInputs: true })
    await gated.listen({ port: 0, host: '127.0.0.1' })
    gatedBase = `http://127.0.0.1:${String((gated.server.address() as AddressInfo).port)}`
  })
  after(async () => {
    for (const g of gates.values()) g.resolve()
    await gated.close()
  })

  const send = async (person: string, text: string) => {
    const r = await call('/api/v1/personal/turns', {
      as: person,
      at: gatedBase,
      key: randomUUID(),
      epoch: await epochOf(person),
      body: { text },
    })
    assert.equal(r.status, 202, JSON.stringify(r.json))
    const { turnId } = parsePersonalReceipt(r.json)
    assert.ok(turnId)
    return turnId
  }

  it('never completing: the observer fails by assertion at its deadline, and the reply is not counted', async () => {
    const person = randomUUID()
    const turnId = await send(person, 'An answer that never comes.')
    await assert.rejects(answeredWithin(person, turnId, 400, gatedBase), assert.AssertionError)
    assert.deepEqual(await rowsOf(person), { turns: 1, inputs: 0 })
  })

  it('delayed: the observer resolves only once the held answer is released and written', async () => {
    const person = randomUUID()
    const text = 'An answer held at the gate.'
    const turnId = await send(person, text)
    let released = false
    const observed = answeredWithin(person, turnId, 15_000, gatedBase).then(() => released)
    // The answer is held: only the person's turn is kept so far.
    assert.deepEqual(await rowsOf(person), { turns: 1, inputs: 0 })
    released = true
    gate(text).resolve()
    assert.equal(await observed, true, 'the observer resolved only after the release')
    assert.deepEqual(await rowsOf(person), { turns: 2, inputs: 0 })
  })
})
