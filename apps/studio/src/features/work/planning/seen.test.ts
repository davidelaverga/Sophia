import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assignment, goal, item, plan, view } from './board-samples.ts'
import type { BoardDecision, ItemView } from './board-view.ts'
import { shows } from './lenses.ts'
import { boardOf, type PlanRow } from './plan.ts'
import { changedSince, glance, readSeen, seenKey, whileAway, writeSeen, type Seen } from './seen.ts'

const people = { davide: { id: 'davide', name: 'Davide' }, luis: { id: 'luis', name: 'Luis' } }

/** The rows of a plan of the given items, each observed as given. */
function rowsOf(
  entries: [string, Partial<ItemView>, Partial<Parameters<typeof item>[1]>?][],
  viewerId = 'davide',
): PlanRow[] {
  const items = entries.map(([id, , over]) => item(id, { purpose: `Task ${id}`, ...over }))
  const views = entries.map(([id, over]) => view(id, over))
  return boardOf(goal(plan(items), views), { resources: [], people, viewerId })?.rows ?? []
}

const waitingOn = (who: string): Partial<ItemView> => ({
  lifecycle: 'waiting',
  assignment: assignment('x'),
  waiting_on: [{ kind: 'product_decision', reference_id: 'r', respondent_id: who, detail: 'Choose', state: 'pending' }],
})

const candidate = (version: string) => ({
  source_id: 's',
  version_id: version,
  sha256: 'e'.repeat(64),
  media_type: 'text/markdown',
  created_at: '2026-10-02T12:00:00Z',
  state: 'current' as const,
})

/** Before the decisions' expiry (13:00), and after it. */
const NOW = new Date('2026-10-02T12:30:00Z')
const LATER = new Date('2026-10-02T13:30:00Z')

const decision = (state: BoardDecision['state']): BoardDecision => ({
  decision_id: 'd1',
  revision: 4,
  work_id: 'a',
  plan_id: 'plan-1',
  plan_revision: 2,
  candidate_version_ref: null,
  question: 'Ship it?',
  decider_id: 'davide',
  choices: [
    { key: 'ship', label: 'Ship it now' },
    { key: 'wait', label: 'Wait' },
  ],
  expires_at: '2026-10-02T13:00:00Z',
  state,
  selected_choice: state === 'accepted' ? 'ship' : null,
  choice_receipt_id: null,
  plan_reaction: state === 'accepted' ? 'pending' : 'not_needed',
})

describe('what changed since the last look', () => {
  it('is every task whose mark or result moved, or that is new; nothing on a first visit', () => {
    const before = rowsOf([
      ['a', { lifecycle: 'running', assignment: assignment('a') }],
      ['b', {}],
    ])
    const seen = glance(before, [])
    const after = rowsOf([
      ['a', waitingOn('davide')],
      ['b', {}],
      ['c', {}],
    ])
    assert.deepEqual([...changedSince(after, seen)], ['a', 'c'])
    const resulted = rowsOf([
      ['a', { lifecycle: 'running', assignment: assignment('a'), candidates: [candidate('v1')] }],
      ['b', {}],
    ])
    assert.deepEqual([...changedSince(resulted, seen)], ['a'])
    assert.deepEqual([...changedSince(after, null)], [])
  })

  it('says decisions first, then new results, then what blocks, then the rest; all of it on request (G5)', () => {
    const before = rowsOf([
      ['a', {}],
      ['b', {}],
      ['c', {}],
      ['d', {}],
      ['e', {}],
    ])
    const seen = glance(before, [decision('proposed')])
    const after = rowsOf([
      ['a', { lifecycle: 'running', assignment: assignment('a') }],
      ['b', waitingOn('davide')],
      ['c', { lifecycle: 'ready_for_review', assignment: assignment('c'), candidates: [candidate('c-v1')] }],
      ['d', { lifecycle: 'failed', closed_reason: 'It crashed' }],
      ['e', {}],
    ])
    const away = whileAway(after, [decision('accepted')], seen, { viewerId: 'davide', people, now: NOW })
    assert.deepEqual(away.phrases, [
      'You chose Ship it now: Ship it?',
      'Task c has a new result: c-v1',
      'Task b now waits on you',
    ])
    assert.deepEqual(away.rest, ['Task d failed', 'Task a started'])
    assert.equal(away.more, 2)
    assert.equal(
      whileAway(after, [decision('accepted')], seen, { viewerId: 'luis', people, now: NOW }).phrases[0],
      'Davide chose Ship it now: Ship it?',
    )
    assert.deepEqual(whileAway(after, [], null, { viewerId: 'davide', people, now: NOW }), {
      phrases: [],
      more: 0,
      rest: [],
    })
  })
})

describe('a decision, said while away (Codex F-010)', () => {
  const rows = rowsOf([['a', {}]])
  const seen = glance(rows, [])
  const said = (d: BoardDecision, viewerId: string, now: Date) =>
    whileAway(rows, [d], seen, { viewerId, people, now }).phrases[0]

  it('waits on its decider only while it can still be answered', () => {
    assert.equal(said(decision('proposed'), 'davide', NOW), 'A decision waits on you: Ship it?')
    assert.equal(said(decision('proposed'), 'luis', NOW), 'Davide has a decision to make: Ship it?')
  })

  it('past its expiry, still proposed, or marked expired: said expired, never as waiting', () => {
    for (const d of [decision('proposed'), decision('expired')]) {
      assert.equal(said(d, 'davide', LATER), 'Your decision expired unanswered: Ship it?')
      assert.equal(said(d, 'luis', LATER), 'Davide’s decision expired unanswered: Ship it?')
    }
  })

  it('expiring while the page is open, the same line changes with the time', () => {
    const d = decision('proposed')
    assert.notEqual(said(d, 'davide', NOW), said(d, 'davide', LATER))
  })
})

/** A task at work, with these versions. */
const running = (candidates: ItemView['candidates']): Partial<ItemView> => ({
  lifecycle: 'running',
  assignment: assignment('a'),
  candidates,
})

describe('a result lost while away (Codex F-012)', () => {
  const had = candidate('v1')
  const seen = glance(rowsOf([['a', running([had])]]), [])
  const away = (candidates: ItemView['candidates']) => {
    const said = whileAway(rowsOf([['a', running(candidates)]]), [], seen, { viewerId: 'davide', people, now: NOW })
    return [...said.phrases, ...said.rest]
  }

  it('is said lost, and no move its mark didn’t make: removed, withdrawn, or two claiming to be current', () => {
    assert.deepEqual(away([]), ['Task a has no current result now: v1 isn’t current any more'])
    assert.deepEqual(away([{ ...had, state: 'withdrawn' }]), [
      'Task a has no current result now: v1 isn’t current any more',
    ])
    assert.deepEqual(away([had, { ...candidate('v2'), sha256: 'f'.repeat(64) }]), [
      'Task a has no single current result now: two versions claim to be current',
    ])
  })

  it('still says a new result, and a mark that moved', () => {
    assert.deepEqual(away([candidate('v2')]), ['Task a has a new result: v2'])
    const waiting = { ...waitingOn('davide'), candidates: [had] }
    const waited = whileAway(rowsOf([['a', waiting]]), [], seen, { viewerId: 'davide', people, now: NOW })
    assert.deepEqual(waited.phrases, ['Task a now waits on you'])
    assert.deepEqual(away([had]), []) // nothing moved
  })
})

describe('a lens', () => {
  it('shows what its name says: what a request asks of you or you do by hand, what waits, what is unassigned', () => {
    const rows = rowsOf(
      [
        ['a', waitingOn('davide')],
        ['b', { lifecycle: 'running', assignment: assignment('b') }],
        ['c', {}, { assignee_kind: 'unassigned', assignee_id: null }],
        ['d', {}, { assignee_kind: 'human', assignee_id: 'luis' }],
      ],
      'luis',
    )
    const ids = (lens: Parameters<typeof shows>[0], viewer: string) =>
      rows
        .filter((r) => shows(lens, r, viewer))
        .map((r) => r.item.id)
        .toSorted()
    assert.deepEqual(ids('all', 'luis'), ['a', 'b', 'c', 'd'])
    assert.deepEqual(ids('mine', 'luis'), ['d']) // by hand
    assert.deepEqual(ids('mine', 'davide'), ['a']) // asked; owning b's account is not enough
    assert.deepEqual(ids('waiting', 'luis'), ['a'])
    assert.deepEqual(ids('unassigned', 'luis'), ['c'])
  })
})

describe('two revisions of one decision in a look (Codex F-038)', () => {
  it('keeps both: an unchanged board says nothing, and a change to one is said once, for it', () => {
    const rows = rowsOf([['a', {}]])
    const first = decision('proposed') // revision 4, past its expiry by LATER
    const next = { ...decision('accepted'), revision: 5, question: 'Ship it, as revised?' }
    const seen = glance(rows, [first, next])
    assert.equal(Object.keys(seen.decisions).length, 2)
    assert.deepEqual(whileAway(rows, [first, next], seen, { viewerId: 'davide', people, now: LATER }), {
      phrases: [],
      more: 0,
      rest: [],
    })
    // Only the revised one's reaction moves: said once, for it.
    const reacted = { ...next, plan_reaction: 'recorded' as const }
    const away = whileAway(rows, [first, reacted], seen, { viewerId: 'davide', people, now: LATER })
    assert.deepEqual([away.phrases, away.rest], [['You chose Ship it now: Ship it, as revised?'], []])
  })
})

describe('an older revision of a decision, while away (Codex F-048)', () => {
  const rows = rowsOf([['a', {}]])
  const seen = glance(rows, [])
  const older = decision('proposed') // revision 4, still answerable at NOW
  const said = (decisions: BoardDecision[], viewerId = 'davide') =>
    whileAway(rows, decisions, seen, { viewerId, people, now: NOW }).phrases

  it('is history under a later one: never said waiting, whichever comes first', () => {
    const revised = { ...decision('proposed'), revision: 5, question: 'Ship it, as revised?' }
    assert.deepEqual(said([older, revised]), ['A decision waits on you: Ship it, as revised?'])
    assert.deepEqual(said([revised, older]), ['A decision waits on you: Ship it, as revised?'])
    assert.deepEqual(said([older, revised], 'luis'), ['Davide has a decision to make: Ship it, as revised?'])
    for (const state of ['accepted', 'declined', 'expired', 'superseded'] as const) {
      const ended = { ...decision(state), revision: 5 }
      const phrases = [...said([older, ended]), ...said([ended, older])]
      assert.ok(
        phrases.every((p) => !p.includes('waits on') && !p.includes('to make')),
        state,
      )
    }
    // An older revision's choice is history, still said; one decision apart still waits.
    const chosen = { ...decision('accepted'), revision: 3 }
    const apart = { ...decision('proposed'), decision_id: 'd2', question: 'Hold it?' }
    assert.deepEqual(said([chosen, older, apart]), [
      'You chose Ship it now: Ship it?',
      'A decision waits on you: Ship it?',
      'A decision waits on you: Hold it?',
    ])
  })
})

/** Runs `check` with a storage of its own, put back as it was after. */
function withStorage(check: (store: Map<string, string>) => void) {
  const store = new Map<string, string>()
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
  })
  try {
    check(store)
  } finally {
    if (was) Object.defineProperty(globalThis, 'localStorage', was)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

const look = (mark: Seen['items'][string]['mark']): Seen => ({ items: { w: { mark, result: null } }, decisions: {} })

describe('where a look is kept (Codex F-034)', () => {
  it('keeps each scope apart, whatever its ids hold, and no viewer apart from one called “anyone” or “”', () => {
    withStorage(() => {
      const scope = { project: 'p', goal: 'a.b', plan: 'c', viewer: 'davide' }
      writeSeen(scope, look('working'))
      assert.equal(readSeen({ ...scope, goal: 'a', plan: 'b.c' }), null)
      assert.equal(readSeen({ ...scope, project: 'p.a', goal: 'b' }), null)
      assert.deepEqual(readSeen(scope), look('working'))
      writeSeen({ ...scope, viewer: null }, look('held'))
      assert.equal(readSeen({ ...scope, viewer: 'anyone' }), null)
      assert.equal(readSeen({ ...scope, viewer: '' }), null)
      assert.deepEqual(readSeen({ ...scope, viewer: null }), look('held'))
    })
  })

  it('keeps one look per plan, whatever its revision: the key names no revision', () => {
    const at = { project: 'p', goal: 'g', plan: 'plan-1', viewer: 'davide' }
    assert.equal(seenKey(at), seenKey({ ...at }))
    assert.deepEqual(JSON.parse(seenKey(at).replace('sophia.plan.seen.v3:', '')), ['p', 'g', 'plan-1', 'davide'])
  })

  it('leaves a look kept under the old joined key as it is: not read as this scope’s, not moved, not deleted', () => {
    withStorage((store) => {
      const at = { project: 'p', goal: 'g', plan: 'plan-1', viewer: 'davide' }
      const old = 'sophia.plan.seen.v2.p.g.plan-1.davide'
      store.set(old, JSON.stringify(look('later')))
      assert.equal(readSeen(at), null)
      writeSeen(at, look('working'))
      assert.equal(store.get(old), JSON.stringify(look('later')))
      assert.deepEqual(readSeen(at), look('working'))
    })
  })
})
