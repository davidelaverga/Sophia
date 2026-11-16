// The canonical A51 page parser (INC01-CC-005-A51-PARSER-LOCAL-001; docs/plans/inc01-resources-parser.md): the
// generated standalone validator of ProjectNativeResourcePage, read through the existing typed parser. Synthetic,
// canonical pages only. A reader is tolerant: a property the contract does not list is dropped in place, so every case
// starts from a fresh copy.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ProjectNativeResourcePage } from './generated-types.ts'
import { ContractViolation, parseProjectNativeResourcePage } from './validate.ts'

const OWNER = '3f6c1b2a-8d4e-4f5a-9b6c-7d8e9f0a1b2c'
const TEAMMATE_OWNER = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const R1 = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f2a3b4c5d'
const R2 = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const NOT_REPORTED = ['sessions', 'assignments', 'models', 'efforts', 'capacity', 'readiness', 'signIn', 'accounts']

/** The owner's own page: one active Codex resource with its recorded connection, host and qualification. */
const ownerPage = (): ProjectNativeResourcePage => ({
  observedAt: '2026-11-12T12:00:00.000Z',
  resources: [
    {
      id: R1,
      tool: 'codex',
      state: 'active',
      owner: { id: OWNER, label: 'Ada', isYou: true, isMember: true },
      mine: {
        connection: { state: 'linked', expired: false },
        host: {
          state: 'active',
          helloOk: true,
          helloConflict: false,
          lastSeenAt: '2026-11-12T11:59:48.000Z',
          secondsSinceSeen: 12,
        },
        recordedQualification: {
          state: 'current',
          operations: ['create', 'input', 'stop'],
          qualifiedAt: '2026-11-10T09:00:00.000Z',
          expiresAt: '2026-12-10T09:00:00.000Z',
        },
      },
    },
  ],
  nextCursor: null,
  complete: true,
  notReported: NOT_REPORTED as ProjectNativeResourcePage['notReported'],
})

/** A teammate's page: someone else's Claude resource, with no owner view (mine: null), and more to follow. */
const teammatePage = (): ProjectNativeResourcePage => ({
  observedAt: '2026-11-12T12:00:00Z',
  resources: [
    {
      id: R2,
      tool: 'claude',
      state: 'needs_connection',
      owner: { id: TEAMMATE_OWNER, label: null, isYou: false, isMember: false },
      mine: null,
    },
  ],
  nextCursor: R2,
  complete: false,
  notReported: [],
})

const parse = (value: unknown) => parseProjectNativeResourcePage(structuredClone(value))
/** The violation a value raises, or a failure: never a cast or a silent pass. */
function violation(value: unknown): ContractViolation {
  let caught: unknown = null
  try {
    parse(value)
  } catch (err) {
    caught = err
  }
  assert.ok(caught instanceof ContractViolation, caught === null ? 'the page was accepted' : 'another error was thrown')
  assert.equal(caught.schema, 'ProjectNativeResourcePage')
  return caught
}
type Mutable = Record<string, unknown>
const at = (page: ProjectNativeResourcePage, edit: (p: Mutable) => void): unknown => {
  const copy = structuredClone(page) as unknown as Mutable
  edit(copy)
  return copy
}
const resource0 = (p: Mutable) => (p.resources as Mutable[])[0] as Mutable
const mine0 = (p: Mutable) => resource0(p).mine as Mutable

describe('the canonical A51 page parser reads what the contract allows', () => {
  it('reads an owner page and a teammate page exactly as given', () => {
    assert.deepEqual(parse(ownerPage()), ownerPage())
    assert.deepEqual(parse(teammatePage()), teammatePage())
  })

  it('reads every tool, resource, connection, host and qualification state A51 lists', () => {
    for (const tool of ['codex', 'claude'])
      for (const state of ['active', 'revoked', 'needs_connection'])
        assert.equal(
          parse(at(ownerPage(), (p) => Object.assign(resource0(p), { tool, state }))).resources[0]?.state,
          state,
        )
    for (const connection of [
      ...['pending', 'linked', 'expired', 'denied', 'revoked', 'rotation_unknown'].map((state) => ({
        state,
        expired: state === 'expired',
      })),
      null,
    ])
      assert.deepEqual(
        parse(at(ownerPage(), (p) => (mine0(p).connection = connection))).resources[0]?.mine?.connection,
        connection,
      )
    for (const host of ['bound', 'active']) parse(at(ownerPage(), (p) => ((mine0(p).host as Mutable).state = host)))
    parse(at(ownerPage(), (p) => (mine0(p).host = null)))
    for (const state of ['none', 'current', 'expired', 'revoked', 'stale', 'not_applicable'])
      parse(at(ownerPage(), (p) => ((mine0(p).recordedQualification as Mutable).state = state)))
  })

  it('reads operation arrays, unrepresentable (null) times, host ages and page shapes at their bounds', () => {
    for (const operations of [[], ['create'], ['create', 'input'], ['create', 'input', 'stop']])
      parse(at(ownerPage(), (p) => ((mine0(p).recordedQualification as Mutable).operations = operations)))
    parse(
      at(ownerPage(), (p) => {
        Object.assign(mine0(p).recordedQualification as Mutable, {
          state: 'none',
          operations: [],
          qualifiedAt: null,
          expiresAt: null,
        })
        Object.assign(mine0(p).host as Mutable, { lastSeenAt: null, secondsSinceSeen: null })
      }),
    )
    for (const age of [0, Number.MAX_SAFE_INTEGER])
      parse(at(ownerPage(), (p) => ((mine0(p).host as Mutable).secondsSinceSeen = age)))
    parse(at(ownerPage(), (p) => ((resource0(p).owner as Mutable).label = 'é'.repeat(200))))
    assert.deepEqual(parse(at(ownerPage(), (p) => (p.resources = []))).resources, [], 'an observed empty catalog')
    const full = at(
      ownerPage(),
      (p) => (p.resources = Array.from({ length: 200 }, () => structuredClone(teammatePage().resources[0]))),
    )
    assert.equal(parse(full).resources.length, 200)
  })
})

describe('the canonical A51 page parser refuses what the contract refuses', () => {
  const cases: [string, (p: Mutable) => void][] = [
    ['a missing observedAt', (p) => delete p.observedAt],
    ['missing resources', (p) => delete p.resources],
    ['a missing nextCursor (it is required, nullable)', (p) => delete p.nextCursor],
    ['a missing complete', (p) => delete p.complete],
    ['a missing notReported', (p) => delete p.notReported],
    ['a resource without mine (required, nullable)', (p) => delete resource0(p).mine],
    ['a host without helloConflict', (p) => delete (mine0(p).host as Mutable).helloConflict],
    ['a null recordedQualification (not nullable)', (p) => (mine0(p).recordedQualification = null)],
    ['complete as a string', (p) => (p.complete = 'true')],
    ['resources as an object', (p) => (p.resources = {})],
    ['operations as a string', (p) => ((mine0(p).recordedQualification as Mutable).operations = 'create')],
    ['isYou as a number', (p) => ((resource0(p).owner as Mutable).isYou = 1)],
    ['an unknown tool', (p) => (resource0(p).tool = 'dsh')],
    ['an unknown resource state', (p) => (resource0(p).state = 'online')],
    ['an unknown connection state', (p) => ((mine0(p).connection as Mutable).state = 'active')],
    ['an unknown host state', (p) => ((mine0(p).host as Mutable).state = 'online')],
    ['an unknown qualification state', (p) => ((mine0(p).recordedQualification as Mutable).state = 'supported')],
    ['an unknown operation', (p) => ((mine0(p).recordedQualification as Mutable).operations = ['delete'])],
    ['an unknown notReported fact', (p) => (p.notReported = ['tokens'])],
    ['a resource id that is not a UUID', (p) => (resource0(p).id = 'resource-1')],
    ['an owner id that is not a UUID', (p) => ((resource0(p).owner as Mutable).id = 'ada')],
    ['a nextCursor that is not a UUID', (p) => (p.nextCursor = 'next')],
    ['an observedAt that is a date only', (p) => (p.observedAt = '2026-11-12')],
    ['a lastSeenAt that is not a time', (p) => ((mine0(p).host as Mutable).lastSeenAt = 'yesterday')],
    [
      'an impossible qualifiedAt',
      (p) => ((mine0(p).recordedQualification as Mutable).qualifiedAt = '2026-13-01T00:00:00Z'),
    ],
    ['a 201-character label', (p) => ((resource0(p).owner as Mutable).label = 'é'.repeat(201))],
    ['a negative host age', (p) => ((mine0(p).host as Mutable).secondsSinceSeen = -1)],
    ['a fractional host age', (p) => ((mine0(p).host as Mutable).secondsSinceSeen = 1.5)],
    ['a host age past the safe-integer bound', (p) => ((mine0(p).host as Mutable).secondsSinceSeen = 2 ** 53)],
    [
      'four operations',
      (p) => ((mine0(p).recordedQualification as Mutable).operations = ['create', 'input', 'stop', 'stop']),
    ],
    ['nine notReported facts', (p) => (p.notReported = [...NOT_REPORTED, 'sessions'])],
    [
      '201 resources',
      (p) => (p.resources = Array.from({ length: 201 }, () => structuredClone(teammatePage().resources[0]))),
    ],
  ]
  for (const [name, edit] of cases)
    it(`refuses ${name}`, () => {
      assert.ok(violation(at(ownerPage(), edit)).issues.length > 0)
    })
})

describe('the A51 parser is a tolerant reader and promises no relational meaning', () => {
  it('drops a property the contract does not list, at every depth, in place on its input', () => {
    const extra = at(ownerPage(), (p) => {
      p.total = 1
      resource0(p).label = 'not in A51'
      ;(resource0(p).owner as Mutable).email = 'not in A51'
      mine0(p).path = 'not in A51'
      ;(mine0(p).connection as Mutable).account = 'not in A51'
      ;(mine0(p).host as Mutable).online = true
      ;(mine0(p).recordedQualification as Mutable).supported = true
    })
    const input = structuredClone(extra)
    assert.deepEqual(parseProjectNativeResourcePage(input), ownerPage())
    assert.deepEqual(input, ownerPage(), 'the reader drops in place: callers pass a value they own')
  })

  it('accepts shapes the schema allows but a consumer must still judge (owner view, operation order, cursor)', () => {
    // The schema expresses none of these relations; the Resources adapter checks them. Nothing here claims them.
    parse(at(ownerPage(), (p) => ((mine0(p).recordedQualification as Mutable).operations = ['stop', 'create'])))
    parse(at(ownerPage(), (p) => ((resource0(p).owner as Mutable).isYou = false)))
    parse(at(teammatePage(), (p) => ((resource0(p).owner as Mutable).isYou = true)))
    parse(at(ownerPage(), (p) => (p.nextCursor = R1)))
  })
})
