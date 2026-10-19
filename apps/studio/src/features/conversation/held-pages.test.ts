import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DiscussionEntry } from '@sophia/contracts'
import { anchorOf, changesOf, contributionChanged, feedResynced, staleHeld, withPage } from './held-pages.ts'

const at = (n: number) => `2026-10-16T09:${String(n).padStart(2, '0')}:00.000Z`
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const e = (n: number, text = `Message ${n}`): DiscussionEntry => ({
  id: id(n),
  actorId: id(900),
  intent: 'discuss',
  origin: 'composer',
  text,
  sourceId: id(800),
  sha256: '0'.repeat(64),
  createdAt: at(n),
})
const maps = (...entries: DiscussionEntry[]) => ({
  entries: new Map(entries.map((x) => [x.id, x])),
  withdrawn: new Map(),
})

describe('held pages kept honest (4309253137)', () => {
  it('only held messages outside the window, changed since last asked, are stale; unheld and window ones are not', () => {
    const changes = {
      ids: new Map([
        [id(3), 5],
        [id(4), 6],
        [id(55), 7],
        [id(99), 8],
      ]),
      resyncs: 0,
    }
    const held = maps(e(3), e(4), e(55)).entries
    const window = new Set([id(55)])
    assert.deepEqual(staleHeld(changes, new Map(), held, window), [id(3), id(4)])
    assert.deepEqual(staleHeld(changes, new Map([[id(3), 5]]), held, window), [id(4)], 'asked already: not again')
    assert.deepEqual(staleHeld(changes, new Map([[id(3), 4]]), held, window), [id(3), id(4)], 'newer: asked again')
  })

  it('a burst beyond the feed’s 30 recent events loses none: every id is kept', () => {
    const project = '00000000-0000-4000-8000-0000000000ab'
    const many = Array.from({ length: 40 }, (_, i) => id(100 + i))
    for (const m of many) contributionChanged(project, m)
    contributionChanged(project, many[0] ?? '') // a replay counts once, newest
    feedResynced(project)
    const kept = changesOf(project)
    assert.equal(kept.ids.size, 40)
    assert.ok((kept.ids.get(many[0] ?? '') ?? 0) > (kept.ids.get(many[39] ?? '') ?? 0), 'the replay is the newest')
    assert.equal(kept.resyncs, 1)
  })

  it('the page that holds a message is the one read before the message just newer than it', () => {
    const items = [e(3), e(1), e(2), e(4)]
    assert.equal(anchorOf(id(2), items), id(3))
    assert.equal(anchorOf(id(4), items), undefined)
    assert.equal(anchorOf(id(9), items), undefined)
  })

  it('a page read again decides for its span: a correction replaces the words, a withdrawal leaves, neighbours stay', () => {
    const held = maps(e(1), e(2), e(3), e(4), e(5))
    const corrected = withPage(held, { entries: [e(2), e(3, 'Fixed'), e(4)], before: null })
    assert.equal(corrected.entries.get(id(3))?.text, 'Fixed')
    assert.equal(corrected.entries.size, 5)
    const gone = withPage(held, { entries: [e(2), e(4)], before: null })
    assert.equal(gone.entries.has(id(3)), false)
    assert.deepEqual([...gone.entries.keys()].toSorted(), [id(1), id(2), id(4), id(5)])
  })
})
