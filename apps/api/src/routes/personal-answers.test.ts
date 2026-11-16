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

const companion: Companion = {
  mode: 'live',
  owner: OWNER,
  answer: () => Promise.reject(new Error('never asked here')),
  greet: () => Promise.reject(new Error('never asked here')),
  answerProfile: () => PROFILE,
}

/** A pool whose installation check passes and which records each Answer writer it is asked for. */
function recordingPool() {
  const writes: string[] = []
  const query = (sql: string) => {
    if (sql.includes("to_regprocedure('sophia.send_personal_answer_input("))
      return Promise.resolve({ rows: [{ ok: true }] })
    const writer = /sophia\.(send|retry)_personal_answer_input\(/.exec(sql)
    if (writer?.[1]) writes.push(writer[1])
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
    const app = buildApp({ pool, verifyActor, companion, personalAnswers: true })
    const post = (who: string, url: string, payload: object) =>
      app.inject({
        method: 'POST',
        url,
        headers: {
          authorization: `Bearer ${who}`,
          'idempotency-key': randomUUID(),
          'x-sophia-personal-epoch': '0',
        },
        payload,
      })
    try {
      for (const [url, payload] of [
        ['/api/v1/personal/answers', { answerContract: 'personal_answer_v1', text: 'Hi' }],
        [`/api/v1/personal/answers/${randomUUID()}/retry`, { expectedSeq: 1 }],
      ] as const) {
        const res = await post(STRANGER, url, payload)
        const body = JSON.parse(res.body) as { code?: string; retry?: string }
        assert.deepEqual([res.statusCode, body.code, body.retry], [503, 'unavailable', 'never'], url)
        assert.ok(!res.body.includes(OWNER), 'nothing of the owner is said')
      }
      assert.deepEqual(writes, [], 'nothing was asked of the database')
      // The owner's own send still reaches its writer (the fake keeps nothing, so its answer is not this test's).
      await post(OWNER, '/api/v1/personal/answers', { answerContract: 'personal_answer_v1', text: 'Hi' })
      assert.deepEqual(writes, ['send'])
    } finally {
      await app.close()
    }
  })
})
