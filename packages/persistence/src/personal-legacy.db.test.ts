// INC03-CC-002 P1 characterization, extended for INC03-CC-003 A3 (0103): the legacy Personal path behaves the same
// through every boundary. The same flow (send, claim, answer; send, fail, retry; erase) and the definitions, grants and
// settings of every legacy Personal function are read on three databases, made one after the other (0070's assembler
// role installs only while no other database holds it): migrated to 0097 (A), through 0102 (B), and with every
// migration, through 0103 (C).
// - A and B: identical in all 19 functions; only the reply CHECK differs, by the one value 0098 adds (recorded).
// - B and C: identical in the 18 other functions. settle_personal_companion_answer is the one function 0103 replaces
//   (late answers of withdrawn work are withheld, for every caller): only its body may differ; its identity, declaration
//   (result, language, volatility, strictness, parallel safety, leakproofness, cost), grants, settings (the same
//   search_path, pinned exactly) and SECURITY DEFINER stay B's. The reply CHECK gains exactly one value (withdrawn).
// - All three: the same fixed flow, so a change on every side alike is still seen.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase } from '@sophia/test-support'
import {
  claimPersonalReply,
  erasePersonalSpace,
  failPersonalReply,
  nextPersonalReply,
  readPersonalSpace,
  recordPersonalReply,
  retryPersonalTurn,
  sendPersonalTurn,
} from './personal.ts'
import { withActor } from './tx.ts'

/** The legacy Personal functions 0098 must leave exactly as they were. */
const LEGACY = [
  'personal_owner',
  'personal_hold',
  'personal_fence',
  'personal_prior',
  'personal_remember',
  'personal_receipt',
  'personal_touch',
  'personal_append',
  'personal_reply_state',
  'send_personal_turn',
  'retry_personal_turn',
  'next_personal_reply',
  'claim_personal_reply',
  'record_personal_reply',
  'fail_personal_reply',
  'erase_personal_space',
  'reserve_personal_answer',
  'settle_personal_companion_answer',
  'record_personal_settled_reply',
]

interface Observed {
  /** Each function's full fingerprint: its definition's digest, grants, settings and SECURITY DEFINER. */
  functions: Record<string, string>
  /** Each function's parts, apart: its body's digest, and everything but its body (declaration, grants, settings). */
  parts: Record<string, { body: string; declaration: string; acl: string; config: string; secdef: boolean }>
  replyCheck: string
  flow: unknown
}

/** The one legacy function 0103 replaces, by its full identity. */
const SETTLEMENT =
  'settle_personal_companion_answer(p_call uuid, p_used bigint, p_usage jsonb, p_body text, p_suggestion text)'
/** Its settings, exactly, as 0080 set them and 0103 keeps them. */
const SETTLEMENT_CONFIG = 'search_path=pg_catalog, sophia'

/** The flow every database must decide alike, fixed. */
const FLOW = [
  ['send', 'send_turn', true],
  ['claim', 'string'],
  ['retry', 'retry_turn'],
  [
    'turns',
    [
      ['person', 'Please answer.', 'answered'],
      ['sophia', 'An answer.', null],
      ['person', 'Another.', 'pending'],
    ],
  ],
  ['replay', true],
  ['conflict', 'idempotency_conflict'],
  ['erase', { turns: 3, notes: 0, suggestions: 0 }],
  ['tombstones', [{ redacted: true }, { redacted: true }, { redacted: true }, { confirm: 'delete' }]],
]

/** A disposable database with the migrations up to (not including) `upTo`, or all of them. */
async function observe(upTo: string | null): Promise<Observed> {
  const dir = mkdtempSync(join(tmpdir(), 'sophia-personal-legacy-'))
  const migrations = resolve('db/migrations')
  for (const f of readdirSync(migrations).filter((n) => n.endsWith('.sql') && (upTo === null || n < upTo)))
    symlinkSync(join(migrations, f), join(dir, f))
  const db = await createTestDatabase(dir, { assembler: false })
  const owner = new pg.Pool({ connectionString: db.ownerUrl, max: 2 })
  const api = new pg.Pool({ connectionString: db.apiUrl, max: 3 })
  try {
    const { rows } = await owner.query<{ name: string; print: string }>(
      `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS name,
              md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '') || ' ' ||
              coalesce(array_to_string(p.proconfig, ','), '') || ' ' || p.prosecdef::text AS print
         FROM pg_proc p WHERE p.pronamespace = 'sophia'::regnamespace AND p.proname = ANY($1) ORDER BY 1`,
      [LEGACY],
    )
    // The same functions, their body apart from everything else pg_get_functiondef declares (structured catalog fields,
    // read by identity, never by oid across databases).
    const parts = await owner.query<{
      name: string
      body: string
      declaration: string
      acl: string
      config: string
      secdef: boolean
    }>(
      `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS name, md5(p.prosrc) AS body,
              concat_ws(' ', pg_get_function_arguments(p.oid), '->', pg_get_function_result(p.oid), l.lanname,
                p.provolatile, p.proisstrict::text, p.proparallel, p.proleakproof::text, p.procost::text,
                p.prorows::text, p.proretset::text, p.prokind) AS declaration,
              coalesce(p.proacl::text, '') AS acl, coalesce(array_to_string(p.proconfig, ','), '') AS config,
              p.prosecdef AS secdef
         FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
        WHERE p.pronamespace = 'sophia'::regnamespace AND p.proname = ANY($1) ORDER BY 1`,
      [LEGACY],
    )
    const [check] = (
      await owner.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'sophia.personal_turns'::regclass AND conname = 'personal_turns_reply_check'`,
      )
    ).rows
    return {
      functions: Object.fromEntries(rows.map((r) => [r.name, r.print])),
      parts: Object.fromEntries(parts.rows.map(({ name, ...rest }) => [name, rest])),
      replyCheck: check?.def ?? 'missing',
      flow: await legacyFlow(api, owner),
    }
  } finally {
    await Promise.all([owner.end(), api.end()])
    await db.drop()
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The legacy Personal path, step by step, reduced to what it decides (no ids or times). */
async function legacyFlow(api: pg.Pool, owner: pg.Pool): Promise<unknown> {
  const person = randomUUID()
  const as = <T>(fn: (c: pg.PoolClient) => Promise<T>) => withActor(api, person, 'write', fn)
  const steps: unknown[] = []
  const first = await as((c) => sendPersonalTurn(c, 'k-1', 'Please answer.'))
  steps.push(['send', first.operation, (await as((c) => nextPersonalReply(c))) === first.turnId])
  const claim = await as((c) => claimPersonalReply(c, first.turnId ?? ''))
  steps.push(['claim', typeof claim])
  await as((c) => recordPersonalReply(c, first.turnId ?? '', claim ?? '', 'An answer.', null))
  const second = await as((c) => sendPersonalTurn(c, 'k-2', 'Another.'))
  const claim2 = await as((c) => claimPersonalReply(c, second.turnId ?? ''))
  await as((c) => failPersonalReply(c, second.turnId ?? '', claim2 ?? ''))
  const retried = await as((c) => retryPersonalTurn(c, 'k-3', second.turnId ?? ''))
  steps.push(['retry', retried.operation])
  const space = await as((c) => readPersonalSpace(c))
  steps.push(['turns', space.turns.map((t) => [t.author, t.text, t.reply])])
  const replay = await as((c) => sendPersonalTurn(c, 'k-1', 'Please answer.'))
  steps.push(['replay', replay.turnId === first.turnId])
  const conflict = await as((c) => sendPersonalTurn(c, 'k-1', 'Other words.')).then(
    () => 'accepted',
    (err: unknown) => (err instanceof Error && 'code' in err ? String(err.code) : 'refused'),
  )
  steps.push(['conflict', conflict])
  const erased = await as((c) => erasePersonalSpace(c, 'k-erase', 'delete'))
  steps.push(['erase', erased.erased])
  const { rows } = await owner.query<{ semantic_request: unknown }>(
    'SELECT semantic_request FROM sophia.personal_requests WHERE owner_id=$1 ORDER BY idempotency_key',
    [person],
  )
  steps.push(['tombstones', rows.map((r) => r.semantic_request)])
  return steps
}

describe('the legacy Personal path through 0097, 0102 and 0103', () => {
  it('decides the same; 0098 widens only the reply CHECK; 0103 changes only the settlement body and adds withdrawn', async () => {
    const a = await observe('0098')
    const b = await observe('0103')
    const c = await observe(null)

    // A (through 0097) and B (through 0102): the original characterization, exact.
    assert.equal(Object.keys(a.functions).length, LEGACY.length)
    assert.deepEqual(b.functions, a.functions)
    assert.deepEqual(b.flow, a.flow)
    assert.equal(a.replyCheck, "CHECK ((reply = ANY (ARRAY['pending'::text, 'answered'::text, 'failed'::text])))")
    assert.equal(
      b.replyCheck,
      "CHECK ((reply = ANY (ARRAY['pending'::text, 'answered'::text, 'failed'::text, 'recorded'::text])))",
    )

    // B and C (every migration, through 0103): the same 19 functions, 18 of them identical in full.
    assert.deepEqual(Object.keys(c.functions), Object.keys(b.functions))
    assert.ok(SETTLEMENT in b.functions, 'the settlement is one of the legacy functions, by its full identity')
    for (const name of Object.keys(b.functions))
      if (name !== SETTLEMENT) assert.equal(c.functions[name], b.functions[name], `${name} unchanged by 0103`)
    // The settlement: its body is 0103's; its identity, declaration, grants, settings and SECURITY DEFINER are B's.
    const before = b.parts[SETTLEMENT]
    const after = c.parts[SETTLEMENT]
    assert.ok(before && after)
    assert.notEqual(after.body, before.body, '0103 replaced the settlement body')
    assert.notEqual(c.functions[SETTLEMENT], b.functions[SETTLEMENT])
    assert.equal(after.declaration, before.declaration)
    assert.equal(after.acl, before.acl)
    assert.equal(after.secdef, true)
    assert.equal(before.secdef, true)
    assert.equal(before.config, SETTLEMENT_CONFIG)
    assert.equal(after.config, SETTLEMENT_CONFIG)
    assert.equal(
      c.replyCheck,
      "CHECK ((reply = ANY (ARRAY['pending'::text, 'answered'::text, 'failed'::text, 'recorded'::text, 'withdrawn'::text])))",
    )

    // The flow itself on every database, so a change on every side alike is still seen.
    assert.deepEqual(a.flow, FLOW)
    assert.deepEqual(b.flow, FLOW)
    assert.deepEqual(c.flow, FLOW)
  })
})
