// INC04-R07 C4/C5 W1 (0114): the operator custody wrappers over real PostgreSQL. Receipts and lost-reply replays;
// concurrent appends of one key (one record, then a replay or one sticky conflict); fixed refusal codes, nothing
// written; the CLI's refusal path; and no application role can append or read custody. Every account, connection,
// qualification, reading, scope, window, issuer and binding is SYNTHETIC: nothing qualifies a real source.
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createTestDatabase, type TestDatabase } from '@sophia/test-support'
import {
  bindCapacityObservation,
  CapacityCustodyRefused,
  registerCapacityIssuer,
  registerCapacityMapping,
  registerCapacityScope,
  registerCapacityWindow,
  type CapacityScopeInput,
  type CapacityWindowRegistration,
} from './capacity-exposure-custody.ts'
import { recordCapacityObservation } from './capacity-observations.ts'

const hex = (seed: string) => createHash('sha256').update(seed).digest('hex')
const r2 = (ms: number) => new Date(ms).toISOString().replace(/Z$/, '000Z')
const ACCOUNT = 'a7000000-0000-0000-0000-0000000000a1'
const CONNECTION = 'a7000000-0000-0000-0000-0000000000c1'

/** One refusal code, or a failure when the append was not refused with one. */
async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (err: unknown) {
    if (err instanceof CapacityCustodyRefused) return err.refusal
    throw err
  }
  throw new Error('not refused')
}

describe('capacity-exposure custody (0114)', () => {
  let db: TestDatabase
  let owner: pg.Pool
  let scope: CapacityScopeInput
  let window: CapacityWindowRegistration
  const dir = mkdtempSync(join(tmpdir(), 'sophia-0114-cli-'))

  before(async () => {
    db = await createTestDatabase()
    owner = new pg.Pool({ connectionString: db.ownerUrl, max: 4 })
    await owner.query(
      `INSERT INTO sophia.api_accounts(id,owner_id,provider,label,total_cap_usd) VALUES($1,$2,'openai','synthetic',20)`,
      [ACCOUNT, 'a7000000-0000-0000-0000-0000000000e1'],
    )
    await owner.query(
      `INSERT INTO sophia.api_connections(id,owner_id,account_id,label,route_id,model,effort,credential_ref,credential_revision,
        custodian_label,state) VALUES($1,$2,$3,'synthetic','research-sol-medium-v1','gpt-6.1-sol','medium',
        'OPENAI_RESEARCH_API_KEY',1,'synthetic host','connected')`,
      [CONNECTION, 'a7000000-0000-0000-0000-0000000000e1', ACCOUNT],
    )
    const route = await owner.query<{ id: string }>(
      `INSERT INTO sophia.api_route_qualifications(route_id,model,effort,evidence_ref,qualified_at,expires_at)
       VALUES('research-sol-medium-v1','gpt-6.1-sol','medium','synthetic',now()-interval '1 day',now()+interval '1 day') RETURNING id`,
    )
    const acq = await owner.query<{ r: { qualificationId: string } }>(
      `SELECT sophia.qualify_api_account($1,'{research}','operator_verified_call','synthetic',now()-interval '1 hour',now()+interval '1 day') AS r`,
      [CONNECTION],
    )
    const aq = acq.rows[0]?.r.qualificationId
    const rq = route.rows[0]?.id
    assert.ok(aq && rq)
    const rev = Number(
      (
        await owner.query<{ revision: string }>(`SELECT revision FROM sophia.api_account_qualifications WHERE id=$1`, [
          aq,
        ])
      ).rows[0]?.revision,
    )
    scope = {
      scope_id: randomUUID(),
      account_id: ACCOUNT,
      connection_id: CONNECTION,
      credential_revision: 1,
      route_id: 'research-sol-medium-v1',
      model: 'gpt-6.1-sol',
      effort: 'medium',
      operation: 'research',
      account_qualification_id: aq,
      account_qualification_revision: rev,
      route_qualification_id: rq,
      approval_ref_digest: hex('approval'),
      evidence_digest: hex('evidence'),
    }
    window = {
      scope_id: scope.scope_id,
      qual_revision: rev,
      dimension: 'openai.output_tokens',
      unit: 'tokens',
      window_kind: 'day',
      epoch_key: 'e1',
      window_start: r2(Date.now() - 3600_000),
      window_end: r2(Date.now() + 23 * 3600_000),
      window_semantics: 'fixed_epoch',
      measurement_basis: 'issuer_local',
      epoch_basis: 'provider_reported',
      approval_ref_digest: hex('approval'),
      evidence_digest: hex('evidence'),
    }
  })
  after(async () => {
    await owner.end()
    await db.drop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the same receipt on a lost-reply retry, and a stable sticky conflict for another payload', async () => {
    const first = await registerCapacityScope(owner, scope)
    assert.deepEqual([first.kind, first.outcome, first.replay], ['scope', 'recorded', false])
    assert.deepEqual(await registerCapacityScope(owner, scope), { ...first, replay: true })
    const other = { ...scope, scope_id: randomUUID() }
    await registerCapacityScope(owner, other)
    const conflict = await registerCapacityScope(owner, { ...other, evidence_digest: hex('another') })
    assert.deepEqual([conflict.outcome, conflict.replay], ['conflict', false])
    assert.deepEqual(await registerCapacityScope(owner, { ...other, evidence_digest: hex('another') }), {
      ...conflict,
      replay: true,
    })
  })

  it('serializes concurrent appends of one key: one record and a replay, or one record and one conflict', async () => {
    await registerCapacityScope(owner, scope)
    const same = await Promise.all([registerCapacityWindow(owner, window), registerCapacityWindow(owner, window)])
    assert.deepEqual(
      same.map((r) => String(r.replay)).toSorted((a, b) => a.localeCompare(b)),
      ['false', 'true'],
    )
    assert.equal(same[0]?.payload, same[1]?.payload)
    const raced = { ...window, epoch_key: 'e2' }
    const two = await Promise.all([
      registerCapacityWindow(owner, raced),
      registerCapacityWindow(owner, { ...raced, window_semantics: 'rolling' }),
    ])
    assert.deepEqual(
      two.map((r) => r.outcome).toSorted((a, b) => a.localeCompare(b)),
      ['conflict', 'recorded'],
    )
    const rows = await owner.query<{ n: string }>(
      `SELECT count(*) AS n FROM sophia.capacity_window_registrations WHERE epoch_key='e2'`,
    )
    assert.equal(rows.rows[0]?.n, '1', 'one record, never two')
  })

  it('refuses with a fixed code and writes nothing', async () => {
    await registerCapacityScope(owner, scope)
    const countBefore = await owner.query<{ n: string }>(
      `SELECT count(*) AS n FROM sophia.capacity_window_registrations`,
    )
    const { evidence_digest: _missing, ...incomplete } = window
    assert.equal(await refusal(registerCapacityWindow(owner, incomplete as never)), 'payload_incomplete')
    assert.equal(
      await refusal(registerCapacityWindow(owner, { ...window, window_start: '2026-02-30T00:00:00.000000Z' })),
      'payload_invalid',
    )
    assert.equal(await refusal(registerCapacityWindow(owner, { ...window, unit: 'requests' })), 'window_unit_mismatch')
    assert.equal(
      await refusal(registerCapacityWindow(owner, { ...window, scope_id: randomUUID() })),
      'window_scope_unregistered',
    )
    const countAfter = await owner.query<{ n: string }>(
      `SELECT count(*) AS n FROM sophia.capacity_window_registrations`,
    )
    assert.equal(countAfter.rows[0]?.n, countBefore.rows[0]?.n)
    const issuer = randomUUID()
    await registerCapacityIssuer(owner, {
      issuer_id: issuer,
      kind: 'controlled_fixture',
      scope_id: scope.scope_id,
      qual_revision: scope.account_qualification_revision,
      registered_at: r2(Date.now()),
      approval_ref_digest: hex('approval'),
      evidence_digest: hex('evidence'),
    })
    const mapping = {
      provider: 'openai',
      route_id: 'research-sol-medium-v1',
      contract: 'c1p_complete_report' as const,
      source_field: 'cache_write' as const,
      dimension: 'openai.input_tokens' as const,
      unit: 'tokens' as const,
      semantics: 'reported_lower_bound' as const,
      revision: 1,
      issuer_id: issuer,
      approval_ref_digest: hex('approval'),
      evidence_digest: hex('evidence'),
    }
    assert.equal(await refusal(registerCapacityMapping(owner, mapping)), 'mapping_unsupported')
    const reading = await recordCapacityObservation(owner, {
      observationKey: `k-${randomUUID()}`,
      connectionId: CONNECTION,
      credentialRevision: 1,
      accountQualificationId: scope.account_qualification_id,
      accountQualificationRevision: scope.account_qualification_revision,
      routeQualificationId: scope.route_qualification_id,
      operation: 'research',
      verification: 'operator_verified_console',
      evidenceRef: 'synthetic evidence',
      sourceChannel: 'synthetic-console',
      windowSetRef: 'synthetic-limits',
      windowSetVersion: 'v1',
      coverage: 'complete',
      requiredWindowRefs: ['tokens-day'],
      reflection: 'unknown',
      observedAt: new Date(Date.now() - 60_000).toISOString(),
      freshUntil: new Date(Date.now() + 600_000).toISOString(),
      windows: [
        {
          windowRef: 'tokens-day',
          windowEpoch: 'e1',
          scope: 'account',
          unit: 'tokens',
          value: 800,
          verdict: 'admits',
          applicability: 'known',
        },
      ],
    })
    const binding = {
      observation_id: reading.observationId,
      window_ref: 'tokens-day',
      scope_id: scope.scope_id,
      qual_revision: scope.account_qualification_revision,
      dimension: 'openai.output_tokens' as const,
      window_kind: 'day' as const,
      epoch_key: 'e-unregistered',
      kind: 'remaining_at' as const,
      issuer_id: issuer,
      issuer_seq: 1,
      measurement_id: null,
      evidence_kind: 'controlled_fixture' as const,
      evidence_digest: hex('evidence'),
    }
    assert.equal(await refusal(bindCapacityObservation(owner, binding)), 'obs_window_unregistered')
    await registerCapacityWindow(owner, window)
    assert.equal((await bindCapacityObservation(owner, { ...binding, epoch_key: 'e1' })).outcome, 'recorded')
  })

  it('the CLI refuses with the fixed code, exits 1, and prints no payload value', () => {
    const file = join(dir, 'window.json')
    writeFileSync(file, JSON.stringify({ ...window, scope_id: '5c000000-0000-4000-8000-0000000000aa' }))
    const run = spawnSync(process.execPath, [resolve('scripts/record-capacity-exposure.ts'), 'window', file], {
      env: { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: db.ownerUrl },
      encoding: 'utf8',
    })
    assert.equal(run.status, 1, run.stderr)
    assert.equal(run.stderr.trim(), 'refused: window_scope_unregistered')
    assert.equal(`${run.stdout}${run.stderr}`.includes(hex('approval')), false)
    const usage = spawnSync(process.execPath, [resolve('scripts/record-capacity-exposure.ts'), 'nothing', file], {
      env: { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: db.ownerUrl },
      encoding: 'utf8',
    })
    assert.equal(usage.status, 2)
  })

  it('W1-F03: the CLI dispatches only its eight own kinds, refusing any other as usage before a file or database', () => {
    const cli = resolve('scripts/record-capacity-exposure.ts')
    const missing = join(dir, 'no-such-payload.json')
    // An inherited or unknown kind is usage (exit 2) with a missing payload file and an unusable database URL: had the
    // kind passed, reading the file would fail first (exit 1), so exit 2 proves the refusal comes before any file or DB.
    for (const kind of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf', 'nothing']) {
      const run = spawnSync(process.execPath, [cli, kind, missing], {
        env: { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' },
        encoding: 'utf8',
      })
      assert.equal(run.status, 2, `${kind}: ${run.stdout}${run.stderr}`)
      assert.equal(run.stdout, '', `${kind}: no receipt`)
      assert.match(run.stderr, /^usage: /, kind)
    }
    // A valid kind still records through the database (an issuer for the registered scope), and replays.
    const file = join(dir, 'issuer.json')
    writeFileSync(
      file,
      JSON.stringify({
        issuer_id: randomUUID(),
        kind: 'controlled_fixture',
        scope_id: scope.scope_id,
        qual_revision: scope.account_qualification_revision,
        registered_at: r2(Date.now()),
        approval_ref_digest: hex('approval'),
        evidence_digest: hex('evidence'),
      }),
    )
    const env = { ...process.env, SOPHIA_MIGRATION_DATABASE_URL: db.ownerUrl }
    const first = spawnSync(process.execPath, [cli, 'issuer', file], { env, encoding: 'utf8' })
    assert.equal(first.status, 0, first.stderr)
    assert.match(first.stdout, /^✓ issuer recorded at /)
    const again = spawnSync(process.execPath, [cli, 'issuer', file], { env, encoding: 'utf8' })
    assert.match(again.stdout, /^✓ issuer recorded \(replay: the original receipt\) at /)
  })

  it('no application role can append or read custody', async () => {
    const api = new pg.Client({ connectionString: db.apiUrl })
    await api.connect()
    try {
      await assert.rejects(api.query(`SELECT sophia.register_capacity_scope($1::jsonb)`, [JSON.stringify(scope)]), {
        code: '42501',
      })
      await assert.rejects(api.query(`SELECT count(*) FROM sophia.capacity_exposure_scopes`), { code: '42501' })
      await assert.rejects(api.query(`SELECT count(*) FROM sophia.capacity_attributions`), { code: '42501' })
    } finally {
      await api.end()
    }
  })
})
