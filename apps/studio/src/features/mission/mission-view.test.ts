import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  MissionContext,
  MissionDecision,
  MissionEntry,
  MissionNotePolicy,
  MissionWithdrawalPreview,
} from '@sophia/contracts'
import {
  citesLine,
  decidedBy,
  direction,
  forgetControls,
  forgetReach,
  forgetRefusal,
  historyText,
  noteActions,
  notesLine,
  omittedLine,
  pendingFocus,
  recentNotes,
  wording,
  writeControls,
} from './mission-view.ts'

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

const excluded = (olderEntries: number, olderHistory: number) => ({ olderEntries, olderHistory, legacyFrame: false })
const preview = (
  entryId: string,
  entries: MissionWithdrawalPreview['entries'],
  decisions: MissionWithdrawalPreview['decisions'] = [],
): MissionWithdrawalPreview => ({
  entryId,
  ledgerRevision: 4,
  previewToken: `v1.1790000000.${'a'.repeat(64)}`,
  expiresAt: '2026-09-29T20:00:00Z',
  entries,
  decisions,
})
type Shown = MissionWithdrawalPreview['decisions'][number]
const shown = (
  id: string,
  kind: Shown['kind'],
  state: Shown['state'],
  statement: string,
  over: Partial<Shown> = {},
): Shown => ({ id, kind, state, revision: 1, statement, purpose: null, destination: null, origin: null, ...over })

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

  it('says what the context leaves out instead of counting notes it cannot show', () => {
    assert.equal(omittedLine(context()), null)
    assert.equal(omittedLine(context({ excluded: excluded(1, 0) })), 'Not shown here: 1 older note.')
    assert.equal(
      omittedLine(context({ excluded: excluded(12, 3) })),
      'Not shown here: 12 older notes and 3 older corrections and forgotten notes.',
    )
  })

  it('says who decided a proposal and where, and nothing for one that was replaced', () => {
    const names = new Map([['b', 'Davide']])
    const decided = (over: Partial<MissionDecision>): MissionDecision => ({
      ...proposal('1'),
      state: 'accepted',
      ...over,
    })
    assert.equal(decidedBy(decided({ decidedBy: 'me', decidedVia: 'voice' }), 'me', names), 'You, by voice')
    assert.equal(decidedBy(decided({ decidedBy: 'b', decidedVia: 'studio' }), 'me', names), 'Davide, in the Studio')
    assert.equal(decidedBy(decided({ state: 'superseded' }), 'me', names), null)
  })

  it('after an unconfirmed write offers only the retry that reuses its key', () => {
    assert.deepEqual(writeControls('unknown'), { canSubmit: false, canRetry: true })
    assert.deepEqual(writeControls('sending'), { canSubmit: false, canRetry: false })
    for (const status of ['idle', 'done', 'rejected'] as const)
      assert.deepEqual(writeControls(status), { canSubmit: true, canRetry: false }, status)
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

  it('before forgetting, lists each version and each proposal or decision that goes, with its words', () => {
    const alone = forgetReach(preview('1', [{ id: '1', state: 'current', text: 'Book the hall early.' }]))
    assert.deepEqual(alone, {
      items: [{ id: '1', text: 'This note: “Book the hall early.”', details: [] }],
      request: {
        expectedAffected: { entryIds: ['1'], decisions: [] },
        previewToken: `v1.1790000000.${'a'.repeat(64)}`,
      },
      closing: 'Sophia stops using it.',
    })
    const built = forgetReach(
      preview(
        '2',
        [
          { id: '1', state: 'superseded', text: 'Groups of five.' },
          { id: '2', state: 'superseded', text: 'Groups of four.' },
          { id: '3', state: 'current', text: 'Groups of three.' },
        ],
        [
          shown('m', 'mission', 'accepted', 'Short workshops.', { revision: 2 }),
          shown('c', 'constraint', 'proposed', 'No fees.'),
          shown('l', 'lesson', 'rejected', 'Book early.', { revision: 2 }),
        ],
      ),
    )
    assert.deepEqual(
      built.items.map((item) => item.text),
      [
        'Another version: “Groups of five.”',
        'This note: “Groups of four.”',
        'Its current version: “Groups of three.”',
        'The accepted direction: “Short workshops.”',
        'The proposed constraint: “No fees.”',
        'The rejected lesson: “Book early.”',
      ],
    )
    assert.deepEqual(
      built.request,
      {
        expectedAffected: {
          entryIds: ['1', '2', '3'],
          decisions: [
            { id: 'm', revision: 2 },
            { id: 'c', revision: 1 },
            { id: 'l', revision: 2 },
          ],
        },
        previewToken: `v1.1790000000.${'a'.repeat(64)}`,
      },
      'the versions and each decision at the revision shown, as the server listed them, with its proof',
    )
    assert.equal(built.closing, 'Sophia stops using them.')
  })

  it('lists every word that goes, unclipped: a long note whole, and each of a decision’s fields (CX-0007 F2)', () => {
    const long = `${'The families on the east side asked for later sessions. '.repeat(35)}End.`
    assert.ok(long.length > 1900)
    const listed = forgetReach(
      preview(
        '1',
        [{ id: '1', state: 'current', text: long }],
        [
          shown('m', 'mission', 'proposed', 'Evening workshops.', {
            purpose: 'Working parents can come.',
            destination: 'Half the families attend.',
            origin: 'Nobody could come at ten.',
          }),
          shown('c', 'constraint', 'accepted', 'No fees.', { destination: 'Free for everyone.' }),
        ],
      ),
    )
    assert.deepEqual(
      listed.items.map((item) => [item.text, item.details]),
      [
        [`This note: “${long}”`, []],
        [
          'The proposed direction: “Evening workshops.”',
          [
            'Purpose: “Working parents can come.”',
            'Destination: “Half the families attend.”',
            'Starting point: “Nobody could come at ten.”',
          ],
        ],
        ['The accepted constraint: “No fees.”', ['Destination: “Free for everyone.”']],
      ],
    )
  })

  it('confirms a forget only once its list is shown; if the list could not be read it offers to check again', () => {
    assert.deepEqual(forgetControls('checking'), { canConfirm: false, canRetry: false })
    assert.deepEqual(forgetControls('failed'), { canConfirm: false, canRetry: true })
    assert.deepEqual(forgetControls('ready'), { canConfirm: true, canRetry: false })
    assert.equal(
      forgetRefusal({
        code: 'stale_revision',
        message: 'Stale withdrawal: what it would erase changed since it was shown',
      }),
      'Something changed since the list was shown, so nothing was forgotten. Forget again to see what would go now.',
    )
    assert.equal(
      forgetRefusal({ code: 'stale_revision', message: 'Stale withdrawal: the list shown has expired' }),
      'The list was shown too long ago, so nothing was forgotten. Forget again to see what would go now.',
    )
    assert.equal(forgetRefusal({ code: 'forbidden', message: 'Not permitted' }), 'Not permitted')
  })

  it('says which notes a proposal rests on, by their words when this view has them', () => {
    const ctx = context({ entries: [entry('1', { text: 'Book the hall early.' })] })
    assert.equal(citesLine(ctx, { supportingEntryIds: [] }), null)
    assert.equal(citesLine(ctx, { supportingEntryIds: ['1'] }), 'Rests on a note: “Book the hall early.”')
    assert.equal(
      citesLine(ctx, { supportingEntryIds: ['1', '9'] }),
      'Rests on 2 notes: “Book the hall early.” and 1 not shown here.',
    )
    assert.equal(citesLine(ctx, { supportingEntryIds: ['9'] }), 'Rests on a note.')
  })
})
