// SessionQualification on its own (qualification.ts, A15): the API's reservations are a FAKE answered by the test, so
// the order of their answers is the test's.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MediaQualificationReserve, VoiceQualification } from '@sophia/contracts'
import { SessionQualification } from './qualification.ts'

const LUIS = '11111111-1111-4111-8111-111111111111'
const GRANT: VoiceQualification = {
  grantId: '77777777-7777-4777-8777-777777777777',
  runBindingSha256: 'ab'.repeat(32),
  principalActorId: LUIS,
  deadline: new Date(Date.now() + 900_000).toISOString(),
  maxProviderConnections: 3,
  maxTurns: 20,
  maxOutputTokensPerTurn: 1000,
  maxUsageTokens: 200_000,
}

/** A session's bound whose generation reservations wait until the test answers them. */
function bound() {
  const waiting: Array<{ kind: MediaQualificationReserve['kind']; answer: () => void }> = []
  const q = new SessionQualification({
    exchangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    grant: GRANT,
    model: 'fake-model',
    instructionSha256: 'ef'.repeat(32),
    bridgeCommit: null,
    record: () => Promise.resolve({ ended: false, reason: null }),
    nextSeq: () => 1,
    retryMs: [],
    now: Date.now,
    attribution: () => ({ actorId: LUIS, inputEpoch: 1 }),
    ended: () => undefined,
    stop: () => undefined,
    reserve: async (r) => {
      if (r.kind !== 'connection') await new Promise<void>((resolve) => waiting.push({ kind: r.kind, answer: resolve }))
      return { ok: true, ordinal: r.kind === 'connection' ? 1 : (r.ordinal ?? null), stop: null, ended: false }
    },
    reserveRetryMs: [],
    reserveTimeoutMs: 1000,
    log: () => undefined,
  })
  return { q, waiting }
}

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

describe('the bound’s reservations, one by one (qualification.ts)', () => {
  it('input waits for its own reservation: another granted first never lets it through', async () => {
    const { q, waiting } = bound()
    assert.equal(await q.connecting(1, false), null)
    const chunk = new Int16Array(1600).fill(2000)
    assert.equal(q.input(1, LUIS, chunk, 0, 1), 'hold', 'its generation is asked for')
    const response = q.prompt(1, 100) // a tool response's, asked for after it
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation', 'generation'],
    )
    waiting[1]?.answer() // the API answers the tool response's first
    assert.equal(await response, null)
    assert.equal(q.input(1, LUIS, chunk, 0, 1), 'hold', 'still behind its own')
    waiting[0]?.answer()
    assert.equal(await q.granted(1), null)
    assert.equal(q.input(1, LUIS, chunk, 0, 1), null, 'its own granted: it goes on')
  })

  it('transcription is paid with the audio it follows: within it nothing more is asked; past it, a debt is topped up', async () => {
    const { q, waiting } = bound()
    assert.equal(await q.connecting(1, false), null)
    const chunk = new Int16Array(1600).fill(2000)
    assert.equal(q.input(1, LUIS, chunk, 0, 1), 'hold')
    await settle()
    waiting[0]?.answer()
    assert.equal(await q.granted(1), null)
    // The turn's allowance (4,000) at 4.2 a chunk (3.2 of audio, 1 of its transcription): 952 chunks, 1.6 left.
    for (let i = 0; i < 952; i += 1) assert.equal(q.input(1, LUIS, chunk, 0, 1), null, `chunk ${String(i + 1)}`)
    assert.equal(q.heard(1, 30, false), null)
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation'],
      '10 tokens transcribed, within the 952 their 95.2 s of audio prepaid: no top-up',
    )
    assert.equal(q.heard(1, 3000, true), null) // 1,000 tokens: 942 prepaid, 58 past the 1.6 left: a debt
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation', 'spend'],
      'the debt is topped up at once',
    )
    assert.equal(q.input(1, LUIS, chunk, 0, 1), 'hold', 'and input waits until it is paid')
    waiting[1]?.answer()
    assert.equal(await q.granted(1), null)
    assert.equal(q.input(1, LUIS, chunk, 0, 1), null)
  })
})
