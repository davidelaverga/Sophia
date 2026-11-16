// INC03-CC-002 P1 characterization: the legacy Personal path behaves the same with and without migration 0098. The same
// flow (send, claim, answer; send, fail, retry; erase) and the definitions, grants and settings of every legacy Personal
// function are read on a database migrated to 0097 and on one with 0098. The two databases are made one after the
// other (0070's assembler role installs only while no other database holds it). Only the reply CHECK of
// personal_turns differs, by the one value 0098 adds.
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
  functions: Record<string, string>
  replyCheck: string
  flow: unknown
}

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
    const [check] = (
      await owner.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'sophia.personal_turns'::regclass AND conname = 'personal_turns_reply_check'`,
      )
    ).rows
    return {
      functions: Object.fromEntries(rows.map((r) => [r.name, r.print])),
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

describe('the legacy Personal path with and without 0098', () => {
  it('decides the same, with the same function definitions, grants and settings; only the reply CHECK widens', async () => {
    const without = await observe('0098')
    const withIt = await observe(null)
    assert.equal(Object.keys(without.functions).length, LEGACY.length)
    assert.deepEqual(withIt.functions, without.functions)
    assert.deepEqual(withIt.flow, without.flow)
    assert.equal(without.replyCheck, "CHECK ((reply = ANY (ARRAY['pending'::text, 'answered'::text, 'failed'::text])))")
    assert.equal(
      withIt.replyCheck,
      "CHECK ((reply = ANY (ARRAY['pending'::text, 'answered'::text, 'failed'::text, 'recorded'::text])))",
    )
    // The flow itself, so a change on both sides alike is still seen.
    assert.deepEqual(without.flow, [
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
    ])
  })
})
