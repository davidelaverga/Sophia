// GuideContext (SMC-M01 binding §4.3, §6): utterance counting per provider session, record freshness and narrowing.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GuideContext } from './guide-context.ts'

const start = { ledgerRevision: 5, eligibilityRevision: 2 }
const ok = (output: object = {}) => ({ status: 'ok' as const, output })

describe('GuideContext', () => {
  it('counts utterances within a provider session; a cold session starts again, a resumed one does not', () => {
    const g = new GuideContext(start)
    g.sessionStarted(true, false)
    g.utteranceHeard()
    g.utteranceHeard()
    assert.equal(g.utterance, 2)
    g.sessionStarted(false, false)
    assert.equal(g.utterance, 2, 'resumed: the same provider session')
    g.sessionStarted(true, true)
    assert.equal(g.utterance, 0, 'cold: a new provider session')
  })

  it('says on the next status read whether the conversation restarted without its history', () => {
    const g = new GuideContext(start)
    g.sessionStarted(true, false)
    assert.deepEqual(g.annotate('project_status', ok({ ledgerRevision: 5 })).output, {
      ledgerRevision: 5,
      connection: { restoredWithoutHistory: false },
    })
    g.sessionStarted(true, true)
    assert.deepEqual(g.annotate('project_status', ok({ ledgerRevision: 5 })).output, {
      ledgerRevision: 5,
      connection: { restoredWithoutHistory: true },
    })
  })

  it('flags records changed by others on the next result, until a status read; its own writes do not count', () => {
    const g = new GuideContext(start)
    g.writeStarted()
    assert.equal(g.observe({ ledgerRevision: 6, eligibilityRevision: 2 }), false)
    g.writeSettled()
    const own = g.annotate('record_mission_note', { status: 'committed', output: { ledgerRevision: 6 } })
    assert.deepEqual(own.output, { ledgerRevision: 6 }, 'its own write explains revision 6')
    g.observe({ ledgerRevision: 8, eligibilityRevision: 2 })
    const next = g.annotate('read_selected_source', ok({ text: 'x' }))
    assert.match(
      String((next.output as { recordsChanged?: string }).recordsChanged),
      /changed outside this conversation/,
    )
    g.annotate('project_status', ok({ ledgerRevision: 8 }))
    assert.deepEqual(g.annotate('read_selected_source', ok()).output, {}, 'read again: fresh')
  })

  it('an external change during its own write is still flagged once the write settles', () => {
    const g = new GuideContext(start)
    g.writeStarted()
    g.observe({ ledgerRevision: 6, eligibilityRevision: 2 }) // someone else's commit
    g.observe({ ledgerRevision: 7, eligibilityRevision: 2 }) // then its own
    g.writeSettled()
    const result = g.annotate('record_mission_note', { status: 'committed', output: { ledgerRevision: 7 } })
    assert.ok('recordsChanged' in result.output, 'revision 6 is not its own, although its receipt is newer')
  })

  it('its own writes alone, in flight together, are never taken for someone else’s', () => {
    const g = new GuideContext(start)
    g.writeStarted()
    g.writeStarted()
    g.observe({ ledgerRevision: 7, eligibilityRevision: 2 })
    g.writeSettled()
    const first = g.annotate('record_mission_note', { status: 'committed', output: { ledgerRevision: 6 } })
    assert.equal('recordsChanged' in first.output, false, 'the other write is still in flight')
    g.writeSettled()
    const second = g.annotate('propose_mission_change', { status: 'proposed', output: { ledgerRevision: 7 } })
    assert.equal('recordsChanged' in second.output, false, 'revisions 6 and 7 are both its own')
  })

  it('reports narrowed eligibility once, so the session rebuilds its provider context', () => {
    const g = new GuideContext(start)
    assert.equal(g.observe({ ledgerRevision: 5, eligibilityRevision: 2 }), false)
    assert.equal(g.observe({ ledgerRevision: 6, eligibilityRevision: 3 }), true)
    assert.equal(g.observe({ ledgerRevision: 6, eligibilityRevision: 3 }), false, 'once per narrowing')
  })
})
