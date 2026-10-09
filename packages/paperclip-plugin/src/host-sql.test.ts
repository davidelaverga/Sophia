// The pinned host's ctx.db rules as the synthetic host applies them (host-sql.ts): what the real host would refuse is
// refused in tests too. scripts/paperclip-verify.mjs runs the pin's own validators over the built worker.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkExecute, checkQuery } from './host-sql.ts'

const NS = 'plugin_sophia_coordination_00c896da3d'
const CORE = ['issues', 'heartbeat_runs']

describe("the pinned host's runtime SQL rules", () => {
  it('ctx.db.query reads only: no INSERT, even with RETURNING; no mutation keyword', () => {
    assert.throws(
      () => checkQuery(`INSERT INTO ${NS}.controls (a) VALUES (1) RETURNING a`, NS, CORE),
      /only allows SELECT/,
    )
    assert.throws(() => checkQuery(`WITH x AS (UPDATE ${NS}.controls SET a = 1) SELECT 1`, NS, CORE), /mutation/)
    assert.doesNotThrow(() =>
      checkQuery(`SELECT state, updated_at FROM ${NS}.controls WHERE delivery_key = $1`, NS, CORE),
    )
  })

  it('ctx.db.query reads public only from the declared core tables', () => {
    assert.doesNotThrow(() =>
      checkQuery(`SELECT EXISTS (SELECT 1 FROM public.heartbeat_runs r WHERE r.company_id::text = $1)`, NS, CORE),
    )
    assert.throws(() => checkQuery('SELECT 1 FROM public.agent_wakeup_requests', NS, CORE), /not whitelisted/)
    assert.throws(() => checkQuery('SELECT 1 FROM other.t', NS, CORE), /cannot read schema/)
  })

  it('ctx.db.execute writes only inside the namespace, and references no other schema', () => {
    assert.doesNotThrow(() => checkExecute(`INSERT INTO ${NS}.wakes (wake_key) VALUES ($1) ON CONFLICT DO NOTHING`, NS))
    assert.throws(() => checkExecute(`SELECT 1 FROM ${NS}.wakes`, NS), /only allows INSERT, UPDATE, or DELETE/)
    assert.throws(() => checkExecute('INSERT INTO public.issues (id) VALUES ($1)', NS), /inside plugin namespace/)
    assert.throws(
      () => checkExecute(`UPDATE ${NS}.wakes SET a = 1 WHERE EXISTS (SELECT 1 FROM public.heartbeat_runs)`, NS),
      /cannot reference public/,
    )
  })

  it('one statement only', () => {
    assert.throws(() => checkQuery(`SELECT 1; SELECT 2`, NS, CORE), /exactly one statement/)
    assert.doesNotThrow(() => checkQuery('SELECT 1;', NS, CORE))
  })
})
