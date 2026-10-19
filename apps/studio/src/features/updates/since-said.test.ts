import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import type { Since } from '../../api/vision.ts'
import { newsKey, newsKeys, newsOf, readSaid, rememberSaid, unsaid } from './since-said.ts'

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
const decided = (n: number) => ({
  decisionId: uuid(n),
  statement: `Decision ${String(n)}`,
  proposedBy: null,
  decidedBy: null,
  at: null,
  undoable: false,
})
const twoDecided = window({ decided: [decided(1), decided(2)] })

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

  it('the same news is the same window however far the project’s feed moved; one more line or a new mark is another', () => {
    // A34's toSequence is the project's newest event: a room's lobby or floor moves it, and says nothing new.
    assert.equal(newsKey({ ...twoDecided, toSequence: '40' }), newsKey(twoDecided))
    assert.notEqual(newsKey(window({ decided: [decided(1), decided(2), decided(3)] })), newsKey(twoDecided))
    assert.notEqual(newsKey({ ...twoDecided, fromSequence: '9' }), newsKey(twoDecided))
    assert.notEqual(newsKey({ ...twoDecided, more: true }), newsKey(twoDecided))
  })

  it('a visit says only the news not said before: by project, and none that names nothing', () => {
    const windows = new Map([
      [uuid(11), twoDecided],
      [uuid(12), window({ decided: [decided(3)] })],
      [uuid(13), window()],
    ])
    assert.deepEqual([...unsaid(windows, {}).keys()], [uuid(11), uuid(12)])
    assert.deepEqual([...unsaid(windows, { [uuid(11)]: newsKey(twoDecided) }).keys()], [uuid(12)])
    // Said for another window of that project: this one is news.
    assert.deepEqual([...unsaid(windows, { [uuid(11)]: 'an older key' }).keys()], [uuid(11), uuid(12)])
    assert.deepEqual(newsKeys(unsaid(windows, {})), {
      [uuid(11)]: newsKey(twoDecided),
      [uuid(12)]: newsKey(window({ decided: [decided(3)] })),
    })
  })

  it('remembers per account on this device, adding to what it kept; anything else kept reads as nothing said', () => {
    assert.deepEqual(readSaid('acct-1'), {})
    rememberSaid('acct-1', { [uuid(11)]: 'k1' })
    rememberSaid('acct-1', { [uuid(12)]: 'k2' })
    assert.deepEqual(readSaid('acct-1'), { [uuid(11)]: 'k1', [uuid(12)]: 'k2' })
    assert.deepEqual(readSaid('acct-2'), {})
    rememberSaid('acct-1', { [uuid(11)]: 'k3' })
    assert.deepEqual(readSaid('acct-1'), { [uuid(11)]: 'k3', [uuid(12)]: 'k2' })
    localStorage.setItem('sophia.since.said.v1.acct-3', '{"x": 4}')
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
    rememberSaid('acct-4', { [uuid(11)]: 'k1' })
    assert.deepEqual(readSaid('acct-4'), { [uuid(11)]: 'k1' })
  })
})
