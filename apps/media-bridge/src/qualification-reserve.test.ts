// The bridge's spend bound under a voice qualification grant (qualification-reserve.ts): pure, no provider, no room.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ASSUMED_RATES, QualificationReserve, type ReserveLimits } from './qualification-reserve.ts'

const SECOND_IN = 16_000
const SECOND_OUT = 24_000
const limits = (over: Partial<ReserveLimits> = {}): ReserveLimits => ({
  usageTokens: 200_000,
  outputTokensPerTurn: 1000,
  turns: 20,
  connections: 3,
  ...over,
})
/** One generation's reserve with the assumed rates: the context again, and its output as audio and as text. */
const GENERATION = ASSUMED_RATES.context + 2 * 1000

describe('the bridge reserves a generation before anything that can start one', () => {
  it('takes the whole context again, the input since and the output twice, for each generation', () => {
    const r = new QualificationReserve(limits())
    assert.deepEqual(r.connected(1), { ok: true })
    assert.deepEqual(r.sentAudio(10 * SECOND_IN), { ok: true }, 'ten seconds of listening')
    assert.equal(r.committed, 320, 'listening is counted before any report')
    assert.deepEqual(r.reserve(1), { ok: true })
    assert.equal(r.committed, GENERATION + 320)
    r.ended(1)
    assert.equal(r.committed, GENERATION + 320, 'an ended generation stays at its reserve until a report covers it')
    r.reported(1, 30_000)
    assert.equal(r.committed, 30_000, 'the report replaces what it covers')
  })

  it('refuses the generation that would pass the budget, and stops for good', () => {
    const r = new QualificationReserve(limits({ usageTokens: 2 * GENERATION + 100 }))
    r.connected(1)
    assert.deepEqual(r.reserve(1), { ok: true })
    r.ended(1)
    assert.deepEqual(r.reserve(1), { ok: true })
    r.ended(1)
    assert.deepEqual(r.reserve(1), { ok: false, stop: 'usage' })
    assert.equal(r.stopped, 'usage')
    // A report that would leave room changes nothing: once stopped, nothing more is sent.
    r.reported(1, 10)
    assert.deepEqual(r.reserve(1), { ok: false, stop: 'usage' })
    assert.deepEqual(r.sentAudio(1), { ok: false, stop: 'usage' })
  })

  it('counts unreported listening: input alone can pass the budget, and is refused as it does', () => {
    const r = new QualificationReserve(limits({ usageTokens: GENERATION + 3200 }))
    r.connected(1)
    assert.deepEqual(r.reserve(1), { ok: true })
    // Input keeps flowing under the open reserve, and nothing is reported.
    let verdict = r.sentAudio(SECOND_IN)
    for (let s = 0; s < 200 && verdict.ok; s += 1) verdict = r.sentAudio(SECOND_IN)
    assert.deepEqual(verdict, { ok: false, stop: 'usage' })
    assert.ok(r.committed > GENERATION + 3200 - 32)
  })
})

describe('generations nobody asked for: continuations, a second tool round, overlapping turns', () => {
  it('a generation that starts unasked (a WHEN_IDLE continuation) takes its reserve as its output arrives', () => {
    const r = new QualificationReserve(limits())
    r.connected(1)
    assert.deepEqual(r.reserve(1), { ok: true }, 'the holder’s turn')
    assert.deepEqual(r.received(1, SECOND_OUT), { ok: true })
    r.ended(1)
    // The tool response's continuation, and a second tool round after the holder stopped: no reserve was asked.
    assert.deepEqual(r.received(1), { ok: true }, 'a tool call, no audio yet')
    r.ended(1)
    assert.deepEqual(r.received(1, SECOND_OUT), { ok: true })
    r.ended(1)
    assert.equal(r.committed, 3 * GENERATION, 'three generations, each with the context billed again')
  })

  it('counts every generation against the grant’s turns, asked for or not', () => {
    const r = new QualificationReserve(limits({ turns: 2 }))
    r.connected(1)
    assert.deepEqual(r.reserve(1), { ok: true })
    r.ended(1)
    assert.deepEqual(r.received(1), { ok: true })
    r.ended(1)
    assert.deepEqual(r.received(1), { ok: false, stop: 'turns' })
    assert.deepEqual(r.reserve(1), { ok: false, stop: 'turns' })
  })

  it('a generation that starts unasked past the budget is already spent: it is counted, and everything stops', () => {
    const r = new QualificationReserve(limits({ usageTokens: GENERATION + 10 }))
    r.connected(1)
    assert.deepEqual(r.reserve(1), { ok: true })
    r.ended(1)
    assert.deepEqual(r.received(1), { ok: false, stop: 'usage' })
    assert.equal(r.committed, 2 * GENERATION)
  })

  it('overlapping turns each keep their reserve until they end', () => {
    const r = new QualificationReserve(limits())
    r.connected(1)
    r.connected(2)
    assert.deepEqual(r.reserve(1), { ok: true })
    assert.deepEqual(r.received(2), { ok: true }, 'a reply on the new connection while the old one’s is open')
    assert.equal(r.committed, 2 * GENERATION)
    r.ended(1)
    assert.equal(r.committed, 2 * GENERATION)
  })
})

describe('reconnections, transcription and a provider that does not honour the output cap', () => {
  it('each connection’s session is reported on its own; the totals add up, and resumption bills context again', () => {
    const r = new QualificationReserve(limits())
    r.connected(1)
    r.reserve(1)
    r.ended(1)
    r.reported(1, 28_000)
    r.connected(2)
    r.reserve(2)
    assert.equal(r.committed, 28_000 + GENERATION, 'the resumed session’s first generation reserves the context')
    r.ended(2)
    r.reported(2, 27_500)
    assert.equal(r.committed, 28_000 + 27_500)
    r.reported(1, 20_000)
    assert.equal(r.committed, 28_000 + 27_500, 'a report never lowers what a connection reported')
  })

  it('stops at the connection past the grant’s', () => {
    const r = new QualificationReserve(limits({ connections: 2 }))
    assert.deepEqual(r.connected(1), { ok: true })
    assert.deepEqual(r.connected(2), { ok: true })
    assert.deepEqual(r.connected(2), { ok: true }, 'the same connection again is not another')
    assert.deepEqual(r.connected(3), { ok: false, stop: 'connections' })
  })

  it('transcription is billed output text: counted, and never taken as reported', () => {
    const r = new QualificationReserve(limits())
    r.connected(1)
    assert.deepEqual(r.transcribed(300), { ok: true })
    assert.deepEqual(r.transcribed(301), { ok: true })
    assert.equal(r.committed, 100 + 101)
    r.reported(1, 5000)
    assert.equal(r.committed, 5000 + 201)
  })

  it('cuts a generation whose output passes the per-turn cap, whatever the provider was configured with', () => {
    const r = new QualificationReserve(limits({ outputTokensPerTurn: 320 }))
    r.connected(1)
    r.reserve(1)
    assert.deepEqual(r.received(1, 10 * SECOND_OUT), { ok: true }, 'ten seconds of reply: 320 tokens')
    assert.deepEqual(r.received(1, SECOND_OUT / 10), { ok: false, stop: 'output' })
    assert.equal(r.stopped, 'output')
  })

  it('a generation past its reserve is counted at what it cost', () => {
    const r = new QualificationReserve(limits({ outputTokensPerTurn: 32 }))
    r.connected(1)
    r.reserve(1)
    r.received(1, 5 * SECOND_OUT)
    assert.equal(r.committed, ASSUMED_RATES.context + 2 * 160)
  })
})
