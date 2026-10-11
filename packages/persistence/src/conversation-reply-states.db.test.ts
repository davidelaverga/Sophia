// CON-01 G2-S1, a reply request's terminal set in SQL: a review-only candidate (db/candidates/con01-s1-reply-states.sql,
// BINDING_MAP §8.2.1; CX-0091 N3), applied here after every migration to a disposable database. Level: sql-run. Its
// number waits for the final census; nothing calls it and nothing is granted. Requests are put in each state by the
// owner here, because no runtime path writes them yet; that is this test's setup, not a path the candidate offers. It
// claims nothing of the native work or its observations, which G2 fences later.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import {
  createPool,
  eraseConversation,
  sendConversationMessage,
  startConversation,
  withActor,
  withdrawConversationMessage,
} from './index.ts'

const CANDIDATE = readFileSync(new URL('../../../db/candidates/con01-s1-reply-states.sql', import.meta.url), 'utf8')
const STATES = ['pending', 'running', 'answered', 'failed', 'cancelled', 'blocked', 'outcome_unknown'] as const
type State = (typeof STATES)[number]
const ENDED: readonly State[] = ['answered', 'failed', 'cancelled', 'blocked', 'outcome_unknown']
const WITHDRAWN_FROM = 'sophia.conversation_withdrawn_from(uuid,uuid,bigint,text)'
const OPEN_BEFORE = "state IN ('pending','running','outcome_unknown')"
const OPEN_AFTER = "state IN ('pending','running')"
const SETTLED_BEFORE =
  "CHECK (((state = ANY (ARRAY['answered'::text, 'failed'::text, 'cancelled'::text, 'blocked'::text])) = (settled_at IS NOT NULL)))"
const SETTLED_AFTER =
  "CHECK (((state = ANY (ARRAY['answered'::text, 'failed'::text, 'cancelled'::text, 'blocked'::text, 'outcome_unknown'::text])) = (settled_at IS NOT NULL)))"
const INDEX_BEFORE =
  "CREATE INDEX conversation_replies_open ON sophia.conversation_replies USING btree (project_id, conversation_id, cutoff_seq) WHERE (state = ANY (ARRAY['pending'::text, 'running'::text, 'outcome_unknown'::text]))"
const INDEX_AFTER =
  "CREATE INDEX conversation_replies_open ON sophia.conversation_replies USING btree (project_id, conversation_id, cutoff_seq) WHERE (state = ANY (ARRAY['pending'::text, 'running'::text]))"
/** Rows of the runtime and the model: none is ever written here. */
const OPERATIONAL = [
  'commands',
  'jobs',
  'work_attempts',
  'execution_bindings',
  'outbox',
  'runtime_commands',
  'runtime_receipts',
  'native_observations',
  'usage_records',
]
const A = randomUUID() // admin
const E = randomUUID() // editor who asks

/** One statement (or a script) on a database, as the role its URL names. */
async function query<T extends pg.QueryResultRow>(url: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    return (await c.query<T>(sql, params)).rows
  } finally {
    await c.end()
  }
}

/** The error code a promise ends with, or `resolved`. */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'resolved'
  } catch (err) {
    return err instanceof pg.DatabaseError ? (err.code ?? 'no code') : String(err)
  }
}

interface Identities {
  constraints: { conname: string; def: string }[]
  indexes: { name: string; def: string; unique: boolean }[]
  withdrawnFrom: { src: string; secdef: boolean; config: string; owner: string; acl: string | null }
  functions: { sig: string; src: string; secdef: boolean; acl: string | null }[]
  relations: { relname: string; relkind: string; acl: string | null }[]
  triggers: { name: string; def: string }[]
  policies: { name: string; rel: string; qual: string | null }[]
  grants: { grantee: string; object: string; privilege: string }[]
  rows: { relname: string; n: string }[]
}

const SETTLED = '(settled_at IS NOT NULL)'
const OPEN_INDEX = 'sophia.conversation_replies_open'
const settledCheck = (ids: Identities) => ids.constraints.filter((c) => c.def.includes(SETTLED))
const otherConstraints = (ids: Identities) => ids.constraints.filter((c) => !c.def.includes(SETTLED))
const openIndex = (ids: Identities) => ids.indexes.find((i) => i.name === OPEN_INDEX)
const otherIndexes = (ids: Identities) => ids.indexes.filter((i) => i.name !== OPEN_INDEX)
const otherFunctions = (ids: Identities) => ids.functions.filter((f) => f.sig !== WITHDRAWN_FROM)

/** What the candidate may touch, read from the catalog: the reply table's constraints and indexes, every function, relation, trigger, policy and grant in the schema, and each table's row count. */
async function identities(url: string): Promise<Identities> {
  const q = <T extends pg.QueryResultRow>(sql: string) => query<T>(url, sql)
  const replies = `'sophia.conversation_replies'::regclass`
  const [constraints, indexes, [withdrawnFrom], functions, relations, triggers, policies, grants, rows] =
    await Promise.all([
      q<Identities['constraints'][number]>(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid=${replies} ORDER BY conname`,
      ),
      q<Identities['indexes'][number]>(
        `SELECT indexrelid::regclass::text AS name, pg_get_indexdef(indexrelid) AS def, indisunique AS unique
           FROM pg_index WHERE indrelid=${replies} ORDER BY 1`,
      ),
      q<Identities['withdrawnFrom']>(
        `SELECT prosrc AS src, prosecdef AS secdef, array_to_string(proconfig, ',') AS config,
                proowner::regrole::text AS owner, proacl::text AS acl
           FROM pg_proc WHERE oid='${WITHDRAWN_FROM}'::regprocedure`,
      ),
      q<Identities['functions'][number]>(
        `SELECT p.oid::regprocedure::text AS sig, md5(p.prosrc) AS src, p.prosecdef AS secdef, p.proacl::text AS acl
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sophia' ORDER BY 1`,
      ),
      q<Identities['relations'][number]>(
        `SELECT c.relname, c.relkind::text, c.relacl::text AS acl
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sophia' ORDER BY 1`,
      ),
      q<Identities['triggers'][number]>(
        `SELECT t.tgname AS name, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
           JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sophia' AND NOT t.tgisinternal ORDER BY 2`,
      ),
      q<Identities['policies'][number]>(
        `SELECT polname AS name, polrelid::regclass::text AS rel, pg_get_expr(polqual, polrelid) AS qual FROM pg_policy
           ORDER BY 2, 1`,
      ),
      q<Identities['grants'][number]>(
        `SELECT grantee, table_name AS object, privilege_type AS privilege FROM information_schema.role_table_grants
           WHERE table_schema='sophia'
         UNION ALL
         SELECT grantee, specific_name, privilege_type FROM information_schema.role_routine_grants
           WHERE routine_schema='sophia'
         ORDER BY 1, 2, 3`,
      ),
      q<Identities['rows'][number]>(
        `SELECT c.relname, (xpath('/row/n/text()',
                  query_to_xml(format('SELECT count(*) AS n FROM sophia.%I', c.relname), false, true, '')))[1]::text AS n
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='sophia' AND c.relkind IN ('r', 'p') ORDER BY 1`,
      ),
    ])
  assert.ok(withdrawnFrom, 'conversation_withdrawn_from exists')
  return { constraints, indexes, withdrawnFrom, functions, relations, triggers, policies, grants, rows }
}

/** A project with conversations on, and a conversation whose `asks` messages each asked Sophia (each a request). */
async function conversationWithAsks(db: TestDatabase, pool: pg.Pool, asks: number) {
  const { projectId } = await seedProject(db.ownerUrl, { admin: A, editors: [E] })
  await query(db.ownerUrl, `SELECT sophia.set_conversation_settings($1, 'enabled', 'CON-01 N3 test')`, [projectId])
  const first = await withActor(pool, E, 'write', (c) =>
    startConversation(c, projectId, randomUUID(), { title: 'Ask', text: 'SYNTHETIC-ASK-1', askSophia: true }, 'Asker'),
  )
  const sent = [first]
  for (let i = 2; i <= asks; i++) {
    sent.push(
      await withActor(pool, E, 'write', (c) =>
        sendConversationMessage(
          c,
          first.conversationId,
          randomUUID(),
          { text: `SYNTHETIC-ASK-${String(i)}`, askSophia: true },
          'Asker',
        ),
      ),
    )
  }
  const replies = sent.map((r) => {
    assert.ok(r.replyId)
    return r.replyId
  })
  return { projectId, conversationId: first.conversationId, messages: sent.map((r) => r.messageId), replies }
}

/** Puts a request in a state with the settled time that state takes once the candidate holds (an answer for answered). */
async function put(url: string, reply: string, state: State, reason: string | null, answer: string | null = null) {
  await query(
    url,
    `UPDATE sophia.conversation_replies SET state=$2, reason=$3, answer_id=$4,
       settled_at=CASE WHEN $5 THEN clock_timestamp() END WHERE id=$1`,
    [reply, state, reason, answer, ENDED.includes(state)],
  )
}

interface Reply {
  id: string
  state: string
  reason: string | null
  settled_at: string | null
  answer_id: string | null
}
const repliesOf = async (url: string, ids: string[]) =>
  query<Reply>(
    url,
    `SELECT id, state, reason, settled_at::text, answer_id FROM sophia.conversation_replies WHERE id = ANY($1)`,
    [ids],
  ).then((rows) => new Map(rows.map((r) => [r.id, r])))
const bodiesOf = async (url: string, conversationId: string) =>
  query<{ seq: string; author: string; body: string | null; withdrawn_by: string | null }>(
    url,
    `SELECT seq::text, author, body, withdrawn_by FROM sophia.conversation_messages WHERE conversation_id=$1 ORDER BY seq`,
    [conversationId],
  )

/** Whether the reply table takes a request in `state`, settled or not: tried in the caller's transaction, undone at once. */
async function takes(
  c: pg.Client,
  a: { projectId: string; reply: string | undefined; state: State; settled: boolean; answer: string | null },
): Promise<boolean> {
  await c.query('SAVEPOINT pair')
  try {
    await c.query(
      `UPDATE sophia.conversation_replies SET state=$2, reason=NULL, answer_id=$3,
         settled_at=CASE WHEN $4 THEN clock_timestamp() END WHERE project_id=$5 AND id=$1`,
      [a.reply, a.state, a.answer, a.settled, a.projectId],
    )
    return true
  } catch (err) {
    assert.ok(err instanceof pg.DatabaseError && err.code === '23514', String(err))
    return false
  } finally {
    await c.query('ROLLBACK TO SAVEPOINT pair')
  }
}

describe('CON-01 N3: a reply request’s terminal set, in SQL', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let pre: Identities
  let post: Identities

  before(async () => {
    db = await createTestDatabase()
    pool = createPool(db.apiUrl, { max: 4 })
    pre = await identities(db.ownerUrl)
    await query(db.ownerUrl, CANDIDATE)
    post = await identities(db.ownerUrl)
  })
  after(async () => {
    await pool.end()
    await db.drop()
  })

  describe('its footprint, recorded before and after it', () => {
    it('replaces only the settled-time CHECK, under the same name; every other constraint is 0048’s', (t) => {
      assert.deepEqual(
        settledCheck(pre).map((c) => c.def),
        [SETTLED_BEFORE],
      )
      assert.deepEqual(
        settledCheck(post).map((c) => c.def),
        [SETTLED_AFTER],
      )
      assert.deepEqual(
        settledCheck(post).map((c) => c.conname),
        settledCheck(pre).map((c) => c.conname),
      )
      assert.deepEqual(otherConstraints(post), otherConstraints(pre))
      t.diagnostic(`settled CHECK ${settledCheck(pre)[0]?.conname ?? ''}: ${SETTLED_BEFORE} -> ${SETTLED_AFTER}`)
    })

    it('keeps the open index plain (not unique) under its name and columns, its predicate pending and running only', (t) => {
      assert.deepEqual(openIndex(pre), { name: OPEN_INDEX, def: INDEX_BEFORE, unique: false })
      assert.deepEqual(openIndex(post), { name: OPEN_INDEX, def: INDEX_AFTER, unique: false })
      assert.deepEqual(otherIndexes(post), otherIndexes(pre))
      // The by-id and per-message uniqueness stay as 0048 made them.
      assert.deepEqual(
        otherIndexes(post).map((i) => [i.name, i.unique]),
        [
          ['sophia.conversation_replies_by_id', true],
          ['sophia.conversation_replies_pkey', true],
          ['sophia.conversation_replies_project_id_message_id_key', true],
        ],
      )
      t.diagnostic(`open index: ${INDEX_BEFORE} -> ${INDEX_AFTER}`)
    })

    it('changes conversation_withdrawn_from in its open set only; owner, SECURITY DEFINER, search_path and privileges stay', (t) => {
      assert.equal(pre.withdrawnFrom.src.split(OPEN_BEFORE).length, 2, '0048’s body names the open set once')
      assert.equal(post.withdrawnFrom.src, pre.withdrawnFrom.src.replace(OPEN_BEFORE, OPEN_AFTER))
      assert.deepEqual(
        { ...post.withdrawnFrom, src: '' },
        { ...pre.withdrawnFrom, src: '' },
        'owner, SECURITY DEFINER, search_path and ACL unchanged',
      )
      assert.equal(post.withdrawnFrom.secdef, true)
      assert.equal(post.withdrawnFrom.config, 'search_path=pg_catalog, sophia')
      t.diagnostic(
        `conversation_withdrawn_from acl ${post.withdrawnFrom.acl ?? 'null'}, owner ${post.withdrawnFrom.owner}`,
      )
    })

    it('adds or changes nothing else: functions, relations, triggers, policies, grants and every table’s rows', () => {
      assert.deepEqual(
        post.functions.map((f) => f.sig),
        pre.functions.map((f) => f.sig),
        'no function added or removed',
      )
      assert.deepEqual(otherFunctions(post), otherFunctions(pre), 'no other function changed')
      assert.deepEqual(post.relations, pre.relations)
      assert.deepEqual(post.triggers, pre.triggers)
      assert.deepEqual(post.policies, pre.policies)
      assert.deepEqual(post.grants, pre.grants)
      assert.deepEqual(post.rows, pre.rows, 'no row inserted, changed away or removed')
      for (const table of OPERATIONAL) {
        assert.equal(post.rows.find((r) => r.relname === table)?.n, '0', `no ${table} row`)
      }
    })

    it('lets none of PUBLIC, sophia_api and sophia_worker execute the replaced helper, as before', async () => {
      for (const role of ['public', 'sophia_api', 'sophia_worker']) {
        const [row] = await query<{ can: boolean }>(
          db.ownerUrl,
          `SELECT has_function_privilege($1, '${WITHDRAWN_FROM}'::regprocedure, 'EXECUTE') AS can`,
          [role],
        )
        assert.equal(row?.can, false, `${role} cannot execute it`)
      }
      const args = [randomUUID(), randomUUID(), 1, 'source_withdrawn']
      const call = `SELECT sophia.conversation_withdrawn_from($1, $2, $3, $4)`
      assert.equal(await codeOf(query(db.apiUrl, call, args)), '42501')
      assert.equal(await codeOf(query(db.workerUrl, call, args)), '42501')
    })
  })

  it('gives every terminal state its settled time and an open one none: all fourteen pairs', async () => {
    const { projectId, replies, messages } = await conversationWithAsks(db, pool, 1)
    const [reply] = replies
    const c = new pg.Client({ connectionString: db.ownerUrl })
    await c.connect()
    const accepted: Record<string, boolean> = {}
    try {
      await c.query('BEGIN')
      for (const state of STATES) {
        for (const settled of [false, true]) {
          const answer = state === 'answered' ? (messages[0] ?? null) : null
          accepted[`${state}/${settled ? 'settled' : 'open'}`] = await takes(c, {
            projectId,
            reply,
            state,
            settled,
            answer,
          })
        }
      }
      await c.query('ROLLBACK')
    } finally {
      await c.end()
    }
    const expected: Record<string, boolean> = {}
    for (const state of STATES) {
      const ended = ENDED.includes(state)
      expected[`${state}/open`] = !ended
      expected[`${state}/settled`] = ended
    }
    assert.deepEqual(accepted, expected)
  })

  it('a withdrawal cancels pending and running; every ended request, outcome_unknown included, stays as it ended', async () => {
    const { projectId, conversationId, messages, replies } = await conversationWithAsks(db, pool, 7)
    const [blocked, pending, running, uncertain, answered, failed, cancelled] = replies as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ]
    await put(db.ownerUrl, pending, 'pending', null)
    await put(db.ownerUrl, running, 'running', null)
    await assert.doesNotReject(
      put(db.ownerUrl, uncertain, 'outcome_unknown', 'runtime_failed'),
      'an outcome_unknown request is written with its settled time',
    )
    const [answer] = await query<{ id: string }>(
      db.ownerUrl,
      `SELECT (sophia.conversation_append($1, $2, 'sophia', NULL, NULL, 'SYNTHETIC-ANSWER', $3)).id AS id`,
      [projectId, conversationId, answered],
    )
    await put(db.ownerUrl, answered, 'answered', null, answer?.id ?? null)
    await put(db.ownerUrl, failed, 'failed', 'turn_error')
    await put(db.ownerUrl, cancelled, 'cancelled', 'grant_disabled')
    const was = await repliesOf(db.ownerUrl, replies)

    // The first asking message withdrawn by its author: every request read from it on.
    await withActor(pool, E, 'write', (c) =>
      withdrawConversationMessage(c, conversationId, messages[0] ?? '', randomUUID()),
    )
    const once = await repliesOf(db.ownerUrl, replies)
    for (const id of [pending, running]) {
      assert.equal(once.get(id)?.state, 'cancelled')
      assert.equal(once.get(id)?.reason, 'source_withdrawn')
      assert.ok(once.get(id)?.settled_at)
    }
    for (const id of [blocked, uncertain, answered, failed, cancelled]) {
      assert.deepEqual(once.get(id), was.get(id), 'an ended request is not moved, revived or re-settled')
    }
    // What it scrubs is unchanged: the withdrawn member's text, and Sophia's answer whose context reached it.
    const bodies = await bodiesOf(db.ownerUrl, conversationId)
    assert.deepEqual(
      bodies.map((m) => [m.seq, m.author, m.body, m.withdrawn_by]),
      [
        ['1', 'member', null, 'author'],
        ...[2, 3, 4, 5, 6, 7].map((n) => [String(n), 'member', `SYNTHETIC-ASK-${String(n)}`, null]),
        ['8', 'sophia', null, 'source'],
      ],
    )

    // A second withdrawal reaches none of them again: what ended, and what the first cancelled, stays.
    await withActor(pool, E, 'write', (c) =>
      withdrawConversationMessage(c, conversationId, messages[2] ?? '', randomUUID()),
    )
    assert.deepEqual(await repliesOf(db.ownerUrl, replies), once)
  })

  it('an erasure cancels only what is open, and every member’s text goes', async () => {
    const { conversationId, replies } = await conversationWithAsks(db, pool, 4)
    const [pending, running, uncertain, failed] = replies as [string, string, string, string]
    await put(db.ownerUrl, pending, 'pending', null)
    await put(db.ownerUrl, running, 'running', null)
    await assert.doesNotReject(put(db.ownerUrl, uncertain, 'outcome_unknown', 'runtime_failed'))
    await put(db.ownerUrl, failed, 'failed', 'turn_error')
    const was = await repliesOf(db.ownerUrl, replies)
    await withActor(pool, A, 'write', (c) => eraseConversation(c, conversationId, randomUUID()))
    const now = await repliesOf(db.ownerUrl, replies)
    for (const id of [pending, running]) {
      assert.equal(now.get(id)?.state, 'cancelled')
      assert.equal(now.get(id)?.reason, 'conversation_erased')
    }
    assert.deepEqual(now.get(uncertain), was.get(uncertain))
    assert.deepEqual(now.get(failed), was.get(failed))
    const bodies = await bodiesOf(db.ownerUrl, conversationId)
    assert.equal(bodies.length, 4)
    assert.ok(bodies.every((m) => m.body === null && m.withdrawn_by === 'admin'))
  })

  it('wrote no row of the runtime or the model', async () => {
    const rows = (await identities(db.ownerUrl)).rows
    for (const table of OPERATIONAL) assert.equal(rows.find((r) => r.relname === table)?.n, '0', `no ${table} row`)
  })
})

describe('CON-01 N3: over rows written before it, and taken back', () => {
  let db: TestDatabase
  let pool: pg.Pool
  let pre: Identities
  let seeded: { replies: string[]; asked: string[] }
  const snapshot = async () =>
    query<{ r: unknown }>(db.ownerUrl, `SELECT to_jsonb(r) AS r FROM sophia.conversation_replies r ORDER BY id`)

  before(async () => {
    db = await createTestDatabase()
    pool = createPool(db.apiUrl, { max: 4 })
    // Before the candidate: a request in each state 0048 allows with its settled time (G1 itself writes only blocked).
    const { projectId, conversationId, messages, replies } = await conversationWithAsks(db, pool, 6)
    const [, pending, running, answered, failed, cancelled] = replies as [
      string,
      string,
      string,
      string,
      string,
      string,
    ]
    await put(db.ownerUrl, pending, 'pending', null)
    await put(db.ownerUrl, running, 'running', null)
    const [answer] = await query<{ id: string }>(
      db.ownerUrl,
      `SELECT (sophia.conversation_append($1, $2, 'sophia', NULL, NULL, 'SYNTHETIC-ANSWER', $3)).id AS id`,
      [projectId, conversationId, answered],
    )
    await put(db.ownerUrl, answered, 'answered', null, answer?.id ?? null)
    await put(db.ownerUrl, failed, 'failed', 'turn_error')
    await put(db.ownerUrl, cancelled, 'cancelled', 'grant_disabled')
    seeded = { replies, asked: messages }
    pre = await identities(db.ownerUrl)
  })
  after(async () => {
    await pool.end()
    await db.drop()
  })

  it('applies over them, changing none, and each satisfies 0048’s settled-time rule and the candidate’s', async () => {
    const was = await snapshot()
    assert.equal(was.length, seeded.replies.length)
    await query(db.ownerUrl, CANDIDATE)
    assert.deepEqual(await snapshot(), was)
    for (const rule of [SETTLED_BEFORE, SETTLED_AFTER]) {
      const [row] = await query<{ n: string }>(
        db.ownerUrl,
        `SELECT count(*)::text AS n FROM sophia.conversation_replies WHERE NOT (${rule.replace(/^CHECK /, '')})`,
      )
      assert.equal(row?.n, '0', rule)
    }
  })

  it('taken back to 0048’s definitions while no outcome_unknown is written, its identities are 0048’s again and the rows unchanged', async () => {
    const was = await snapshot()
    const settled = pre.constraints.find((c) => c.def === SETTLED_BEFORE)
    assert.ok(settled)
    await query(
      db.ownerUrl,
      `ALTER TABLE sophia.conversation_replies DROP CONSTRAINT ${settled.conname}, ADD CONSTRAINT ${settled.conname} ${SETTLED_BEFORE};
       DROP INDEX sophia.conversation_replies_open; ${INDEX_BEFORE};
       CREATE OR REPLACE FUNCTION ${WITHDRAWN_FROM.replace('(uuid,uuid,bigint,text)', '(p_project uuid, p_conversation uuid, p_seq bigint, p_reason text)')}
       RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sophia AS $body$${pre.withdrawnFrom.src}$body$;`,
    )
    const back = await identities(db.ownerUrl)
    assert.deepEqual(back, pre)
    assert.deepEqual(await snapshot(), was)
  })

  it('is refused over a request 0048 recorded as an open outcome_unknown, and changes nothing', async () => {
    const [, pending] = seeded.replies
    await query(
      db.ownerUrl,
      `UPDATE sophia.conversation_replies SET state='outcome_unknown', reason=NULL WHERE id=$1`,
      [pending],
    )
    const was = await snapshot()
    assert.equal(await codeOf(query(db.ownerUrl, CANDIDATE)), '55000')
    assert.deepEqual(await identities(db.ownerUrl), pre)
    assert.deepEqual(await snapshot(), was)
  })
})
