// The canonical A54 Personal answer control readers (INC03-CC-003 A3; docs/plans/personal-answers.md, "A3"): the
// generated standalone validators of the control receipt, the input view, the log, the controlled turn page and the
// versioned export, read through the typed parsers. Synthetic values only. A reader is tolerant: a property the contract
// does not list is dropped in place, so every case starts from a fresh copy; a value outside a closed enum is refused.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  PersonalAnswerControlLog,
  PersonalAnswerControlReceipt,
  PersonalAnswerControlView,
  PersonalControlledExport,
  PersonalControlledTurnPage,
} from './generated-types.ts'
import {
  ContractViolation,
  parsePersonalAnswerControlLog,
  parsePersonalAnswerControlReceipt,
  parsePersonalAnswerControlView,
  parsePersonalControlledExport,
  parsePersonalControlledTurnPage,
} from './validate.ts'

const TURN = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f2a3b4c5d'
const INPUT = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const REPLACEMENT = 'd1e2f3a4-b5c6-4d7e-8f90-1a2b3c4d5e6f'
const CONTROL = 'e1f2a3b4-c5d6-4e7f-8a90-1b2c3d4e5f60'
const CALL = 'f1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f8'
const AT = '2026-11-13T12:00:00.123456Z'

const decision = () => ({
  seq: 1,
  operation: 'send' as const,
  outcome: 'admitted' as const,
  reason: null,
  late: false,
  epoch: 0,
  admittedAt: AT,
  policy: 'personal-default-answer' as const,
  policyVersion: 1 as const,
  family: 'answer' as const,
  basis: 'personal_default_addressee' as const,
})

const receipt = (): PersonalAnswerControlReceipt => ({
  operation: 'control_answer_input',
  controlContract: 'personal_answer_control_v1',
  revision: 4,
  epoch: 0,
  controlId: CONTROL,
  controlSeq: 7,
  inputId: INPUT,
  turnId: TURN,
  action: 'replace',
  outcome: 'applied',
  revisionBefore: 0,
  revisionAfter: 1,
  phase: 'after_launch',
  prior: { financial: 'unresolved', effect: 'possible', answer: 'in_progress' },
  heldReason: null,
  replacement: {
    inputId: REPLACEMENT,
    turnId: TURN,
    seq: 3,
    state: 'held',
    heldReason: 'prior_in_progress',
    decision: null,
  },
})

const view = (): PersonalAnswerControlView => ({
  inputId: INPUT,
  turnId: TURN,
  seq: 2,
  createdAt: AT,
  reply: 'withdrawn',
  decisions: [decision()],
  route: { routeId: 'personal-synthetic', profileDigest: `sha256:${'a'.repeat(64)}` },
  control: {
    state: 'withdrawn',
    revision: 1,
    heldReason: null,
    withdrawnPhase: 'after_launch',
    replaces: null,
    replacedBy: [REPLACEMENT],
  },
  prior: { financial: 'settled', effect: 'possible', answer: 'withheld' },
  calls: [
    { callId: CALL, financial: 'settled', reason: null, launch: 'launching', answer: 'withheld', possibleEffect: true },
  ],
  withheld: [{ callId: CALL, text: 'Late words', suggestion: null, source: 'late_settlement', at: AT }],
})

const page = (): PersonalControlledTurnPage => ({
  revision: 5,
  epoch: 0,
  turns: [
    {
      id: TURN,
      seq: 2,
      author: 'person',
      text: 'Withdrawn words',
      createdAt: AT,
      replyTo: null,
      reply: 'withdrawn',
      suggestion: null,
      input: { inputId: INPUT, control: 'withdrawn', revision: 1 },
      prompt: 'excluded',
      activity: true,
    },
  ],
  earlier: false,
  pending: false,
})

describe('A54 readers', () => {
  it('reads a control receipt, a refused admission included', () => {
    assert.deepEqual(parsePersonalAnswerControlReceipt(receipt()), receipt())
    const refused = {
      ...receipt(),
      operation: 'admit_answer_input',
      action: 'admit',
      outcome: 'refused',
      revisionBefore: 1,
      revisionAfter: 1,
      phase: null,
      heldReason: 'admission_off',
      replacement: null,
      decision: null,
    }
    assert.equal(parsePersonalAnswerControlReceipt(refused).heldReason, 'admission_off')
  })

  it('refuses what A54 does not allow: another contract, an unknown phase, a revision past 1000', () => {
    assert.throws(() => parsePersonalAnswerControlReceipt({ ...receipt(), controlContract: 'v2' }), ContractViolation)
    assert.throws(() => parsePersonalAnswerControlReceipt({ ...receipt(), phase: 'undone' }), ContractViolation)
    assert.throws(() => parsePersonalAnswerControlReceipt({ ...receipt(), revisionAfter: 1001 }), ContractViolation)
  })

  it('drops a property it does not list (never a profile or an amount)', () => {
    const extra = { ...receipt(), profile: { payer: 'p' }, micros: 5 }
    const read = parsePersonalAnswerControlReceipt(extra)
    assert.ok(!('profile' in read) && !('micros' in read))
  })

  it('reads an input view, its withheld answers and calls; a call is never "sent"', () => {
    assert.deepEqual(parsePersonalAnswerControlView(view()), view())
    const sent = view()
    assert.throws(
      () => parsePersonalAnswerControlView({ ...sent, calls: [{ ...sent.calls[0], launch: 'sent' }] }),
      ContractViolation,
    )
  })

  it('reads the log, a controlled page and the versioned export', () => {
    const log: PersonalAnswerControlLog = {
      items: [
        {
          controlId: CONTROL,
          controlSeq: 7,
          action: 'cancel',
          outcome: 'applied',
          inputId: INPUT,
          turnId: TURN,
          revisionBefore: 0,
          revisionAfter: 1,
          phase: 'before_reservation',
          prior: { financial: 'none', effect: 'none', answer: 'none' },
          replacementInputId: null,
          replacementState: null,
          heldReason: null,
          at: AT,
        },
      ],
      next: null,
    }
    assert.deepEqual(parsePersonalAnswerControlLog(log), log)
    assert.deepEqual(parsePersonalControlledTurnPage(page()), page())
    const exported: PersonalControlledExport = {
      exportedAt: AT,
      epoch: 0,
      turns: page().turns,
      next: null,
      inputs: [view()],
      notes: [],
      releases: [],
    }
    assert.deepEqual(parsePersonalControlledExport(exported), exported)
    assert.throws(
      () => parsePersonalControlledTurnPage({ ...page(), turns: [{ ...page().turns[0], prompt: 'maybe' }] }),
      ContractViolation,
    )
  })
})
