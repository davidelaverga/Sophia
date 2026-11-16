import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { ProjectNativeResource, ProjectNativeResourceMine, ProjectNativeResourcePage } from '@sophia/contracts'
import { ApiError } from './client.ts'
import {
  CatalogViolation,
  canonicalId,
  checkPage,
  listProjectNativeResources,
  readCatalogPage,
} from './native-resources.ts'

// A51's catalog read (INC01-DES-002): the reviewed parser, then the relations it can't say, through the real client.
// Every token here is invented; nothing leaves the process.
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const ME = '00000000-0000-4000-8000-00000000d001'
const LUIS = '00000000-0000-4000-8000-00000000e001'
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T = '2026-11-12T14:00:00.000Z'

const MINE: ProjectNativeResourceMine = {
  connection: { state: 'linked', expired: false },
  host: { state: 'active', helloOk: true, helloConflict: false, lastSeenAt: T, secondsSinceSeen: 240 },
  recordedQualification: { state: 'current', operations: ['create', 'stop'], qualifiedAt: T, expiresAt: null },
}
const ownRow = (n: number, over: Partial<ProjectNativeResource> = {}): ProjectNativeResource => ({
  id: id(n),
  tool: 'codex',
  state: 'active',
  owner: { id: ME, label: 'Davide', isYou: true, isMember: true },
  mine: MINE,
  ...over,
})
/** An owner row whose recorded qualification is `q`. */
const qualified = (q: ProjectNativeResourceMine['recordedQualification']) =>
  ownRow(1, { mine: { ...MINE, recordedQualification: q } })
const teammateRow = (n: number): ProjectNativeResource => ({
  id: id(n),
  tool: 'claude',
  state: 'needs_connection',
  owner: { id: LUIS, label: null, isYou: false, isMember: false },
  mine: null,
})
const page = (
  resources: ProjectNativeResource[],
  over: Partial<ProjectNativeResourcePage> = {},
): ProjectNativeResourcePage => ({
  observedAt: T,
  resources,
  nextCursor: null,
  complete: true,
  notReported: ['sessions', 'assignments', 'models', 'efforts', 'capacity', 'readiness', 'signIn', 'accounts'],
  ...over,
})

const realFetch = globalThis.fetch
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (error: unknown) => error,
  )
/** Whether reading refused the page for a broken relation (CatalogViolation), not for its shape or not at all. */
const violates = (read: () => unknown) => {
  try {
    read()
    return false
  } catch (error) {
    return error instanceof CatalogViolation
  }
}
const withinMs = <T>(ms: number, p: Promise<T>) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`not settled in ${ms} ms`)), ms)),
  ])

describe('the catalog page, read and checked (A51)', () => {
  it('reads a canonical page as given: an owner row with its own facts, a teammate row without them', () => {
    const value = page([ownRow(1), teammateRow(2)])
    assert.deepEqual(readCatalogPage(ME, null)(value), value)
  })

  it('drops unknown extra properties (the reviewed tolerant parser), and invents nothing for them', () => {
    const extended: unknown = { ...page([]), resources: [{ ...ownRow(1), sessions: [], extra: 1 }], total: 9 }
    const read = readCatalogPage(ME, null)(extended)
    assert.equal('total' in read, false)
    assert.equal('sessions' in (read.resources[0] ?? {}), false)
  })

  it('refuses what the schema refuses: an unknown enum, a wrong type, a bad id', () => {
    const bad: unknown[] = [
      { ...page([]), resources: [{ ...ownRow(1), tool: 'cursor' }] },
      { ...page([]), complete: 'yes' },
      page([{ ...ownRow(1), id: 'not-a-uuid' }]),
    ]
    for (const value of bad) {
      assert.throws(() => readCatalogPage(ME, null)(value))
    }
  })

  it('refuses each broken relation: complete and cursor, owner and reader, private part, operations, order', () => {
    const cases: [string, ProjectNativeResourcePage, string | null][] = [
      ['complete with a cursor', page([ownRow(1)], { nextCursor: id(1), complete: true }), null],
      ['incomplete without a cursor', page([ownRow(1)], { complete: false }), null],
      [
        'isYou for another owner',
        page([{ ...teammateRow(1), owner: { id: LUIS, label: 'L', isYou: true, isMember: true } }]),
        null,
      ],
      [
        'not isYou for the reader',
        page([{ ...ownRow(1), owner: { id: ME, label: 'D', isYou: false, isMember: true } }]),
        null,
      ],
      ['a private part for another', page([{ ...teammateRow(1), mine: MINE }]), null],
      ['no private part for the owner', page([{ ...ownRow(1), mine: null }]), null],
      [
        'operations repeated',
        page([qualified({ state: 'current', operations: ['stop', 'stop'], qualifiedAt: T, expiresAt: null })]),
        null,
      ],
      [
        'operations out of order',
        page([qualified({ state: 'current', operations: ['stop', 'create'], qualifiedAt: T, expiresAt: null })]),
        null,
      ],
      [
        'operations with no record',
        page([qualified({ state: 'none', operations: ['create'], qualifiedAt: null, expiresAt: null })]),
        null,
      ],
      [
        'a record with no operations',
        page([qualified({ state: 'expired', operations: [], qualifiedAt: T, expiresAt: T })]),
        null,
      ],
      ['ids not ascending', page([ownRow(2), ownRow(1)]), null],
      ['an id repeated', page([ownRow(1), ownRow(1)]), null],
      ['an id not past the cursor', page([ownRow(1)]), id(1)],
      ['a cursor not past the one asked with', page([ownRow(3)], { nextCursor: id(2), complete: false }), id(2)],
    ]
    for (const [label, value, after] of cases) assert.throws(() => checkPage(value, ME, after), CatalogViolation, label)
  })

  it('compares ids as A51 reads them: case and the urn:uuid: prefix make no difference', () => {
    assert.equal(canonicalId(`urn:uuid:${ME.toUpperCase()}`), ME)
    const upper = page([ownRow(1, { owner: { id: ME.toUpperCase(), label: 'D', isYou: true, isMember: true } })])
    assert.doesNotThrow(() => readCatalogPage(ME.toUpperCase(), null)(upper))
  })

  it('a complete empty page is an observed empty catalog, read as such', () => {
    assert.deepEqual(readCatalogPage(ME, null)(page([])).resources, [])
  })

  // CUR01: the cursor of a page with rows is its last row (0097 79–89); one past it would skip the rows between.
  it('refuses an incomplete page whose cursor isn’t its own last row, on the first page or a later one', () => {
    const more = (rows: number[], next: number) =>
      page(
        rows.map((n) => ownRow(n)),
        { nextCursor: id(next), complete: false },
      )
    const cases: [string, ProjectNativeResourcePage, string | null][] = [
      ['first page, cursor past its last row', more([1, 2], 5), null],
      ['first page, cursor behind its last row', more([1, 3], 2), null],
      ['later page, cursor past its last row', more([3, 4], 8), id(2)],
      ['later page, cursor past the one asked with but behind its last row', more([3, 5], 4), id(2)],
    ]
    const accepted = cases.filter(([, value, after]) => !violates(() => readCatalogPage(ME, after)(value)))
    assert.deepEqual(
      accepted.map(([label]) => label),
      [],
    )
  })

  it('takes a cursor that is its last row in any spelling, as sent; an empty page keeps its own reading', () => {
    const last = id(2).toUpperCase()
    assert.equal(
      readCatalogPage(ME, null)(page([ownRow(1), ownRow(2)], { nextCursor: last, complete: false })).nextCursor,
      last,
    )
    const later = page([ownRow(3), { ...ownRow(4), id: `urn:uuid:${id(4)}` }], { nextCursor: id(4), complete: false })
    assert.doesNotThrow(() => readCatalogPage(ME, id(2))(later))
    // Empty and incomplete has no last row: still read (the catalog says it partial, with no More), first or later.
    const emptyMore = page([], { nextCursor: id(9), complete: false })
    assert.deepEqual(readCatalogPage(ME, null)(emptyMore), emptyMore)
    assert.deepEqual(readCatalogPage(ME, id(2))(emptyMore), emptyMore)
    assert.throws(() => readCatalogPage(ME, id(9))(emptyMore), CatalogViolation)
  })
})

describe('the catalog read through the client (memberRead)', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('asks the project member read with its cursor as the server sent it, the token as given', async () => {
    const asked: { url: string; auth: string | null }[] = []
    globalThis.fetch = (input, init) => {
      asked.push({
        url: input instanceof Request ? input.url : input instanceof URL ? input.href : input,
        auth: new Headers(init?.headers).get('authorization'),
      })
      return Promise.resolve(Response.json(page([ownRow(2)])))
    }
    const read = await listProjectNativeResources('invented-token', PROJECT, ME, id(1))
    assert.equal(read.resources.length, 1)
    assert.match(asked[0]?.url ?? '', new RegExp(`/api/v1/projects/${PROJECT}/native-resources\\?after=${id(1)}$`))
    assert.equal(asked[0]?.auth, 'Bearer invented-token')
  })

  it('a page that breaks a relation is a contract violation, safe to read again: never rows filtered out', async () => {
    globalThis.fetch = () => Promise.resolve(Response.json(page([{ ...teammateRow(1), mine: MINE }])))
    const error = await refusal(listProjectNativeResources('t', PROJECT, ME, null))
    assert.ok(error instanceof ApiError)
    assert.deepEqual([error.code, error.retry], ['contract_violation', 'safe_read'])
  })

  it('a page whose cursor skips past its last row is a contract violation, safe to read again', async () => {
    globalThis.fetch = () =>
      Promise.resolve(Response.json(page([ownRow(3), ownRow(4)], { nextCursor: id(8), complete: false })))
    const error = await refusal(listProjectNativeResources('t', PROJECT, ME, id(2)))
    assert.ok(error instanceof ApiError, 'refused')
    assert.deepEqual([error.code, error.retry], ['contract_violation', 'safe_read'])
    assert.ok(error.cause instanceof CatalogViolation)
  })

  for (const status of [401, 403, 404]) {
    it(`a final ${String(status)} is refused from its status at once, its body never read`, async () => {
      globalThis.fetch = () => Promise.resolve(new Response(new ReadableStream({ start() {} }), { status }))
      const error = await withinMs(500, refusal(listProjectNativeResources('t', PROJECT, ME, null)))
      assert.ok(error instanceof ApiError)
      assert.deepEqual([error.status, error.retry], [status, 'never'])
    })
  }

  it('503 projection_unavailable keeps its code: the catalog not installed, never an empty one', async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        Response.json(
          { code: 'projection_unavailable', message: 'not installed', requestId: PROJECT, retry: 'never' },
          { status: 503 },
        ),
      )
    const error = await refusal(listProjectNativeResources('t', PROJECT, ME, null))
    assert.ok(error instanceof ApiError)
    assert.deepEqual([error.status, error.code], [503, 'projection_unavailable'])
  })
})
