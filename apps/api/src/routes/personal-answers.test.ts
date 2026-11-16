import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import type pg from 'pg'
import type { PersonalAnswerProfile } from '@sophia/persistence'
import { buildApp } from '../app.ts'
import type { Companion } from '../companion.ts'
import { PERSONAL_ROLE_DIGEST } from '../companion-live.ts'

// A live companion answers one person. Anyone else's send or retry of an Answer (A53) is refused before anything is
// kept, and asking again will not change that: 503 `unavailable`, as A53's 503 names it, with `retry: never` (review of
// #513, P3 7). Here the database is a FAKE that only records which writers are called; the real refusal over 0101 is
// personal-answers.db.test.ts's.
const OWNER = randomUUID()
const STRANGER = randomUUID()

/** A synthetic trusted profile: nothing here pays for, or asks, any model. */
const PROFILE: PersonalAnswerProfile = {
  version: 1,
  owner: OWNER,
  payer: 'p-synthetic',
  routeId: 'personal-synthetic',
  roleDigest: PERSONAL_ROLE_DIGEST,
  provider: 'synthetic-provider',
  model: 'synthetic-model',
  reasoningEffort: 'medium',
  maxTokens: 256,
  prices: { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 },
}

/** A live companion for OWNER whose live settings make `profile()` now (null: none 0101 would accept). */
const companionWith = (profile: () => PersonalAnswerProfile | null): Companion => ({
  mode: 'live',
  owner: OWNER,
  answer: () => Promise.reject(new Error('never asked here')),
  greet: () => Promise.reject(new Error('never asked here')),
  answerProfile: profile,
})

/** The receipt 0101 would remember for a send left waiting (its payer not admitted): synthetic, as 0101 shapes it. */
const WAITING = {
  operation: 'send_answer_input',
  revision: 1,
  turnId: randomUUID(),
  seq: 1,
  inputId: randomUUID(),
  answerContract: 'personal_answer_v1',
  interactionContract: 'automatic_v1',
  contractVersion: 1,
  decision: {
    seq: 1,
    operation: 'send',
    outcome: 'waiting',
    reason: 'payer_unavailable',
    late: false,
    epoch: 0,
    admittedAt: null,
    policy: 'personal-default-answer',
    policyVersion: 1,
    family: 'answer',
    basis: 'personal_default_addressee',
  },
  suggestionId: null,
  noteId: null,
  releaseId: null,
  projectId: null,
  erased: null,
}

/** A pool whose installation check passes and which records each Answer writer asked for; a send is left waiting. */
function recordingPool() {
  const writes: string[] = []
  const query = (sql: string) => {
    if (sql.includes("to_regprocedure('sophia.send_personal_answer_input("))
      return Promise.resolve({ rows: [{ ok: true }] })
    const writer = /sophia\.(send|retry)_personal_answer_input\(/.exec(sql)
    if (writer?.[1]) writes.push(writer[1])
    if (writer?.[1] === 'send') return Promise.resolve({ rows: [{ receipt: WAITING }], rowCount: 1 })
    return Promise.resolve({ rows: [], rowCount: 0 })
  }
  const pool = { query, connect: () => Promise.resolve({ query, release: () => undefined }) } as unknown as pg.Pool
  return { pool, writes }
}

const verifyActor = (authorization: string | undefined) =>
  Promise.resolve({ id: String(authorization).slice('Bearer '.length), name: null, contact: null, anonymous: false })

describe('an Answer from someone the live companion does not serve', () => {
  it('is refused 503 unavailable with retry never, send and retry alike, and writes nothing', async () => {
    const { pool, writes } = recordingPool()
    // A profile when the app is built (buildApp requires one); gone later only where a case says so.
    let profile: PersonalAnswerProfile | null = PROFILE
    const app = buildApp({ pool, verifyActor, companion: companionWith(() => profile), personalAnswers: true })
    const post = async (who: string, url: string, payload: object) => {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${who}`, 'idempotency-key': randomUUID(), 'x-sophia-personal-epoch': '0' },
        payload,
      })
      const body = JSON.parse(res.body) as { code?: string; retry?: string }
      return { status: res.statusCode, refusal: [res.statusCode, body.code, body.retry], body: res.body }
    }
    try {
      for (const [url, payload] of [
        ['/api/v1/personal/answers', { answerContract: 'personal_answer_v1', text: 'Hi' }],
        [`/api/v1/personal/answers/${randomUUID()}/retry`, { expectedSeq: 1 }],
      ] as const) {
        const res = await post(STRANGER, url, payload)
        assert.deepEqual(res.refusal, [503, 'unavailable', 'never'], url)
        assert.ok(!res.body.includes(OWNER), 'nothing of the owner is said')
      }
      assert.deepEqual(writes, [], 'nothing was asked of the database')
      // The owner's own send is taken: its writer is asked, and its receipt answered.
      const send = { answerContract: 'personal_answer_v1', text: 'Hi' }
      const own = await post(OWNER, '/api/v1/personal/answers', send)
      assert.equal(own.status, 202, own.body)
      assert.deepEqual(JSON.parse(own.body), WAITING)
      assert.deepEqual(writes, ['send'])
      // The owner, while the live settings make no profile: an operator's change can end that, so safe_read stays.
      profile = null
      assert.deepEqual((await post(OWNER, '/api/v1/personal/answers', send)).refusal, [503, 'unavailable', 'safe_read'])
      assert.deepEqual(writes, ['send'], 'nothing more was asked of the database')
    } finally {
      await app.close()
    }
  })
})
