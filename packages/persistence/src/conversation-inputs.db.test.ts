// INC03-CC-002 S01a (migration 0095): an automatic_v1 member message is retained as an input, with no effect, through
// the API login and withActor on a disposable PostgreSQL. Every grant, runtime and route is synthetic.
// The no-effect assertions run where it matters: on a project whose current grant, admitted assembler and ready
// runtime make the legacy askSophia:true path admit a pending reply (conversation-legacy-ask.db.test.ts). Not covered:
// HTTP, routing, assessment, addressing, attention or any funded Answer/Explore/Build.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, registerRuntime, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  AUTOMATIC_V1,
  isInputReceipt,
  sendConversationInput,
  startConversationInput,
  type ConversationInputReceipt,
} from './conversation-inputs.ts'
import { eraseConversation, startConversation, withdrawConversationMessage } from './conversations.ts'
import { withActor } from './tx.ts'

const ROUTE = 'route-inputs-test'
const auto = { contract: AUTOMATIC_V1 } as const

interface World {
  db: TestDatabase
  owner: pg.Pool
  api: pg.Pool
}

let w: World

async function owner<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await w.owner.query<T>(sql, params)).rows
}

/** The SQL error a call was refused with, through withActor's DomainError or directly. */
function sqlstate(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined
  const source: unknown = err.cause ?? err
  return typeof source === 'object' && source !== null && 'code' in source && typeof source.code === 'string'
    ? source.code
    : undefined
}
const refusedWith = (code: string) => (err: unknown) => sqlstate(err) === code

interface Project {
  projectId: string
  admin: string
  editor: string
  viewer: string
}

/**
 * Conversations on, and (unless `funded` is false) a ready runtime with the conversation role and a current grant
 * naming the editor: the configuration in which a legacy Ask admits work (0071).
 */
async function project(funded = true): Promise<Project> {
  const p = { admin: randomUUID(), editor: randomUUID(), viewer: randomUUID() }
  const { projectId } = await seedProject(w.db.ownerUrl, { admin: p.admin, editors: [p.editor], viewers: [p.viewer] })
  await w.owner.query("SELECT sophia.set_conversation_settings($1,'enabled','inc03-cc-002-inputs-test')", [projectId])
  if (funded) await fund(projectId, p.admin, p.editor)
  return { projectId, ...p }
}

async function fund(projectId: string, admin: string, editor: string): Promise<void> {
  const rt = await registerRuntime(w.db.ownerUrl, { projectId, admin, runtimeUnitId: 'sophia-runtime-test' })
  const hash = createHash('sha256').update(rt.token).digest()
  const bridge = randomUUID()
  const call = (op: string, body: unknown) =>
    w.api.query(`SELECT sophia.runtime_${op}($1,$2,$3,$4::jsonb) AS v`, [hash, rt.runtimeUnitId, bridge, body])
  await call('hello', {
    protocolVersion: 1,
    roles: [{ id: 'sophia-conversation-v1', route: ROUTE, presetDigest: 'x' }],
  })
  await call('record_ready', { state: 'ready', reason: null, unrecovered: [] })
  await w.owner.query('SELECT sophia.conversation_new_lineage($1,$2::jsonb)', [
    projectId,
    {
      unit: 'calls_tokens',
      routeId: ROUTE,
      credentialRef: 'synthetic-credential-ref',
      ownerResourceRef: 'synthetic-owner-resource-ref',
      approvalRef: `inc03-cc-002-inputs-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      maxCallsPerReply: 2,
      totalCallCap: 10,
      replyTokenCap: 100_000,
      totalTokenCap: 500_000,
      subjects: [editor],
    },
  ])
}

const start = (actor: string, projectId: string, key: string, text = 'Opening words.', title = 'Inputs') =>
  withActor(w.api, actor, 'write', (c) => startConversationInput(c, projectId, key, { ...auto, title, text }, 'Member'))
const send = (actor: string, conversationId: string, key: string, text: string) =>
  withActor(w.api, actor, 'write', (c) => sendConversationInput(c, conversationId, key, { ...auto, text }, 'Member'))

/** Every row an Ask, a reply, an admission or a dispatch could have written for the project. */
async function effects(projectId: string): Promise<Record<string, number>> {
  const [row] = await owner<Record<string, number>>(
    `SELECT (SELECT count(*)::int FROM sophia.conversation_replies WHERE project_id=$1) AS replies,
       (SELECT count(*)::int FROM sophia.work_attempts WHERE project_id=$1) AS attempts,
       (SELECT count(*)::int FROM sophia.execution_bindings WHERE project_id=$1) AS bindings,
       (SELECT count(*)::int FROM sophia.commands WHERE project_id=$1) AS commands,
       (SELECT count(*)::int FROM sophia.outbox WHERE project_id=$1) AS outbox,
       (SELECT count(*)::int FROM sophia.runtime_commands WHERE project_id=$1) AS runtime_commands,
       (SELECT count(*)::int FROM sophia.conversation_reservations WHERE project_id=$1) AS reservations`,
    [projectId],
  )
  assert.ok(row)
  return row
}
const NO_EFFECTS = {
  replies: 0,
  attempts: 0,
  bindings: 0,
  commands: 0,
  outbox: 0,
  runtime_commands: 0,
  reservations: 0,
}

/** Messages, requests and inputs written for the project. */
async function written(projectId: string): Promise<Record<string, number>> {
  const [row] = await owner<Record<string, number>>(
    `SELECT (SELECT count(*)::int FROM sophia.conversation_messages WHERE project_id=$1) AS messages,
       (SELECT count(*)::int FROM sophia.conversation_requests WHERE project_id=$1) AS requests,
       (SELECT count(*)::int FROM sophia.saved_conversation_inputs WHERE project_id=$1) AS inputs`,
    [projectId],
  )
  assert.ok(row)
  return row
}

async function inputRow(inputId: string): Promise<Record<string, unknown>> {
  const [row] = await owner<Record<string, unknown>>(
    'SELECT to_jsonb(i) AS row FROM sophia.saved_conversation_inputs i WHERE id=$1',
    [inputId],
  )
  assert.ok(row)
  const value: unknown = row.row
  assert.ok(typeof value === 'object' && value !== null)
  return { ...value }
}

before(async () => {
  const db = await createTestDatabase(undefined, { assembler: true })
  w = {
    db,
    owner: new pg.Pool({ connectionString: db.ownerUrl, max: 3 }),
    api: new pg.Pool({ connectionString: db.apiUrl, max: 4 }),
  }
})
after(async () => {
  await Promise.all([w.owner.end(), w.api.end()])
  await w.db.drop()
})

describe('an automatic_v1 input is recorded, with no effect', () => {
  it('start and send write the message, its request, the input and one event each, and nothing that acts', async () => {
    const p = await project()
    const events = async () =>
      (await owner<{ n: number }>('SELECT event_sequence::int AS n FROM sophia.projects WHERE id=$1', [p.projectId]))[0]
        ?.n ?? -1
    const before0 = await events()
    const started = await start(p.editor, p.projectId, randomUUID())
    assert.equal(await events(), before0 + 1)
    const sent = await send(p.editor, started.conversationId, randomUUID(), '@Luis stop the deploy and build it.')
    assert.equal(await events(), before0 + 2)
    assert.deepEqual(await written(p.projectId), { messages: 2, requests: 2, inputs: 2 })
    assert.deepEqual(await effects(p.projectId), NO_EFFECTS)
    for (const r of [started, sent]) {
      assert.ok(isInputReceipt(r))
      assert.deepEqual(Object.keys(r).toSorted(), [
        'contractVersion',
        'conversationId',
        'effect',
        'input',
        'inputId',
        'interactionContract',
        'messageId',
      ])
      assert.deepEqual(
        [r.input, r.effect, r.interactionContract, r.contractVersion],
        ['recorded', 'none', 'automatic_v1', 1],
      )
    }
    const types = await owner<{ type: string; summary_code: string }>(
      'SELECT type, summary_code FROM sophia.project_events WHERE project_id=$1 ORDER BY sequence DESC LIMIT 2',
      [p.projectId],
    )
    assert.deepEqual(
      types.map((t) => [t.type, t.summary_code]),
      [
        ['conversation.updated', 'conversation.message_recorded'],
        ['conversation.updated', 'conversation.started'],
      ],
    )
  })

  it('the input row holds ids, the contract, the server-resolved audience and context references, and no text', async () => {
    const p = await project()
    const started = await start(p.editor, p.projectId, randomUUID(), '@Marta please hold it.')
    const row = await inputRow(started.inputId)
    const [message] = await owner<{ seq: string; actor_id: string; body: string }>(
      'SELECT seq::text, actor_id, body FROM sophia.conversation_messages WHERE id=$1',
      [started.messageId],
    )
    const [settings] = await owner<{ revision: number }>(
      'SELECT revision FROM sophia.conversation_settings WHERE project_id=$1',
      [p.projectId],
    )
    assert.deepEqual(
      {
        ...row,
        id: 'id',
        created_at: 'at',
        idempotency_key: 'key',
      },
      {
        project_id: p.projectId,
        id: 'id',
        conversation_id: started.conversationId,
        message_id: started.messageId,
        actor_id: p.editor,
        idempotency_key: 'key',
        operation: 'start',
        interaction_contract: 'automatic_v1',
        contract_version: 1,
        origin: 'text',
        audience_kind: 'project_members',
        settings_policy: 'conversation-text-v1',
        settings_revision: settings?.revision,
        message_seq: 1,
        // A new conversation is revision 1; the append makes it 2 (the event that follows moves it again).
        conversation_revision: 2,
        erasure_revision: 0,
        writer_role: 'editor',
        structured_mentions: [],
        reply_target: null,
        addressing_basis: 'none',
        state: 'recorded',
        created_at: 'at',
      },
    )
    assert.equal(row.id, started.inputId)
    assert.deepEqual([message?.seq, message?.actor_id, message?.body], ['1', p.editor, '@Marta please hold it.'])
    const text = JSON.stringify(row)
    assert.ok(!text.includes('Marta') && !text.includes('hold'), 'no text on the input row')
  })

  it('is recorded without any payer, grant, runtime or assessment route', async () => {
    const p = await project(false)
    const r = await start(p.editor, p.projectId, randomUUID())
    assert.equal((await inputRow(r.inputId)).state, 'recorded')
    assert.deepEqual(await effects(p.projectId), NO_EFFECTS)
  })
})

describe('the contract is explicit', () => {
  it('the typed boundary refuses anything but automatic_v1 before reaching SQL', async () => {
    const p = await project()
    for (const contract of ['legacy_explicit_ask', '', 'automatic', undefined, null, true]) {
      const write = { contract, title: 'T', text: 'x' }
      await assert.rejects(
        withActor(w.api, p.editor, 'write', (c) =>
          // A deliberately wrong contract, as an untyped caller could pass one: the boundary must refuse it at run time.
          startConversationInput(
            c,
            p.projectId,
            randomUUID(),
            write as unknown as typeof auto & { title: string; text: string },
            null,
          ),
        ),
        // Refused by the typed boundary itself: a database refusal would carry PostgreSQL's error as its cause.
        (err) => err instanceof Error && 'code' in err && err.code === 'invalid_request' && err.cause === undefined,
      )
    }
    assert.deepEqual(await written(p.projectId), { messages: 0, requests: 0, inputs: 0 })
  })

  it('SQL refuses a NULL, empty, near-miss or legacy contract with 22023 and writes nothing', async () => {
    const p = await project()
    const first = await start(p.editor, p.projectId, randomUUID())
    const counts = await written(p.projectId)
    for (const contract of [null, '', 'automatic', 'AUTOMATIC_V1', 'legacy_explicit_ask']) {
      await assert.rejects(
        withActor(w.api, p.editor, 'write', (c) =>
          c.query('SELECT sophia.start_conversation_input($1,$2,$3,$4,$5,$6)', [
            p.projectId,
            randomUUID(),
            contract,
            'T',
            'x',
            null,
          ]),
        ),
        refusedWith('22023'),
      )
      await assert.rejects(
        withActor(w.api, p.editor, 'write', (c) =>
          c.query('SELECT sophia.send_conversation_input($1,$2,$3,$4,$5)', [
            first.conversationId,
            randomUUID(),
            contract,
            'x',
            null,
          ]),
        ),
        refusedWith('22023'),
      )
    }
    assert.deepEqual(await written(p.projectId), counts)
  })
})

describe('one request per key, under current authority', () => {
  it('the same key and words return the original receipt, even after later messages', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await start(p.editor, p.projectId, key)
    const sendKey = randomUUID()
    const sent = await send(p.editor, first.conversationId, sendKey, 'Second.')
    await send(p.editor, first.conversationId, randomUUID(), 'Third.')
    assert.deepEqual(await start(p.editor, p.projectId, key), first)
    assert.deepEqual(await send(p.editor, first.conversationId, sendKey, 'Second.'), sent)
    assert.deepEqual(await written(p.projectId), { messages: 3, requests: 3, inputs: 3 })
  })

  it('changed words, legacy and automatic, and start and send under one key conflict (23505) and write nothing', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await start(p.editor, p.projectId, key, 'Opening words.')
    const sendKey = randomUUID()
    await send(p.editor, first.conversationId, sendKey, 'Second.')
    const counts = await written(p.projectId)
    const conflicts = [
      () => start(p.editor, p.projectId, key, 'Other words.'),
      () => start(p.editor, p.projectId, key, 'Opening words.', 'Other title'),
      () =>
        withActor(w.api, p.editor, 'write', (c) =>
          startConversation(c, p.projectId, key, { title: 'Inputs', text: 'Opening words.', askSophia: false }, null),
        ),
      () => send(p.editor, first.conversationId, key, 'Opening words.'),
      () => send(p.editor, first.conversationId, sendKey, 'Changed.'),
      () => start(p.editor, p.projectId, sendKey, 'Second.'),
    ]
    for (const attempt of conflicts) await assert.rejects(attempt(), refusedWith('23505'))
    const legacyKey = randomUUID()
    await withActor(w.api, p.editor, 'write', (c) =>
      startConversation(c, p.projectId, legacyKey, { title: 'Legacy', text: 'Words.', askSophia: false }, null),
    )
    await assert.rejects(start(p.editor, p.projectId, legacyKey, 'Words.', 'Legacy'), refusedWith('23505'))
    assert.deepEqual(await written(p.projectId), {
      ...counts,
      messages: (counts.messages ?? 0) + 1,
      requests: (counts.requests ?? 0) + 1,
    })
  })

  it('a writer demoted or removed is refused a new write and a retry under an old key', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await start(p.editor, p.projectId, key)
    const sendKey = randomUUID()
    await send(p.editor, first.conversationId, sendKey, 'Second.')
    await w.owner.query("UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2", [
      p.projectId,
      p.editor,
    ])
    await assert.rejects(start(p.editor, p.projectId, key), refusedWith('42501'))
    await assert.rejects(send(p.editor, first.conversationId, sendKey, 'Second.'), refusedWith('42501'))
    await assert.rejects(start(p.editor, p.projectId, randomUUID()), refusedWith('42501'))
    await w.owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
      p.projectId,
      p.editor,
    ])
    await assert.rejects(start(p.editor, p.projectId, key), refusedWith('42501'))
    await assert.rejects(send(p.editor, first.conversationId, sendKey, 'Second.'), refusedWith('22023'))
    assert.deepEqual(await written(p.projectId), { messages: 2, requests: 2, inputs: 2 })
  })

  it('a viewer, a non-member and a member of another project cannot write', async () => {
    const p = await project()
    const other = await project()
    const first = await start(p.editor, p.projectId, randomUUID())
    await assert.rejects(start(p.viewer, p.projectId, randomUUID()), refusedWith('42501'))
    await assert.rejects(send(p.viewer, first.conversationId, randomUUID(), 'x'), refusedWith('42501'))
    for (const stranger of [randomUUID(), other.editor]) {
      await assert.rejects(start(stranger, p.projectId, randomUUID()), refusedWith('42501'))
      await assert.rejects(send(stranger, first.conversationId, randomUUID(), 'x'), refusedWith('22023'))
    }
    assert.deepEqual(await written(p.projectId), { messages: 1, requests: 1, inputs: 1 })
  })

  it('read-only settings refuse a new write (55000) and still replay an earlier key', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await start(p.editor, p.projectId, key)
    await w.owner.query("SELECT sophia.set_conversation_settings($1,'read_only','inc03-cc-002-inputs-test')", [
      p.projectId,
    ])
    await assert.rejects(start(p.editor, p.projectId, randomUUID()), refusedWith('55000'))
    await assert.rejects(send(p.editor, first.conversationId, randomUUID(), 'x'), refusedWith('55000'))
    assert.deepEqual(await start(p.editor, p.projectId, key), first)
    assert.deepEqual(await written(p.projectId), { messages: 1, requests: 1, inputs: 1 })
  })
})

describe('withdrawal and erasure', () => {
  it('withdrawal removes the text and redacts the request; the input keeps ids only; a retry is 40001', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await start(p.editor, p.projectId, key)
    const sendKey = randomUUID()
    const sent = await send(p.editor, first.conversationId, sendKey, 'Withdraw me.')
    await withActor(w.api, p.editor, 'write', (c) =>
      withdrawConversationMessage(c, first.conversationId, sent.messageId, randomUUID()),
    )
    const [message] = await owner<{ body: string | null }>(
      'SELECT body FROM sophia.conversation_messages WHERE id=$1',
      [sent.messageId],
    )
    assert.equal(message?.body, null)
    const [request] = await owner<{ semantic_request: unknown }>(
      'SELECT semantic_request FROM sophia.conversation_requests WHERE project_id=$1 AND message_id=$2',
      [p.projectId, sent.messageId],
    )
    assert.deepEqual(request?.semantic_request, { redacted: true })
    assert.equal((await inputRow(sent.inputId)).message_id, sent.messageId)
    await assert.rejects(send(p.editor, first.conversationId, sendKey, 'Withdraw me.'), refusedWith('40001'))
    assert.deepEqual(await start(p.editor, p.projectId, key), first)
  })

  it('erasure redacts every request, refuses retries (40001) and takes the inputs out of members’ reads', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await start(p.editor, p.projectId, key)
    await send(p.editor, first.conversationId, randomUUID(), 'Second.')
    const visible = () =>
      withActor(
        w.api,
        p.admin,
        'read',
        async (c) =>
          (
            await c.query('SELECT id FROM sophia.saved_conversation_inputs WHERE conversation_id=$1', [
              first.conversationId,
            ])
          ).rowCount,
      )
    assert.equal(await visible(), 2)
    await withActor(w.api, p.admin, 'write', (c) => eraseConversation(c, first.conversationId, randomUUID()))
    assert.equal(await visible(), 0)
    await assert.rejects(start(p.editor, p.projectId, key), refusedWith('40001'))
    const [kept] = await owner<{ n: number }>(
      'SELECT count(*)::int AS n FROM sophia.saved_conversation_inputs WHERE conversation_id=$1',
      [first.conversationId],
    )
    assert.equal(kept?.n, 2)
  })
})

/** A security-definer function's expected API grant, no worker or public grant, and its fixed search path. */
const definer = (api: boolean) => [api, false, false, true, 'search_path=pg_catalog, sophia, pg_temp']

describe('who reads input metadata, and who may write it', () => {
  const readAs = (actor: string, projectId: string) =>
    withActor(
      w.api,
      actor,
      'read',
      async (c) =>
        (await c.query('SELECT id FROM sophia.saved_conversation_inputs WHERE project_id=$1', [projectId])).rowCount,
    )

  it('current members read it; a non-member, another project’s member and a removed member do not', async () => {
    const p = await project()
    const other = await project()
    await start(p.editor, p.projectId, randomUUID())
    assert.equal(await readAs(p.viewer, p.projectId), 1)
    assert.equal(await readAs(p.admin, p.projectId), 1)
    assert.equal(await readAs(randomUUID(), p.projectId), 0)
    assert.equal(await readAs(other.admin, p.projectId), 0)
    await w.owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
      p.projectId,
      p.viewer,
    ])
    assert.equal(await readAs(p.viewer, p.projectId), 0)
  })

  it('the API login cannot write the table; the worker and assembler logins can neither call the writers nor read it', async () => {
    const p = await project()
    const r = await start(p.editor, p.projectId, randomUUID())
    await assert.rejects(
      withActor(w.api, p.editor, 'write', (c) =>
        c.query("UPDATE sophia.saved_conversation_inputs SET state='recorded' WHERE id=$1", [r.inputId]),
      ),
      refusedWith('42501'),
    )
    for (const url of [w.db.workerUrl, w.db.assemblerUrl]) {
      assert.ok(url)
      const login = new pg.Client({ connectionString: url })
      await login.connect()
      try {
        await login.query("SELECT set_config('sophia.actor_id',$1,false)", [p.editor])
        for (const sql of [
          'SELECT 1 FROM sophia.saved_conversation_inputs',
          `SELECT sophia.start_conversation_input('${p.projectId}','k','automatic_v1','T','x',NULL)`,
          `SELECT sophia.send_conversation_input('${r.conversationId}','k','automatic_v1','x',NULL)`,
        ])
          await assert.rejects(login.query(sql), refusedWith('42501'), sql)
      } finally {
        await login.end()
      }
    }
  })

  it('only an internal helper inserts input rows, no login may call it, and only the two writers reach it', async () => {
    const inserting = await owner<{ sig: string }>(
      `SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='sophia' AND p.prosrc ~ 'INSERT INTO sophia\\.saved_conversation_inputs' ORDER BY 1`,
    )
    const RECORD = 'sophia.conversation_input_record(uuid,text,text,jsonb,sophia.conversation_messages,text)'
    assert.deepEqual(
      inserting.map((r) => r.sig),
      [RECORD],
    )
    const callers = await owner<{ sig: string }>(
      `SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='sophia' AND p.prosrc ~ 'conversation_input_record\\(' ORDER BY 1`,
    )
    const WRITERS = [
      'sophia.send_conversation_input(uuid,text,text,text,text)',
      'sophia.start_conversation_input(uuid,text,text,text,text,text)',
    ]
    assert.deepEqual(
      callers.map((r) => r.sig),
      WRITERS,
    )
    const acl = await owner<{
      sig: string
      api: boolean
      worker: boolean
      pub: boolean
      definer: boolean
      config: string
    }>(
      `SELECT p.oid::regprocedure::text AS sig, has_function_privilege('sophia_api',p.oid,'EXECUTE') AS api,
              has_function_privilege('sophia_worker',p.oid,'EXECUTE') AS worker,
              has_function_privilege('public',p.oid,'EXECUTE') AS pub, p.prosecdef AS definer,
              array_to_string(p.proconfig, ',') AS config
         FROM pg_proc p WHERE p.oid = ANY($1::regprocedure[]) ORDER BY 1`,
      [[RECORD, ...WRITERS]],
    )
    assert.deepEqual(
      acl.map((f) => [f.sig, f.api, f.worker, f.pub, f.definer, f.config]),
      [
        [RECORD, ...definer(false)],
        [WRITERS[0], ...definer(true)],
        [WRITERS[1], ...definer(true)],
      ],
    )
  })
})

/** Whether a promise settled within 300 ms; the sentinel winning is what a waiting caller looks like. */
const settled = <T>(p: Promise<T>) =>
  Promise.race([p.then(() => 'settled'), new Promise((resolve) => setTimeout(() => resolve('waiting'), 300))])

describe('concurrent requests under one key (two connections)', () => {
  /** Holds a write open on its own connection until released: the second caller must wait for its locks. */
  async function held(actor: string, sql: string, params: unknown[]) {
    const c = await w.api.connect()
    let rows: { r: unknown }[]
    try {
      await c.query('BEGIN')
      await c.query("SELECT set_config('sophia.actor_id',$1,true)", [actor])
      rows = (await c.query<{ r: unknown }>(sql, params)).rows
    } catch (err) {
      // Never leave the connection checked out: the pool's end would wait on it for good.
      await c.query('ROLLBACK').catch(() => undefined)
      c.release()
      throw err
    }
    return {
      receipt: rows[0]?.r,
      release: async (commit: boolean) => {
        await c.query(commit ? 'COMMIT' : 'ROLLBACK')
        c.release()
      },
    }
  }

  it('the same words: one message, one input, the same receipt for both', async () => {
    const p = await project()
    const key = randomUUID()
    const first = await held(p.editor, 'SELECT sophia.start_conversation_input($1,$2,$3,$4,$5,NULL) AS r', [
      p.projectId,
      key,
      'automatic_v1',
      'Race',
      'Same words.',
    ])
    const second = start(p.editor, p.projectId, key, 'Same words.', 'Race')
    assert.equal(await settled(second), 'waiting', 'the second write waits for the first one’s project lock')
    await first.release(true)
    const r: ConversationInputReceipt = await second
    assert.deepEqual(r, first.receipt)
    assert.deepEqual(await written(p.projectId), { messages: 1, requests: 1, inputs: 1 })
    assert.deepEqual(await effects(p.projectId), NO_EFFECTS)
  })

  it('different words under one key: one is written, the other conflicts', async () => {
    const p = await project()
    const conversation = await start(p.editor, p.projectId, randomUUID())
    const key = randomUUID()
    const first = await held(p.editor, 'SELECT sophia.send_conversation_input($1,$2,$3,$4,NULL) AS r', [
      conversation.conversationId,
      key,
      'automatic_v1',
      'First words.',
    ])
    const second = send(p.editor, conversation.conversationId, key, 'Other words.')
    assert.equal(await settled(second), 'waiting')
    await first.release(true)
    await assert.rejects(second, refusedWith('23505'))
    assert.deepEqual(await written(p.projectId), { messages: 2, requests: 2, inputs: 2 })
  })
})
