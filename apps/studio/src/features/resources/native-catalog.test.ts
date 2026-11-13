import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProjectNativeResource, ProjectNativeResourceMine, ProjectNativeResourcePage } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { catalogReducer, initialCatalog, toResource, UNKNOWN_NAME, type CatalogState } from './native-catalog.ts'
import { activity, anyLive, inFilter, matches, observationOf } from './resource.ts'

// A51's catalog in the view (INC01-DES-002): each row as a Resource that says only what is recorded, and one read's
// pages and refusals, each answer taken only for its own generation.
const ME = '00000000-0000-4000-8000-00000000d001'
const LUIS = '00000000-0000-4000-8000-00000000e001'
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T1 = '2026-11-12T14:00:00.000Z'
const T2 = '2026-11-12T14:01:00.000Z'

const MINE: ProjectNativeResourceMine = {
  connection: { state: 'linked', expired: false },
  host: { state: 'bound', helloOk: false, helloConflict: true, lastSeenAt: null, secondsSinceSeen: null },
  recordedQualification: {
    state: 'current',
    operations: ['create', 'input', 'stop'],
    qualifiedAt: null,
    expiresAt: null,
  },
}
const own = (n: number): ProjectNativeResource => ({
  id: id(n),
  tool: 'codex',
  state: 'active',
  owner: { id: ME, label: 'Davide', isYou: true, isMember: true },
  mine: MINE,
})
const theirs = (n: number, label: string | null = null): ProjectNativeResource => ({
  id: id(n),
  tool: 'claude',
  state: 'needs_connection',
  owner: { id: LUIS, label, isYou: false, isMember: false },
  mine: null,
})
const page = (rows: ProjectNativeResource[], next: string | null, at = T1): ProjectNativeResourcePage => ({
  observedAt: at,
  resources: rows,
  nextCursor: next,
  complete: next === null,
  notReported: ['sessions', 'assignments', 'models', 'efforts', 'capacity', 'readiness', 'signIn', 'accounts'],
})

const run = (state: CatalogState, ...events: Parameters<typeof catalogReducer>[1][]) =>
  events.reduce((s, e) => catalogReducer(s, e), state)
const refused = (status: number) => new ApiError(status, `http_${String(status)}`, 'That didn’t go through.', 'never')

describe('a catalog row in the view', () => {
  it('says what is recorded, each fact as given: tool, owner, state, and its page’s time', () => {
    const r = toResource(own(1), T1)
    assert.equal(r.tool, 'codex')
    assert.deepEqual(r.owner, { id: ME, name: 'Davide', named: true, former: false })
    assert.equal(r.catalog?.state, 'active')
    assert.equal(r.catalog?.observedAt, T1)
    // The server's qualification state, kept as given with null times: never judged again here.
    assert.deepEqual(r.catalog?.mine?.qualification, {
      state: 'current',
      operations: ['create', 'input', 'stop'],
      qualifiedAt: null,
      expiresAt: null,
    })
    assert.deepEqual(r.catalog?.mine?.host, MINE.host)
  })

  it('maps claude to Claude Code, a null label to an unknown name, and says a former owner', () => {
    const r = toResource(theirs(2), T1)
    assert.equal(r.tool, 'claude-code')
    assert.deepEqual(r.owner, { id: LUIS, name: UNKNOWN_NAME, named: false, former: true })
    assert.equal(toResource(theirs(2, '  '), T1).owner.named, false)
    assert.equal(toResource(theirs(2, 'Luis'), T1).owner.name, 'Luis')
  })

  it('keeps a teammate’s view free of the owner’s facts', () => {
    assert.equal(toResource(theirs(2), T1).catalog?.mine, null)
  })

  it('reports no account, session, control, readiness or host state: null and unknown, never none or zero', () => {
    const r = toResource(own(1), T1)
    assert.equal(r.entitlementId, null)
    assert.equal(r.sessions, null)
    assert.equal(r.controls, null)
    assert.equal(r.readiness, null)
    assert.equal(r.reservePercent, null)
    assert.deepEqual(r.host, { state: 'unknown', observedAt: null })
    assert.equal(activity(r), 'Sessions not reported')
    assert.equal(observationOf([{ entitlement_id: id(1) } as never], r), undefined)
    assert.equal(anyLive(r, new Date(T1)), false)
    assert.equal(inFilter('online', r, [], ME), false)
    assert.equal(matches(r, 'davide codex'), true)
  })

  it('never makes an account up from a resource or connection id', () => {
    const r = toResource(own(1), T1)
    assert.ok(!JSON.stringify({ e: r.entitlementId }).includes(id(1)))
  })
})

describe('one read, its pages and refusals', () => {
  it('reads a complete first page, and an observed empty catalog as empty and complete', () => {
    const s = run(initialCatalog(), { type: 'page', gen: 1, after: null, page: page([own(1), theirs(2)], null) })
    assert.equal(s.status, 'complete')
    assert.deepEqual(
      s.rows.map((r) => r.id),
      [id(1), id(2)],
    )
    const empty = run(initialCatalog(), { type: 'page', gen: 1, after: null, page: page([], null) })
    assert.deepEqual([empty.status, empty.rows.length], ['complete', 0])
  })

  it('an empty first page that isn’t the last is partial, never an empty catalog', () => {
    const s = run(initialCatalog(), {
      type: 'page',
      gen: 1,
      after: null,
      page: { ...page([], id(9)), complete: false },
    })
    assert.deepEqual([s.status, s.partial], ['partial', 'inconsistent'])
  })

  it('reads on with More, each page keeping its own observation time', () => {
    const s = run(
      initialCatalog(),
      { type: 'page', gen: 1, after: null, page: page([own(1)], id(1), T1) },
      { type: 'more', gen: 1 },
      { type: 'page', gen: 1, after: id(1), page: page([theirs(2)], null, T2) },
    )
    assert.equal(s.status, 'complete')
    assert.deepEqual(
      s.rows.map((r) => r.catalog?.observedAt),
      [T1, T2],
    )
  })

  it('a page that doesn’t follow leaves what was read partial: a row again, a cursor again, not past, empty', () => {
    const first = run(
      initialCatalog(),
      { type: 'page', gen: 1, after: null, page: page([own(1), own(2)], id(2)) },
      { type: 'more', gen: 1 },
    )
    for (const [label, next] of [
      ['a row read before', page([own(2), own(3)], null)],
      ['a cursor seen before', page([own(3)], id(2))],
      ['a cursor not past the last', page([own(3)], id(1))],
      ['an empty page that isn’t the last', { ...page([], id(5)), complete: false }],
    ] as const) {
      const s = catalogReducer(first, { type: 'page', gen: 1, after: id(2), page: next })
      assert.deepEqual([s.status, s.partial, s.rows.length], ['partial', 'inconsistent', 2], label)
    }
  })

  it('a later page that fails keeps what was read, partial, with its time; the first failing is a failed read', () => {
    const read = run(
      initialCatalog(),
      { type: 'page', gen: 1, after: null, page: page([own(1)], id(1)) },
      { type: 'more', gen: 1 },
    )
    const later = catalogReducer(read, {
      type: 'failed',
      gen: 1,
      error: new ApiError(0, 'outcome_unknown', 'x', 'safe_read'),
    })
    assert.deepEqual(
      [later.status, later.partial, later.rows.length, later.lastObservedAt],
      ['partial', 'failed', 1, T1],
    )
    const first = catalogReducer(initialCatalog(), {
      type: 'failed',
      gen: 1,
      error: new ApiError(502, 'http_502', 'x', 'safe_read'),
    })
    assert.deepEqual([first.status, first.rows.length], ['failed', 0])
  })

  it('503 projection_unavailable on the first page is unavailable; any other 503 is a failed read', () => {
    const missing = new ApiError(503, 'projection_unavailable', 'not installed', 'never')
    assert.equal(catalogReducer(initialCatalog(), { type: 'failed', gen: 1, error: missing }).status, 'unavailable')
    const busy = new ApiError(503, 'unavailable', 'busy', 'safe_read')
    assert.equal(catalogReducer(initialCatalog(), { type: 'failed', gen: 1, error: busy }).status, 'failed')
  })

  for (const status of [401, 403, 404] as const) {
    it(`a ${String(status)} on any page clears everything read at once, and nothing older is taken after`, () => {
      const read = run(
        initialCatalog(),
        { type: 'page', gen: 1, after: null, page: page([own(1)], id(1)) },
        { type: 'more', gen: 1 },
      )
      const s = catalogReducer(read, { type: 'failed', gen: 1, error: refused(status) })
      assert.deepEqual([s.status, s.refusal, s.rows.length, s.next], ['refused', status, 0, null])
      assert.equal(s.gen, 2)
      // The page asked for before the refusal answers late: an older generation's, refused.
      const late = catalogReducer(s, { type: 'page', gen: 1, after: id(1), page: page([theirs(2)], null) })
      assert.equal(late, s)
      const lateFirst = catalogReducer(s, { type: 'page', gen: 1, after: null, page: page([own(1)], null) })
      assert.equal(lateFirst, s)
      // Refused on the first page too.
      const first = catalogReducer(initialCatalog(), { type: 'failed', gen: 1, error: refused(status) })
      assert.deepEqual([first.status, first.rows.length], ['refused', 0])
    })
  }

  it('only a new read starts again: a new generation, nothing of the last, and its late answers refused', () => {
    const read = run(initialCatalog(), { type: 'page', gen: 1, after: null, page: page([own(1)], null) })
    const again = catalogReducer(read, { type: 'read' })
    assert.deepEqual([again.gen, again.status, again.rows.length], [2, 'loading', 0])
    assert.equal(catalogReducer(again, { type: 'page', gen: 1, after: null, page: page([theirs(2)], null) }), again)
    assert.equal(catalogReducer(again, { type: 'failed', gen: 1, error: refused(404) }), again)
  })

  it('takes no More while one is under way, nor a page it didn’t ask for', () => {
    const read = run(initialCatalog(), { type: 'page', gen: 1, after: null, page: page([own(1)], id(1)) })
    assert.equal(catalogReducer(read, { type: 'page', gen: 1, after: id(1), page: page([own(2)], null) }), read)
    const reading = catalogReducer(read, { type: 'more', gen: 1 })
    assert.equal(catalogReducer(reading, { type: 'more', gen: 1 }), reading)
    assert.equal(catalogReducer(reading, { type: 'page', gen: 1, after: id(7), page: page([own(8)], null) }), reading)
  })
})
