import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DiscussionEntry, DiscussionPage } from '@sophia/contracts'
import {
  ACTS,
  anchorOf,
  changesOf,
  contributionChanged,
  feedResynced,
  feedStopped,
  HeldRefresher,
  KEPT,
  ownerOf,
  READS,
  staleHeld,
  superseded,
  withPage,
  windowAliasesOf,
  withoutAliases,
} from './held-pages.ts'

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
    const project = ownerOf('davide', '00000000-0000-4000-8000-0000000000ab')
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

  it('a page read again settles only the messages it was read for; a newer neighbour is never set back (R F1)', () => {
    const held = maps(e(1), e(2, 'Newer 2'), e(3), e(4), e(5))
    const corrected = withPage(held, { entries: [e(2), e(3, 'Fixed'), e(4)], before: null }, [id(3)])
    assert.equal(corrected.entries.get(id(3))?.text, 'Fixed')
    assert.equal(corrected.entries.get(id(2))?.text, 'Newer 2', 'the page’s older copy of a neighbour is not used')
    assert.deepEqual(corrected.settled, [id(3)])
    const gone = withPage(held, { entries: [e(2), e(4)], before: null }, [id(3)])
    assert.equal(gone.entries.has(id(3)), false)
    assert.equal(gone.entries.size, 4)
    const elsewhere = withPage(held, { entries: [e(4), e(5)], before: null }, [id(1)])
    assert.deepEqual(elsewhere.settled, [], 'a page that doesn’t cover the message settles nothing')
    assert.equal(elsewhere.entries.has(id(1)), true)
  })

  it('each account and project keeps its own changes, bounded, and forgets them when its feed stops (R F3)', () => {
    const mine = ownerOf('davide', 'p1')
    const theirs = ownerOf('lucia', 'p1')
    contributionChanged(mine, id(1))
    assert.equal(changesOf(theirs).ids.size, 0)
    feedStopped(mine)
    assert.equal(changesOf(mine).ids.size, 0)
    const busy = ownerOf('davide', 'p2')
    for (let n = 0; n <= KEPT; n += 1) contributionChanged(busy, id(1000 + n))
    assert.equal(changesOf(busy).ids.size, 0, 'past the bound: let go')
    assert.equal(changesOf(busy).resyncs, 1, 'as after a resync: the earlier pages go')
  })

  it('the refresher keeps at most one batch in flight: a burst while reads are pending starts no more (R 61DC-F1)', async () => {
    const answers: { anchor: string; resolve: (p: DiscussionPage) => void }[] = []
    let active = 0
    let most = 0
    const refresher = new HeldRefresher(
      (anchor) =>
        new Promise((resolve) => {
          active += 1
          most = Math.max(most, active)
          answers.push({ anchor, resolve: (p) => ((active -= 1), resolve(p)) })
        }),
      (_page, ids) => ids,
      () => assert.fail('nothing is dropped'),
    )
    const held = maps(...Array.from({ length: 20 }, (_, n) => e(n + 1)))
    const window = [e(60)]
    const learned = new Map<string, number>()
    for (const n of [3, 7, 11, 15]) {
      learned.set(id(n), learned.size + 1)
      refresher.step({ ids: new Map(learned), resyncs: 0 }, held, window)
    }
    assert.equal(answers.length, 1, 'one read for the first change; the next three wait')
    assert.equal(most, 1)
    assert.deepEqual(
      [...refresher.fence({ ids: learned, resyncs: 0 }, held, window)].toSorted(),
      [id(3), id(7), id(11), id(15)].toSorted(),
      'all four are fenced at once, read or waiting',
    )
    answers[0]?.resolve({ entries: [], before: null })
    await Promise.resolve()
    refresher.step({ ids: learned, resyncs: 0 }, held, window)
    assert.equal(answers.length, 4, 'the waiting three go together, one read each, within READS')
    assert.ok(most <= READS)
  })

  it('after a failure drops the pages, an older answer or failure changes nothing in the pages read again (R 61DC-F2)', async () => {
    const answers: { resolve: (p: DiscussionPage) => void; reject: (e: Error) => void }[] = []
    let drops = 0
    let applied = 0
    const refresher = new HeldRefresher(
      () => new Promise((resolve, reject) => answers.push({ resolve, reject })),
      (_page, ids) => {
        applied += 1
        return ids
      },
      () => (drops += 1),
    )
    const held = maps(...Array.from({ length: 20 }, (_, n) => e(n + 1)))
    const changes = {
      ids: new Map([
        [id(3), 1],
        [id(12), 2],
      ]),
      resyncs: 0,
    }
    refresher.step(changes, held, [e(60)])
    assert.equal(answers.length, 2)
    answers[0]?.reject(new Error('503'))
    await Promise.resolve()
    assert.equal(drops, 1, 'the failure lets the pages go')
    // The reader reads the earlier pages again (a fresh held span); the other, older read fails late, then one succeeds late.
    answers[1]?.reject(new Error('late'))
    await Promise.resolve()
    assert.equal(drops, 1, 'an older failure does not drop the pages read again')
    const fresh = maps(...Array.from({ length: 20 }, (_, n) => e(n + 1)))
    refresher.step({ ids: new Map(), resyncs: 0 }, fresh, [e(60)])
    assert.equal(applied, 0, 'no older answer was applied')
  })

  it('a message learned newer while its read is out is not settled by that read; it is asked again', async () => {
    const answers: ((p: DiscussionPage) => void)[] = []
    const refresher = new HeldRefresher(
      () => new Promise((resolve) => answers.push(resolve)),
      (_page, ids) => ids,
      () => assert.fail('nothing is dropped'),
    )
    const held = maps(e(1), e(2), e(3), e(4))
    refresher.step({ ids: new Map([[id(2), 1]]), resyncs: 0 }, held, [e(60)])
    const newer = { ids: new Map([[id(2), 2]]), resyncs: 0 }
    answers[0]?.({ entries: [e(2, 'old answer')], before: null })
    await Promise.resolve()
    assert.ok(refresher.fence(newer, held, [e(60)]).has(id(2)), 'still fenced: its newer change is not yet read')
    refresher.step(newer, held, [e(60)])
    assert.equal(answers.length, 2, 'read again for the newer change')
  })

  it('reads still out from an older epoch keep their place: after failure and reload, no more than READS are ever out (R physical pending)', async () => {
    const answers: { resolve: (p: DiscussionPage) => void; reject: (e: Error) => void }[] = []
    let active = 0
    let most = 0
    let drops = 0
    const refresher = new HeldRefresher(
      () =>
        new Promise((resolve, reject) => {
          active += 1
          most = Math.max(most, active)
          answers.push({
            resolve: (p) => {
              active -= 1
              resolve(p)
            },
            reject: (error) => {
              active -= 1
              reject(error)
            },
          })
        }),
      (_page, ids) => ids,
      () => (drops += 1),
    )
    const held = maps(...Array.from({ length: 20 }, (_, n) => e(n + 1)))
    refresher.step(
      {
        ids: new Map([
          [id(3), 1],
          [id(12), 2],
        ]),
        resyncs: 0,
      },
      held,
      [e(60)],
    )
    assert.equal(active, 2)
    answers[0]?.reject(new Error('503'))
    await Promise.resolve()
    assert.equal(drops, 1)
    // The pages are read again; three other held messages change while the older read is still out.
    const fresh = maps(...Array.from({ length: 20 }, (_, n) => e(n + 1)))
    const later = {
      ids: new Map([
        [id(5), 3],
        [id(9), 4],
        [id(15), 5],
      ]),
      resyncs: 0,
    }
    refresher.step(later, fresh, [e(60)])
    assert.ok(active <= READS, `at most ${READS} reads out, the older one included (was ${active})`)
    answers[1]?.reject(new Error('late')) // the older read ends, late
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(drops, 1, 'its late failure drops nothing')
    refresher.step(later, fresh, [e(60)])
    assert.equal(active, 3, 'drained: the waiting work goes, within READS')
    assert.ok(most <= READS)
  })

  it('pages read again after a let-go are not fenced again for what was known then; a later change still is (R fallback-reload)', () => {
    let reads = 0
    let drops = 0
    const refresher = new HeldRefresher(
      () => {
        reads += 1
        return new Promise<DiscussionPage>(() => {})
      },
      (_page, ids) => ids,
      () => (drops += 1),
    )
    const held = maps(...Array.from({ length: 20 }, (_, n) => e(n + 1)))
    const burst = { ids: new Map([1, 3, 5, 7, 9].map((n, k): [string, number] => [id(n), k + 1])), resyncs: 0 }
    refresher.fence(burst, held, [e(60)])
    refresher.step(burst, held, [e(60)])
    assert.equal(drops, 1, 'five pages at once: let go')
    assert.equal(reads, 0)
    // «Earlier messages» reads the pages again (fresh, after the let-go): nothing fenced, nothing read again.
    const reloaded = maps(...Array.from({ length: 20 }, (_, n) => e(n + 1)))
    assert.deepEqual([...refresher.fence(burst, reloaded, [e(60)])], [])
    refresher.step(burst, reloaded, [e(60)])
    assert.equal(drops, 1, 'not let go again')
    assert.equal(reads, 0, 'not read again')
    // A change learned after the let-go is newer than what was known then: fenced and read.
    const later = { ids: new Map([...burst.ids, [id(12), 9]]), resyncs: 0 }
    assert.deepEqual([...refresher.fence(later, reloaded, [e(60)])], [id(12)])
    refresher.step(later, reloaded, [e(60)])
    assert.equal(reads, 1)
  })

  it('a held message named again at the same revision (contribution.mentioned) is read again like a correction (4309755040)', () => {
    assert.ok(ACTS.has('contribution.mentioned'))
    const owner = ownerOf('davide', 'p-mention')
    contributionChanged(owner, id(3))
    const first = changesOf(owner).ids.get(id(3)) ?? 0
    contributionChanged(owner, id(3)) // a second event for the same message, same revision: learned newer
    assert.ok((changesOf(owner).ids.get(id(3)) ?? 0) > first)
    const held = maps(e(1), e(2), e(3), e(4)).entries
    assert.deepEqual(staleHeld(changesOf(owner), new Map([[id(3), first]]), held, new Set()), [id(3)], 'still to read')
  })
})

// r4313704366: a correction or withdrawal erases a source; every other held message sharing it goes with it.
describe('held aliases of an erased source (r4313704366)', () => {
  const src = (n: number, source: number, kind: 'text' | 'reference' = 'text'): DiscussionEntry => ({
    ...e(n),
    sourceId: id(source),
    kind,
  })

  it('a batch drops every alias of every source gone, and keeps the rest; a held withdrawn place undoes nothing (F3)', () => {
    const held = {
      entries: new Map([1, 2, 3, 4].map((n) => [id(n), src(n, n < 3 ? 700 : n === 3 ? 701 : 702)])),
      withdrawn: new Map([
        [id(9), { id: id(9), actorId: id(900), authorName: null, createdAt: at(9), withdrawnAt: at(10) }],
      ]),
    }
    // A = 1 (source 700) and the withdrawn place 9 learned together, A first: 2 shares A's source and goes.
    const next = withoutAliases(held, new Set([id(700)]), new Set([id(1), id(9)]))
    assert.deepEqual([...next.entries.keys()], [id(1), id(3), id(4)])
    // The same with the withdrawn place first: the same result, nothing undone.
    assert.deepEqual(
      [...withoutAliases(held, new Set([id(700)]), new Set([id(9), id(1)])).entries.keys()],
      [id(1), id(3), id(4)],
    )
  })

  it('in the snapshot’s own window, nothing held, every alias of a source gone is named; the acted, a withdrawn place and other sources are not (4316503664)', () => {
    const withdrawn = { id: id(9), actorId: id(900), authorName: null, createdAt: at(9), withdrawnAt: at(10) }
    const window = [src(1, 700), src(2, 700), src(3, 701), src(4, 700, 'reference'), withdrawn]
    assert.deepEqual(windowAliasesOf(window, new Set([id(700)]), new Set([id(1)])), [id(2), id(4)])
    assert.deepEqual(windowAliasesOf(window, new Set(), new Set([id(1)])), [])
    assert.deepEqual(windowAliasesOf(window, new Set([id(799)]), new Set()), [])
  })
})

describe('a receipt superseded by a later erasure (R-B56-P1)', () => {
  it('a correction or withdrawal at a later cursor supersedes it; its own act’s event, or none, does not', () => {
    assert.equal(superseded('41', '42'), true)
    assert.equal(superseded('41', '41'), false) // its own act's event
    assert.equal(superseded('41', '40'), false)
    assert.equal(superseded('41', undefined), false)
    assert.equal(superseded(null, '42'), false) // nothing changed: no receipt shown
    assert.equal(superseded('9007199254740993', '9007199254740994'), true) // beyond 2^53, exact
  })

  it('the feed keeps each message’s latest erasing cursor; a mention keeps none', () => {
    const owner = ownerOf('b57', 'p')
    contributionChanged(owner, id(1), true, '10')
    contributionChanged(owner, id(1), true, '12')
    contributionChanged(owner, id(2), false, '13')
    assert.deepEqual([...(changesOf(owner).erasedAt ?? [])], [[id(1), '12']])
    feedStopped(owner)
  })
})
