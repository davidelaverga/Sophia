import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BoardDecision } from './board-view.ts'
import { decisionNote, newSince, openAcross, openDecisions, openKey } from './decision-alert.ts'

// A decision waiting on the viewer, heard beyond the view (docs/plans/decision-alert.md; informe-25 DL-07).

const NOW = new Date('2026-10-17T12:00:00Z')
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()
const decision = (id: string, over: Partial<BoardDecision> = {}): BoardDecision => ({
  decision_id: id,
  revision: 1,
  work_id: 'work-1',
  plan_id: 'plan-1',
  plan_revision: 1,
  candidate_version_ref: null,
  question: `Question ${id}?`,
  decider_id: 'me',
  choices: [{ key: 'yes', label: 'Yes' }],
  expires_at: at(120),
  state: 'proposed',
  selected_choice: null,
  choice_receipt_id: null,
  plan_reaction: 'not_needed',
  ...over,
})
/** Open decisions by their ids alone. */
const openOf = (...ids: string[]) => ids.map((id) => ({ id, question: 'Keep it?', due: 'expires in 2 h' }))

describe('decisions waiting on the viewer', () => {
  it('are the latest revision of each, still answerable, theirs to decide', () => {
    const open = openDecisions(
      [
        decision('a'),
        decision('a', { revision: 2, question: 'Keep it?' }),
        decision('b', { expires_at: at(-1) }),
        decision('c', { state: 'accepted' }),
        decision('d', { decider_id: 'marco' }),
      ],
      'me',
      NOW,
    )
    assert.deepEqual(open, [{ id: 'a', question: 'Keep it?', due: 'expires in 2 h' }])
    assert.deepEqual(openDecisions([decision('a')], null, NOW), [])
  })

  it('across the goals, none until the board is read', () => {
    const x = { id: 'x', question: 'X?', due: 'expires in 2 h' }
    const y = { id: 'y', question: 'Y?', due: 'expires in 1 h' }
    assert.deepEqual(openAcross({ g1: { toDecide: [x] }, g2: {}, g3: { toDecide: [y] } }), [x, y])
    assert.equal(openAcross(undefined), undefined)
  })

  it('are news only when they weren’t there at the last look', () => {
    const x = { id: 'x', question: 'X?', due: 'expires in 2 h' }
    const y = { id: 'y', question: 'Y?', due: 'expires in 1 h' }
    assert.deepEqual(newSince(new Set(['x']), [x, y]), [y])
    assert.deepEqual(newSince(new Set(['x', 'y']), [x]), [])
  })

  it('are told apart by their ids, whatever an id holds: one with a comma is not two (Codex P2 on #458)', () => {
    assert.notEqual(openKey(openOf('a,b')), openKey(openOf('a', 'b')))
    assert.equal(openKey(openOf('a', 'b')), openKey(openOf('a', 'b')))
    assert.equal(openKey(undefined), undefined)
  })

  it('are said in the notification: one by its question and when it ends, several by how many', () => {
    const x = { id: 'x', question: 'Keep it?', due: 'expires in 2 h' }
    assert.deepEqual(decisionNote([x], 'Fixture project'), {
      title: 'A decision waits on you: Keep it?',
      body: 'Fixture project · expires in 2 h',
    })
    assert.deepEqual(decisionNote([x, { ...x, id: 'z' }], 'Fixture project'), {
      title: '2 decisions wait on you',
      body: 'Fixture project',
    })
  })
})
