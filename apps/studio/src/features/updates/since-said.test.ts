import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import type { Since } from '../../api/vision.ts'
import {
  freshIn,
  linesOf,
  markPending,
  newsOf,
  readerOf,
  readPending,
  readSaid,
  rememberSaid,
  settlePending,
  unsaid,
} from './since-said.ts'

function storage(): Storage {
  const kept = new Map<string, string>()
  return {
    get length() {
      return kept.size
    },
    clear: () => kept.clear(),
    getItem: (k) => kept.get(k) ?? null,
    key: (i) => [...kept.keys()][i] ?? null,
    removeItem: (k) => void kept.delete(k),
    setItem: (k, v) => void kept.set(k, v),
  }
}

const uuid = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const READER = uuid(90)
const MARCO = uuid(91)
const window = (over: Partial<Since> = {}): Since => ({
  fromSequence: '3',
  toSequence: '9',
  more: false,
  decided: [],
  made: [],
  noted: [],
  open: [],
  work: [],
  names: {},
  ...over,
})
const decided = (n: number, by: { proposedBy?: string | null; decidedBy?: string | null } = {}) => ({
  decisionId: uuid(n),
  statement: `Decision ${String(n)}`,
  proposedBy: null,
  decidedBy: null,
  at: null,
  undoable: false,
  ...by,
})
const made = (n: number, askedBy: string | null = null) => ({
  artifactId: uuid(n),
  artifactVersionId: uuid(n + 50),
  title: `Report ${String(n)}`,
  versionNumber: 1,
  askedBy,
})
const noted = (n: number, actorId = MARCO) => ({
  entryId: uuid(n),
  kind: 'observation',
  text: `Note ${String(n)}`,
  authoredBy: 'member' as const,
  actorId,
  at: '2026-10-18T09:00:00.000Z',
})
const twoDecided = window({ decided: [decided(1), decided(2)] })
const ids = (w: Since | undefined) => w?.decided.map((d) => d.decisionId)
/** A token as a signed-in one carries its claims, unsigned: only its subject is read. */
const token = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.unsigned`

describe('what changed since you last looked, said once (home-since-you-looked.md)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  })

  it('a window’s news is what was decided, made and kept, after a seen mark; else none', () => {
    assert.deepEqual(newsOf(twoDecided), { decided: 2, made: 0, kept: 0, more: false })
    assert.equal(newsOf(window()), null)
    assert.equal(newsOf({ ...twoDecided, fromSequence: null }), null)
    assert.equal(newsOf(window({ open: [{ proposalId: uuid(5), statement: 'Monday?' }] })), null)
  })

  it('what the reader did is no news to them: the decision they took, the report they asked for, a note in their name', () => {
    const theirOwn = window({
      decided: [decided(1, { proposedBy: MARCO, decidedBy: READER })],
      made: [made(2, READER)],
      noted: [noted(3, READER)],
    })
    assert.equal(newsOf(freshIn(theirOwn, READER)), null)
    // A decision they proposed and someone else took happened without them; a line nobody can be named for is someone
    // else's.
    const others = window({
      decided: [decided(4, { proposedBy: READER, decidedBy: MARCO }), decided(5)],
      made: [made(6)],
      noted: [noted(7)],
    })
    assert.deepEqual(newsOf(freshIn(others, READER)), { decided: 2, made: 1, kept: 1, more: false })
    // No reader known (a token without a subject): nothing is theirs.
    assert.deepEqual(newsOf(freshIn(theirOwn, null)), { decided: 1, made: 1, kept: 1, more: false })
  })

  it('lines kept for a project are no news there: only the new ones count, however far the feed moved', () => {
    const kept = linesOf(twoDecided)
    assert.deepEqual(kept, [`d:${uuid(1)}`, `d:${uuid(2)}`])
    // A34's toSequence is the project's newest event: a room's lobby or floor moves it, and says nothing new.
    assert.equal(newsOf(freshIn({ ...twoDecided, toSequence: '40' }, READER, kept)), null)
    const later = window({ decided: [decided(1), decided(2), decided(3)], made: [made(4)], noted: [noted(8)] })
    assert.deepEqual(linesOf(later), [`d:${uuid(1)}`, `d:${uuid(2)}`, `d:${uuid(3)}`, `m:${uuid(54)}`, `n:${uuid(8)}`])
    assert.deepEqual(newsOf(freshIn(later, READER, kept)), { decided: 1, made: 1, kept: 1, more: false })
  })

  it('a visit says each project’s news not kept there, trimmed to it; none that names nothing', () => {
    const windows = new Map([
      [uuid(11), twoDecided],
      [uuid(12), window({ decided: [decided(3)] })],
      [uuid(13), window()],
      [uuid(14), window({ decided: [decided(6, { decidedBy: READER })] })],
    ])
    assert.deepEqual([...unsaid(windows, {}, READER).keys()], [uuid(11), uuid(12)])
    assert.deepEqual([...unsaid(windows, { [uuid(11)]: linesOf(twoDecided) }, READER).keys()], [uuid(12)])
    // A window partly kept says only what is new in it.
    const partly = unsaid(
      new Map([[uuid(11), window({ decided: [decided(1), decided(2), decided(3)] })]]),
      { [uuid(11)]: linesOf(twoDecided) },
      READER,
    )
    assert.deepEqual(ids(partly.get(uuid(11))), [uuid(3)])
    // What one project kept is that project's: the same lines elsewhere are news.
    assert.deepEqual([...unsaid(windows, { [uuid(12)]: linesOf(twoDecided) }, READER).keys()], [uuid(11), uuid(12)])
  })

  it('remembers per account on this device, a project’s window whole; anything else kept reads as nothing', () => {
    assert.deepEqual(readSaid('acct-1'), {})
    rememberSaid('acct-1', { [uuid(11)]: ['d:1', 'd:2'] })
    rememberSaid('acct-1', { [uuid(12)]: ['n:3'] })
    assert.deepEqual(readSaid('acct-1'), { [uuid(11)]: ['d:1', 'd:2'], [uuid(12)]: ['n:3'] })
    assert.deepEqual(readSaid('acct-2'), {})
    // Kept again, a project's window replaces what it kept: never more than one window per project.
    rememberSaid('acct-1', { [uuid(11)]: ['d:2', 'd:4'] })
    assert.deepEqual(readSaid('acct-1'), { [uuid(11)]: ['d:2', 'd:4'], [uuid(12)]: ['n:3'] })
    localStorage.setItem('sophia.since.said.v1.acct-3', '{"x": "4"}')
    assert.deepEqual(readSaid('acct-3'), {})
    localStorage.setItem('sophia.since.said.v1.acct-3', 'not json')
    assert.deepEqual(readSaid('acct-3'), {})
  })

  it('where storage refuses, the page remembers for as long as it lives', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => {
        throw new Error('blocked')
      },
      configurable: true,
    })
    assert.deepEqual(readSaid('acct-4'), {})
    rememberSaid('acct-4', { [uuid(11)]: ['d:1'] })
    assert.deepEqual(readSaid('acct-4'), { [uuid(11)]: ['d:1'] })
  })

  it('a call’s project waits for a read after the call: never said meanwhile, its first window read kept (Codex P2 on #468)', () => {
    assert.deepEqual(readPending('acct-1'), [])
    markPending('acct-1', uuid(11))
    markPending('acct-1', uuid(11))
    assert.deepEqual(readPending('acct-1'), [uuid(11)])
    assert.deepEqual(readPending('acct-2'), [])
    const another = window({ decided: [decided(3)] })
    const windows = new Map([
      [uuid(11), twoDecided],
      [uuid(12), another],
    ])
    // While it waits, a visit says nothing of it, whatever its window holds; the others' news stands.
    assert.deepEqual([...unsaid(windows, readSaid('acct-1'), READER, readPending('acct-1')).keys()], [uuid(12)])
    // A window read for a project that doesn't wait keeps nothing.
    settlePending('acct-1', uuid(12), another)
    assert.deepEqual(readSaid('acct-1'), {})
    assert.deepEqual(readPending('acct-1'), [uuid(11)])
    // The first window read for it once the call ended is what the call held: kept whole, and the wait is over.
    settlePending('acct-1', uuid(11), twoDecided)
    assert.deepEqual(readSaid('acct-1'), { [uuid(11)]: linesOf(twoDecided) })
    assert.deepEqual(readPending('acct-1'), [])
    assert.deepEqual([...unsaid(windows, readSaid('acct-1'), READER, readPending('acct-1')).keys()], [uuid(12)])
    // Over, it keeps nothing more: a decision after the call is news.
    const later = window({ decided: [decided(1), decided(2), decided(3)] })
    settlePending('acct-1', uuid(11), later)
    const after = unsaid(new Map([[uuid(11), later]]), readSaid('acct-1'), READER, readPending('acct-1'))
    assert.deepEqual(ids(after.get(uuid(11))), [uuid(3)])
    // Anything else kept as the wait reads as none.
    localStorage.setItem('sophia.since.pending.v1.acct-3', '{"x": "4"}')
    assert.deepEqual(readPending('acct-3'), [])
  })

  it('where storage refuses, a call’s project waits for as long as the page lives', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => {
        throw new Error('blocked')
      },
      configurable: true,
    })
    markPending('acct-5', uuid(11))
    assert.deepEqual(readPending('acct-5'), [uuid(11)])
    settlePending('acct-5', uuid(11), twoDecided)
    assert.deepEqual(readPending('acct-5'), [])
    assert.deepEqual(readSaid('acct-5'), { [uuid(11)]: linesOf(twoDecided) })
  })

  it('the reader is the token’s subject, lowered, as the API names its actor; none without one', () => {
    assert.equal(
      readerOf(token({ sub: '0000000A-0000-4000-8000-0000000000AB' })),
      '0000000a-0000-4000-8000-0000000000ab',
    )
    assert.equal(readerOf('fixture-token'), null)
  })
})
