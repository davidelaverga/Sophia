// PS-01 crossing (level: sql-run): the personal routes over real HTTP, the real API and PostgreSQL, with the keyless
// rehearsal companion. Members call with synthetic Supabase tokens. No model, LiveKit or Google is involved.
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  parsePersonalEarlierTurns,
  parsePersonalExport,
  parsePersonalReceipt,
  parsePersonalSpace,
  parsePersonalTurnPage,
  parseProjectList,
} from '@sophia/contracts/validate'
import { DomainError } from '@sophia/domain'
import { createPool, erasePersonalSpace, sendPersonalTurn, withActor } from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'
import { rehearsalCompanion } from './companion-rehearsal.ts'
import { ANSWER_LIMIT_MS, CompanionRunner } from './companion.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const ANA = randomUUID() // editor of the project, with her own space
const LEAD = randomUUID() // admin of the project
const OUT = randomUUID() // another person, in no project
const GUEST = randomUUID() // an anonymous guest

let db: TestDatabase
let pool: pg.Pool
let app: FastifyInstance
let quiet: FastifyInstance // the same API with no companion configured
let base: string
let quietBase: string
let projectId: string

const token = (sub: string, claims: Record<string, unknown>) =>
  new SignJWT({ role: 'authenticated', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))

const claimsOf = (sub: string) =>
  sub === GUEST
    ? { is_anonymous: true }
    : { email: `${sub === ANA ? 'ana' : sub === LEAD ? 'lead' : 'out'}@sophia.test` }

async function call(path: string, init: { as: string; body?: unknown; key?: string; at?: string; epoch?: number }) {
  const res = await fetch(`${init.at ?? base}${path}`, {
    method: init.body === undefined && !init.key ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${await token(init.as, claimsOf(init.as))}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(init.key ? { 'idempotency-key': init.key } : {}),
      ...(init.epoch === undefined ? {} : { 'x-sophia-personal-epoch': String(init.epoch) }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await res.text()
  const json: unknown = text ? JSON.parse(text) : null
  return { status: res.status, json }
}

/** A write as the Studio makes it: against the epoch of the space it last read. */
const write = async (path: string, as: string, body?: unknown) => {
  const { epoch } = parsePersonalSpace((await call('/api/v1/personal', { as })).json)
  const r = await call(path, { as, body, key: randomUUID(), epoch })
  assert.equal(r.status, 202, JSON.stringify(r.json))
  return parsePersonalReceipt(r.json)
}

const space = async (as: string) => parsePersonalSpace((await call('/api/v1/personal', { as })).json)

/** As the migration owner: what the API role may not do (age a turn, take a function away). */
async function owner(sql: string, params: unknown[] = []): Promise<void> {
  const c = new pg.Client({ connectionString: db.ownerUrl })
  await c.connect()
  try {
    await c.query(sql, params)
  } finally {
    await c.end()
  }
}

/** Poll as a client does until no reply is pending. */
async function settled(as: string) {
  for (let i = 0; i < 50; i++) {
    const page = parsePersonalTurnPage((await call('/api/v1/personal/turns?after=0', { as })).json)
    if (!page.pending) return page
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  throw new Error('the companion never answered')
}

before(async () => {
  db = await createTestDatabase()
  pool = createPool(db.apiUrl, { max: 6 })
  projectId = (await seedProject(db.ownerUrl, { title: 'Launch plan', admin: LEAD, editors: [ANA] })).projectId
  const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
  app = buildApp({ pool, verifyActor, companion: rehearsalCompanion(0) })
  quiet = buildApp({ pool, verifyActor })
  await app.listen({ port: 0, host: '127.0.0.1' })
  await quiet.listen({ port: 0, host: '127.0.0.1' })
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  quietBase = `http://127.0.0.1:${String((quiet.server.address() as AddressInfo).port)}`
})
after(async () => {
  await app.close()
  await quiet.close()
  await pool.end()
  await db.drop()
})

describe('personal routes', () => {
  it('refuse a guest, and a message where no companion runs keeps nothing', async () => {
    assert.equal((await call('/api/v1/personal', { as: GUEST })).status, 403)
    const refused = await call('/api/v1/personal/turns', {
      as: ANA,
      body: { text: 'Hello' },
      key: randomUUID(),
      at: quietBase,
      epoch: 0,
    })
    assert.equal(refused.status, 503)
    const empty = parsePersonalSpace((await call('/api/v1/personal', { as: ANA, at: quietBase })).json)
    assert.deepEqual([empty.companion, empty.turns.length], ['unavailable', 0])
  })

  it('answer a message with the companion, and suggest a note without keeping it', async () => {
    const sent = await write('/api/v1/personal/turns', ANA, { text: 'I have a pitch on Friday and I cannot sleep' })
    assert.equal(sent.operation, 'send_turn')
    const page = await settled(ANA)
    assert.deepEqual(
      page.turns.map((t) => t.author),
      ['person', 'sophia'],
    )
    assert.equal(page.turns[1]?.suggestion?.text, 'Preparing a pitch for Friday')
    const mine = await space(ANA)
    assert.equal(mine.companion, 'rehearsal')
    assert.equal(mine.notes.length, 0)
    // Nobody else reads it.
    for (const other of [LEAD, OUT]) assert.deepEqual((await space(other)).turns, [])
  })

  it('carry a kept note to her project, where its members read it as hers, and take it back', async () => {
    const suggestion = (await space(ANA)).turns.find((t) => t.suggestion)?.suggestion
    assert.ok(suggestion)
    const kept = await write(`/api/v1/personal/suggestions/${suggestion.id}/decision`, ANA, { decision: 'keep' })
    assert.ok(kept.noteId)
    const carried = await write(`/api/v1/personal/notes/${kept.noteId}/carry`, ANA, { projectId })
    const lead = parseProjectList((await call('/api/v1/projects', { as: LEAD })).json)
    assert.deepEqual(
      lead.projects[0]?.releases.map((r) => [r.text, r.ownerName, r.mine]),
      [['Preparing a pitch for Friday', 'ana@sophia.test', false]],
    )
    assert.deepEqual(parseProjectList((await call('/api/v1/projects', { as: OUT })).json).projects, [])
    const hers = parseProjectList((await call('/api/v1/projects', { as: ANA })).json).projects[0]
    assert.deepEqual([hers?.title, hers?.role, hers?.members, hers?.room], ['Launch plan', 'editor', 2, null])
    assert.equal(hers?.releases[0]?.mine, true)
    await write(`/api/v1/personal/releases/${carried.releaseId}/take-back`, ANA)
    const back = parseProjectList((await call('/api/v1/projects', { as: LEAD })).json)
    assert.deepEqual(back.projects[0]?.releases, [])
    assert.equal((await space(ANA)).notes[0]?.text, 'Preparing a pitch for Friday')
  })

  it('welcome her back after a quiet spell, once', async () => {
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '3 hours' WHERE owner_id = $1`, [ANA])
    const welcomed = await write('/api/v1/personal/resume', ANA, { name: 'Ana' })
    assert.equal(welcomed.operation, 'resume')
    assert.ok(welcomed.turnId)
    assert.equal((await write('/api/v1/personal/resume', ANA, { name: 'Ana' })).turnId, null)
    const last = (await space(ANA)).turns.at(-1)
    assert.match(last?.text ?? '', /^Welcome back, Ana\./)
  })

  it('export everything, then erase it for good', async () => {
    const everything = parsePersonalExport((await call('/api/v1/personal/export', { as: ANA })).json)
    assert.equal(everything.turns.length, 3)
    assert.equal(everything.notes.length, 1)
    const refused = await call('/api/v1/personal/erasure', { as: ANA, body: { confirm: 'yes' }, key: randomUUID() })
    assert.equal(refused.status, 422)
    const erased = await write('/api/v1/personal/erasure', ANA, { confirm: 'delete' })
    assert.deepEqual(erased.erased, { turns: 3, notes: 1, suggestions: 1 })
    const erasedSpace = await space(ANA)
    assert.deepEqual([erasedSpace.turns.length, erasedSpace.notes.length], [0, 0])
  })

  it('let her ask again for a reply lost with the process answering it', async () => {
    // The turn committed and the API went away before answering (a deploy, a crash): nothing marks it failed.
    const lost = await withActor(pool, ANA, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'Did that go through?'))
    const retry = `/api/v1/personal/turns/${lost.turnId ?? ''}/retry`
    const { epoch } = await space(ANA)
    assert.equal((await call(retry, { as: ANA, key: randomUUID(), epoch })).status, 409, 'not while it may still come')
    await owner(`UPDATE sophia.personal_turns SET asked_at = now() - interval '121 seconds' WHERE id = $1`, [
      lost.turnId,
    ])
    assert.equal((await space(ANA)).turns.find((t) => t.id === lost.turnId)?.reply, 'failed')
    await write(retry, ANA)
    const page = await settled(ANA)
    assert.equal(page.turns.find((t) => t.id === lost.turnId)?.reply, 'answered')
    assert.equal(page.turns.at(-1)?.replyTo, lost.turnId)
    // The database reads a wait as lost after two minutes (0021): longer than any answer may take.
    assert.ok(ANSWER_LIMIT_MS < 120_000)
  })

  it('answer a malformed id or cursor with 422, never 503', async () => {
    const urn = `urn:uuid:${randomUUID()}`
    const note = await write('/api/v1/personal/notes', ANA, { text: 'Checked ids' })
    const { epoch } = await space(ANA)
    const carry = await call(`/api/v1/personal/notes/${note.noteId ?? ''}/carry`, {
      as: ANA,
      body: { projectId: urn },
      key: randomUUID(),
      epoch,
    })
    assert.equal(carry.status, 422, JSON.stringify(carry.json))
    const keep = await call('/api/v1/personal/notes', {
      as: ANA,
      body: { text: 'From a turn', fromTurnId: urn },
      key: randomUUID(),
      epoch,
    })
    assert.equal(keep.status, 422, JSON.stringify(keep.json))
    assert.equal((await call('/api/v1/personal/turns/earlier?before=x', { as: ANA })).status, 422)
    assert.equal((await call('/api/v1/personal/export?after=x', { as: ANA })).status, 422)
    const first = (await space(ANA)).turns[0]
    const back = await call(`/api/v1/personal/turns/earlier?before=${String((first?.seq ?? 0) + 1)}`, { as: ANA })
    assert.deepEqual(
      parsePersonalEarlierTurns(back.json).turns.map((t) => t.id),
      [first?.id],
      'read back from just after the first turn: that turn',
    )
    assert.equal((await call('/api/v1/personal?timeZone=Mars/Olympus_Mons', { as: ANA })).status, 422)
    assert.equal((await call('/api/v1/personal/turns?after=9999999999999999', { as: ANA })).status, 422)
    assert.equal((await call('/api/v1/personal/turns?after=9007199254740991', { as: ANA })).status, 200)
  })

  it('replay what a keyed write kept where no companion runs, and refuse only new work there', async () => {
    const SAME = randomUUID()
    const k = randomUUID()
    const sent = await call('/api/v1/personal/turns', { as: SAME, body: { text: 'Hello again' }, key: k, epoch: 0 })
    assert.equal(sent.status, 202)
    const replayed = await call('/api/v1/personal/turns', {
      as: SAME,
      body: { text: 'Hello again' },
      key: k,
      epoch: 0,
      at: quietBase,
    })
    assert.deepEqual([replayed.status, replayed.json], [202, sent.json], 'its receipt, where no companion runs')
    const fresh = await call('/api/v1/personal/turns', {
      as: SAME,
      body: { text: 'Something new' },
      key: randomUUID(),
      epoch: 0,
      at: quietBase,
    })
    assert.equal(fresh.status, 503, 'new work is refused there')
    // Asking again for a lost reply, the same way.
    const lost = await withActor(pool, SAME, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'Lost on the way'))
    await owner(`UPDATE sophia.personal_turns SET asked_at = now() - interval '121 seconds' WHERE id = $1`, [
      lost.turnId,
    ])
    const retryPath = `/api/v1/personal/turns/${lost.turnId ?? ''}/retry`
    const q = randomUUID()
    const asked = await call(retryPath, { as: SAME, key: q, epoch: 0 })
    assert.equal(asked.status, 202)
    const askedAgain = await call(retryPath, { as: SAME, key: q, epoch: 0, at: quietBase })
    assert.deepEqual([askedAgain.status, askedAgain.json], [202, asked.json])
    // And a welcome back.
    await settled(SAME)
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '3 hours' WHERE owner_id = $1`, [SAME])
    const r = randomUUID()
    const welcomed = await call('/api/v1/personal/resume', { as: SAME, body: { name: 'Sam' }, key: r, epoch: 0 })
    assert.equal(welcomed.status, 202)
    const welcomedAgain = await call('/api/v1/personal/resume', {
      as: SAME,
      body: { name: 'Sam' },
      key: r,
      epoch: 0,
      at: quietBase,
    })
    assert.deepEqual([welcomedAgain.status, welcomedAgain.json], [202, welcomed.json])
  })

  it('refuse a write made before an erasure that arrives after it, and one that names no epoch', async () => {
    const GONE = randomUUID()
    await write('/api/v1/personal/turns', GONE, { text: 'Before' })
    const sentAt = (await space(GONE)).epoch
    const message = { as: GONE, body: { text: 'Held on its way' }, key: randomUUID(), epoch: sentAt }
    await write('/api/v1/personal/erasure', GONE, { confirm: 'delete' })
    assert.equal((await space(GONE)).epoch, sentAt + 1)
    const late = await call('/api/v1/personal/turns', message)
    assert.deepEqual([late.status, (late.json as { code?: string } | null)?.code], [409, 'request_erased'])
    assert.deepEqual((await space(GONE)).turns, [], 'nothing came back')
    const unnamed = await call('/api/v1/personal/turns', { as: GONE, body: { text: 'No epoch' }, key: randomUUID() })
    assert.equal(unnamed.status, 422)
    const work = parseProjectList((await call('/api/v1/projects', { as: GONE })).json)
    assert.equal(work.personalEpoch, sentAt + 1, 'Work knows it too, for what it writes while the space is locked')
  })
})

describe('a companion that fails', () => {
  it('is logged by its name and code, never by the words it carries', async () => {
    const LOG = randomUUID()
    const lines: string[] = []
    const words = 'the person said something private'
    const failing = {
      mode: 'rehearsal' as const,
      answer: () => Promise.reject(Object.assign(new Error(words), { code: 'E_MODEL' })),
      greet: () => Promise.reject(new Error(words)),
    }
    const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })
    const loud = buildApp({
      pool,
      verifyActor,
      companion: failing,
      logger: { stream: { write: (line: string) => lines.push(line) } },
    })
    await loud.listen({ port: 0, host: '127.0.0.1' })
    const at = `http://127.0.0.1:${String((loud.server.address() as AddressInfo).port)}`
    try {
      const sent = await call('/api/v1/personal/turns', {
        as: LOG,
        body: { text: 'Hello' },
        key: randomUUID(),
        at,
        epoch: 0,
      })
      assert.equal(sent.status, 202)
      for (let i = 0; i < 50 && !lines.some((l) => l.includes('companion')); i++) {
        await new Promise((resolve) => setTimeout(resolve, 40))
      }
      await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '3 hours' WHERE owner_id = $1`, [LOG])
      const greeted = await call('/api/v1/personal/resume', { as: LOG, body: {}, key: randomUUID(), at, epoch: 0 })
      assert.equal(greeted.status, 503)
      assert.ok(
        lines.some((l) => l.includes('E_MODEL')),
        'the failure is logged, by its code',
      )
      assert.ok(
        lines.every((l) => !l.includes(words)),
        lines.join('\n'),
      )
    } finally {
      await loud.close()
    }
  })
})

describe('a welcome the companion could not write', () => {
  it('answers outcome_unknown, and the same request asks again', async () => {
    const BACK = randomUUID()
    let asked = 0
    const once = {
      mode: 'rehearsal' as const,
      answer: () => Promise.resolve({ text: 'Noted.', suggestion: null }),
      greet: () => {
        asked += 1
        return asked === 1 ? Promise.reject(new Error('The model was busy')) : Promise.resolve('Welcome back.')
      },
    }
    const runner = new CompanionRunner(pool, once, () => undefined)
    const sent = await withActor(pool, BACK, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'Before the quiet'))
    await runner.answer(BACK, sent.turnId ?? '')
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '3 hours' WHERE owner_id = $1`, [BACK])
    const k = randomUUID()
    const failure: unknown = await runner.greet(BACK, k, 0, null).then(
      () => null,
      (err: unknown) => err,
    )
    assert.ok(failure instanceof DomainError)
    assert.deepEqual([failure.code, failure.retry], ['outcome_unknown', 'same_admission_key'])
    const welcome = await runner.greet(BACK, k, 0, null)
    assert.ok(welcome.turnId, 'the same request asked again, and wrote it')
    assert.equal(asked, 2)
  })
})

describe('a companion that runs out of time', () => {
  it('is told to stop, and waited for, before a turn fails or a welcome lets its claim go', async () => {
    const SLOW = randomUUID()
    const seen = { stopped: 0, settled: 0 }
    const stopsWhenTold = (signal: AbortSignal) =>
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => {
          seen.stopped += 1
          setTimeout(() => {
            seen.settled += 1
            reject(new Error('Stopped'))
          }, 50)
        })
      })
    const slow = {
      mode: 'rehearsal' as const,
      answer: (_context: unknown, signal: AbortSignal) => stopsWhenTold(signal),
      greet: (_context: unknown, _name: string | null, signal: AbortSignal) => stopsWhenTold(signal),
    }
    const runner = new CompanionRunner(pool, slow, () => undefined, 30)
    const sent = await withActor(pool, SLOW, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'Are you there?'))
    await runner.answer(SLOW, sent.turnId ?? '')
    assert.deepEqual(seen, { stopped: 1, settled: 1 }, 'it had stopped when the turn said it failed')
    assert.equal((await space(SLOW)).turns.find((t) => t.id === sent.turnId)?.reply, 'failed')
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '3 hours' WHERE owner_id = $1`, [SLOW])
    const failure: unknown = await runner.greet(SLOW, randomUUID(), 0, null).then(
      () => null,
      (err: unknown) => err,
    )
    assert.ok(failure instanceof DomainError)
    assert.equal(failure.code, 'outcome_unknown')
    assert.deepEqual(seen, { stopped: 2, settled: 2 }, 'and it had stopped when the welcome let its claim go')
  })
})

describe('a welcome whose space is erased while it is written', () => {
  it('is refused as erased, and nothing is kept under its key', async () => {
    const GONE = randomUUID()
    const asked = Promise.withResolvers<void>()
    const held = Promise.withResolvers<void>()
    const waits = {
      mode: 'rehearsal' as const,
      answer: () => Promise.resolve({ text: 'Noted.', suggestion: null }),
      greet: async () => {
        asked.resolve()
        await held.promise
        return 'Welcome back.'
      },
    }
    const runner = new CompanionRunner(pool, waits, () => undefined)
    const sent = await withActor(pool, GONE, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'Before the quiet'))
    await runner.answer(GONE, sent.turnId ?? '')
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '3 hours' WHERE owner_id = $1`, [GONE])
    const k = randomUUID()
    const greeting = runner.greet(GONE, k, 0, null).then(
      () => null,
      (err: unknown) => err,
    )
    await asked.promise
    await withActor(pool, GONE, 'write', (c) => erasePersonalSpace(c, randomUUID(), 'delete'))
    held.resolve()
    const failure = await greeting
    assert.ok(failure instanceof DomainError)
    assert.equal(failure.code, 'request_erased')
    assert.equal((await space(GONE)).turns.length, 0)
  })
})

describe('a welcome whose read fails after its claim', () => {
  it('lets the claim go and answers outcome_unknown, so the same request writes it at once', async () => {
    const BACK = randomUUID()
    const greeter = {
      mode: 'rehearsal' as const,
      answer: () => Promise.resolve({ text: 'Noted.', suggestion: null }),
      greet: () => Promise.resolve('Welcome back.'),
    }
    const steady = new CompanionRunner(pool, greeter, () => undefined)
    const sent = await withActor(pool, BACK, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'Before the quiet'))
    await steady.answer(BACK, sent.turnId ?? '')
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '3 hours' WHERE owner_id = $1`, [BACK])
    // The second connection (the welcome's read, after the claim) fails: the database went away for a moment.
    let connections = 0
    const flaky = new Proxy(pool, {
      get(target, prop) {
        if (prop !== 'connect') {
          const own: unknown = Reflect.get(target, prop, target)
          return own
        }
        return async () => {
          connections += 1
          if (connections === 2) throw new Error('The database went away')
          return target.connect()
        }
      },
    })
    const k = randomUUID()
    const failure: unknown = await new CompanionRunner(flaky, greeter, () => undefined).greet(BACK, k, 0, null).then(
      () => null,
      (err: unknown) => err,
    )
    assert.ok(failure instanceof DomainError)
    assert.deepEqual([failure.code, failure.retry], ['outcome_unknown', 'same_admission_key'])
    const welcome = await steady.greet(BACK, k, 0, null)
    assert.ok(welcome.turnId, 'the same request asked again at once, and wrote it')
  })
})

/** A companion that takes a moment to answer, so two processes ask at the same time. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 100))

describe('a companion on two API processes', () => {
  it('answers a turn once, and welcomes back once, whichever process is asked', async () => {
    const PERSON = randomUUID()
    let answered = 0
    let greeted = 0
    const counting = {
      mode: 'rehearsal' as const,
      answer: async () => {
        answered += 1
        await pause()
        return { text: 'Once.', suggestion: null }
      },
      greet: async () => {
        greeted += 1
        await pause()
        return 'Welcome back.'
      },
    }
    const one = new CompanionRunner(pool, counting, () => undefined)
    const two = new CompanionRunner(pool, counting, () => undefined)
    const sent = await withActor(pool, PERSON, 'write', (c) => sendPersonalTurn(c, randomUUID(), 'Hello from two'))
    const turn = sent.turnId ?? ''
    await Promise.all([one.answer(PERSON, turn), two.answer(PERSON, turn)])
    assert.equal(answered, 1, 'one process answered it')
    await owner(`UPDATE sophia.personal_turns SET created_at = now() - interval '3 hours' WHERE owner_id = $1`, [
      PERSON,
    ])
    const [a, b] = await Promise.all([
      one.greet(PERSON, randomUUID(), 0, null),
      two.greet(PERSON, randomUUID(), 0, null),
    ])
    assert.equal(greeted, 1, 'one process asked for the welcome')
    assert.equal([a, b].filter((r) => r.turnId).length, 1, 'and one welcome was written')
  })
})

// Last: it takes part of the personal space out of the database.
describe('readiness', () => {
  it('fails while the personal space is missing from the database', async () => {
    assert.equal((await fetch(`${base}/ready`)).status, 200)
    await owner('DROP FUNCTION sophia.send_personal_turn(text,text,boolean)')
    const res = await fetch(`${base}/ready`)
    assert.deepEqual([res.status, await res.json()], [503, { ready: false, reason: 'schema' }])
  })
})
