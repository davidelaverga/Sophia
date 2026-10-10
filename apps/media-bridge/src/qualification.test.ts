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

/**
 * A session's bound whose generation reservations wait until the test answers them (granted, or refused); the grant's
 * limits as GRANT's, with `over`.
 */
function bound(over: Partial<VoiceQualification> = {}) {
  const waiting: Array<{
    kind: MediaQualificationReserve['kind']
    charge: number | undefined
    answer: () => void
    refuse: (why: Refusal) => void
  }> = []
  const q = new SessionQualification({
    exchangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    grant: { ...GRANT, ...over },
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
/** What the session asked the API, in order: each kind with its charge. */
const charges = (waiting: ReturnType<typeof bound>['waiting']) => waiting.map((w) => [w.kind, w.charge])

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

describe('Sophia’s words are output text, held to the per-turn cap (Codex r4233559250)', () => {
  const chunk = new Int16Array(1600).fill(2000)

  /** A connection whose generation, asked for by the holder's input, was granted; the grant's per-turn cap is `cap`. */
  async function speaking(cap: number) {
    const b = bound({ maxOutputTokensPerTurn: cap })
    assert.equal(await b.q.connecting(1, false), null)
    assert.equal(b.q.input(1, LUIS, chunk, 0, 1), 'hold')
    await settle()
    b.waiting[0]?.answer()
    assert.equal(await b.q.granted(1), null)
    return b
  }

  it('words whose characters alone pass the cap cut the generation, and nothing after the cut goes on', async () => {
    const { q } = await speaking(64)
    assert.equal(q.output(1, { chars: 60 }), null, '60 characters: 20 tokens, within the 64')
    assert.equal(q.output(1, { chars: 150 }), 'output', '150 more: 70 tokens of words, past the 64 with no audio')
    assert.equal(q.output(1, { samples: 2400 }), 'output', 'output after the cut is refused')
    assert.equal(q.input(1, LUIS, chunk, 0, 1), 'output', 'and so is input')
  })

  it('the cap is each generation’s: the next one’s words count from zero', async () => {
    const { q, waiting } = await speaking(64)
    assert.equal(q.output(1, { chars: 180 }), null, '60 tokens: within the cap')
    q.turnEnded(1, 'turn_complete')
    assert.equal(q.input(1, LUIS, chunk, 0, 1), 'hold', 'the next generation is asked for')
    await settle()
    waiting[1]?.answer()
    assert.equal(await q.granted(1), null)
    assert.equal(q.output(1, { chars: 180 }), null, 'its own 60 tokens: within its own cap')
  })

  it('a normal turn’s words are charged on the API once, from the allowance: no more than before', async () => {
    const { q, waiting } = await speaking(8192)
    // 7,500 characters: 2,500 tokens of words, within the 8,192 cap and the 4,000 the turn's allowance holds. Charged
    // twice (5,000 tokens) they would pass it, and a top-up would be asked for.
    for (let i = 0; i < 25; i += 1) assert.equal(q.output(1, { chars: 300 }), null, `words ${String(i + 1)}`)
    q.turnEnded(1, 'turn_complete')
    await settle()
    assert.deepEqual(
      waiting.map((w) => [w.kind, w.charge]),
      [['generation', 25_000 + 2 * 8192 + 4000]],
      'one generation at its worst case with the allowance it filled, and nothing more: the words came out of it',
    )
  })

  it('the holder’s transcribed words are not output: however many, they never trip the output cap', async () => {
    const { q } = await speaking(64)
    assert.equal(q.heard(1, 600, false), null, '200 tokens of the holder’s words, past 64: no cut')
    assert.equal(q.heard(1, 600, true), null)
    assert.equal(q.output(1, { chars: 60 }), null, 'Sophia’s 20 tokens still fit her generation’s cap')
  })
})

describe('each turn end retires the one generation that ended (Codex r4233559261)', () => {
  it('two prompts granted on one connection under a grant of exactly two turns: both continuations go on, no false stop', async () => {
    // Root's shape: the real SessionQualification, two generations the API granted, maxTurns 2 (reserveTimeoutMs 1000).
    const { q, waiting } = bound({ maxTurns: 2 })
    assert.equal(await q.connecting(1, false), null)
    const first = q.prompt(1, 100) // a tool response's continuation
    const second = q.prompt(1, 100) // another's, asked before the first continuation ended
    await settle()
    waiting[0]?.answer()
    waiting[1]?.answer()
    assert.deepEqual([await first, await second], [null, null])
    assert.equal(q.output(1, { samples: 2400 }), null, 'the first continuation')
    q.turnEnded(1, 'turn_complete')
    assert.equal(
      q.output(1, { samples: 2400 }),
      null,
      'the second continuation: the API counted it; it is not one more',
    )
    q.turnEnded(1, 'turn_complete')
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation', 'generation'],
      'nothing charged unasked: the session counts the two the API counted',
    )
    assert.equal(q.output(1, { samples: 2400 }), 'turns', 'a third, nobody reserved, is past the grant’s two')
  })

  it('a lost connection ends all of its generations: a late report from it covers them all', async () => {
    // Two generations of 27,000 (the context and twice the 1,000 cap) and 34 of text each fit a budget of 55,000.
    const { q, waiting } = bound({ maxUsageTokens: 55_000 })
    assert.equal(await q.connecting(1, false), null)
    const first = q.prompt(1, 100)
    const second = q.prompt(1, 100)
    await settle()
    waiting[0]?.answer()
    waiting[1]?.answer()
    assert.deepEqual([await first, await second], [null, null])
    q.turnEnded(1, 'lost') // replaced before either continuation came
    q.usage(1, { totalTokenCount: 1000 }) // the lost session's last report, after it was replaced
    assert.equal(await q.connecting(2, true), null)
    const next = q.prompt(2, 100)
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation', 'generation', 'generation'],
      'the report covers both: 1,034 committed, so the next 27,000 fits (one still open there would hold 28,068)',
    )
    waiting[2]?.answer()
    assert.equal(await next, null)
  })

  it('one generation, one turn end: as before', async () => {
    const { q, waiting } = bound({ maxTurns: 1 })
    assert.equal(await q.connecting(1, false), null)
    const asked = q.prompt(1, 100)
    await settle()
    waiting[0]?.answer()
    assert.equal(await asked, null)
    assert.equal(q.output(1, { samples: 2400 }), null)
    q.turnEnded(1, 'turn_complete')
    assert.equal(q.output(1, { samples: 2400 }), 'turns', 'the next, nobody reserved, is past the grant’s one')
  })
})

describe('a generation nobody reserved is charged even when its first output is cut (Codex r4233954386)', () => {
  /** Its worst case under a per-turn cap of 64: the context and the cap twice. */
  const UNASKED_64 = 25_000 + 2 * 64

  it('a first chunk of 60 characters: one unasked charge, and it goes on (root’s control)', async () => {
    const { q, waiting } = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { chars: 60 }), null)
    await settle()
    assert.deepEqual(
      waiting.map((w) => [w.kind, w.charge]),
      [
        ['unasked', UNASKED_64],
        ['spend', 4020],
      ],
      'its generation, unasked, once; and its 20 tokens of words owed by an empty allowance, topped up',
    )
  })

  it('a first chunk of 300 characters past the cap: cut (output), and its generation still charged once, unasked', async () => {
    const { q, waiting } = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { chars: 300 }), 'output')
    await settle()
    assert.deepEqual(
      waiting.map((w) => [w.kind, w.charge]),
      [['unasked', UNASKED_64]],
      'its turn and its charge reach the API',
    )
    assert.equal(q.output(1, { chars: 300 }), 'output', 'what follows the cut is refused')
    q.turnEnded(1, 'lost') // the session drops the connection at its stop
    assert.equal(q.output(1, { chars: 3 }), 'output', 'and so is anything that still arrives')
    await settle()
    assert.equal(waiting.length, 1, 'and charges nothing more: the session had stopped')
  })

  it('a first function call whose payload passes the cap: none runs, and its generation is charged once, unasked', async () => {
    const { q, waiting } = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await q.connecting(1, false), null)
    assert.equal(await q.called(1, 1, 300), 'output')
    await settle()
    assert.deepEqual(
      waiting.map((w) => [w.kind, w.charge]),
      [['unasked', UNASKED_64]],
    )
  })

  it('a refusal of that charge is recorded as the API answers it', async () => {
    const { q, waiting } = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { chars: 300 }), 'output')
    await settle()
    assert.equal(waiting[0]?.kind, 'unasked')
    waiting[0]?.refuse('turns')
    await settle()
    assert.equal(q.due(), 'output', 'the session stays stopped for its cut')
  })

  it('a generation asked for and cut by its words is not charged again (control)', async () => {
    const { q, waiting } = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.input(1, LUIS, new Int16Array(1600).fill(2000), 0, 1), 'hold')
    await settle()
    waiting[0]?.answer()
    assert.equal(await q.granted(1), null)
    assert.equal(q.output(1, { chars: 300 }), 'output')
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation'],
      'nothing unasked: it was reserved',
    )
  })

  it('the bridge’s stop goes to the API only once that charge is answered, so the ended exchange holds it', async () => {
    const { q, waiting } = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { chars: 300 }), 'output')
    void q.stopped()
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['unasked'],
      'the stop waits',
    )
    waiting[0]?.answer()
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['unasked', 'stop'],
    )
  })
})

describe('every charge for what was spent is settled before the stop and the end (Codex r4234233112, r4234233106)', () => {
  it('a function call waits for every unasked charge of its connection, not only the latest', async () => {
    const { q, waiting } = bound()
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { samples: 2400 }), null, 'a generation nobody reserved: charged')
    q.turnEnded(1, 'turn_complete')
    const runs = q.called(1, 1, 30) // a call of the next one, nobody reserved either: charged again
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['unasked', 'unasked', 'spend'],
      'two generations nobody reserved, and the call’s payload owed by an empty allowance',
    )
    waiting[1]?.answer() // its own generation counted
    waiting[2]?.answer() // and its payload paid
    const sentinel = new Promise((resolve) => setImmediate(() => resolve('waiting')))
    assert.equal(await Promise.race([runs.then(() => 'ran'), sentinel]), 'waiting', 'the first is still unanswered')
    waiting[0]?.answer()
    assert.equal(await runs, null, 'both counted: it runs')
  })

  it('the stop waits for a debt’s top-up too: words already received are charged before the exchange ends', async () => {
    const { q, waiting } = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { chars: 60 }), null, 'unasked, and 20 tokens owed by an empty allowance')
    assert.equal(q.output(1, { chars: 300 }), 'output', 'then cut')
    const stopping = q.stopped()
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['unasked', 'spend'],
    )
    waiting[0]?.answer()
    await settle()
    assert.equal(waiting.length, 2, 'no stop while the top-up is unanswered')
    waiting[1]?.answer()
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['unasked', 'spend', 'stop'],
    )
    waiting[2]?.answer()
    await stopping
  })

  it('a session that owes nothing settles at once, and sends no stop', async () => {
    const { q, waiting } = bound()
    assert.equal(await q.connecting(1, false), null)
    const started = Date.now()
    await q.settle()
    assert.ok(Date.now() - started < 500)
    assert.deepEqual(waiting, [])
  })
})

describe('output that cuts its generation is charged before the stop: what it billed past its reserve (Codex r4234649836)', () => {
  const chunk = new Int16Array(1600).fill(2000)

  /**
   * Root's sequence: a per-turn cap of 64; the holder's input asks for its generation, prepaid at 25,000 + 2 × 64 +
   * 4,000 = 29,128 and granted; one 100 ms chunk of input sent from the allowance (4.2 tokens: 3,995.8 left); then 1 s
   * of Sophia's audio (32 tokens, within the cap).
   */
  async function cutting() {
    const b = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await b.q.connecting(1, false), null)
    assert.equal(b.q.input(1, LUIS, chunk, 0, 1), 'hold')
    await settle()
    b.waiting[0]?.answer()
    assert.equal(await b.q.granted(1), null)
    assert.equal(b.q.input(1, LUIS, chunk, 0, 1), null, 'one 100 ms chunk, from the allowance')
    assert.equal(b.q.output(1, { samples: 24_000 }), null, '1 s of audio: 32 tokens')
    return b
  }

  /** Then 15,000 characters (5,000 tokens), by `cut`: the stop waits for the 909 that closes the 908.2 gap. */
  async function chargedBeforeTheStop(cut: (q: SessionQualification) => Promise<string | null>) {
    const { q, waiting } = await cutting()
    assert.equal(await cut(q), 'output')
    const stopping = q.stopped()
    await settle()
    // 32 + 5,000 billed, 128 reserved, nothing owed yet: 4,904 from the 3,995.8 left, 908.2 short. Charged alone.
    assert.deepEqual(
      charges(waiting),
      [
        ['generation', 29_128],
        ['spend', 909],
      ],
      'the debt alone, before the stop',
    )
    assert.ok(
      29_128 + 909 >= 25_000 + 4.2 + 32 + 5000,
      'the API holds at least what the provider billed: 30,037 ≥ 30,036.2',
    )
    waiting[1]?.answer()
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation', 'spend', 'stop'],
      'the stop once the charge is answered',
    )
    waiting[2]?.answer()
    await stopping
    assert.deepEqual({ unanswered: q.ledger().unanswered, lost: q.ledger().lost }, { unanswered: 0, lost: false })
  }

  it('words past the cap: the 4,904 tokens past its reserve are charged, 909 on the API, before the stop (root’s sequence)', async () => {
    await chargedBeforeTheStop((q) => Promise.resolve(q.output(1, { chars: 15_000 })))
  })

  it('a function call whose payload passes the cap: the same charge, before the stop', async () => {
    await chargedBeforeTheStop((q) => q.called(1, 1, 15_000))
  })

  it('audio past the cap: 130 s more (4,160 tokens), 4,064 past its reserve, 68.2 short: 69 charged', async () => {
    const { q, waiting } = await cutting()
    assert.equal(q.output(1, { samples: 130 * 24_000 }), 'output')
    void q.stopped()
    await settle()
    assert.deepEqual(charges(waiting), [
      ['generation', 29_128],
      ['spend', 69],
    ])
    assert.ok(29_128 + 69 >= 25_000 + 4.2 + 32 + 4160, '29,197 ≥ 29,196.2')
  })

  it('a generation nobody reserved, cut by its first words: its charge, unasked, and what passed its reserve', async () => {
    const { q, waiting } = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { chars: 15_000 }), 'output')
    await settle()
    assert.deepEqual(charges(waiting), [
      ['unasked', 25_000 + 2 * 64],
      ['spend', 5000 - 2 * 64],
    ])
  })

  it('within the cap: owed from the allowance as before, nothing charged (control)', async () => {
    const { q, waiting } = await cutting()
    assert.equal(q.output(1, { chars: 192 }), null, '64 tokens of words: the cap, not past it')
    await settle()
    assert.deepEqual(charges(waiting), [['generation', 29_128]])
  })

  it('a cut the allowance covers charges nothing more (control)', async () => {
    const { q, waiting } = await cutting()
    // 32 + 100 billed, 128 reserved: 4 past it, from the 3,995.8 left.
    assert.equal(q.output(1, { chars: 300 }), 'output', '100 tokens of words: past the cap')
    void q.stopped()
    await settle()
    assert.deepEqual(
      waiting.map((w) => w.kind),
      ['generation', 'stop'],
      'no spend: the stop at once',
    )
  })

  it('a cut while a top-up is in flight: only the debt that top-up leaves, charged once it is credited', async () => {
    const { q, waiting } = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await q.connecting(1, false), null)
    assert.equal(q.output(1, { chars: 60 }), null, 'unasked; 20 tokens owed by an empty allowance: 4,020 asked')
    assert.equal(q.output(1, { chars: 15_000 }), 'output', '5,020 billed, 128 reserved, 20 owed already: 4,872 more')
    const stopping = q.stopped()
    await settle()
    assert.deepEqual(charges(waiting), [
      ['unasked', 25_128],
      ['spend', 4020],
    ])
    waiting[0]?.answer()
    waiting[1]?.answer()
    await settle()
    assert.deepEqual(
      charges(waiting),
      [
        ['unasked', 25_128],
        ['spend', 4020],
        ['spend', 872],
      ],
      'the 4,020 credited: 872 short',
    )
    assert.equal(25_128 + 4020 + 872, 25_000 + 20 + 5000, 'what the API holds is what the provider billed: 30,020')
    waiting[2]?.answer()
    await settle()
    assert.equal(waiting[3]?.kind, 'stop')
    waiting[3]?.answer()
    await stopping
  })

  it('a refused charge is not on the API: the ledger handed over says so', async () => {
    const { q, waiting } = await cutting()
    assert.equal(q.output(1, { chars: 15_000 }), 'output')
    await settle()
    assert.deepEqual(q.ledger().unanswered, 1, 'unanswered')
    const { landed } = q.ledger()
    waiting[1]?.refuse('usage')
    assert.equal(await landed, false)
    assert.equal(q.ledger().lost, true)
  })
})

describe('the stop is owed in the ledger handed over until it is answered (Codex r4235490757)', () => {
  /** A generation asked for, granted, and cut within its reserve: the stop alone is owed. */
  async function cut() {
    const b = bound({ maxOutputTokensPerTurn: 64 })
    assert.equal(await b.q.connecting(1, false), null)
    assert.equal(b.q.input(1, LUIS, new Int16Array(1600).fill(2000), 0, 1), 'hold')
    await settle()
    b.waiting[0]?.answer()
    assert.equal(await b.q.granted(1), null)
    assert.equal(b.q.output(1, { chars: 300 }), 'output')
    void b.q.stopped()
    await settle()
    assert.deepEqual(
      b.waiting.map((w) => w.kind),
      ['generation', 'stop'],
    )
    return b
  }

  it('asked and unanswered: one unanswered; answered: none, and it landed', async () => {
    const { q, waiting } = await cut()
    assert.deepEqual([q.ledger().unanswered, q.ledger().lost], [1, false])
    const { landed } = q.ledger()
    waiting[1]?.answer()
    assert.equal(await landed, true)
    assert.deepEqual([q.ledger().unanswered, q.ledger().lost], [0, false])
  })

  it('never confirmed: lost, so a replacement stays closed', async () => {
    const { q, waiting } = await cut()
    const { landed } = q.ledger()
    waiting[1]?.refuse('usage')
    assert.equal(await landed, false)
    assert.deepEqual([q.ledger().unanswered, q.ledger().lost], [0, true])
  })
})
