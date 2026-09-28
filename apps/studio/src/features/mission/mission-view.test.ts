import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionContext, MissionDecision, MissionEntry, MissionNotePolicy } from '@sophia/contracts'
import { direction, historyText, noteActions, notesLine, pendingFocus, recentNotes, wording } from './mission-view.ts'

const cap = (available: boolean) => ({ available, reason: available ? null : 'no' })
const policy = (over: Partial<MissionNotePolicy> = {}): MissionNotePolicy => ({
  capture: 'off',
  revision: 0,
  consent: 'unset',
  consentRevision: 0,
  acceptedMembers: 0,
  automaticNotes: false,
  explicitSelectedNoteSave: false,
  explicitProposals: false,
  exactTextRetention: false,
  transientBuffer: { turns: 0, bytes: 0, seconds: 0 },
  ...over,
})
const entry = (id: string, over: Partial<MissionEntry> = {}): MissionEntry => ({
  id,
  kind: 'observation',
  epistemic: 'reported',
  state: 'current',
  text: `note ${id}`,
  textKind: 'sophia_paraphrase',
  authoredBy: 'sophia',
  actorId: 'a',
  origin: 'voice',
  exchangeId: null,
  inputEpoch: null,
  relatedEntryId: null,
  supersedesEntryId: null,
  supersededById: null,
  goalId: null,
  decisionId: null,
  sourceId: id,
  sha256: '0'.repeat(64),
  ledgerRevision: 2,
  observedAt: '2026-09-28T00:00:00.000Z',
  recordedAt: '2026-09-28T00:00:00.000Z',
  changedAt: null,
  ...over,
})
const proposal = (id: string): MissionDecision => ({
  id,
  revision: 1,
  kind: 'mission',
  state: 'proposed',
  statement: `direction ${id}`,
  purpose: null,
  destination: null,
  origin: null,
  textKind: 'member_text',
  proposedBy: 'b',
  proposedVia: 'studio',
  createdAt: '2026-09-28T00:00:00.000Z',
  baseMissionRevision: 1,
  stale: false,
  supersedesDecisionId: null,
  supportingEntryIds: [],
  decidedBy: null,
  decidedAt: null,
  decidedVia: null,
  sourceId: id,
  sha256: '0'.repeat(64),
})
const context = (over: Partial<MissionContext> = {}): MissionContext => ({
  projectId: 'p',
  title: 'T',
  readState: 'present',
  missionRevision: 1,
  ledgerRevision: 1,
  eligibilityRevision: 1,
  mission: null,
  constraints: [],
  pending: [],
  decided: [],
  entries: [],
  history: [],
  excluded: { olderEntries: 0, olderHistory: 0, legacyFrame: false },
  missing: [],
  work: [],
  notePolicy: policy(),
  capabilities: {
    recordNote: cap(true),
    propose: cap(true),
    decide: cap(true),
    correct: cap(true),
    withdrawOwnNote: cap(true),
    setNotePolicy: cap(false),
    controlWork: cap(true),
  },
  compiler: 'sophia.mission-context.v1',
  digest: '0'.repeat(64),
  ...over,
})

describe('mission view', () => {
  it('says plainly when nothing is accepted, and how to begin when nothing is recorded', () => {
    assert.deepEqual(direction(context({ readState: 'empty' })), {
      statement: 'Nothing recorded yet. Talk the idea through with Sophia.',
      purpose: null,
      accepted: false,
    })
    assert.equal(direction(context()).statement, 'No direction accepted yet.')
  })

  it('shows the accepted direction and its purpose', () => {
    const mission = {
      revision: 2,
      statement: 'Workshops nearby',
      purpose: 'Beginners start',
      destination: null,
      origin: null,
      decisionId: 'd',
      acceptedBy: 'a',
      acceptedAt: '2026-09-28T00:00:00.000Z',
      sourceId: 's',
      sha256: '0'.repeat(64),
    }
    assert.deepEqual(direction(context({ mission })), {
      statement: 'Workshops nearby',
      purpose: 'Beginners start',
      accepted: true,
    })
  })

  it('puts the newest pending proposal first and counts the alternatives beside it', () => {
    assert.equal(pendingFocus(context()), null)
    const focus = pendingFocus(context({ pending: [proposal('1'), proposal('2')] }))
    assert.deepEqual([focus?.proposal.id, focus?.alternatives], ['2', 1])
  })

  it('says whether Sophia keeps notes for this person, and why not', () => {
    assert.equal(notesLine(policy()).text, 'Sophia isn’t keeping notes in this project.')
    assert.equal(
      notesLine(policy({ capture: 'automatic', consent: 'accepted' })).text,
      'Sophia keeps shared project notes during this exchange.',
    )
    assert.match(notesLine(policy({ capture: 'automatic', consent: 'declined' })).text, /you declined/)
    assert.match(notesLine(policy({ capture: 'automatic' })).text, /You haven’t chosen yet/)
  })

  it('labels a paraphrase as Sophia’s, and a forgotten note by what is left of it', () => {
    assert.equal(wording(entry('1')), 'Sophia’s paraphrase')
    assert.equal(wording(entry('1', { textKind: 'member_text' })), 'typed')
    assert.equal(
      historyText(entry('1', { state: 'withdrawn', text: null })),
      'A note was forgotten; its text no longer exists.',
    )
    assert.equal(historyText(entry('1', { state: 'superseded' })), 'note 1')
  })

  it('shows the newest notes, oldest first', () => {
    const ctx = context({ entries: ['1', '2', '3', '4'].map((id) => entry(id)) })
    assert.deepEqual(
      recentNotes(ctx).map((e) => e.id),
      ['2', '3', '4'],
    )
  })

  it('lets a member forget their own note and an admin forget any; only current notes are corrected', () => {
    const ctx = context()
    assert.deepEqual(noteActions(ctx, entry('1', { actorId: 'me' }), 'me'), { correct: true, withdraw: true })
    assert.deepEqual(noteActions(ctx, entry('1', { actorId: 'other' }), 'me'), { correct: true, withdraw: false })
    const admin = context({ capabilities: { ...ctx.capabilities, setNotePolicy: cap(true) } })
    assert.equal(noteActions(admin, entry('1', { actorId: 'other' }), 'me').withdraw, true)
    assert.equal(noteActions(ctx, entry('1', { state: 'superseded', actorId: 'me' }), 'me').correct, false)
    assert.equal(noteActions(ctx, entry('1', { state: 'withdrawn', actorId: 'me' }), 'me').withdraw, false)
  })
})
