// 0123: trusted member/reply references on saved automatic inputs, never attention or work.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { AUTOMATIC_V1, sendConversationInput, startConversationInput } from './conversation-inputs.ts'
import type { ConversationInputReceipt } from './conversation-inputs.ts'
import { eraseConversation, withdrawConversationMessage } from './conversations.ts'
import { withActor } from './tx.ts'

let db: TestDatabase, api: pg.Pool, owner: pg.Pool
let baseMigrations: string
let foundationBefore: pg.QueryResultRow[]
let legacyCallersBefore: string[]
const foundations = () =>
  query(
    `SELECT p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS definition,p.proacl::text AS grants
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sophia' AND p.proname=ANY($1::text[]) ORDER BY signature`,
    [
      [
        'start_conversation',
        'send_conversation_message',
        'conversation_ask',
        'conversation_ask_capability',
        'conversation_prior',
        'conversation_redact',
        'start_conversation_input',
        'send_conversation_input',
        'conversation_input_record',
        'conversation_input_contract',
        'conversation_input_receipt',
        'mention_recipients',
        'mentions_allowed',
      ],
    ],
  )
const SOURCE = 'A public synthetic target.'
const BODY = 'A public synthetic addressed input.'
const key = () => randomUUID()
const sqlstate = (error: unknown) => {
  if (!(error instanceof Error)) return undefined
  const cause: unknown = error.cause ?? error
  return typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined
}
const refused = (code: string) => (error: unknown) => sqlstate(error) === code
const query = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await owner.query<T>(sql, params)).rows
const act = <T>(actor: string, run: (c: pg.PoolClient) => Promise<T>, mode: 'read' | 'write' = 'write') =>
  withActor(api, actor, mode, run)

interface World {
  project: string
  admin: string
  writer: string
  member: string
  author: string
  target: ConversationInputReceipt
}
async function world(): Promise<World> {
  const admin = key(),
    writer = key(),
    member = key(),
    author = key()
  const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [writer, author], viewers: [member] })
  await query("SELECT sophia.set_conversation_settings($1,'enabled','0123 synthetic')", [projectId])
  const target = await act(author, (c) =>
    startConversationInput(
      c,
      projectId,
      key(),
      { contract: AUTOMATIC_V1, title: 'Synthetic', text: SOURCE },
      'Synthetic author',
    ),
  )
  return { project: projectId, admin, writer, member, author, target }
}
async function start(w: World, requestKey = key(), mentions: unknown = [w.member]) {
  return act(
    w.writer,
    async (c) =>
      (
        await c.query<{ receipt: ConversationInputReceipt }>(
          'SELECT sophia.start_conversation_addressed_input($1,$2,$3,$4,$5,$6,$7::jsonb) AS receipt',
          [w.project, requestKey, AUTOMATIC_V1, 'Addressed', BODY, 'Synthetic writer', JSON.stringify(mentions)],
        )
      ).rows[0]!.receipt,
  )
}
async function send(
  w: World,
  requestKey = key(),
  mentions: unknown = [w.member],
  target: string | null = w.target.messageId,
) {
  return act(
    w.writer,
    async (c) =>
      (
        await c.query<{ receipt: ConversationInputReceipt }>(
          'SELECT sophia.send_conversation_addressed_input($1,$2,$3,$4,$5,$6::jsonb,$7::uuid) AS receipt',
          [
            w.target.conversationId,
            requestKey,
            AUTOMATIC_V1,
            BODY,
            'Synthetic writer',
            JSON.stringify(mentions),
            target,
          ],
        )
      ).rows[0]!.receipt,
  )
}
interface Addressing extends pg.QueryResultRow {
  project_id: string
  input_id: string
  conversation_id: string
  addressing_version: number
  structured_mentions: string[]
  reply_target: string | null
  reply_target_seq: string | null
  reply_target_author: 'member' | 'sophia' | null
  reply_target_actor_id: string | null
  conversation_revision: string
  erasure_revision: string
}
const addressing = async (input: string) =>
  (await query<Addressing>('SELECT * FROM sophia.saved_conversation_input_addressing WHERE input_id=$1', [input]))[0]!
const totals = async (project: string) =>
  (
    await query(
      `SELECT
 (SELECT count(*)::int FROM sophia.conversation_messages WHERE project_id=$1) AS messages,
 (SELECT count(*)::int FROM sophia.conversation_requests WHERE project_id=$1) AS requests,
 (SELECT count(*)::int FROM sophia.saved_conversation_inputs WHERE project_id=$1) AS inputs,
 (SELECT count(*)::int FROM sophia.saved_conversation_input_addressing WHERE project_id=$1) AS contexts`,
      [project],
    )
  )[0]!
async function noEffects(project: string) {
  for (const table of [
    'conversation_replies',
    'contribution_mentions',
    'viewer_attention',
    'work_attempts',
    'execution_bindings',
    'commands',
    'outbox',
    'coordination_outbox',
    'runtime_commands',
    'research_reservations',
    'conversation_reservations',
  ])
    assert.equal(
      (await query<{ n: number }>(`SELECT count(*)::int AS n FROM sophia.${table} WHERE project_id=$1`, [project]))[0]!
        .n,
      0,
      table,
    )
}

before(async () => {
  baseMigrations = mkdtempSync(join(tmpdir(), 'sophia-0123-baseline-'))
  for (const file of readdirSync('db/migrations'))
    if (file.endsWith('.sql') && file < '0123_saved_conversation_input_addressing.sql')
      cpSync(join('db/migrations', file), join(baseMigrations, file))
  db = await createTestDatabase(baseMigrations, { assembler: true })
  api = new pg.Pool({ connectionString: db.apiUrl, max: 4, statement_timeout: 5000, connectionTimeoutMillis: 5000 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, statement_timeout: 5000, connectionTimeoutMillis: 5000 })
  foundationBefore = await foundations()
  legacyCallersBefore = (
    await query<{ signature: string }>(
      `SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='sophia' AND position('conversation_input_record(' in p.prosrc)>0 ORDER BY 1`,
    )
  ).map((row) => row.signature)
  const migration = 'db/migrations/0123_saved_conversation_input_addressing.sql'
  if (existsSync(migration)) await owner.query(readFileSync(migration, 'utf8'))
  const observationMigration = 'db/migrations/0124_saved_conversation_input_observations.sql'
  if (existsSync(migration) && existsSync(observationMigration))
    await owner.query(readFileSync(observationMigration, 'utf8'))
})
after(async () => {
  await api?.end()
  await owner?.end()
  await db?.drop()
  if (baseMigrations) rmSync(baseMigrations, { recursive: true, force: true })
})

describe('saved input addressing: fresh authority and exact references', () => {
  it('start/send canonicalize current members, derive target author, keep old input metadata and dispatch nothing', async () => {
    const w = await world()
    const first = await start(w, key(), [w.member, w.writer, w.member])
    const sent = await send(w)
    assert.equal(first.effect, 'none')
    assert.equal(sent.effect, 'none')
    assert.equal(sent.contractVersion, 1)
    const a = await addressing(sent.inputId)
    assert.deepEqual(a.structured_mentions, [w.member])
    assert.deepEqual(
      [a.project_id, a.conversation_id, a.reply_target, a.reply_target_actor_id, a.reply_target_author],
      [w.project, w.target.conversationId, w.target.messageId, w.author, 'member'],
    )
    assert.equal(Number(a.reply_target_seq), 1)
    assert.equal(a.addressing_version, 1)
    assert.ok(Number(a.conversation_revision) > 0)
    assert.ok(!Object.keys(a).some((k) => /body|text|name|digest/.test(k)))
    assert.deepEqual((await addressing(first.inputId)).structured_mentions, [w.member])
    const old = (
      await query(
        'SELECT structured_mentions,reply_target,addressing_basis FROM sophia.saved_conversation_inputs WHERE id=$1',
        [sent.inputId],
      )
    )[0]
    assert.deepEqual(old, { structured_mentions: [], reply_target: null, addressing_basis: 'none' })
    await noEffects(w.project)
  })
  it('a Sophia reply target is derived as Sophia, without a caller author or a copied body', async () => {
    const w = await world()
    const [target] = await query<{ id: string; seq: string }>(
      `SELECT (m).id,(m).seq FROM (SELECT sophia.conversation_append($1,$2,'sophia',NULL,NULL,'Synthetic fixture reply',NULL) AS m) t`,
      [w.project, w.target.conversationId],
    )
    const sent = await send(w, key(), [], target!.id)
    const a = await addressing(sent.inputId)
    assert.equal(a.reply_target_author, 'sophia')
    assert.equal(a.reply_target_actor_id, null)
    assert.equal(Number(a.reply_target_seq), Number(target!.seq))
    await noEffects(w.project)
  })
  it('only explicit automatic_v1 enters these addressed writers', async () => {
    const w = await world(),
      was = await totals(w.project)
    for (const contract of [null, '', 'automatic', 'legacy_explicit_ask']) {
      await assert.rejects(
        act(w.writer, (c) =>
          c.query('SELECT sophia.start_conversation_addressed_input($1,$2,$3,$4,$5,$6,$7::jsonb)', [
            w.project,
            key(),
            contract,
            'Title',
            BODY,
            null,
            '[]',
          ]),
        ),
        refused('22023'),
      )
      await assert.rejects(
        act(w.writer, (c) =>
          c.query('SELECT sophia.send_conversation_addressed_input($1,$2,$3,$4,$5,$6::jsonb,$7::uuid)', [
            w.target.conversationId,
            key(),
            contract,
            BODY,
            null,
            '[]',
            null,
          ]),
        ),
        refused('22023'),
      )
    }
    assert.deepEqual(await totals(w.project), was)
  })
  it('fresh writes revalidate named members; absent/inactive recipients record nothing', async () => {
    const w = await world(),
      was = await totals(w.project)
    await assert.rejects(start(w, key(), [key()]), refused('22023'))
    await query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
      w.project,
      w.member,
    ])
    await assert.rejects(send(w), refused('22023'))
    assert.deepEqual(await totals(w.project), was)
    await noEffects(w.project)
  })
  it('fresh replies reject a withdrawn target, and a same-project different conversation target', async () => {
    const w = await world()
    const other = await act(w.author, (c) =>
      startConversationInput(c, w.project, key(), { contract: AUTOMATIC_V1, title: 'Other', text: SOURCE }, null),
    )
    await assert.rejects(send(w, key(), [], other.messageId), refused('22023'))
    await act(w.author, (c) => withdrawConversationMessage(c, w.target.conversationId, w.target.messageId, key()))
    const was = await totals(w.project)
    await assert.rejects(send(w, key(), [], w.target.messageId), refused('22023'))
    assert.deepEqual(await totals(w.project), was)
    await noEffects(w.project)
  })
  it('fresh replies reject another project target and malformed member shape', async () => {
    const w = await world(),
      elsewhere = await world(),
      was = await totals(w.project)
    await assert.rejects(send(w, key(), [], elsewhere.target.messageId), refused('22023'))
    for (const mentions of [null, {}, ['not-a-member-id'], Array.from({ length: 6 }, () => w.member)])
      await assert.rejects(send(w, key(), mentions), refused('22023'))
    assert.deepEqual(await totals(w.project), was)
    await noEffects(w.project)
  })
})

describe('saved input addressing: replay is historical, authority remains current', () => {
  it('identical canonical replay after target withdrawal/recipient loss preserves receipt and context without substituting', async () => {
    const w = await world(),
      k = key(),
      first = await send(w, k),
      context = await addressing(first.inputId)
    await act(w.author, (c) => withdrawConversationMessage(c, w.target.conversationId, w.target.messageId, key()))
    await query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
      w.project,
      w.member,
    ])
    const was = await totals(w.project)
    assert.deepEqual(await send(w, k, [w.member, w.member]), first)
    assert.deepEqual(await addressing(first.inputId), context)
    assert.deepEqual(await totals(w.project), was)
    await assert.rejects(send(w), refused('22023'))
    await noEffects(w.project)
  })
  it('withdrawal of the originating input itself redacts its request and refuses replay', async () => {
    const w = await world(),
      k = key(),
      first = await send(w, k)
    await act(w.writer, (c) => withdrawConversationMessage(c, first.conversationId, first.messageId, key()))
    await assert.rejects(send(w, k), refused('40001'))
    const a = await addressing(first.inputId)
    assert.equal(a.reply_target, w.target.messageId)
    await noEffects(w.project)
  })
  it('current writer authority precedes replay; read-only permits only the identical historical receipt', async () => {
    const w = await world(),
      k = key(),
      first = await send(w, k),
      context = await addressing(first.inputId)
    await query("SELECT sophia.set_conversation_settings($1,'read_only','0123 synthetic')", [w.project])
    assert.deepEqual(await send(w, k), first)
    assert.deepEqual(await addressing(first.inputId), context)
    await assert.rejects(send(w), refused('55000'))
    await query("UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2", [
      w.project,
      w.writer,
    ])
    await assert.rejects(send(w, k), refused('42501'))
    await noEffects(w.project)
  })
  it('changed addressing and addressed/A49 crossings conflict in the existing shared key namespace', async () => {
    const w = await world(),
      k = key(),
      first = await send(w, k)
    await assert.rejects(send(w, k, [], null), refused('23505'))
    await assert.rejects(
      act(w.writer, (c) =>
        sendConversationInput(c, w.target.conversationId, k, { contract: AUTOMATIC_V1, text: BODY }, null),
      ),
      refused('23505'),
    )
    const oldKey = key()
    await act(w.writer, (c) =>
      sendConversationInput(c, w.target.conversationId, oldKey, { contract: AUTOMATIC_V1, text: BODY }, null),
    )
    await assert.rejects(send(w, oldKey, [], null), refused('23505'))
    assert.equal((await addressing(first.inputId)).reply_target, w.target.messageId)
    await noEffects(w.project)
  })
  it('same-key concurrent canonical requests yield one message/context; changed concurrent request conflicts', async () => {
    const w = await world(),
      k = key(),
      was = await totals(w.project)
    const [a, b] = await Promise.all([send(w, k, [w.member, w.member]), send(w, k, [w.member])])
    assert.deepEqual(a, b)
    const next = await totals(w.project)
    assert.equal(Number(next.messages), Number(was.messages) + 1)
    assert.equal(Number(next.contexts), Number(was.contexts) + 1)
    const k2 = key(),
      results = await Promise.allSettled([send(w, k2, [], null), send(w, k2, [w.member])])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    assert.ok(results.some((r) => r.status === 'rejected' && sqlstate(r.reason) === '23505'))
    await noEffects(w.project)
  })
})

describe('saved input addressing: role-RLS and unchanged foundations', () => {
  it('keeps prior writer/erasure/mention validator definitions and grants byte-equivalent', async () => {
    assert.deepEqual(legacyCallersBefore, [
      'sophia.send_conversation_input(uuid,text,text,text,text)',
      'sophia.start_conversation_input(uuid,text,text,text,text,text)',
    ])
    assert.deepEqual(await foundations(), foundationBefore)
  })
  it('members read reference metadata; removal/erasure hides it; API has no direct write and private helpers stay private', async () => {
    const w = await world(),
      originKey = key(),
      first = await send(w, originKey)
    const read = (actor: string) =>
      act(
        actor,
        async (c) =>
          (
            await c.query('SELECT input_id FROM sophia.saved_conversation_input_addressing WHERE input_id=$1', [
              first.inputId,
            ])
          ).rowCount,
        'read',
      )
    assert.equal(await read(w.member), 1)
    assert.equal(await read(key()), 0)
    await query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
      w.project,
      w.member,
    ])
    assert.equal(await read(w.member), 0)
    await assert.rejects(
      query('UPDATE sophia.saved_conversation_input_addressing SET addressing_version=1 WHERE input_id=$1', [
        first.inputId,
      ]),
      refused('55000'),
    )
    assert.equal(
      (
        await query<{ allowed: boolean }>(
          "SELECT has_function_privilege('sophia_api','sophia.conversation_input_addressing_record(uuid,uuid,uuid[],uuid,bigint,text,uuid)','EXECUTE') AS allowed",
        )
      )[0]!.allowed,
      false,
    )
    await assert.rejects(
      act(w.writer, (c) =>
        c.query('UPDATE sophia.saved_conversation_input_addressing SET addressing_version=1 WHERE input_id=$1', [
          first.inputId,
        ]),
      ),
      refused('42501'),
    )
    for (const url of [db.workerUrl, db.assemblerUrl!]) {
      const c = new pg.Client({ connectionString: url })
      await c.connect()
      try {
        await assert.rejects(c.query('SELECT * FROM sophia.saved_conversation_input_addressing'), refused('42501'))
        await assert.rejects(
          c.query('SELECT sophia.send_conversation_addressed_input($1,$2,$3,$4,$5,$6::jsonb,$7::uuid)', [
            w.target.conversationId,
            key(),
            AUTOMATIC_V1,
            BODY,
            null,
            '[]',
            null,
          ]),
          refused('42501'),
        )
      } finally {
        await c.end()
      }
    }
    await act(w.admin, (c) => eraseConversation(c, w.target.conversationId, key()))
    assert.equal(await read(w.writer), 0)
    await assert.rejects(send(w, originKey), refused('40001'))
    await assert.rejects(send(w), refused('22023'))
    await noEffects(w.project)
  })
})
