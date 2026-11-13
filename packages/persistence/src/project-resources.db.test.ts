// The native resource catalog (A51, migration 0097) on real PostgreSQL with the production application role: every read
// goes through withActor on sophia_api, as the API does. Fixtures are written by the migration owner and are SYNTHETIC:
// no real connection, host, qualification or account exists or is implied. Private markers (PRIVATE, SECRET, /home)
// sit in every private column the catalog must never return.
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ProjectNativeResource, ProjectNativeResourcePage } from '@sophia/contracts'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { createPool, readProjectNativeResources, withActor } from './index.ts'

const PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'
const PRIVATE = /PRIVATE|SECRET|\/home|env-owner|acct-|journal|capability/

let db: TestDatabase
let api: pg.Pool
let owner: pg.Pool

before(async () => {
  db = await createTestDatabase()
  api = createPool(db.apiUrl, { max: 4 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
})
after(async () => {
  await api.end()
  await owner.end()
  await db.drop()
})

const sql = (text: string, params: unknown[] = []) => owner.query(text, params)
const byText = (a: string, b: string) => a.localeCompare(b)
const read = (who: string, projectId: string, cursor: string | null = null) =>
  withActor(api, who, 'read', (c) => readProjectNativeResources(c, projectId, cursor))
async function page(who: string, projectId: string, cursor: string | null = null): Promise<ProjectNativeResourcePage> {
  const p = await read(who, projectId, cursor)
  assert.ok(p, 'a member reads a page')
  return p
}
const only = (p: ProjectNativeResourcePage, id: string): ProjectNativeResource => {
  const r = p.resources.find((x) => x.id === id)
  assert.ok(r, `resource ${id} listed`)
  return r
}

/** A linked synthetic connection of `who`. */
async function connection(who: string): Promise<string> {
  const id = randomUUID()
  await sql(
    `INSERT INTO sophia.execution_connections(id, owner_id, upstream_origin, upstream_subject, state)
     VALUES ($1, $2, 'synthetic', 'SECRET-subject', 'linked')`,
    [id, who],
  )
  return id
}
/** A synthetic resource of `who` on `conn`, with private markers in its label and repository root. */
async function resource(
  projectId: string,
  who: string,
  conn: string | null,
  harness = 'claude-native',
  state = 'active',
) {
  const id = randomUUID()
  await sql(
    `INSERT INTO sophia.executor_resources(project_id, id, owner_id, connection_id, harness, label, repository_root, state)
     VALUES ($1, $2, $3, $4, $5, 'PRIVATE-label', '/home/PRIVATE/root', $6)`,
    [projectId, id, who, conn, harness, state],
  )
  return id
}
/** A recorded qualification row as the operator would keep it, at the resource's and connection's current revisions. */
async function qualification(
  projectId: string,
  res: string,
  opts: { qualifiedAgo?: string; expiresIn?: string; revoked?: boolean } = {},
) {
  const { rows } = await sql(
    `INSERT INTO sophia.owner_runner_qualifications(project_id, resource_id, owner_id, connection_id, connection_revision,
       resource_revision, adapter, adapter_pin, environment_ref, native_project_ref, profile_id, profile_revision,
       toolkit_scope, account_key, operations, allowance_operations, evidence_ref, qualified_at, expires_at, revoked_at,
       revoked_reason)
     SELECT r.project_id, r.id, r.owner_id, r.connection_id, c.revision, r.revision, 't3', $3, 'env-owner-SECRET',
       'project-SECRET', 'profile-SECRET', 1, 'gateway_enforced', 'acct-SECRET', ARRAY['create','stop'], 5, 'SECRET evidence',
       now() - $4::interval, now() + $5::interval, CASE WHEN $6 THEN now() END, CASE WHEN $6 THEN 'SECRET reason' END
     FROM sophia.executor_resources r JOIN sophia.execution_connections c ON c.id = r.connection_id
     WHERE r.project_id = $1 AND r.id = $2 RETURNING id, qualified_at`,
    [projectId, res, PIN, opts.qualifiedAgo ?? '1 hour', opts.expiresIn ?? '1 day', opts.revoked === true],
  )
  return rows[0] as { id: string; qualified_at: Date }
}
/** A host of `who` on `conn` in `state`, last seen `seen` ago (an interval; negative for the future) or never. */
async function host(who: string, conn: string, state: string, seen: string | null, conflict: string | null = null) {
  const pairing = randomUUID()
  await sql(
    `INSERT INTO sophia.owner_host_pairings(id, owner_id, connection_id, code_sha256, expires_at)
     VALUES ($1, $2, $3, sha256(convert_to($4, 'UTF8')), now() + interval '5 minutes')`,
    [pairing, who, conn, `code-${pairing}`],
  )
  await sql(
    `INSERT INTO sophia.owner_hosts(owner_id, connection_id, pairing_id, capability_sha256, state, hello_ok, hello_conflict,
       last_seen_at, environment_ref, account_key)
     VALUES ($1, $2, $3, sha256(gen_random_uuid()::text::bytea), $4, $5, $6, now() - $7::interval, 'env-owner-SECRET',
       'acct-SECRET')`,
    [who, conn, pairing, state, conflict === null, conflict, seen],
  )
}

/** A project with an admin owner O, an editor E, a viewer V and a former editor F; and an outsider X. */
async function world() {
  const [O, E, V, F, X] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  const p = await seedProject(db.ownerUrl, { admin: O, editors: [E], viewers: [V] })
  await sql(`INSERT INTO sophia.project_members(project_id, actor_id, role, active) VALUES ($1, $2, 'editor', false)`, [
    p.projectId,
    F,
  ])
  return { projectId: p.projectId, O, E, V, F, X }
}

/** What a read must never change: outbox, commands, events, qualification use and hosts. */
async function counts(): Promise<Record<string, string>> {
  const { rows } = await owner.query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM sophia.outbox) o, (SELECT count(*) FROM sophia.commands) c,
      (SELECT count(*) FROM sophia.project_events) e,
      (SELECT coalesce(sum(used_operations), 0) FROM sophia.owner_runner_qualifications) u,
      (SELECT count(*) FROM sophia.owner_hosts) h`,
  )
  return rows[0] ?? {}
}

describe('who reads what (A51)', () => {
  it('the owner alone reads mine; a teammate, a viewer and others read the public part only; nonmembers read nothing', async () => {
    const w = await world()
    await sql(`INSERT INTO sophia.actor_profiles(actor_id, display_name, chosen) VALUES ($1, 'Owner Name', true)`, [
      w.O,
    ])
    const conn = await connection(w.O)
    const res = await resource(w.projectId, w.O, conn)
    const formerConn = await connection(w.F)
    const formers = await resource(w.projectId, w.F, formerConn, 'codex-native')
    await host(w.O, conn, 'active', '30 seconds', 'changed: SECRET-conflict')
    await qualification(w.projectId, res)
    const effects = await counts()
    const mineView = only(await page(w.O, w.projectId), res)
    assert.deepEqual(mineView.owner, { id: w.O, label: 'Owner Name', isYou: true, isMember: true })
    assert.ok(mineView.mine)
    assert.equal(mineView.mine.host?.helloConflict, true)
    assert.equal(mineView.mine.recordedQualification.state, 'current')
    for (const who of [w.E, w.V]) {
      const p = await page(who, w.projectId)
      const r = only(p, res)
      assert.equal(r.mine, null, 'no owner-only part for a teammate or a viewer')
      assert.deepEqual(r.owner, { id: w.O, label: 'Owner Name', isYou: false, isMember: true })
      assert.equal(only(p, formers).owner.isMember, false, 'a former owner is not a member')
      assert.equal(only(p, formers).mine, null)
      assert.doesNotMatch(JSON.stringify(p), PRIVATE)
    }
    assert.doesNotMatch(JSON.stringify(await page(w.O, w.projectId)), PRIVATE, 'not even to the owner')
    assert.equal(await read(w.F, w.projectId), null, 'a former member reads nothing')
    assert.equal(await read(w.X, w.projectId), null, 'a nonmember reads nothing')
    assert.equal(await read(w.O, randomUUID()), null, 'a missing project reads like a foreign one')
    assert.deepEqual(await counts(), effects, 'reads write nothing')
  })

  it('lists codex and claude resources in every state, never the dsh runtime row', async () => {
    const w = await world()
    const conn = await connection(w.O)
    const ids = [
      await resource(w.projectId, w.O, conn, 'claude-native', 'active'),
      await resource(w.projectId, w.O, conn, 'codex-native', 'revoked'),
      await resource(w.projectId, w.O, conn, 'codex-native', 'needs_connection'),
    ]
    await resource(w.projectId, w.O, null, 'dsh')
    const p = await page(w.E, w.projectId)
    assert.deepEqual(p.resources.map((r) => r.id).toSorted(byText), ids.toSorted(byText))
    assert.deepEqual(p.resources.map((r) => `${r.tool}/${r.state}`).toSorted(byText), [
      'claude/active',
      'codex/needs_connection',
      'codex/revoked',
    ])
    assert.deepEqual(p.notReported, [
      'sessions',
      'assignments',
      'models',
      'efforts',
      'capacity',
      'readiness',
      'signIn',
      'accounts',
    ])
  })
})

/** The owner's view of a fresh resource after `setup`: its recorded qualification, connection and host. */
async function ownerView(setup: (w: Awaited<ReturnType<typeof world>>, conn: string, res: string) => Promise<unknown>) {
  const w = await world()
  const conn = await connection(w.O)
  const res = await resource(w.projectId, w.O, conn)
  await setup(w, conn, res)
  const mine = only(await page(w.O, w.projectId), res).mine
  assert.ok(mine)
  return mine
}

describe("the owner's recorded qualification, judged at one instant (A51)", () => {
  const cases: [
    string,
    string,
    (w: Awaited<ReturnType<typeof world>>, conn: string, res: string) => Promise<unknown>,
  ][] = [
    ['none', 'none', () => Promise.resolve()],
    ['current', 'current', (w, _c, res) => qualification(w.projectId, res)],
    [
      'expired',
      'expired',
      (w, _c, res) => qualification(w.projectId, res, { qualifiedAgo: '2 days', expiresIn: '-1 day' }),
    ],
    ['revoked (history)', 'revoked', (w, _c, res) => qualification(w.projectId, res, { revoked: true })],
    [
      'stale: the resource moved on',
      'stale',
      async (w, _c, res) => {
        await qualification(w.projectId, res)
        await sql(`UPDATE sophia.executor_resources SET revision = revision + 1 WHERE id = $1`, [res])
      },
    ],
    [
      'stale: the connection moved on',
      'stale',
      async (w, conn, res) => {
        await qualification(w.projectId, res)
        await sql(`UPDATE sophia.execution_connections SET revision = revision + 1 WHERE id = $1`, [conn])
      },
    ],
    [
      'not applicable: the resource needs a connection',
      'not_applicable',
      async (w, _c, res) => {
        await qualification(w.projectId, res)
        await sql(`UPDATE sophia.executor_resources SET state = 'needs_connection' WHERE id = $1`, [res])
      },
    ],
    [
      'not applicable: the connection is revoked',
      'not_applicable',
      async (w, conn, res) => {
        await qualification(w.projectId, res)
        await sql(`UPDATE sophia.execution_connections SET state = 'revoked' WHERE id = $1`, [conn])
      },
    ],
    [
      'not applicable: the connection expired',
      'not_applicable',
      async (w, conn, res) => {
        await qualification(w.projectId, res)
        await sql(`UPDATE sophia.execution_connections SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
          conn,
        ])
      },
    ],
    [
      'not applicable: the owner became a viewer',
      'not_applicable',
      async (w, _c, res) => {
        await qualification(w.projectId, res)
        await sql(`UPDATE sophia.project_members SET role = 'viewer' WHERE project_id = $1 AND actor_id = $2`, [
          w.projectId,
          w.O,
        ])
      },
    ],
  ]
  for (const [name, expected, setup] of cases) {
    it(`${name}: ${expected}`, async () => {
      const mine = await ownerView(setup)
      assert.equal(mine.recordedQualification.state, expected)
      assert.deepEqual(mine.recordedQualification.operations, expected === 'none' ? [] : ['create', 'stop'])
    })
  }

  it('prefers the unrevoked record over a later revoked one, and otherwise the latest by (qualified_at, id)', async () => {
    let kept = ''
    const mine = await ownerView(async (w, _c, res) => {
      await qualification(w.projectId, res, { qualifiedAgo: '3 hours', revoked: true })
      kept = (await qualification(w.projectId, res, { qualifiedAgo: '2 hours' })).qualified_at.toISOString()
      await qualification(w.projectId, res, { qualifiedAgo: '1 hour', revoked: true })
    })
    assert.equal(mine.recordedQualification.state, 'current')
    assert.equal(new Date(mine.recordedQualification.qualifiedAt ?? '').toISOString(), kept)
    let latest = ''
    const history = await ownerView(async (w, _c, res) => {
      await qualification(w.projectId, res, { qualifiedAgo: '3 hours', revoked: true })
      latest = (
        await qualification(w.projectId, res, { qualifiedAgo: '1 hour', revoked: true })
      ).qualified_at.toISOString()
    })
    assert.equal(history.recordedQualification.state, 'revoked')
    assert.equal(new Date(history.recordedQualification.qualifiedAt ?? '').toISOString(), latest)
  })

  it('reports the connection state and its expiry as booleans only', async () => {
    const mine = await ownerView((_w, conn) =>
      sql(`UPDATE sophia.execution_connections SET expires_at = now() - interval '1 minute' WHERE id = $1`, [conn]),
    )
    assert.deepEqual(mine.connection, { state: 'linked', expired: true })
  })
})

describe("the owner's live host: recorded, never online (A51)", () => {
  it('none, retired only, bound never seen, active seen, and a time in the future', async () => {
    assert.equal((await ownerView(() => Promise.resolve())).host, null)
    assert.equal(
      (await ownerView((w, conn) => host(w.O, conn, 'retired', '1 minute'))).host,
      null,
      'retired is not live',
    )
    const bound = (await ownerView((w, conn) => host(w.O, conn, 'bound', null))).host
    assert.deepEqual(bound, {
      state: 'bound',
      helloOk: true,
      helloConflict: false,
      lastSeenAt: null,
      secondsSinceSeen: null,
    })
    const active = (await ownerView((w, conn) => host(w.O, conn, 'active', '30 seconds'))).host
    assert.equal(active?.state, 'active')
    assert.ok((active?.secondsSinceSeen ?? -1) >= 30 && (active?.secondsSinceSeen ?? 99) < 90)
    const future = (await ownerView((w, conn) => host(w.O, conn, 'active', '-10 minutes'))).host
    assert.ok(future?.lastSeenAt, 'the recorded time is reported')
    assert.equal(future.secondsSinceSeen, null, 'a time later than observedAt is never fresh')
  })
})

describe('pages by resource id, with no total (A51)', () => {
  it('an empty catalog is complete; 205 resources page stably as 200 and 5 with no row twice', async () => {
    const w = await world()
    const empty = await page(w.E, w.projectId)
    assert.deepEqual([empty.resources, empty.nextCursor, empty.complete], [[], null, true])
    const conn = await connection(w.O)
    await sql(
      `INSERT INTO sophia.executor_resources(project_id, owner_id, connection_id, harness, label, repository_root, state)
       SELECT $1, $2, $3, 'codex-native', 'x', 'x', 'active' FROM generate_series(1, 205)`,
      [w.projectId, w.O, conn],
    )
    const first = await page(w.E, w.projectId)
    assert.equal(first.resources.length, 200)
    assert.equal(first.complete, false)
    assert.equal(first.nextCursor, first.resources.at(-1)?.id)
    const rest = await page(w.E, w.projectId, first.nextCursor)
    assert.deepEqual([rest.resources.length, rest.nextCursor, rest.complete], [5, null, true])
    const ids = [...first.resources, ...rest.resources].map((r) => r.id)
    assert.equal(new Set(ids).size, 205)
    assert.deepEqual(
      ids,
      ids.toSorted((a, b) => a.localeCompare(b)),
      'ordered by id',
    )
    const past = await page(w.E, w.projectId, 'ffffffff-ffff-ffff-ffff-ffffffffffff')
    assert.deepEqual([past.resources, past.complete], [[], true])
  })
})

// ---- r1 (INC01-CC-006-dev-BOUNDED-SOURCE-STUDY-001: CC006-F01, CC006-F02): legal records stay readable ----

/** A qualification recorded through the frozen 0092 qualifier itself, with these operations and this expiry. */
async function qualifiedVia(projectId: string, res: string, operations: string[], expires: string) {
  await sql(
    `SELECT sophia.qualify_owner_runner($1, $2, $3, 'env-owner-1', 'project-sophia', 'read-only-v1', 1, 'gateway_enforced',
       'acct-SECRET', $4::text[], 5, $5::timestamptz, 'SECRET evidence')`,
    [projectId, res, PIN, operations, expires],
  )
}
/** The owner's recorded qualification of `res` on page `p`. */
function recordOf(p: ProjectNativeResourcePage, res: string) {
  const q = only(p, res).mine?.recordedQualification
  assert.ok(q, `the owner reads the record of ${res}`)
  return q
}
/** A time as read: null, an RFC 3339 date-time (its date kept), or the literal text when it is neither. */
const shape = (t: string | null) => (t === null ? null : /^\d{4}-\d{2}-\d{2}T/.test(t) ? `${t.slice(0, 10)}T…` : t)

describe('every record the qualifier accepts is readable, as recorded (r1, CC006-F01/F02)', () => {
  it('reads the recorded operations as a set in the fixed order, adding nothing', async () => {
    const w = await world()
    const conn = await connection(w.O)
    const cases: [string[], string[]][] = [
      [
        ['create', 'input', 'stop', 'stop'],
        ['create', 'input', 'stop'],
      ],
      [
        ['stop', 'create', 'stop', 'input'],
        ['create', 'input', 'stop'],
      ],
      [['stop', 'stop'], ['stop']],
      [
        ['input', 'create'],
        ['create', 'input'],
      ],
    ]
    const ids: [string, string[]][] = []
    for (const [recorded, expected] of cases) {
      const res = await resource(w.projectId, w.O, conn)
      await qualifiedVia(w.projectId, res, recorded, new Date(Date.now() + 86_400_000).toISOString())
      ids.push([res, expected])
    }
    const unchanged = await counts()
    const p = await page(w.O, w.projectId)
    for (const [res, expected] of ids) {
      const q = recordOf(p, res)
      assert.deepEqual(q.operations, expected)
      assert.equal(q.state, 'current')
    }
    for (const [res] of ids) assert.equal(only(await page(w.E, w.projectId), res).mine, null)
    assert.deepEqual(await counts(), unchanged, 'a read changes nothing')
  })

  it('reads a time with no RFC 3339 form as null, and judges the state on the recorded value', async () => {
    const w = await world()
    const conn = await connection(w.O)
    const unbounded = await resource(w.projectId, w.O, conn)
    await qualifiedVia(w.projectId, unbounded, ['stop'], 'infinity')
    const farFuture = await resource(w.projectId, w.O, conn)
    await qualifiedVia(w.projectId, farFuture, ['stop'], '12000-01-01 00:00:00+00')
    const lastYear = await resource(w.projectId, w.O, conn)
    await qualifiedVia(w.projectId, lastYear, ['stop'], '9999-12-31 00:00:00+00')
    const since = await resource(w.projectId, w.O, conn)
    await qualifiedVia(w.projectId, since, ['stop'], new Date(Date.now() + 86_400_000).toISOString())
    await sql(`UPDATE sophia.owner_runner_qualifications SET qualified_at = '-infinity' WHERE resource_id = $1`, [
      since,
    ])
    const p = await page(w.O, w.projectId)
    const today = new Date().toISOString().slice(0, 10)
    // [state judged on the recorded values, qualifiedAt as read, expiresAt as read]
    assert.deepEqual(
      [unbounded, farFuture, lastYear, since].map((res) => {
        const q = recordOf(p, res)
        return [q.state, shape(q.qualifiedAt), shape(q.expiresAt)]
      }),
      [
        ['current', `${today}T…`, null],
        ['current', `${today}T…`, null],
        ['current', `${today}T…`, '9999-12-31T…'],
        ['current', null, `${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}T…`],
      ],
    )
  })

  it('reads a host last seen at infinity or -infinity with no time and no age, never failing the page', async () => {
    const seen: Record<string, unknown> = {}
    for (const at of ['infinity', '-infinity']) {
      seen[at] = await ownerView(async (w, conn) => {
        await host(w.O, conn, 'active', '1 minute')
        await sql(`UPDATE sophia.owner_hosts SET last_seen_at = $2::timestamptz WHERE connection_id = $1`, [conn, at])
      }).then(
        (mine) => [mine.host?.lastSeenAt, mine.host?.secondsSinceSeen, mine.host?.state],
        (err: unknown) => String(err),
      )
    }
    assert.deepEqual(seen, { infinity: [null, null, 'active'], '-infinity': [null, null, 'active'] })
  })
})

// ---- r2 (INC01-CC-006-r1-BOUNDED-SOURCE-STUDY-001: CC006-R1-F01): full RFC 3339 times in any session time zone ----

/** A full RFC 3339 date-time as the catalog writes it: always UTC, `+00:00`. */
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?\+00:00$/
/** The caller's own session settings for one read, as `SET LOCAL` in the API role's transaction. */
const SESSIONS: Record<string, string>[] = [
  { TimeZone: 'UTC' },
  { TimeZone: 'Asia/Kathmandu' },
  { TimeZone: 'Europe/Amsterdam' },
  { TimeZone: 'Africa/Monrovia' },
  { TimeZone: 'America/New_York' },
  { TimeZone: 'Pacific/Kiritimati' },
  { TimeZone: 'Asia/Kathmandu', DateStyle: 'SQL, DMY', IntervalStyle: 'sql_standard' },
]

/** The page `who` reads with these session settings, and the session's settings after the read. */
async function readIn(who: string, projectId: string, session: Record<string, string>) {
  return withActor(api, who, 'read', async (c) => {
    for (const [name, value] of Object.entries(session)) await c.query('SELECT set_config($1, $2, true)', [name, value])
    const p = await readProjectNativeResources(c, projectId, null)
    const settings: Record<string, string> = {}
    for (const name of Object.keys(session)) {
      const { rows } = await c.query<{ v: string }>('SELECT current_setting($1) AS v', [name])
      settings[name] = rows[0]?.v ?? ''
    }
    assert.ok(p, 'a member reads a page')
    return { p, settings }
  })
}

/** A time as read, for comparison across sessions: exact, or `now`/`tomorrow` for times the fixture takes from now. */
function timeAs(t: string | null | undefined, observedAt: number): string | null {
  if (t === null || t === undefined) return null
  if (!UTC_TIME.test(t)) return `NOT RFC 3339 UTC: ${t}`
  const ms = Date.parse(t)
  if (Math.abs(ms - observedAt) < 3_600_000) return 'now'
  if (Math.abs(ms - observedAt - 86_400_000) < 3_600_000) return 'tomorrow'
  return t
}
/** An age as read: null, or whether it is the whole seconds from lastSeenAt to observedAt. */
function ageAs(age: number | null | undefined, seen: string | null | undefined, observedAt: number): string | null {
  if (age === null || age === undefined) return null
  const expected = Math.floor((observedAt - Date.parse(seen ?? '')) / 1000)
  return Math.abs(age - expected) <= 1 ? 'consistent' : `WRONG ${age} vs ${expected}`
}

/** One resource per isolated legal record: historic, year-1, year-9999, BC, infinite and future times. */
async function historicWorld() {
  const w = await world()
  const conn = await connection(w.O)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
  const set = (res: string, assignments: string) =>
    sql(`UPDATE sophia.owner_runner_qualifications SET ${assignments} WHERE resource_id = $1`, [res])
  const qualified = async (expires: string, assignments: string | null) => {
    const res = await resource(w.projectId, w.O, conn)
    await qualifiedVia(w.projectId, res, ['stop'], expires)
    if (assignments) await set(res, assignments)
    return res
  }
  const seen = async (at: string | null) => {
    const own = await connection(w.O)
    const res = await resource(w.projectId, w.O, own)
    await host(w.O, own, 'active', at === null ? '-1 day' : '1 minute')
    if (at !== null)
      await sql(`UPDATE sophia.owner_hosts SET last_seen_at = $2::timestamptz WHERE connection_id = $1`, [own, at])
    return res
  }
  const ids = {
    qualified1900: await qualified('infinity', `qualified_at = '1900-01-01T00:00:00Z'`),
    expired1900: await qualified(tomorrow, `qualified_at = '-infinity', expires_at = '1900-01-01T00:00:00Z'`),
    qualifiedYear1: await qualified('infinity', `qualified_at = '0001-01-01T00:00:00Z'`),
    expiresYear9999: await qualified('9999-12-31T20:00:00Z', null),
    qualifiedBC: await qualified('infinity', `qualified_at = '0001-06-01 00:00:00+00 BC'`),
    seen1900: await seen('1900-01-01T00:00:00Z'),
    seenYear1: await seen('0001-01-01T00:00:00Z'),
    seenMinusInfinity: await seen('-infinity'),
    seenTomorrow: await seen(null),
  }
  return { ...w, ids }
}

/** One owner view, for comparison across sessions: [state, qualifiedAt, expiresAt, lastSeenAt, secondsSinceSeen]. */
function viewOf(mine: ProjectNativeResource['mine'], observedAt: number): (string | null)[] {
  const q = mine?.recordedQualification
  const h = mine?.host
  return [
    q?.state ?? null,
    timeAs(q?.qualifiedAt, observedAt),
    timeAs(q?.expiresAt, observedAt),
    timeAs(h?.lastSeenAt, observedAt),
    ageAs(h?.secondsSinceSeen, h?.lastSeenAt, observedAt),
  ]
}

/** What every session must read, by fixture: [state, qualifiedAt, expiresAt, lastSeenAt, secondsSinceSeen]. */
const EXPECTED: Record<string, (string | null)[]> = {
  qualified1900: ['current', '1900-01-01T00:00:00+00:00', null, null, null],
  expired1900: ['expired', null, '1900-01-01T00:00:00+00:00', null, null],
  qualifiedYear1: ['current', '0001-01-01T00:00:00+00:00', null, null, null],
  expiresYear9999: ['current', 'now', '9999-12-31T20:00:00+00:00', null, null],
  qualifiedBC: ['current', null, null, null, null],
  seen1900: ['none', null, null, '1900-01-01T00:00:00+00:00', 'consistent'],
  seenYear1: ['none', null, null, '0001-01-01T00:00:00+00:00', 'consistent'],
  seenMinusInfinity: ['none', null, null, null, null],
  seenTomorrow: ['none', null, null, 'tomorrow', null],
}

describe('every outward time is full RFC 3339 in UTC, whatever the session time zone (r2, CC006-R1-F01)', () => {
  it("reads the same exact times in every caller's zone and style, states as recorded, the session untouched", async () => {
    const w = await historicWorld()
    const unchanged = await counts()
    const seen: Record<string, unknown> = {}
    for (const session of SESSIONS) {
      const label = Object.values(session).join(' / ')
      const { p, settings } = await readIn(w.O, w.projectId, session)
      const observedAt = Date.parse(p.observedAt)
      const views: Record<string, (string | null)[]> = {}
      for (const [name, res] of Object.entries(w.ids)) views[name] = viewOf(only(p, res).mine, observedAt)
      seen[label] = { observedAt: UTC_TIME.test(p.observedAt), views, settings }
    }
    assert.deepEqual(
      seen,
      Object.fromEntries(
        SESSIONS.map((s) => [Object.values(s).join(' / '), { observedAt: true, views: EXPECTED, settings: s }]),
      ),
    )
    assert.deepEqual(await counts(), unchanged, 'a read changes nothing')
  })

  it('shows a teammate no owner part in any of these zones', async () => {
    const w = await historicWorld()
    for (const session of SESSIONS) {
      const { p } = await readIn(w.E, w.projectId, session)
      assert.ok(UTC_TIME.test(p.observedAt), p.observedAt)
      for (const res of Object.values(w.ids)) assert.equal(only(p, res).mine, null)
    }
  })
})
