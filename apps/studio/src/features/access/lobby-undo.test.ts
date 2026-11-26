import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LobbyEntry } from '@sophia/contracts'
import { ASK_AGAIN_MS, nextExpiry, undoable } from './lobby-undo.ts'

const entry = (status: LobbyEntry['status'], knocks = 1): LobbyEntry => ({
  id: 'g1',
  displayName: 'Carla',
  status,
  requestedAt: '2026-11-22T10:00:00Z',
  decidedAt: null,
  knocks,
})
const declined = [{ entry: entry('waiting'), at: 1_000 }]

describe('«Let in instead» stands while the decline holds (call-way-back.md)', () => {
  it('stands through the guest’s minute, the decline read or on its way', () => {
    assert.equal(undoable(declined, [entry('denied')], 1_000 + 59_000).length, 1)
    assert.equal(undoable(declined, [entry('waiting')], 1_500).length, 1)
    assert.equal(undoable(declined, undefined, 2_000).length, 1)
  })

  it('goes when the minute is up, when they ask again, leave, are let in or blocked', () => {
    assert.equal(undoable(declined, [entry('denied')], 1_000 + ASK_AGAIN_MS).length, 0)
    assert.equal(undoable(declined, [entry('waiting', 2)], 30_000).length, 0)
    for (const status of ['left', 'admitted', 'blocked'] as const) {
      assert.equal(undoable(declined, [entry(status)], 30_000).length, 0, status)
    }
    assert.equal(undoable(declined, [], 30_000).length, 0)
  })

  it('says when the next one leaves by time', () => {
    assert.equal(nextExpiry(declined, 2_000), 1_000 + ASK_AGAIN_MS)
    assert.equal(nextExpiry([], 2_000), null)
  })

  it('has nothing to wake for once the last minute is past (Codex P2 on #547)', () => {
    assert.equal(nextExpiry(declined, 1_000 + ASK_AGAIN_MS), null)
    const two = [...declined, { entry: entry('waiting'), at: 30_000 }]
    assert.equal(nextExpiry(two, 1_000 + ASK_AGAIN_MS), 30_000 + ASK_AGAIN_MS)
  })
})
