// A connection is settled on the API only once everything this bridge spent on it is on the ledger (PR #190's billing
// P1s r4235198833 and r4232295959; 0085's 'settle'): at the session's end, and before the next provider connection.
// The API's reservations are a FAKE answered by the test, so the order of their answers is the test's.
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

const none = () => undefined

interface Asked {
  kind: MediaQualificationReserve['kind']
  ordinal: number | undefined
  charge: number | undefined
  /** Of the charge, what was already spent: the API keeps it even when it refuses (R2-G7-INTERIM-F1). */
  owed: number | undefined
  answer: () => void
  /** Refused, the API keeping `kept` of the charge (0085), as it says. */
  refuse: (why: Refusal, kept?: number) => void
  /** No answer at all (the ledger's attempts all failed): unconfirmed. */
  fail: () => void
}

/**
 * A session's bound whose reservations wait for the test (`answer`, `refuse`), except connections, granted at once with
 * the next ordinal. Every request is kept (`asked`), in the order it was made.
 */
function bound(now: () => number = Date.now) {
  const asked: Asked[] = []
  let ordinals = 0
  const q = new SessionQualification({
    exchangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    grant: GRANT,
    model: 'fake-model',
    instructionSha256: 'ef'.repeat(32),
    bridgeCommit: null,
    record: () => Promise.resolve({ seq: 1, replayed: false, ended: false, reason: null }),
    retryMs: [],
    now,
    attribution: () => ({ actorId: LUIS, inputEpoch: 1 }),
    ended: () => undefined,
    stop: () => undefined,
    reserve: async (r) => {
      const { kind, ordinal, charge, owed } = r
      if (kind === 'connection') {
        ordinals += 1
        asked.push({ kind, ordinal: ordinals, charge, owed, answer: none, refuse: none, fail: none })
        return { ok: true, ordinal: ordinals, stop: null, ended: false }
      }
      const refused = await new Promise<{ why: Refusal; kept: number } | null>((resolve, reject) =>
        asked.push({
          kind,
          ordinal,
          charge,
          owed,
          answer: () => resolve(null),
          refuse: (why, kept = 0) => resolve({ why, kept }),
          fail: () => reject(new Error('socket hang up')),
        }),
      )
      if (refused) return { ok: false, ordinal: null, stop: refused.why, ended: true, kept: refused.kept }
      return { ok: true, ordinal: ordinal ?? null, stop: null, ended: false }
    },
    reserveRetryMs: [],
    reserveTimeoutMs: 1000,
    log: () => undefined,
  })
  /** What was asked, in order: each kind with the connection it names. */
  const kinds = () => asked.map((a) => (a.ordinal === undefined ? a.kind : `${a.kind}:${String(a.ordinal)}`))
  /** The last request of `kind`, still waiting for its answer. */
  const last = (kind: MediaQualificationReserve['kind']) => asked.findLast((a) => a.kind === kind) ?? assert.fail(kind)
  /** Every request of `kind`, in order. */
  const all = (kind: MediaQualificationReserve['kind']) => asked.filter((a) => a.kind === kind)
  return { q, kinds, last, all }
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

describe('a connection is settled once what was spent on it is on the API', () => {
  it('at the end, after the charge for output nobody asked for lands, never before it', async () => {
    const { q, kinds, last } = bound()
    assert.equal(await q.connecting(1, false), null)
    // Output arrives while no generation is paid for: charged now, after it arrived (unasked).
    assert.equal(q.output(1, { samples: 2400 }), null)
    const ending = q.settle()
    await settle()
    assert.deepEqual(kinds(), ['connection:1', 'unasked:1'], 'nothing is settled while that charge is unanswered')
    last('unasked').answer()
    await settle()
    assert.deepEqual(kinds(), ['connection:1', 'unasked:1', 'settle:1'])
    last('settle').answer()
    await ending
    assert.equal(await q.ledger().landed, true, 'every charge landed, and the connection is settled')
  })

  it('a charge refused or never confirmed: the connection is never settled, and the ledger says it did not land', async () => {
    const { q, kinds, last } = bound()
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { samples: 2400 }), null)
    const ending = q.settle()
    await settle()
    last('unasked').refuse('usage')
    await ending
    await settle()
    assert.deepEqual(kinds(), ['connection:1', 'unasked:1'], 'no settlement: the API may not hold what was spent')
    assert.equal(await q.ledger().landed, false)
  })

  it('a refused settlement is not on the API either: the ledger says it did not land', async () => {
    const { q, last } = bound()
    assert.equal(await q.connecting(1, false), null)
    const ending = q.settle()
    await settle()
    last('settle').refuse('usage')
    await ending
    assert.equal(await q.ledger().landed, false)
  })

  it('a debt left while the input’s reservation is in flight is paid by it: nothing is settled before it lands', async () => {
    const { q, kinds, last } = bound()
    assert.equal(await q.connecting(1, false), null)
    const chunk = new Int16Array(1600).fill(2000)
    assert.equal(q.input(1, LUIS, chunk, 0, 1), 'hold', 'its generation, with the allowance, is asked for')
    // The holder's words transcribed meanwhile, 100 tokens with nothing prepaid yet: a debt only that grant pays.
    assert.equal(q.heard(1, 300, true), null)
    const ending = q.settle()
    await settle()
    assert.deepEqual(kinds(), ['connection:1', 'generation:1'], 'no settlement while what pays the debt is unanswered')
    last('generation').answer()
    await settle()
    assert.deepEqual(kinds(), ['connection:1', 'generation:1', 'settle:1'])
    last('settle').answer()
    await ending
    assert.equal(await q.ledger().landed, true)
  })

  it('a new provider connection settles the one before it first, once that one’s charges landed', async () => {
    const { q, kinds, last } = bound()
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { samples: 2400 }), null)
    q.turnEnded(1, 'lost')
    const opening = q.connecting(2, true)
    await settle()
    assert.deepEqual(kinds(), ['connection:1', 'unasked:1'], 'the next connection waits for the charge on the last')
    last('unasked').answer()
    await settle()
    assert.deepEqual(kinds(), ['connection:1', 'unasked:1', 'settle:1'])
    last('settle').answer()
    assert.equal(await opening, null)
    assert.deepEqual(kinds(), ['connection:1', 'unasked:1', 'settle:1', 'connection:2'])
  })

  it('a new provider connection whose last one cannot be settled does not open: the session stops', async () => {
    const { q, kinds, last } = bound()
    assert.equal(await q.connecting(1, false), null)
    const opening = q.connecting(2, true)
    await settle()
    last('settle').refuse('usage')
    assert.equal(await opening, 'usage')
    assert.deepEqual(kinds(), ['connection:1', 'settle:1'], 'no second connection is asked for')
  })
})

/** A connection whose input was granted, its allowance prepaid (INPUT_SLICE): the start of each debt below. */
async function granted(now?: () => number) {
  const b = bound(now)
  assert.equal(await b.q.connecting(1, false), null)
  assert.equal(b.q.input(1, LUIS, new Int16Array(1600).fill(2000), 0, 1), 'hold')
  b.last('generation').answer()
  await settle()
  return b
}

// R2-G7-INTERIM-F1: a debt is for what the provider already billed. Charged while the exchange is open, it can be the
// very charge the API refuses (its budget, its deadline): what was already spent is still on the ledger (0085 owed,
// kept), and nothing more is granted.
describe('a debt the API refused to top up is still on the ledger, and only then is the connection settled', () => {
  it('a top-up for a debt says what of it is owed; refused, the API kept that: nothing lost, the connection settled', async () => {
    const { q, kinds, last } = await granted()
    assert.equal(q.heard(1, 30_000, true), null, 'words past the allowance: a debt, topped up at once')
    await settle()
    const topUp = last('spend')
    assert.ok((topUp.owed ?? 0) > 0 && (topUp.owed ?? 0) < (topUp.charge ?? 0), 'its debt, and the refill beside it')
    topUp.refuse('usage', topUp.owed)
    await settle()
    const ending = q.settle()
    await settle()
    assert.deepEqual(
      kinds().filter((k) => k.startsWith('settle')),
      ['settle:1'],
      'settled: everything spent on it is on the API',
    )
    last('settle').answer()
    await ending
    assert.equal(await q.ledger().landed, true)
    assert.equal(q.input(1, LUIS, new Int16Array(1600), 0, 1), 'usage', 'and nothing more is sent')
  })

  it('refused with nothing kept: the debt is asked alone after it; refused again, lost, and never settled', async () => {
    const { q, kinds, last, all } = await granted()
    assert.equal(q.heard(1, 30_000, true), null)
    await settle()
    const topUp = last('spend')
    topUp.refuse('usage', 0)
    await settle()
    const alone = all('spend')[1] ?? assert.fail('the debt, asked alone')
    assert.equal(alone.owed, alone.charge)
    assert.equal(alone.charge, topUp.owed, 'the whole debt the top-up was asked with')
    alone.refuse('usage', 0)
    await q.settle()
    assert.deepEqual(
      kinds().filter((k) => k.startsWith('settle')),
      [],
    )
    assert.equal(await q.ledger().landed, false)
  })

  it('no answer at all to the top-up: unknown, so lost and never settled, and nothing asked again past its bound', async () => {
    const { q, kinds, last } = await granted()
    assert.equal(q.heard(1, 30_000, true), null)
    await settle()
    last('spend').fail()
    await q.settle()
    assert.deepEqual(kinds(), ['connection:1', 'generation:1', 'spend:1'], 'no settlement, no second charge')
    assert.equal(await q.ledger().landed, false)
  })

  it('a debt that came while the refused top-up was in flight is charged alone after it, on the ended exchange', async () => {
    const { q, kinds, last, all } = await granted()
    assert.equal(q.heard(1, 30_000, true), null)
    await settle()
    const topUp = last('spend')
    assert.equal(q.heard(1, 6000, true), null, 'more words while it is in flight: a debt it was not asked with')
    topUp.refuse('usage', topUp.owed)
    await settle()
    const late = all('spend')[1] ?? assert.fail('the debt left, charged alone')
    assert.equal(late.owed, late.charge, 'all of it owed: nothing more is prepaid')
    assert.equal(late.charge, 2000, '6,000 characters, 2,000 tokens')
    const ending = q.settle()
    await settle()
    assert.deepEqual(
      kinds().filter((k) => k.startsWith('settle')),
      [],
      'nothing settled while it is unanswered',
    )
    late.answer() // 0085: a late charge lands on the exchange the refusal ended
    await settle()
    last('settle').answer()
    await ending
    assert.equal(await q.ledger().landed, true)
  })

  it('words heard as the deadline passes are billed: their debt is charged alone before the connection is settled', async () => {
    const clock = { now: Date.now() }
    const { q, kinds, last } = await granted(() => clock.now)
    clock.now += 1_000_000 // past the grant's deadline
    assert.equal(q.heard(1, 30_000, true), 'deadline')
    await settle()
    const debt = last('spend')
    assert.equal(debt.owed, debt.charge, 'the debt alone')
    const ending = q.settle()
    await settle()
    assert.deepEqual(
      kinds().filter((k) => k.startsWith('settle')),
      [],
    )
    debt.answer()
    await settle()
    last('settle').answer()
    await ending
    assert.equal(await q.ledger().landed, true)
  })

  it('stopped while a top-up is in flight: what its credit leaves of a debt is charged alone before the settlement', async () => {
    const clock = { now: Date.now() }
    const { q, kinds, last, all } = await granted(() => clock.now)
    assert.equal(q.heard(1, 30_000, true), null)
    await settle()
    const topUp = last('spend')
    assert.equal(q.heard(1, 15_000, true), null, '5,000 tokens more while it is in flight: past what it refills')
    clock.now += 1_000_000
    assert.equal(q.due(), 'deadline', 'the session stops')
    topUp.answer()
    await settle()
    const left = all('spend')[1] ?? assert.fail('what the credit left, charged alone')
    assert.equal(left.owed, left.charge)
    const ending = q.settle()
    await settle()
    assert.deepEqual(
      kinds().filter((k) => k.startsWith('settle')),
      [],
      'no settlement before it lands',
    )
    left.answer()
    await settle()
    last('settle').answer()
    await ending
    assert.equal(await q.ledger().landed, true)
  })
})
