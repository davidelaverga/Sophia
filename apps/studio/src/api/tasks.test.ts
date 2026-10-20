import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ContractViolation, parseProjectTask } from '@sophia/contracts/validate'
import { shownTask } from './tasks.ts'

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const served = (origin: unknown) => ({
  taskId: ID(1),
  projectId: ID(2),
  title: 'Check the March figure',
  ownerId: ID(3),
  ownerName: 'Lucía',
  state: 'open',
  revision: 4,
  createdBy: ID(5),
  createdByName: null,
  createdAt: '2026-10-17T10:00:00.000Z',
  doneBy: null,
  doneByName: null,
  doneAt: null,
  origin,
})

describe('the served task (A39) through the generated validator', () => {
  it('reads a link-only passage as its version and place, with no quote, and keeps the revision', () => {
    const t = shownTask(
      parseProjectTask(
        served({
          available: true,
          artifactId: ID(6),
          versionId: ID(7),
          versionNumber: 2,
          title: 'Kiosk pilot',
          at: { block: 3, word: 2, count: 4 },
        }),
      ),
    )
    assert.deepEqual(t.from, { artifactId: ID(6), versionId: ID(7), versionNumber: 2, passage: '3.2.4', quote: null })
    assert.deepEqual([t.text, t.owner, t.revision], ['Check the March figure', ID(3), 4])
  })

  it('reads an unavailable origin as unavailable, and none as none', () => {
    assert.equal(shownTask(parseProjectTask(served({ available: false }))).from, 'unavailable')
    assert.equal(shownTask(parseProjectTask(served(null))).from, null)
  })

  it('refuses what A39 never serves: a quote is dropped, a task without its revision refused', () => {
    const withQuote = parseProjectTask(served({ available: false, quote: 'The vendor quoted 9,400.' }))
    assert.equal(JSON.stringify(withQuote).includes('9,400'), false, 'an extra property is not kept')
    const { revision: _r, ...noRevision } = served(null)
    assert.throws(() => parseProjectTask(noRevision), ContractViolation)
  })
})
