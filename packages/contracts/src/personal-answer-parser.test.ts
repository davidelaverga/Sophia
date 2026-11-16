// The canonical A53 Personal Answer readers (INC03-CC-003 A2; docs/plans/personal-answers.md): the generated standalone
// validators of PersonalAnswerReceipt and PersonalAnswerDecisionList, read through the typed parsers. Synthetic values
// only. A reader is tolerant: a property the contract does not list is dropped in place (so a profile a newer or wrong
// server might add never reaches the client), so every case starts from a fresh copy.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PersonalAnswerDecision, PersonalAnswerDecisionList, PersonalAnswerReceipt } from './generated-types.ts'
import { ContractViolation, parsePersonalAnswerDecisionList, parsePersonalAnswerReceipt } from './validate.ts'

const TURN = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f2a3b4c5d'
const INPUT = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

const admitted = (): PersonalAnswerDecision => ({
  seq: 1,
  operation: 'send',
  outcome: 'admitted',
  reason: null,
  late: false,
  epoch: 0,
  admittedAt: '2026-11-12T12:00:00.123456Z',
  policy: 'personal-default-answer',
  policyVersion: 1,
  family: 'answer',
  basis: 'personal_default_addressee',
})

const receipt = (): PersonalAnswerReceipt => ({
  operation: 'send_answer_input',
  revision: 3,
  turnId: TURN,
  seq: 2,
  inputId: INPUT,
  answerContract: 'personal_answer_v1',
  interactionContract: 'automatic_v1',
  contractVersion: 1,
  decision: admitted(),
  suggestionId: null,
  noteId: null,
  releaseId: null,
  projectId: null,
  erased: null,
})

const list = (): PersonalAnswerDecisionList => ({
  inputId: INPUT,
  turnId: TURN,
  decisions: [
    {
      decision: {
        ...admitted(),
        outcome: 'waiting',
        reason: 'payer_unavailable',
        admittedAt: null,
      },
      createdAt: '2026-11-12T12:00:00.000001Z',
    },
    {
      decision: {
        ...admitted(),
        seq: 2,
        operation: 'cancel',
        outcome: 'cancelled',
        reason: 'cancelled_by_owner',
        admittedAt: null,
      },
      createdAt: '2026-11-12T12:01:00.000001Z',
    },
  ],
})

/** A value with one path changed, as the wire might carry it. */
function changed(value: object, change: (v: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(value) as Record<string, unknown>
  change(copy)
  return copy
}

describe('the A53 Personal Answer readers', () => {
  it('read a canonical receipt and decision list as they are', () => {
    assert.deepEqual(parsePersonalAnswerReceipt(receipt()), receipt())
    assert.deepEqual(parsePersonalAnswerDecisionList(list()), list())
  })

  it('drop what the contract does not list, a profile included, instead of passing it on', () => {
    const withProfile = changed(receipt(), (r) => {
      r.profile = { payer: 'x' }
      ;(r.decision as Record<string, unknown>).profile = { model: 'y' }
    })
    assert.deepEqual(parsePersonalAnswerReceipt(withProfile), receipt())
    const listed = changed(list(), (l) => {
      const [first] = l.decisions as Record<string, unknown>[]
      if (first) first.profile = { routeId: 'z' }
      l.refusals = []
    })
    assert.deepEqual(parsePersonalAnswerDecisionList(listed), list())
  })

  it('refuse a receipt that is not the contract', () => {
    const wrong: unknown[] = [
      changed(receipt(), (r) => (r.answerContract = 'automatic_v1')),
      changed(receipt(), (r) => (r.operation = 'send_input')),
      changed(receipt(), (r) => (r.suggestionId = INPUT)),
      changed(receipt(), (r) => delete r.decision),
      changed(receipt(), (r) => ((r.decision as Record<string, unknown>).outcome = 'answered')),
      changed(receipt(), (r) => ((r.decision as Record<string, unknown>).seq = 101)),
      changed(receipt(), (r) => ((r.decision as Record<string, unknown>).admittedAt = 'yesterday')),
      changed(receipt(), (r) => ((r.decision as Record<string, unknown>).reason = 'profile_mismatch')),
      changed(receipt(), (r) => (r.inputId = 'not-a-uuid')),
    ]
    for (const value of wrong) assert.throws(() => parsePersonalAnswerReceipt(value), ContractViolation)
  })

  it('refuse a decision list that is not the contract', () => {
    const many = Array.from({ length: 101 }, (_, i) => ({
      decision: { ...admitted(), seq: Math.min(i + 1, 100) },
      createdAt: '2026-11-12T12:00:00Z',
    }))
    const wrong: unknown[] = [
      changed(list(), (l) => (l.decisions = [])),
      changed(list(), (l) => (l.decisions = many)),
      changed(list(), (l) => delete l.turnId),
      changed(list(), (l) => {
        const [first] = l.decisions as Record<string, unknown>[]
        if (first) delete first.createdAt
      }),
      changed(list(), (l) => {
        const [first] = l.decisions as Record<string, unknown>[]
        if (first) first.decision = null
      }),
    ]
    for (const value of wrong) assert.throws(() => parsePersonalAnswerDecisionList(value), ContractViolation)
  })
})
