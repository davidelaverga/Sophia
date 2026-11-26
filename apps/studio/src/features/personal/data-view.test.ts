// A held Personal input (A52: a person turn with reply `recorded`) through the Studio's own readers: the canonical
// generated parsers behind every Personal read, and "Your data"'s export as DataSheet composes it (exportPersonalSpace,
// then exportText), both unchanged. Synthetic words only; fetch is a local stub, nothing leaves the process.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { exportPersonalSpace, getEarlierPersonalTurns, getPersonalSpace, getPersonalTurns } from '../../api/personal.ts'
import { clock } from '../../app/time-words.ts'
import { exportText } from './data-view.ts'

/** A moment as the copy writes it: its day in full and its time. */
const FULL = (iso: string) =>
  `${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(iso))}, ${clock(new Date(iso))}`

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const AT = '2026-10-01T10:00:00.000Z'
const HELD_WORDS = 'Kept for later, not a question yet.'

const held = {
  id: '6f1c2a7e-0d4b-4c39-9a51-3e0b7d1c9a01',
  seq: 2,
  author: 'person',
  text: HELD_WORDS,
  createdAt: AT,
  replyTo: null,
  reply: 'recorded',
  suggestion: null,
}
const asked = { ...held, id: '6f1c2a7e-0d4b-4c39-9a51-3e0b7d1c9a00', seq: 1, text: 'Asked earlier.', reply: 'answered' }

/** Every Personal read, as the API answers it, with a held turn in it. */
const BODIES: Record<string, unknown> = {
  '/api/v1/personal': {
    companion: 'rehearsal',
    revision: 3,
    turns: [asked, held],
    earlier: false,
    notes: [],
    releases: [],
    epoch: 0,
    days: 1,
  },
  '/api/v1/personal/turns': { revision: 3, turns: [held], pending: false },
  '/api/v1/personal/turns/earlier': { turns: [asked, held], earlier: false },
  '/api/v1/personal/export': { exportedAt: AT, turns: [asked, held], notes: [], releases: [], next: null },
}

/** The API answering each read with `body(path)`; the paths asked for. */
function serve(body: (path: string) => unknown): string[] {
  const paths: string[] = []
  globalThis.fetch = (url) => {
    const path = new URL(url instanceof Request ? url.url : String(url), 'http://studio.test').pathname
    paths.push(path)
    return Promise.resolve(
      new Response(JSON.stringify(body(path)), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
  }
  return paths
}

describe('a held turn through the canonical Personal readers', () => {
  it('the space, the poll and reading back each parse it, its reply kept as recorded', async () => {
    serve((path) => BODIES[path])
    const space = await getPersonalSpace('token', null)
    const page = await getPersonalTurns('token', 1)
    const earlier = await getEarlierPersonalTurns('token', 3)
    for (const turns of [space.turns, page.turns, earlier.turns]) {
      const t = turns.find((x) => x.seq === 2)
      assert.deepEqual([t?.author, t?.text, t?.reply], ['person', HELD_WORDS, 'recorded'])
    }
    assert.equal(page.pending, false)
  })

  it('"Your data" copies it as the person said it, through DataSheet\'s unchanged export and text', async () => {
    const paths = serve((path) => BODIES[path])
    const text = exportText(await exportPersonalSpace('token', 0, new AbortController().signal), 'Ana')
    assert.deepEqual(paths, ['/api/v1/personal/export'])
    assert.match(text, /You: Asked earlier\.\n.*You: Kept for later, not a question yet\.$/)
  })

  it('a reply state outside the contract is still refused, whole', async () => {
    serve(() => ({ revision: 3, turns: [{ ...held, reply: 'kept' }], pending: false }))
    await assert.rejects(getPersonalTurns('token', 1))
    serve(() => ({ revision: 3, turns: [{ ...held, reply: 'Recorded' }], pending: false }))
    await assert.rejects(getPersonalTurns('token', 1))
  })
})

// INC03-DES-001: a controlled space's copy (A54's export, read whole by exportControlledSpace): under each message how
// its answer stands, with every decision and call as recorded, stable references between inputs, calls and what was
// kept, and when each page was made. Never a route, payer or host.
/** A controlled input's control, withdrawn after a launch unless told. */
const control = (over: object) => ({
  state: 'withdrawn' as const,
  revision: 2,
  heldReason: null,
  withdrawnPhase: 'after_launch' as const,
  replaces: null,
  replacedBy: [],
  ...over,
})

describe('a controlled space’s copy says how each answer stands, completely', () => {
  const X = '20000000-0000-4000-8000-00000000000a'
  const Y = '20000000-0000-4000-8000-00000000000b'
  const CALL = '30000000-0000-4000-8000-00000000000a'
  const ROUTE = 'route-should-never-be-copied'
  const turnOf = (n: number, text: string, input: string | null, over: object = {}) => ({
    id: `6f1c2a7e-0d4b-4c39-9a51-3e0b7d1c9b0${String(n)}`,
    seq: n,
    author: 'person' as const,
    text,
    createdAt: AT,
    replyTo: null,
    reply: 'answered' as const,
    suggestion: null,
    input: input === null ? null : { inputId: input, control: 'withdrawn' as const, revision: 2 },
    prompt: 'excluded' as const,
    activity: true,
    ...over,
  })
  const view = (inputId: string, n: number, over: object) => ({
    inputId,
    turnId: `6f1c2a7e-0d4b-4c39-9a51-3e0b7d1c9b0${String(n)}`,
    seq: n,
    createdAt: AT,
    reply: 'answered' as const,
    decisions: [],
    route: { routeId: ROUTE, profileDigest: 'digest-should-never-be-copied' },
    prior: { financial: 'unresolved' as const, effect: 'possible' as const, answer: 'withheld' as const },
    calls: [],
    withheld: [],
    ...over,
  })
  const everything = {
    exportedAt: AT,
    epoch: 1,
    next: null,
    notes: [],
    releases: [],
    turns: [
      turnOf(1, 'Draft it.', X),
      turnOf(2, 'Shorter.', Y, { reply: 'recorded', activity: false, prompt: 'excluded' }),
      turnOf(3, 'And later.', null),
    ],
    inputs: [
      view(X, 1, {
        control: control({ replacedBy: [Y] }),
        decisions: [
          {
            seq: 4,
            operation: 'send',
            outcome: 'admitted',
            reason: null,
            late: true,
            epoch: 1,
            admittedAt: AT,
            policy: 'personal-default-answer',
            policyVersion: 1,
            family: 'answer',
            basis: 'personal_default_addressee',
          },
        ],
        calls: [
          {
            callId: CALL,
            financial: 'uncertain',
            reason: 'provider_timeout',
            launch: 'launching',
            answer: 'withheld',
            possibleEffect: true,
          },
        ],
        withheld: [
          {
            callId: CALL,
            text: 'Thursday, then.',
            suggestion: 'Say Thursday',
            source: 'late_settlement',
            at: '2026-10-01T10:05:00.000Z',
          },
        ],
      }),
      view(Y, 2, {
        control: control({
          state: 'held',
          revision: 1,
          withdrawnPhase: null,
          heldReason: 'admission_off',
          replaces: X,
        }),
        prior: { financial: 'none', effect: 'none', answer: 'none' },
      }),
    ],
    pages: [
      { from: 1, exportedAt: AT },
      { from: 3, exportedAt: '2026-10-01T10:00:07.000Z' },
    ],
  }

  it('names each input, its control, links, every decision and call, and what was kept from which call', () => {
    const text = exportText(everything, 'Luis')
    const lines = text.split('\n')
    const has = (line: string) => assert.ok(lines.includes(line), `${line}\n---\n${text}`)
    has('  Input 1 (control revision 2)')
    has('  Withdrawn; work may already have started · cost not settled yet')
    has(`  Replaced by input 2 (your message of ${FULL(AT)})`)
    has('  Original request: answer kept aside · cost not settled yet · may have had an effect')
    has(
      `  Decision 4: Sent, admitted, late; admitted ${FULL(AT)}; epoch 1; personal-default-answer v1 (answer, personal default addressee)`,
    )
    has('  Call 1: cost not known · launching · answer kept aside · may have had an effect · provider timeout')
    has(`  Kept aside from call 1 (late settlement), at ${FULL('2026-10-01T10:05:00.000Z')}: Thursday, then.`)
    has('    Suggested note with it: Say Thursday')
    has('  Input 2 (control revision 1)')
    has('  Held to replace an earlier message — not asked yet · answers are off')
    has(`  Replaces input 1 (your message of ${FULL(AT)})`)
    has('  Not counted as time together')
    has(`(The rest as of ${FULL('2026-10-01T10:00:07.000Z')})`)
    // X, held Y (a held message isn't used: 0103's prompt eligibility) and the plain turn.
    assert.equal(
      lines.filter((l) => l === '  Not used for what Sophia says next').length,
      3,
      'X, held Y, the plain turn',
    )
    // R03: each input's control exactly as recorded, apart from the friendly line.
    has('  Control: withdrawn · phase after_launch · held reason none')
    has('  Control: held · phase none · held reason admission_off')
    has('  Original request: no answer · no cost')
    assert.ok(!text.includes(ROUTE) && !text.includes('digest-should-never'), 'no route, no profile')
  })
})

// R03: the copy keeps each control's exact state and withdrawal phase (and none where none), for every state A54 has,
// apart from the friendly words (before_reservation and before_launch read alike there, never here).
describe('a controlled space’s copy keeps every control state and phase exactly', () => {
  const X = '20000000-0000-4000-8000-00000000000a'
  const phases = [
    null,
    'before_admission',
    'before_reservation',
    'before_launch',
    'after_launch',
    'after_publication',
  ] as const
  const states = [['active', null], ['held', null], ...phases.map((phase) => ['withdrawn', phase] as const)] as const

  it('writes state, phase and held reason as recorded, none for null', () => {
    for (const [state, phase] of states) {
      const text = exportText(
        {
          exportedAt: AT,
          epoch: 1,
          next: null,
          notes: [],
          releases: [],
          turns: [
            {
              id: '6f1c2a7e-0d4b-4c39-9a51-3e0b7d1c9c01',
              seq: 1,
              author: 'person',
              text: 'A message.',
              createdAt: AT,
              replyTo: null,
              reply: 'answered',
              suggestion: null,
              input: { inputId: X, control: state, revision: 1 },
              prompt: 'eligible',
              activity: true,
            },
          ],
          inputs: [
            {
              inputId: X,
              turnId: '6f1c2a7e-0d4b-4c39-9a51-3e0b7d1c9c01',
              seq: 1,
              createdAt: AT,
              reply: 'answered',
              decisions: [],
              route: null,
              control: {
                state,
                revision: 1,
                heldReason: state === 'held' ? 'prior_in_progress' : null,
                withdrawnPhase: phase,
                replaces: null,
                replacedBy: [],
              },
              prior: { financial: 'none', effect: 'none', answer: 'none' },
              calls: [],
              withheld: [],
            },
          ],
        },
        'Luis',
      )
      const reason = state === 'held' ? 'prior_in_progress' : 'none'
      assert.ok(
        text.split('\n').includes(`  Control: ${state} · phase ${phase ?? 'none'} · held reason ${reason}`),
        `${state}/${String(phase)}\n${text}`,
      )
    }
  })
})
