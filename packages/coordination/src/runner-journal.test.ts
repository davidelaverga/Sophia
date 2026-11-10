import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { JournalLocked, RunnerJournal } from './runner-journal.ts'
import { digestOf, type RunnerEnvelope } from './runner-port.ts'
import { deriveIdentity } from './t3-port-mapping.ts'

const root = mkdtempSync(join(tmpdir(), 'sophia-runner-journal-'))
after(() => rmSync(root, { recursive: true, force: true }))
let n = 0
const fresh = () => join(root, `j${(n += 1)}`, 'journal.jsonl')

const OP = '00000000-0000-4000-8000-000000000001'
const envelope: RunnerEnvelope = {
  v: 1,
  operationId: OP,
  kind: 'create',
  projectId: '00000000-0000-4000-8000-0000000000a1',
  ownerId: '00000000-0000-4000-8000-0000000000b1',
  resourceId: '00000000-0000-4000-8000-0000000000c1',
  bindingId: '00000000-0000-4000-8000-0000000000d1',
  goalId: '00000000-0000-4000-8000-0000000000e1',
  qualificationId: '00000000-0000-4000-8000-0000000000f1',
  qualificationRevision: 1,
  adapterPin: 'ade473018d32003658b7d38693e083ee2e314bd8',
  environmentRef: 'env-owner-1',
  nativeProjectRef: 'project-sophia',
  profileId: 'read-only-v1',
  profileRevision: 1,
  accountKey: 'claude:acct-1',
  authorityEpoch: 1,
  message: 'Report the Ask admission boundary.',
  title: 'Read-only qualification',
  targetOperationId: null,
  nativeThreadId: null,
}
const identity = deriveIdentity(envelope, 'client:s1')
const digest = digestOf(envelope)

/** A valid journal on disk (header, intent, possible send), its lock released, and its lines. */
function written(): { file: string; lines: Record<string, unknown>[] } {
  const file = fresh()
  const j = new RunnerJournal(file)
  j.append('intent', OP, { digest, envelope, identity })
  j.append('possible_send', OP, {})
  j.close()
  const lines = readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>)
  return { file, lines }
}
const rewrite = (file: string, lines: unknown[]) =>
  writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`)

// r3 (R2-F03) fixtures: journal records built from their envelopes.
const NS = 'client:s1'
const op = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
type Rec = Record<string, unknown>
const intent = (e: RunnerEnvelope, id = deriveIdentity(e, NS)): Rec => ({
  type: 'intent',
  operationId: e.operationId,
  digest: digestOf(e),
  envelope: e,
  identity: id,
})
const sent = (e: RunnerEnvelope): Rec => ({ type: 'possible_send', operationId: e.operationId })
const answer = (e: RunnerEnvelope, a: Rec): Rec => ({ type: 'answer', operationId: e.operationId, answer: a })
const at = (records: Rec[], i: number, r: Rec) => records.map((x, k) => (k === i ? r : x))

describe('every complete record is validated, or the journal does not open (R1-F03)', () => {
  const cases: [string, (lines: Record<string, unknown>[]) => unknown[]][] = [
    ['an unknown type', (l) => [...l, { seq: 3, time: 1, type: 'possible_senD', operationId: OP }]],
    ['a missing field', (l) => [...l, { seq: 3, time: 1, type: 'unknown', operationId: OP }]],
    ['a field of the wrong type', (l) => [...l, { seq: 3, time: 1, type: 'unknown', operationId: OP, reason: 7 }]],
    ['an extra field', (l) => [...l, { seq: 3, time: 1, type: 'unknown', operationId: OP, reason: 'r', tool: 'x' }]],
    ['a gap in seq', (l) => [...l, { seq: 5, time: 1, type: 'unknown', operationId: OP, reason: 'r' }]],
    ['a repeated seq', (l) => [...l, { seq: 2, time: 1, type: 'unknown', operationId: OP, reason: 'r' }]],
    ['a second header', (l) => [...l, { ...l[0], seq: 3 }]],
    ['no header first', (l) => l.slice(1).map((r, i) => ({ ...r, seq: i }))],
    ['an intent whose digest does not bind its envelope', (l) => [l[0], { ...l[1], digest: 'f'.repeat(64) }, l[2]]],
    [
      'an intent naming another operation',
      (l) => [
        l[0],
        { ...l[1], operationId: '00000000-0000-4000-8000-000000000002' },
        { ...l[2], operationId: '00000000-0000-4000-8000-000000000002' },
      ],
    ],
    ['a possible send without an intent', (l) => [l[0], { seq: 1, time: 1, type: 'possible_send', operationId: OP }]],
    [
      'an answer without a possible send',
      (l) => [
        l[0],
        l[1],
        {
          seq: 2,
          time: 1,
          type: 'answer',
          operationId: OP,
          answer: { kind: 'received', identity, runId: 'r', delivery: 'started' },
        },
      ],
    ],
    [
      'a second answer',
      (l) => [
        ...l,
        ...[3, 4].map((seq) => ({
          seq,
          time: 1,
          type: 'answer',
          operationId: OP,
          answer: { kind: 'received', identity, runId: 'r', delivery: 'started' },
        })),
      ],
    ],
    [
      'an answer with other identities',
      (l) => [
        ...l,
        {
          seq: 3,
          time: 1,
          type: 'answer',
          operationId: OP,
          answer: { kind: 'received', identity: { ...identity, threadId: 'other' }, runId: 'r', delivery: 'started' },
        },
      ],
    ],
    [
      'an answer of a non-final kind',
      (l) => [...l, { seq: 3, time: 1, type: 'answer', operationId: OP, answer: { kind: 'not_sent', reason: 'r' } }],
    ],
    ['an intent after a possible send', (l) => [...l, { ...l[1], seq: 3 }]],
    ['a second intent before a possible send (r3)', (l) => [l[0], l[1], { ...l[1], seq: 2 }]],
    [
      'a refusal after an intent',
      (l) => [...l, { seq: 3, time: 1, type: 'refused', operationId: OP, digest, reason: 'r' }],
    ],
    ['an empty line in the middle', (l) => [l[0], '', l[1], l[2]]],
  ]
  for (const [name, mutate] of cases) {
    it(`refuses ${name}`, () => {
      const { file, lines } = written()
      const mutated = mutate(lines)
      writeFileSync(file, `${mutated.map((l) => (l === '' ? '' : JSON.stringify(l))).join('\n')}\n`)
      assert.throws(() => new RunnerJournal(file), /corrupt/)
    })
  }

  it('refuses a complete line that does not parse, even the last one', () => {
    const { file } = written()
    appendFileSync(file, '{"seq":3,"type":\n')
    assert.throws(() => new RunnerJournal(file), /corrupt/)
  })

  it('cuts only a torn final line (no newline), and keeps the possible send it had', () => {
    const { file } = written()
    appendFileSync(file, '{"seq":3,"time":1,"type":"answ')
    const j = new RunnerJournal(file)
    assert.equal(j.entry(OP)?.possibleSend, true)
    assert.equal(readFileSync(file, 'utf8').endsWith('}\n'), true)
    j.close()
  })

  it('validates and terminates a complete final record whose newline was cut', () => {
    const { file, lines } = written()
    rewrite(file, lines)
    writeFileSync(file, readFileSync(file, 'utf8').trimEnd())
    const j = new RunnerJournal(file)
    assert.equal(j.entry(OP)?.possibleSend, true)
    j.close()
    assert.equal(readFileSync(file, 'utf8').endsWith('\n'), true)
  })

  it('keeps its id across reopening, and creates its files owner-only', () => {
    const file = fresh()
    const first = new RunnerJournal(file)
    const id = first.id
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.equal(statSync(`${file}.lock`).mode & 0o777, 0o600)
    assert.equal(statSync(join(file, '..')).mode & 0o777, 0o700)
    first.close()
    const again = new RunnerJournal(file)
    assert.equal(again.id, id)
    again.close()
  })

  it('refuses an append the transition rules forbid, writing nothing', () => {
    const file = fresh()
    const j = new RunnerJournal(file)
    const before = readFileSync(file, 'utf8')
    assert.throws(() => j.append('possible_send', OP, {}), /possible send without a fresh intent/)
    assert.equal(readFileSync(file, 'utf8'), before)
    j.close()
  })
})

describe('journaled identities are bound to their operation (r3, R2-F03)', () => {
  const created = envelope
  const createdId = identity
  const follow = (i: number, kind: 'input' | 'stop', over: Partial<RunnerEnvelope> = {}): RunnerEnvelope => ({
    ...envelope,
    operationId: op(i),
    kind,
    title: null,
    message: kind === 'input' ? 'And the outbox boundary?' : null,
    targetOperationId: OP,
    nativeThreadId: createdId.threadId,
    ...over,
  })
  const input = follow(2, 'input')
  const stop = follow(3, 'stop')
  const received = (e: RunnerEnvelope, delivery: string, id = deriveIdentity(e, NS)): Rec =>
    answer(e, { kind: 'received', identity: id, runId: 'run-1', delivery })
  /** A create received, an input received queued, a stop acknowledged: every record valid. */
  const history = (): Rec[] => [
    intent(created),
    sent(created),
    received(created, 'started'),
    intent(input),
    sent(input),
    received(input, 'queued'),
    intent(stop),
    sent(stop),
    received(stop, 'stop_requested'),
  ]
  /** Write a journal of exactly these records after a valid header, seq assigned in order. */
  function journalOf(records: Rec[]): string {
    const file = fresh()
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    const header = { seq: 0, time: 1, type: 'header', journalId: randomUUID(), version: 1 }
    rewrite(file, [header, ...records.map((r, i) => ({ seq: i + 1, time: 1, ...r }))])
    return file
  }

  it('opens the valid history, and keeps every entry across a reopen', () => {
    const file = journalOf(history())
    const j = new RunnerJournal(file)
    assert.equal(j.entry(input.operationId)?.answer?.kind, 'received')
    assert.equal(j.entry(stop.operationId)?.answer?.kind, 'received')
    j.close()
    new RunnerJournal(file).close()
  })

  const other = { ...created, operationId: op(9), bindingId: '00000000-0000-4000-8000-0000000000d2' }
  const otherId = deriveIdentity(other, NS)
  const mutations: [string, RegExp, (h: Rec[]) => Rec[]][] = [
    [
      "a create intent carrying another create's identities (and its answer the same)",
      /not the derivation/,
      (h) => at(at(h, 0, intent(created, otherId)), 2, received(created, 'started', otherId)),
    ],
    [
      'a create intent whose namespace is not the one its ids were derived under',
      /not the derivation/,
      (h) =>
        at(
          at(h, 0, intent(created, { ...createdId, namespace: 'client:s2' })),
          2,
          received(created, 'started', { ...createdId, namespace: 'client:s2' }),
        ),
    ],
    [
      'a create intent without its message id',
      /not the derivation/,
      (h) => at(h, 0, intent(created, { ...createdId, messageId: null })),
    ],
    [
      "an input intent carrying a Stop's derivation of its own id",
      /not the derivation/,
      (h) => at(h, 3, intent(input, deriveIdentity({ ...input, kind: 'stop', message: null }, NS))),
    ],
    [
      "an input intent whose thread is not its envelope's",
      /not the derivation/,
      (h) => at(h, 3, intent(input, { ...deriveIdentity(input, NS), threadId: otherId.threadId })),
    ],
    [
      'a Stop intent with a message id',
      /not the derivation/,
      (h) => at(h, 6, intent(stop, { ...deriveIdentity(stop, NS), messageId: 'm' })),
    ],
    [
      'an input targeting a create this journal never held',
      /target is not a create/,
      (h) => {
        const e = follow(2, 'input', { targetOperationId: op(9) })
        return at(at(h, 3, intent(e)), 5, received(e, 'queued'))
      },
    ],
    [
      "an input on a thread other than its target create's receipt",
      /thread is not its target/,
      (h) => {
        const e = follow(2, 'input', { nativeThreadId: otherId.threadId })
        return at(at(h, 3, intent(e)), 5, received(e, 'queued'))
      },
    ],
    ...(['accountKey', 'bindingId', 'qualificationRevision', 'profileId'] as const).map(
      (k): [string, RegExp, (h: Rec[]) => Rec[]] => [
        `an input whose ${k} is not its target create's`,
        new RegExp(`its ${k} is not its target create's`),
        (h) => {
          const moved = {
            accountKey: 'claude:acct-2',
            bindingId: other.bindingId,
            qualificationRevision: 2,
            profileId: 'p2',
          }
          const e = follow(2, 'input', { [k]: moved[k] })
          return at(at(h, 3, intent(e)), 5, received(e, 'queued'))
        },
      ],
    ),
    ['an input whose target create has no receipt', /has no receipt here/, (h) => h.filter((_, i) => i !== 2)],
    [
      'a Stop targeting an input, not a create',
      /target is not a create/,
      (h) => {
        const e = follow(3, 'stop', { targetOperationId: input.operationId })
        return at(at(h, 6, intent(e)), 8, received(e, 'stop_requested'))
      },
    ],
    ['a create received as queued', /a create received as queued/, (h) => at(h, 2, received(created, 'queued'))],
    [
      'an input received as stop_requested',
      /an input received as stop_requested/,
      (h) => at(h, 5, received(input, 'stop_requested')),
    ],
    ['a Stop received as started', /a stop received as started/, (h) => at(h, 8, received(stop, 'started'))],
    [
      "an input answered with its create's identity",
      /identities other than its intent/,
      (h) => at(h, 5, received(input, 'queued', createdId)),
    ],
    [
      'a violated delivery of a create',
      /violated delivery of a create/,
      (h) => at(h, 2, answer(created, { kind: 'unknown', identity: createdId, reason: 'r', violation: true })),
    ],
    [
      'a create settled by observation',
      /a create settled by observation/,
      (h) => at(h, 2, answer(created, { kind: 'settled', identity: createdId, reason: 'r' })),
    ],
    [
      'a Stop settled without its identity',
      /identities other than its intent/,
      (h) => at(h, 8, answer(stop, { kind: 'settled', identity: null, reason: 'r' })),
    ],
  ]
  for (const [name, why, mutate] of mutations) {
    it(`refuses ${name}`, () => {
      assert.throws(
        () => new RunnerJournal(journalOf(mutate(history()))),
        (err: Error) => {
          assert.match(err.message, /corrupt/)
          assert.match(err.message, why)
          return true
        },
      )
    })
  }

  it('refuses to append an intent whose identity is not its derivation, or a follow-up of a foreign target', () => {
    const file = journalOf(history().slice(0, 3))
    const j = new RunnerJournal(file)
    const before = readFileSync(file, 'utf8')
    const e = follow(4, 'input')
    assert.throws(
      () => j.append('intent', e.operationId, { digest: digestOf(e), envelope: e, identity: otherId }),
      /not the derivation/,
    )
    const foreign = follow(5, 'input', { targetOperationId: op(9) })
    assert.throws(
      () =>
        j.append('intent', foreign.operationId, {
          digest: digestOf(foreign),
          envelope: foreign,
          identity: deriveIdentity(foreign, NS),
        }),
      /target is not a create/,
    )
    assert.equal(readFileSync(file, 'utf8'), before)
    j.close()
  })
})

describe('one writer per journal (R1-F02)', () => {
  it('refuses a second instance while the first holds the journal, and admits one after release', () => {
    const file = fresh()
    const first = new RunnerJournal(file)
    assert.throws(() => new RunnerJournal(file), JournalLocked)
    first.close()
    const second = new RunnerJournal(file)
    assert.equal(second.id, first.id)
    second.close()
  })

  it('recovers the lock of a process that is gone, and keeps the stale lock as evidence', () => {
    const file = fresh()
    new RunnerJournal(file).close()
    // A dead holder on this host: a pid no process has.
    writeFileSync(
      `${file}.lock`,
      JSON.stringify({ pid: 2 ** 22 + 7, host: hostname(), start: null, token: 'dead', journal: file }),
    )
    const j = new RunnerJournal(file)
    assert.notEqual(JSON.parse(readFileSync(`${file}.lock`, 'utf8')).token, 'dead')
    j.close()
  })

  it('never presumes stale a lock from another host or one it cannot read', () => {
    const file = fresh()
    new RunnerJournal(file).close()
    writeFileSync(
      `${file}.lock`,
      JSON.stringify({ pid: 2 ** 22 + 7, host: 'another-host', start: null, token: 't', journal: file }),
    )
    assert.throws(() => new RunnerJournal(file), /another host/)
    writeFileSync(`${file}.lock`, '{"pid": 12')
    assert.throws(() => new RunnerJournal(file), /cannot be read/)
  })

  it('fails closed when its lock is taken away or the file is written by someone else', () => {
    const file = fresh()
    const j = new RunnerJournal(file)
    appendFileSync(file, 'x')
    assert.throws(() => j.append('intent', OP, { digest, envelope, identity }), /another writer/)
    j.close()
    const k = new RunnerJournal(fresh())
    const kFile = join(root, `j${n}`, 'journal.jsonl')
    writeFileSync(
      `${kFile}.lock`,
      JSON.stringify({ pid: process.pid, host: hostname(), start: null, token: 'someone-else', journal: kFile }),
    )
    assert.throws(() => k.append('intent', OP, { digest, envelope, identity }), JournalLocked)
  })
})
