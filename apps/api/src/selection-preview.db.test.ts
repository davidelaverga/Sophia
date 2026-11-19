// The trusted read-only selection preview over HTTP (A56, migration 0104): buildApp with a verified token, the
// production API role and real PostgreSQL, through the real kernel and projection. Owner records go through the owner's
// real idempotent write entry; custody, route and account qualification run as the migration owner. Every account,
// grant, qualification and token is SYNTHETIC: nothing here qualifies a real owner, account, route or provider, and no
// selected synthetic preview is an AC-04 case. Private markers must never reach a response body or a log line.
import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SignJWT } from 'jose'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { RuntimeRole } from '@sophia/contracts'
import { parseSelectionView } from '@sophia/contracts/validate'
import {
  admitResearchTask,
  contributionWrite,
  createPool,
  recordRuntimeReady,
  runtimeHello,
  runtimeTokenHash,
  withActor,
  withService,
} from '@sophia/persistence'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { buildApp } from './app.ts'
import { createActorVerifier } from './auth.ts'

const SECRET = 'synthetic-test-secret-at-least-32-bytes-long!!'
const ISSUER = 'https://synthetic.supabase.test/auth/v1'
const MD: RuntimeRole = { id: 'sophia-research-md-v1', route: 'research-sol-medium-v1', presetDigest: 'sha256:md' }
/** What no preview body or log line may carry: labels, custody, evidence, caps. */
const PRIVATE = /PRIVATE|SECRET|Usd|totalCap|taskCap|evidence|custodian|eligibleActors/
const token = (sub: string) =>
  new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(SECRET))
const verifyActor = createActorVerifier({ issuer: ISSUER, audience: 'authenticated', secret: SECRET })

/** The tables an effect would touch: none may change while previews are read. */
const LEDGERS = [
  'commands',
  'outbox',
  'project_events',
  'jobs',
  'goals',
  'work_attempts',
  'execution_bindings',
  'research_allowances',
  'research_reservations',
  'api_contribution_tasks',
  'api_contribution_reservations',
  'api_contribution_requests',
  'research_funding_pins',
  'owner_runner_operations',
  'owner_runner_reservations',
  'runtime_instances',
  'api_account_qualifications',
]

describe('the selection preview over HTTP (A56, 0104)', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let owner: pg.Pool
  let app: FastifyInstance
  const lines: string[] = []

  before(async () => {
    db = await createTestDatabase()
    pool = createPool(db.apiUrl, { max: 8 })
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 3 })
    app = buildApp({ pool, verifyActor, logger: { stream: { write: (line: string) => lines.push(line) } } })
    await app.ready()
    // A SYNTHETIC global route qualification: necessary, never sufficient.
    await owner.query(
      `SELECT sophia.qualify_api_route('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic: not a live qualification',now()+interval '1 day')`,
    )
  })
  after(async () => {
    await app.close()
    await pool.end()
    await owner.end()
    await db.drop()
  })

  async function preview(who: string | null, projectId: string, query = 'operation=research') {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/selection-preview?${query}`,
      headers: who ? { authorization: `Bearer ${await token(who)}` } : {},
    })
    return { status: res.statusCode, body: res.body, cache: res.headers['cache-control'] }
  }
  async function shared(who: string, projectId: string, query?: string) {
    const r = await preview(who, projectId, query)
    assert.equal(r.status, 200, r.body)
    assert.equal(r.cache, 'no-store')
    assert.equal(PRIVATE.test(r.body), false, `a private marker in ${r.body}`)
    const v = parseSelectionView(JSON.parse(r.body))
    assert.ok(v.disclosure === 'shared', r.body)
    // A shared view carries every field (the contract's `then`); the generated type cannot say so, so assert it.
    const { outcome, mode, globalCodes, candidates, proposal, requestRevision, strictSettings } = v
    assert.ok(outcome !== undefined && mode !== undefined && globalCodes !== undefined && candidates !== undefined)
    assert.ok(proposal !== undefined && requestRevision !== undefined && strictSettings !== undefined)
    return { outcome, mode, globalCodes, candidates, proposal, requestRevision, strictSettings }
  }
  const ownerWrite = (who: string, op: Parameters<typeof contributionWrite>[1], req: Record<string, unknown>) =>
    withActor(pool, who, 'write', (c) => contributionWrite(c, op, randomUUID(), req))
  const counts = async () =>
    Promise.all(
      LEDGERS.map(async (t) =>
        Number((await owner.query<{ n: string }>(`SELECT count(*) AS n FROM sophia.${t}`)).rows[0]?.n),
      ),
    )

  interface Opts {
    protection?: Record<string, unknown> | null
    accountQualified?: boolean
    concurrency?: number
  }
  /**
   * A project with an enabled research gate; an owner (editor) with an account, a declaration, a connection, a grant,
   * a ready contribution runtime and an account qualification; a requester (editor), a viewer and an outsider.
   */
  async function world(opts: Opts = {}) {
    const [OWNER, REQ, VIEW, OUT] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
    const p = await seedProject(db.ownerUrl, { admin: randomUUID(), editors: [OWNER, REQ], viewers: [VIEW] })
    await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      p.projectId,
    ])
    const acc = await ownerWrite(OWNER, 'account_create', {
      label: 'PRIVATE account',
      totalCapUsd: 10,
      concurrency: opts.concurrency ?? 1,
    })
    const accountId = String(acc.accountId)
    const protection =
      opts.protection === undefined
        ? { applicability: 'none_applicable', operations: ['research'], roles: ['sophia-research-md-v1'] }
        : opts.protection
    if (protection !== null)
      await ownerWrite(OWNER, 'account_update', { accountId, expectedRevision: 1, patch: { protection } })
    const conn = await ownerWrite(OWNER, 'connection_create', {
      accountId,
      label: 'PRIVATE key',
      custodianLabel: 'PRIVATE host',
    })
    const connectionId = String(conn.connectionId)
    const grant = await ownerWrite(OWNER, 'grant_create', {
      connectionId,
      projectId: p.projectId,
      settings: {
        expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
        taskCapUsd: 1,
        totalCapUsd: 5,
        fundingPolicy: 'bounded_total_spend',
        fundingAcknowledgementRef: 'synthetic acknowledgement',
      },
    })
    const runtimeToken = randomUUID() + randomUUID()
    await owner.query(`SELECT sophia.register_contribution_runtime($1, $2, 'sophia-runtime-test', $3, false)`, [
      p.projectId,
      connectionId,
      createHash('sha256').update(runtimeToken, 'utf8').digest(),
    ])
    const who = {
      tokenSha256: runtimeTokenHash(runtimeToken),
      runtimeUnitId: 'sophia-runtime-test',
      bridgeInstanceId: randomUUID(),
    }
    await withService(pool, (c) =>
      runtimeHello(c, who, { bundle: 'test', protocolVersion: 1, dshVersion: 'x', roles: [MD] }),
    )
    await withService(pool, (c) => recordRuntimeReady(c, who, { state: 'ready', reason: null, unrecovered: [] }))
    if (opts.accountQualified ?? true)
      await owner.query(
        `SELECT sophia.qualify_api_account($1, '{research}', 'operator_verified_call', 'SECRET-evidence', now()-interval '1 minute', now()+interval '1 day')`,
        [connectionId],
      )
    return {
      ...p,
      OWNER,
      REQ,
      VIEW,
      OUT,
      accountId,
      connectionId,
      grantId: String(grant.grantId),
      ref: `api:${String(grant.grantId)}`,
    }
  }
  type World = Awaited<ReturnType<typeof world>>
  const grantRevision = async (w: World) =>
    Number(
      (
        await owner.query<{ r: string }>(`SELECT revision AS r FROM sophia.api_contribution_grants WHERE id=$1`, [
          w.grantId,
        ])
      ).rows[0]?.r,
    )
  const pin = async (w: World) =>
    ownerWrite(w.REQ, 'pin_set', {
      projectId: w.projectId,
      grantId: w.grantId,
      expectedRevision: await grantRevision(w),
    })

  it('selects a qualified, protected grant for its owner and for another member, writing nothing anywhere', async () => {
    const w = await world()
    const initial = await counts()
    const mine = await shared(w.OWNER, w.projectId)
    assert.equal(mine.outcome, 'selected')
    assert.ok(mine.proposal && 'candidateRef' in mine.proposal)
    assert.deepEqual([mine.proposal.candidateRef, mine.proposal.relation], [w.ref, 'owner'])
    assert.equal(mine.proposal.payerScopeRef, w.accountId, 'the owner sees their own payer')
    const theirs = await shared(w.REQ, w.projectId)
    assert.equal(theirs.outcome, 'selected')
    assert.ok(theirs.proposal && 'candidateRef' in theirs.proposal)
    assert.deepEqual(
      [theirs.proposal.relation, theirs.proposal.payerScopeRef, theirs.proposal.codes],
      ['shared', undefined, undefined],
    )
    assert.equal(theirs.strictSettings, null)
    assert.deepEqual(await counts(), initial, 'no row was written, reserved, queued, leased or notified')
    assert.equal(PRIVATE.test(lines.join('')), false, 'no private marker reached the log')
    assert.equal(lines.join('').includes(w.accountId), false, 'no account id reached the log')
  })

  it('answers a viewer uniformly restricted, an outsider and a missing project 404, and refuses any other field', async () => {
    const w = await world()
    const v = await preview(w.VIEW, w.projectId)
    assert.equal(v.status, 200)
    assert.deepEqual(JSON.parse(v.body), {
      contract: 'inc04.selection.input.v1',
      policyVersion: 'inc04-s01-policy-v1',
      disclosure: 'restricted',
    })
    const out = await preview(w.OUT, w.projectId)
    const missing = await preview(w.OUT, randomUUID())
    assert.deepEqual([out.status, missing.status], [404, 404])
    assert.equal(out.body.replace(/"requestId":"[^"]*"/, ''), missing.body.replace(/"requestId":"[^"]*"/, ''))
    assert.equal((await preview(null, w.projectId)).status, 401)
    for (const q of [
      '',
      'operation=build',
      `operation=research&goalId=${randomUUID()}`,
      `operation=research&actor=${w.OWNER}`,
      'operation=research&role=reviewer',
      `operation=research&grantId=${w.grantId}`,
      `operation=research&sourceIds=${w.grantId},${w.grantId}`,
      'operation=research&sourceIds=not-a-uuid',
    ]) {
      assert.equal((await preview(w.REQ, w.projectId, q)).status, 422, q)
    }
  })

  it('fails closed without the owner’s protection, past a protected slot, or without the account’s own qualification', async () => {
    const absent = await world({ protection: null })
    assert.notEqual((await shared(absent.REQ, absent.projectId)).outcome, 'selected')
    assert.equal(
      (await shared(absent.OWNER, absent.projectId)).candidates[0]?.limitation,
      'not_verified',
      'no declaration is policy_absent, never clear',
    )
    const full = await world({
      protection: {
        applicability: 'protected',
        operations: ['research'],
        roles: ['sophia-research-md-v1'],
        protectedConcurrency: 1,
      },
    })
    const v = await shared(full.OWNER, full.projectId)
    assert.equal(v.outcome, 'waiting')
    assert.ok(v.candidates[0]?.codes?.includes('reserve_protected'), JSON.stringify(v.candidates[0]))
    const unqualified = await world({ accountQualified: false })
    const u = await shared(unqualified.OWNER, unqualified.projectId)
    assert.equal(u.outcome, 'denied', 'a current global route without the account’s own record is not access')
    assert.ok(u.candidates[0]?.codes?.includes('route_qualification_none'))
  })

  it('stales the account record on rotation, and follows owner removal, source withdrawal and grant expiry', async () => {
    const w = await world()
    const src = randomUUID()
    await owner.query(
      `INSERT INTO sophia.source_objects(project_id,id,owner_id,scope,sha256,mime,storage_key,byte_length,eligible,state)
       VALUES ($1,$2,$3,'project',repeat('a',64),'text/plain',$4,1,true,'ready')`,
      [w.projectId, src, w.REQ, `k/${src}`],
    )
    assert.equal(
      (await shared(w.REQ, w.projectId, `operation=research&sourceIds=${src.toUpperCase()}`)).outcome,
      'selected',
    )
    await owner.query(`UPDATE sophia.source_objects SET state='deleted', eligible=false WHERE id=$1`, [src])
    assert.equal((await shared(w.REQ, w.projectId, `operation=research&sourceIds=${src}`)).outcome, 'blocked')
    await owner.query(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
      w.projectId,
      w.OWNER,
    ])
    const removed = await shared(w.REQ, w.projectId)
    assert.equal(removed.outcome, 'denied')
    await owner.query(`UPDATE sophia.project_members SET active=true WHERE project_id=$1 AND actor_id=$2`, [
      w.projectId,
      w.OWNER,
    ])
    await owner.query(`SELECT sophia.register_contribution_runtime($1, $2, 'sophia-runtime-test', $3, true)`, [
      w.projectId,
      w.connectionId,
      createHash('sha256').update(randomUUID(), 'utf8').digest(),
    ])
    const rotated = await shared(w.OWNER, w.projectId)
    assert.equal(rotated.outcome, 'denied')
    assert.ok(
      rotated.candidates[0]?.codes?.includes('route_qualification_stale'),
      JSON.stringify(rotated.candidates[0]),
    )
    const later = await world()
    await owner.query(`UPDATE sophia.api_contribution_grants SET expires_at=now() WHERE id=$1`, [later.grantId])
    const expired = await shared(later.OWNER, later.projectId)
    assert.equal(expired.outcome, 'denied')
    assert.ok(expired.candidates[0]?.codes?.includes('grant_expired'))
  })

  it('waits on a revoked Pin without falling back, keeps the correlation while a new commitment changes the decision', async () => {
    const w = await world()
    await pin(w)
    const pinned = await shared(w.REQ, w.projectId)
    assert.deepEqual([pinned.mode, pinned.outcome], ['pin', 'selected'])
    // A new commitment: the requester's admitted task holds the account's one slot.
    const admission = await withActor(pool, w.REQ, 'write', (c) =>
      admitResearchTask(c, w.projectId, {
        key: randomUUID(),
        exchangeId: randomUUID(),
        request: { question: 'Which sandboxes render PDFs?', outputs: ['markdown'] },
        specialist: { role: MD.id, route: MD.route },
      }),
    )
    assert.ok('admitted' in admission)
    const busy = await shared(w.REQ, w.projectId)
    assert.equal(busy.requestRevision, pinned.requestRevision, 'the client-safe correlation did not move')
    assert.equal(busy.outcome, 'waiting', 'the decision did')
    await ownerWrite(w.OWNER, 'grant_state', {
      grantId: w.grantId,
      expectedRevision: await grantRevision(w),
      state: 'revoked',
    })
    const revoked = await shared(w.REQ, w.projectId)
    assert.deepEqual([revoked.mode, revoked.outcome, revoked.globalCodes], ['pin', 'denied', ['pin_cannot_be_honored']])
    assert.equal(revoked.proposal, null, 'no fallback to any other payer')
    assert.ok(
      revoked.candidates.some((c) => c.candidateRef === w.ref),
      'the revoked pinned grant is still evaluated',
    )
  })

  it('answers projection_unavailable for a pool above 200, never a ranked subset', async () => {
    const w = await world()
    const conn = randomUUID()
    await owner.query(
      `INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state) VALUES ($1,$2,'synthetic','synthetic','linked')`,
      [conn, w.OWNER],
    )
    await owner.query(
      `INSERT INTO sophia.executor_resources(project_id,owner_id,connection_id,harness,label,repository_root,state)
       SELECT $1,$2,$3,'claude-native','PRIVATE-label','/PRIVATE','active' FROM generate_series(1,199)`,
      [w.projectId, w.OWNER, conn],
    )
    assert.equal((await shared(w.REQ, w.projectId)).candidates.length, 200, '1 grant + 199 native = 200, complete')
    await owner.query(
      `INSERT INTO sophia.executor_resources(project_id,owner_id,connection_id,harness,label,repository_root,state)
       VALUES ($1,$2,$3,'codex-native','PRIVATE-label','/PRIVATE','active')`,
      [w.projectId, w.OWNER, conn],
    )
    const over = await preview(w.REQ, w.projectId)
    assert.equal(over.status, 503)
    assert.equal(JSON.parse(over.body).code, 'projection_unavailable')
    assert.equal(PRIVATE.test(over.body), false)
  })

  it('answers a current viewer one identical restricted response at 0, 200 and 201 hidden candidates (R1)', async () => {
    const [EDIT, VIEW, OUT] = [randomUUID(), randomUUID(), randomUUID()]
    const p = await seedProject(db.ownerUrl, { admin: randomUUID(), editors: [EDIT], viewers: [VIEW] })
    await owner.query(`SELECT sophia.set_research_grant($1, 'enabled', 5, 40, 'web-pilot-v1', 'approval:test')`, [
      p.projectId,
    ])
    const conn = randomUUID()
    await owner.query(
      `INSERT INTO sophia.execution_connections(id,owner_id,upstream_origin,upstream_subject,state) VALUES ($1,$2,'synthetic','synthetic','linked')`,
      [conn, EDIT],
    )
    const hide = (n: number) =>
      owner.query(
        `INSERT INTO sophia.executor_resources(project_id,owner_id,connection_id,harness,label,repository_root,state)
         SELECT $1,$2,$3,'claude-native','PRIVATE-label','/PRIVATE','active' FROM generate_series(1,$4::int)`,
        [p.projectId, EDIT, conn, n],
      )
    /** The viewer's whole response as a client sees it, and the log lines the request wrote. */
    const asViewer = async () => {
      const from = lines.length
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${p.projectId}/selection-preview?operation=research`,
        headers: { authorization: `Bearer ${await token(VIEW)}` },
      })
      const logged = lines.slice(from)
      return {
        status: res.statusCode,
        body: res.body,
        headers: { cache: res.headers['cache-control'], type: res.headers['content-type'] },
        loggedStatus: logged.flatMap((l) => {
          const code = (JSON.parse(l) as { res?: { statusCode?: number } }).res?.statusCode
          return code === undefined ? [] : [code]
        }),
        logged: logged.join(''),
      }
    }
    const initial = await counts()
    const atZero = await asViewer()
    await hide(200)
    const atFull = await asViewer()
    const editorFull = await shared(EDIT, p.projectId)
    assert.equal(editorFull.candidates.length, 200, 'the editor evaluates the complete pool of 200')
    await hide(1)
    const atOver = await asViewer()
    const editorOver = await preview(EDIT, p.projectId)
    assert.equal(editorOver.status, 503, 'the editor still needs the complete pool')
    assert.equal(JSON.parse(editorOver.body).code, 'projection_unavailable')

    assert.equal(atZero.status, 200, atZero.body)
    assert.deepEqual(JSON.parse(atZero.body), {
      contract: 'inc04.selection.input.v1',
      policyVersion: 'inc04-s01-policy-v1',
      disclosure: 'restricted',
    })
    assert.equal(parseSelectionView(JSON.parse(atZero.body)).disclosure, 'restricted')
    assert.deepEqual(atZero.headers, { cache: 'no-store', type: 'application/json; charset=utf-8' })
    for (const [n, r] of [
      [200, atFull],
      [201, atOver],
    ] as const) {
      assert.deepEqual(
        [r.status, r.body, r.headers, r.loggedStatus],
        [atZero.status, atZero.body, atZero.headers, atZero.loggedStatus],
        `the viewer's answer at ${String(n)} hidden candidates is the answer at 0`,
      )
    }
    assert.deepEqual(atZero.loggedStatus, [200])
    for (const r of [atZero, atFull, atOver]) {
      assert.equal(PRIVATE.test(r.body) || PRIVATE.test(r.logged), false, 'no private marker in body or log')
      assert.equal(r.logged.includes('projection_unavailable'), false, 'no pool-dependent refusal was even logged')
    }
    // The controls hold at the same pool: membership is still verified, the query still closed.
    const out = await preview(OUT, p.projectId)
    const missing = await preview(VIEW, randomUUID())
    assert.deepEqual([out.status, missing.status], [404, 404])
    assert.equal(out.body.replace(/"requestId":"[^"]*"/, ''), missing.body.replace(/"requestId":"[^"]*"/, ''))
    assert.equal((await preview(null, p.projectId)).status, 401)
    assert.equal((await preview(VIEW, p.projectId, `operation=research&role=editor`)).status, 422)
    assert.equal((await preview(VIEW, p.projectId, `operation=research&actor=${EDIT}`)).status, 422)
    await owner.query(`UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2`, [
      p.projectId,
      VIEW,
    ])
    assert.equal((await preview(VIEW, p.projectId)).status, 404, 'a former viewer is a nonmember')
    assert.deepEqual(await counts(), initial, 'no preview wrote, reserved, queued, leased or notified anything')
  })
})

describe('on a database without 0104', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let app: FastifyInstance

  before(async () => {
    db = await createTestDatabase()
    const owner = new pg.Pool({ connectionString: db.ownerUrl, max: 1 })
    await owner.query('ALTER FUNCTION sophia.selection_snapshot(uuid,uuid[]) RENAME TO selection_snapshot_absent')
    await owner.end()
    pool = createPool(db.apiUrl, { max: 2 })
    app = buildApp({ pool, verifyActor })
    await app.ready()
  })
  after(async () => {
    await app.close()
    await pool.end()
    await db.drop()
  })

  it('answers projection_unavailable, never an empty preview', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${randomUUID()}/selection-preview?operation=research`,
      headers: { authorization: `Bearer ${await token(randomUUID())}` },
    })
    assert.equal(res.statusCode, 503)
    assert.equal(JSON.parse(res.body).code, 'projection_unavailable')
  })
})
