// SessionQualification on its own (qualification.ts, A15): the API's reservations are a FAKE answered by the test, so
// the order of their answers is the test's.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MediaQualificationReservation, MediaQualificationReserve, VoiceQualification } from '@sophia/contracts'
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

type Refusal = NonNullable<MediaQualificationReservation['stop']>

/** A session's bound whose generation reservations wait until the test answers them (granted, or refused). */
function bound() {
  const waiting: Array<{
    kind: MediaQualificationReserve['kind']
    charge: number | undefined
    answer: () => void
    refuse: (why: Refusal) => void
  }> = []
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
      const refused =
        r.kind === 'connection'
          ? null
          : await new Promise<Refusal | null>((resolve) =>
              waiting.push({ kind: r.kind, charge: r.charge, answer: () => resolve(null), refuse: resolve }),
            )
      if (refused) return { ok: false, ordinal: null, stop: refused, ended: true }
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

  it('a function call’s payload is paid before it runs: within the allowance at once; past it, after the top-up it asks', async () => {
    const { q, waiting } = bound()
    assert.equal(await q.connecting(1, false), null)
    const chunk = new Int16Array(1600).fill(2000)
    assert.equal(q.input(1, LUIS, chunk, 0, 1), 'hold')
    await settle()
    waiting[0]?.answer()
    assert.equal(await q.granted(1), null)
    // 300 characters of names and arguments: 100 tokens of billed output text, within the 4,000 prepaid.
    assert.equal(await q.called(1, 1, 300), null, 'paid from the allowance: it runs at once')
    // The allowance spent but 27.6 tokens (4,000 less 100, less 922 chunks at 4.2), then calls of 300 characters.
    for (let i = 0; i < 922; i += 1) assert.equal(q.input(1, LUIS, chunk, 0, 1), null)
    const runs = q.called(1, 2, 300)
    const sentinel = new Promise((resolve) => setImmediate(() => resolve('waiting')))
    assert.equal(await Promise.race([runs.then(() => 'ran'), sentinel]), 'waiting', 'not before what it owes is paid')
    assert.deepEqual(
      waiting.map((w) => [w.kind, w.charge]),
      [
        ['generation', 31_000],
        ['spend', 4073],
      ],
      'the top-up refills the 4,000 and the 72.4 the calls owe past the 27.6 left: their 100 tokens are charged',
    )
    waiting[1]?.answer()
    assert.equal(await runs, null, 'then they run')
  })

  it('a function call of a generation nobody reserved runs only once the API counted that generation (Codex r4232975798)', async () => {
    const { q, waiting } = bound()
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.input(1, LUIS, new Int16Array(1600).fill(2000), 0, 1), 'hold')
    await settle()
    waiting[0]?.answer()
    assert.equal(await q.granted(1), null)
    q.turnEnded(1, 'turn_complete') // its turn is over: what comes next, nobody asked for
    const runs = q.called(1, 1, 30)
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation', 'unasked'],
      'the call started a generation: it is charged',
    )
    const sentinel = new Promise((resolve) => setImmediate(() => resolve('waiting')))
    assert.equal(await Promise.race([runs.then(() => 'ran'), sentinel]), 'waiting', 'not before the API answered')
    waiting[1]?.answer()
    assert.equal(await runs, null, 'counted: it runs')
  })

  it('a function call waits for the charge of its generation that earlier output started; refused, it never runs', async () => {
    const { q, waiting } = bound()
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.input(1, LUIS, new Int16Array(1600).fill(2000), 0, 1), 'hold')
    await settle()
    waiting[0]?.answer()
    assert.equal(await q.granted(1), null)
    q.turnEnded(1, 'turn_complete')
    assert.equal(q.output(1, { samples: 2400 }), null, 'audio of a generation nobody asked for: it is charged')
    const runs = q.called(1, 1, 30)
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation', 'unasked'],
      'one charge for the generation, not one more for its call',
    )
    waiting[1]?.refuse('usage')
    assert.equal(await runs, 'usage', 'refused: its calls never run, and the session stops')
  })
})
