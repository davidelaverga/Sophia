import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Goal, MissionEntry } from '@sophia/contracts'
import {
  goalNotes,
  keptAfter,
  known,
  noteAuthor,
  notesRead,
  noteWord,
  readingWords,
  said,
  withNotes,
} from './goal-notes.ts'

const entry = (id: string, over: Partial<MissionEntry> = {}): MissionEntry => ({
  id,
  kind: 'observation',
  epistemic: 'reported',
  state: 'current',
  text: `Note ${id}`,
  textKind: 'member_text',
  authoredBy: 'member',
  actorId: 'luis',
  origin: 'studio',
  exchangeId: null,
  inputEpoch: null,
  relatedEntryId: null,
  supersedesEntryId: null,
  supersededById: null,
  goalId: 'g1',
  decisionId: null,
  sourceId: 's',
  sha256: null,
  ledgerRevision: 1,
  observedAt: '2026-10-13T10:00:00Z',
  recordedAt: '2026-10-13T10:00:00Z',
  changedAt: null,
  ...over,
})

const goal = (id: string): Goal => ({
  id,
  projectId: 'p',
  title: id,
  revision: 1,
  authorityEpoch: 1,
  status: 'running',
  outcome: 'o',
  criteria: [],
  stateRevision: 1,
})

const names = new Map([['marco', 'Marco']])

describe('a goal’s notes (docs/plans/goal-notes.md)', () => {
  it('keeps its own current notes, newest first', () => {
    const entries = [
      entry('a', { recordedAt: '2026-10-13T08:00:00Z' }),
      entry('b', { recordedAt: '2026-10-13T11:00:00Z' }),
      entry('c', { goalId: 'g2' }),
      entry('d', { state: 'superseded' }),
      entry('e', { goalId: null }),
    ]
    assert.deepEqual(
      goalNotes(entries, 'g1').map((e) => e.id),
      ['b', 'a'],
    )
  })

  it('says a kind only when it says something', () => {
    assert.equal(noteWord('blocker'), 'Difficulty')
    assert.equal(noteWord('expectation'), 'Expected')
    assert.equal(noteWord('outcome'), 'Outcome')
    assert.equal(noteWord('observation'), null)
  })

  it('names who wrote it: Sophia, the viewer, a known name, else a member', () => {
    assert.equal(noteAuthor(entry('a', { authoredBy: 'sophia', actorId: 'x' }), 'luis', names), 'Sophia')
    assert.equal(noteAuthor(entry('a'), 'luis', names), 'You')
    assert.equal(noteAuthor(entry('a', { actorId: 'marco' }), 'luis', names), 'Marco')
    assert.equal(noteAuthor(entry('a', { actorId: 'ana' }), 'luis', names), 'A member')
    // Outside a call: the name the note kept (A18).
    assert.equal(noteAuthor(entry('a', { actorId: 'ana', authorName: 'ana@sophia.test' }), 'luis', names), 'Ana')
  })

  it('says the latest note as who said what', () => {
    assert.equal(
      said(entry('a', { actorId: 'marco', text: 'Legal lands Thursday.' }), 'luis', names),
      'Marco “Legal lands Thursday.”',
    )
  })

  it('gives each goal its latest note, a goal without a plan too', () => {
    const entries = [entry('a', { kind: 'blocker' }), entry('b', { goalId: 'g2', authoredBy: 'sophia' })]
    const plans = withNotes(
      [goal('g1'), goal('g2'), goal('g3')],
      { g1: { checkpoint: 'Next' } },
      entries,
      'luis',
      names,
    )
    assert.deepEqual(plans.g1, { checkpoint: 'Next', note: { kind: 'blocker', said: 'You “Note a”' } })
    assert.deepEqual(plans.g2, { note: { kind: 'observation', said: 'Sophia “Note b”' } })
    assert.equal(plans.g3, undefined)
  })
})

describe('the notes when the ledger is slow or fails, and a note still going (docs/plans/notes-robust.md)', () => {
  it('says whether the notes are read, being read, or failed', () => {
    assert.equal(notesRead({ data: {}, isError: false }), 'read')
    assert.equal(notesRead({ data: undefined, isError: false }), 'reading')
    assert.equal(notesRead({ data: undefined, isError: true }), 'failed')
    assert.equal(notesRead({ data: {}, isError: true }), 'stale')
  })

  it('clears only what was sent: words and a kind chosen since stay', () => {
    const sent = { text: 'First note', kind: 'blocker' as const }
    assert.deepEqual(keptAfter({ text: 'First note', kind: 'blocker' }, sent), { text: '', kind: 'observation' })
    assert.deepEqual(keptAfter({ text: 'Second one', kind: 'blocker' }, sent), {
      text: 'Second one',
      kind: 'observation',
    })
    assert.deepEqual(keptAfter({ text: 'First note', kind: 'expectation' }, sent), { text: '', kind: 'expectation' })
  })
})

describe('the reads a health waits on (targets-robust.md; Codex P2 on #372)', () => {
  it('a health is known once every read it waits on is in, a later failure keeping the last', () => {
    assert.equal(known('read', 'read'), true)
    assert.equal(known('read', 'stale'), true)
    assert.equal(known('read', 'reading'), false)
    assert.equal(known('failed', 'read'), false)
  })

  it('the brief says which reads are still coming', () => {
    assert.equal(readingWords('read', 'read'), '')
    assert.equal(readingWords('reading', 'read'), ' · Reading the notes…')
    assert.equal(readingWords('read', 'reading'), ' · Reading the dates…')
    assert.equal(readingWords('reading', 'reading'), ' · Reading the notes and dates…')
    assert.equal(readingWords('failed', 'reading'), ' · Reading the dates…')
  })
})
