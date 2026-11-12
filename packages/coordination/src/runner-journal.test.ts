import { after, describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs, {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
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
/** Journal fixtures are written as the journal writes them: owner-only (repair 5 refuses anything readable by others). */
const rewrite = (file: string, lines: unknown[]) =>
  writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`, { mode: 0o600 })

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

describe("the journal's private path, at the journal itself (repair 5, NATIVE4-F01)", () => {
  it('stops appending once its open file is made readable by others: nothing written, the lock still released', () => {
    const file = fresh()
    const j = new RunnerJournal(file)
    chmodSync(file, 0o640)
    const before = readFileSync(file)
    assert.throws(() => j.append('intent', OP, { digest, envelope, identity }), /runner journal path is unsafe/)
    assert.deepEqual(readFileSync(file), before)
    j.close()
    assert.throws(() => statSync(`${file}.lock`), /ENOENT/)
  })

  it('judges a symlinked directory by its real directory: private is opened, writable by others is refused', () => {
    const real = mkdtempSync(join(root, 'real-'))
    const link = join(root, `link-${(n += 1)}`)
    symlinkSync(real, link)
    const j = new RunnerJournal(join(link, 'journal.jsonl'))
    j.append('intent', OP, { digest, envelope, identity })
    j.close()
    assert.equal(statSync(join(real, 'journal.jsonl')).mode & 0o777, 0o600)
    const shared = mkdtempSync(join(root, 'shared-'))
    chmodSync(shared, 0o777)
    const viaLink = join(root, `link-${(n += 1)}`)
    symlinkSync(shared, viaLink)
    assert.throws(() => new RunnerJournal(join(viaLink, 'journal.jsonl')), /runner journal path is unsafe/)
    assert.throws(() => statSync(join(shared, 'journal.jsonl')), /ENOENT/)
  })
})

describe('a journal holding v1 and v2 intents (INC01-CC-005, 0096)', () => {
  it('reloads both, binds each by its own digest, and keeps no instruction text', () => {
    const file = join(root, `journal-v2-${randomUUID()}.jsonl`)
    const journal = new RunnerJournal(file)
    const v1 = { ...envelope, operationId: '00000000-0000-4000-8000-0000000000e1' }
    const { message: _m, title: _t, ...common } = envelope
    const v2 = {
      ...common,
      operationId: '00000000-0000-4000-8000-0000000000e2',
      v: 2,
      payloadSha256: 'a'.repeat(64),
      manifestSha256: 'c'.repeat(64),
      baseCommit: '0123456789abcdef0123456789abcdef01234567',
      writeScope: 'read_only',
      settings: { instanceId: 'claudeAgent', model: 'synthetic-model', options: [] },
    } as unknown as RunnerEnvelope
    for (const e of [v1, v2]) {
      journal.append('intent', e.operationId, {
        digest: digestOf(e),
        envelope: e,
        identity: deriveIdentity(e, 'client:s1'),
      })
      journal.append('possible_send', e.operationId, {})
    }
    journal.close()
    const reopened = new RunnerJournal(file)
    assert.equal(reopened.entry(v1.operationId)?.envelope?.v, 1)
    assert.equal(reopened.entry(v2.operationId)?.envelope?.v, 2)
    assert.equal(reopened.entry(v2.operationId)?.digest, digestOf(v2))
    reopened.close()
    assert.equal(
      readFileSync(file, 'utf8').includes('"message"'),
      true,
      'the v1 intent keeps its inline text, as before',
    )
    const v2Line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.includes(v2.operationId) && l.includes('"intent"'))
    assert.equal(v2Line?.includes('"message"'), false, 'the v2 intent holds no instruction')
  })
})

// ---- repair 13 (NATIVE12-F01 and F01-A3): every intended byte, or nothing usable ----

/**
 * What one faulted writeSync call does.
 * - A number writes that many bytes for real and returns it.
 * - 'rest' writes the rest.
 * - 'zero' writes nothing and returns 0.
 * - 'over', 'negative', 'nan' and 'fraction' return impossible progress.
 * - 'throw' writes nothing and throws ENOSPC.
 * - `{ cut }` writes the number of bytes it computes from the call's bytes.
 * - A function does its own thing and continues nothing.
 */
type Step =
  | number
  | 'rest'
  | 'zero'
  | 'throw'
  | 'over'
  | 'negative'
  | 'nan'
  | 'fraction'
  | { readonly cut: (bytes: Buffer) => number }
  | ((fd: number, bytes: Buffer, position: number | null) => number)
const realWriteSync = fs.writeSync
const enospc = () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
const selects = (text: string) => (bytes: Buffer) => bytes.includes(text)
const NEWLINE = (bytes: Buffer) => bytes.length === 1 && bytes[0] === 0x0a

/** One writeSync call, in either of its forms, as its bytes and position. */
function requestOf(data: unknown, a: unknown, b: unknown, c: unknown): { bytes: Buffer; position: number | null } {
  if (typeof data === 'string') return { bytes: Buffer.from(data, 'utf8'), position: typeof a === 'number' ? a : null }
  const view = data as Buffer
  const offset = typeof a === 'number' ? a : 0
  const length = typeof b === 'number' ? b : view.length - offset
  return { bytes: Buffer.from(view.subarray(offset, offset + length)), position: typeof c === 'number' ? c : null }
}
type Writing = Exclude<Step, 'throw' | ((...args: never[]) => number)>
/** How many of the call's bytes a step really writes. */
function bytesFor(step: Writing, bytes: Buffer): number {
  if (step === 'rest' || step === 'over') return bytes.length
  if (typeof step === 'number') return step
  return typeof step === 'object' ? step.cut(bytes) : 0
}
/** What a step reports as written: the truth, or impossible progress. */
function reported(step: Writing, wroteBytes: number): number {
  if (step === 'over') return wroteBytes + 1
  if (step === 'negative') return -1
  if (step === 'nan') return Number.NaN
  return step === 'fraction' ? 1.5 : wroteBytes
}

/**
 * TEST-PROCESS-ONLY write faults (repair 13). `fs.writeSync` is replaced for this process, and the named ESM imports of
 * the modules under test are resynchronized to it; both are restored in `finally`. The first call whose bytes `select`
 * picks gets `steps[0]`. Each following call that continues exactly its remaining bytes, at the next position, gets the
 * next step. Every other call is the real writeSync. The bytes a fault "writes" really reach the file.
 */
async function withWrites<T>(
  select: (bytes: Buffer) => boolean,
  steps: readonly Step[],
  run: () => T | Promise<T>,
): Promise<{ value: T | undefined; error: unknown; hits: number }> {
  const left = [...steps]
  let hits = 0
  let pending: Buffer | null = null
  const fake = (fd: number, data: unknown, a?: unknown, b?: unknown, c?: unknown): number => {
    const { bytes, position } = requestOf(data, a, b, c)
    const continues = pending !== null && bytes.equals(pending)
    const step = continues || (hits === 0 && select(bytes)) ? left.shift() : undefined
    pending = null
    if (step === undefined) return realWriteSync(fd, bytes, 0, bytes.length, position)
    hits += 1
    if (typeof step === 'function') return step(fd, bytes, position)
    if (step === 'throw') throw enospc()
    const k = bytesFor(step, bytes)
    const wroteBytes = k === 0 ? 0 : realWriteSync(fd, bytes, 0, k, position)
    pending = bytes.subarray(wroteBytes)
    return reported(step, wroteBytes)
  }
  const mocked = mock.method(fs, 'writeSync', fake as unknown as typeof fs.writeSync)
  syncBuiltinESMExports()
  try {
    try {
      return { value: await run(), error: undefined, hits }
    } catch (error) {
      return { value: undefined, error, hits }
    }
  } finally {
    mocked.mock.restore()
    syncBuiltinESMExports()
    assert.equal(fs.writeSync, realWriteSync, 'the real writeSync is restored')
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
const NO_PROGRESS = /runner journal: a write made no valid progress/
const LOCK_NO_PROGRESS = /runner journal lock: a write made no valid progress/
/** A create whose instruction holds 2-, 3- and 4-byte UTF-8 characters, and its identity. */
const MULTI: RunnerEnvelope = {
  ...envelope,
  operationId: '00000000-0000-4000-8000-000000000013',
  message: 'Rapport é – 🚀 fin.',
}
const MULTI_ID = deriveIdentity(MULTI, 'client:s1')
const MOP = MULTI.operationId
/** A byte count that ends inside the rocket (2 of its 4 bytes), for a line that contains it. */
const insideRocket = (bytes: Buffer) => bytes.indexOf(Buffer.from('🚀')) + 2
const linesOf = (file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as { type: string }).type)
/** Open, observe and close: the id and the records of a reopened journal, or why it did not open. */
function reopenOf(file: string): { id: string; records: string[] } | string {
  try {
    const j = new RunnerJournal(file)
    const id = j.id
    j.close()
    return { id, records: linesOf(file) }
  } catch (err) {
    return messageOf(err)
  }
}

describe('the header is whole before the journal has an id (repair 13, NATIVE12-F01)', () => {
  for (const k of [1, 40, 'last'] as const) {
    it(`completes a header cut short at ${k} byte(s), and reopens with the same id and records`, async () => {
      const file = fresh()
      const run = await withWrites(
        selects('"type":"header"'),
        [{ cut: (b) => (k === 'last' ? b.length - 1 : k) }, 'rest'],
        () => {
          const j = new RunnerJournal(file)
          j.append('intent', MOP, { digest: digestOf(MULTI), envelope: MULTI, identity: MULTI_ID })
          const id = j.id
          j.close()
          return id
        },
      )
      assert.deepEqual(
        { hits: run.hits, error: messageOf(run.error ?? ''), reopened: reopenOf(file) },
        { hits: 2, error: '', reopened: { id: run.value, records: ['header', 'intent'] } },
      )
    })
  }

  for (const step of ['zero', 'negative', 'nan', 'fraction', 'over'] as const) {
    it(`refuses a header write of ${step} progress: no id, the lock released, a later opening whole`, async () => {
      const file = fresh()
      const run = await withWrites(selects('"type":"header"'), [step], () => new RunnerJournal(file).id)
      assert.equal(run.hits, 1)
      assert.match(messageOf(run.error), NO_PROGRESS)
      assert.equal(existsSync(`${file}.lock`), false, 'the lock is released')
      const later = reopenOf(file)
      assert.ok(typeof later === 'object', JSON.stringify(later))
      assert.deepEqual(later.records, ['header'])
    })
  }

  it('fails the opening when the header write throws after a prefix: no id; a later opening starts whole', async () => {
    const file = fresh()
    const run = await withWrites(selects('"type":"header"'), [30, 'throw'], () => new RunnerJournal(file).id)
    assert.deepEqual({ hits: run.hits, error: messageOf(run.error) }, { hits: 2, error: messageOf(enospc()) })
    assert.equal(statSync(file).size, 30, 'only the torn prefix is on disk')
    const later = reopenOf(file)
    assert.ok(typeof later === 'object', JSON.stringify(later))
    assert.deepEqual(later.records, ['header'])
  })
})

describe('every record is whole before anything advances (repair 13, NATIVE12-F01)', () => {
  const bodies = {
    intent: { digest: digestOf(MULTI), envelope: MULTI, identity: MULTI_ID },
    possible_send: {},
    answer: { answer: { kind: 'received', identity: MULTI_ID, runId: 'run-1', delivery: 'started' } },
    unknown: { reason: 'the reply was lost: é – 🚀' },
    refused: { digest: digestOf(MULTI), reason: 'refused: not this host — é 🚀' },
  } as const
  type Kind = keyof typeof bodies
  const before: Record<Kind, Kind[]> = {
    intent: [],
    possible_send: ['intent'],
    answer: ['intent', 'possible_send'],
    unknown: ['intent', 'possible_send'],
    refused: [],
  }
  /** A journal with the records before `kind`, and the append of `kind` under the given fault. */
  async function appendUnder(kind: Kind, steps: Step[]) {
    const file = fresh()
    const j = new RunnerJournal(file)
    const id = j.id
    for (const k of before[kind]) j.append(k, MOP, bodies[k])
    const prior = readFileSync(file)
    const entry = JSON.stringify(j.entry(MOP) ?? null)
    const run = await withWrites(selects(`"type":"${kind}"`), steps, () => j.append(kind, MOP, bodies[kind] as never))
    const entryAfter = JSON.stringify(j.entry(MOP) ?? null)
    let next = 'appended'
    try {
      j.append('refused', '00000000-0000-4000-8000-0000000000ff', { digest: 'a'.repeat(64), reason: 'r' })
    } catch (err) {
      next = messageOf(err)
    }
    j.close()
    return { file, id, prior, entry, entryAfter, run, next }
  }

  for (const kind of Object.keys(bodies) as Kind[]) {
    it(`completes a ${kind} record cut short inside a multibyte character, and reopens it whole`, async () => {
      const r = await appendUnder(kind, [
        { cut: (b) => (b.includes(Buffer.from('🚀')) ? insideRocket(b) : Math.floor(b.length / 2)) },
        'rest',
      ])
      assert.deepEqual(
        { hits: r.run.hits, error: messageOf(r.run.error ?? ''), next: r.next, reopened: reopenOf(r.file) },
        {
          hits: 2,
          error: '',
          next: 'appended',
          reopened: { id: r.id, records: ['header', ...before[kind], kind, 'refused'] },
        },
      )
    })

    it(`refuses a ${kind} write of zero progress: nothing advances; a reopen keeps every earlier record`, async () => {
      const r = await appendUnder(kind, ['zero'])
      assert.equal(r.run.hits, 1)
      assert.match(messageOf(r.run.error), NO_PROGRESS)
      assert.equal(r.entryAfter, r.entry, 'the entry did not advance')
      assert.deepEqual(reopenOf(r.file), { id: r.id, records: ['header', ...before[kind], 'refused'] })
    })

    it(`fails a ${kind} write that throws after a prefix: nothing advances, the next append is fenced, the reopen cuts only the prefix`, async () => {
      const r = await appendUnder(kind, [25, 'throw'])
      assert.deepEqual({ hits: r.run.hits, error: messageOf(r.run.error) }, { hits: 2, error: messageOf(enospc()) })
      assert.equal(r.entryAfter, r.entry, 'the entry did not advance')
      assert.match(r.next, /written by another writer/)
      assert.deepEqual(reopenOf(r.file), { id: r.id, records: ['header', ...before[kind]] })
      assert.deepEqual(readFileSync(r.file), r.prior, 'every earlier byte, exactly')
    })
  }

  it('refuses over, negative, NaN and fractional progress on an append', async () => {
    for (const step of ['over', 'negative', 'nan', 'fraction'] as const) {
      const r = await appendUnder('intent', [step])
      assert.equal(r.run.hits, 1, step)
      assert.match(messageOf(r.run.error), NO_PROGRESS, step)
      assert.equal(r.entryAfter, r.entry, step)
    }
  })
})

describe('the newline that terminates a final record is whole too (repair 13, NATIVE12-F01)', () => {
  for (const step of ['zero', 'over'] as const) {
    it(`fails the opening on a ${step}-progress newline; a later opening terminates the record`, async () => {
      const { file } = written()
      writeFileSync(file, readFileSync(file, 'utf8').trimEnd())
      const run = await withWrites(NEWLINE, [step], () => new RunnerJournal(file).id)
      assert.equal(run.hits, 1)
      assert.match(messageOf(run.error), NO_PROGRESS)
      assert.equal(existsSync(`${file}.lock`), false, 'the lock is released')
      const later = new RunnerJournal(file)
      assert.equal(later.entry(OP)?.possibleSend, true)
      later.close()
      assert.equal(readFileSync(file, 'utf8').endsWith('}\n'), true)
    })
  }
})

describe("the lock's content is whole, or the journal does not open (repair 13, NATIVE12-F01)", () => {
  it('completes a lock cut short, then appends under it', async () => {
    const file = fresh()
    const run = await withWrites(selects('"token":'), [20, 'rest'], () => {
      const j = new RunnerJournal(file)
      j.append('intent', OP, { digest, envelope, identity })
      j.close()
      return j.id
    })
    assert.deepEqual(
      { hits: run.hits, error: messageOf(run.error ?? ''), reopened: reopenOf(file) },
      { hits: 2, error: '', reopened: { id: run.value, records: ['header', 'intent'] } },
    )
  })

  for (const steps of [['zero'], ['over'], [20, 'throw']] satisfies Step[][]) {
    it(`fails on a lock write of ${steps.join(' then ')}: no journal, no lock left, a later opening works`, async () => {
      const file = fresh()
      const run = await withWrites(selects('"token":'), [...steps], () => new RunnerJournal(file).id)
      assert.equal(run.hits, steps.length)
      assert.match(messageOf(run.error), steps.at(-1) === 'throw' ? /ENOSPC/ : LOCK_NO_PROGRESS)
      assert.equal(existsSync(`${file}.lock`), false, 'the lock this call created is removed')
      assert.equal(existsSync(file), false, 'no journal was created')
      assert.ok(typeof reopenOf(file) === 'object')
    })
  }

  it('never removes a lock that replaced its own during a failed creation', async () => {
    const file = fresh()
    const lock = `${file}.lock`
    const run = await withWrites(
      selects('"token":'),
      [
        () => {
          renameSync(lock, `${lock}.moved`)
          writeFileSync(lock, 'FOREIGN', { mode: 0o600 })
          return 0
        },
      ],
      () => new RunnerJournal(file).id,
    )
    assert.equal(run.hits, 1)
    assert.match(messageOf(run.error), LOCK_NO_PROGRESS)
    assert.equal(existsSync(lock), true, 'a lock still stands at the path')
    assert.equal(readFileSync(lock, 'utf8'), 'FOREIGN', 'the replacement is left in place')
    assert.equal(existsSync(file), false)
  })
})

const char = (c: string, k: number) => Buffer.from(c).subarray(0, k)
/** Append a torn record's bytes to a closed journal, and make them durable, as a crash mid-append leaves them. */
function tear(file: string, end: Buffer) {
  const fd = openSync(file, 'a')
  try {
    fs.writeSync(fd, Buffer.concat([Buffer.from('{"seq":9,"time":1,"type":"unknown","reason":"'), end]))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

describe('a torn UTF-8 tail is cut at its first byte, never into an earlier record (repair 13, NATIVE12-F01-A3)', () => {
  /** A journal with each kind of prefix, written and fsynced by the journal itself. */
  function prefix(kind: 'header' | 'intent' | 'possible_send' | 'answer'): { file: string; id: string } {
    const file = fresh()
    const j = new RunnerJournal(file)
    const id = j.id
    if (kind !== 'header') j.append('intent', MOP, { digest: digestOf(MULTI), envelope: MULTI, identity: MULTI_ID })
    if (kind === 'possible_send' || kind === 'answer') j.append('possible_send', MOP, {})
    if (kind === 'answer')
      j.append('answer', MOP, { answer: { kind: 'received', identity: MULTI_ID, runId: 'run-1', delivery: 'started' } })
    j.close()
    return { file, id }
  }
  const tails: [string, Buffer][] = [
    ['1 of 2 bytes', char('é', 1)],
    ['1 of 3 bytes', char('–', 1)],
    ['2 of 3 bytes', char('–', 2)],
    ['1 of 4 bytes', char('🚀', 1)],
    ['2 of 4 bytes', char('🚀', 2)],
    ['3 of 4 bytes (control)', char('🚀', 3)],
    ['ASCII (control)', Buffer.from('ab')],
    ['a whole 4-byte character (control)', Buffer.from('🚀')],
  ]
  for (const kind of ['header', 'intent', 'possible_send', 'answer'] as const) {
    it(`keeps every byte of a ${kind} prefix and its id, across two reopenings, for each torn tail`, () => {
      const seen: unknown[] = []
      for (const [name, end] of tails) {
        const { file, id } = prefix(kind)
        const exact = readFileSync(file)
        tear(file, end)
        const first = reopenOf(file)
        const afterFirst = readFileSync(file)
        const second = reopenOf(file)
        seen.push({
          tail: name,
          prefixKept: afterFirst.equals(exact),
          bytesLost: exact.length - afterFirst.length,
          first: typeof first === 'object' ? { sameId: first.id === id, records: first.records } : first,
          second: typeof second === 'object' ? { sameId: second.id === id, records: second.records } : second,
        })
      }
      const records = {
        header: ['header'],
        intent: ['header', 'intent'],
        possible_send: ['header', 'intent', 'possible_send'],
        answer: ['header', 'intent', 'possible_send', 'answer'],
      }[kind]
      assert.deepEqual(
        seen,
        tails.map(([name]) => ({
          tail: name,
          prefixKept: true,
          bytesLost: 0,
          first: { sameId: true, records },
          second: { sameId: true, records },
        })),
      )
    })
  }
})
