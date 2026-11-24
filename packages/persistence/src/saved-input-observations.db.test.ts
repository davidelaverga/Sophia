// Durable deterministic metadata on disposable PG only; no provider, dispatch, hidden corpus or actual admission.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, after, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { withActor } from './tx.ts'
import { removeMember } from './activity.ts'
import { startConversationInput } from './conversation-inputs.ts'
import { sendAddressedConversationInput } from './conversation-input-addressing.ts'
import { observeAddressedConversationInput, type AddressedInputObservation } from './addressed-input-observation.ts'
import { recordAddressedInputObservation, type SavedInputObservation } from './saved-input-observations.ts'
import { withdrawConversationMessage, eraseConversation } from './conversations.ts'

let db: TestDatabase, api: pg.Pool, owner: pg.Pool
const key = randomUUID
const sqlstate = (error: unknown) =>
  error instanceof Error && typeof error.cause === 'object' && error.cause !== null && 'code' in error.cause
    ? error.cause.code
    : typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined
const refused = (code: string) => (error: unknown) => sqlstate(error) === code
before(async () => {
  db = await createTestDatabase(undefined, { assembler: true })
  api = new pg.Pool({ connectionString: db.apiUrl, max: 4, statement_timeout: 5000, connectionTimeoutMillis: 5000 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, statement_timeout: 5000, connectionTimeoutMillis: 5000 })
})
after(async () => {
  await api?.end()
  await owner?.end()
  await db?.drop()
})
async function world(text = 'Public synthetic retained discussion.') {
  const admin = key(),
    sender = key(),
    recipient = key(),
    author = key()
  const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [sender, author], viewers: [recipient] })
  await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','0124 fixture')", [projectId])
  const target = await withActor(api, author, 'write', (c) =>
    startConversationInput(
      c,
      projectId,
      key(),
      { contract: 'automatic_v1', title: 'Synthetic', text: 'Private-to-fixture target body must not be copied.' },
      null,
    ),
  )
  const input = await withActor(api, sender, 'write', (c) =>
    sendAddressedConversationInput(
      c,
      target.conversationId,
      key(),
      {
        interactionContract: 'automatic_v1',
        addressingVersion: 1,
        text,
        mentions: [recipient],
        replyToMessageId: target.messageId,
      },
      null,
    ),
  )
  return {
    admin,
    sender,
    recipient,
    author,
    projectId,
    target,
    input,
    scope: { projectId, conversationId: input.conversationId, inputId: input.inputId },
  }
}
type World = Awaited<ReturnType<typeof world>>
const record = (w: World, actor = w.sender) => recordAddressedInputObservation(api, actor, w.scope)
const observe = (w: World) => observeAddressedConversationInput(api, w.sender, w.scope)
const write = (w: World, payload: unknown, actor = w.sender) =>
  withActor(
    api,
    actor,
    'write',
    async (c) =>
      (
        await c.query<{ receipt: SavedInputObservation | null }>(
          'SELECT sophia.record_saved_conversation_input_observation($1,$2,$3,$4::jsonb) AS receipt',
          [
            w.projectId,
            w.input.conversationId,
            w.input.inputId,
            payload === undefined ? null : JSON.stringify(payload),
          ],
        )
      ).rows[0]?.receipt,
  )
const count = async (w: World) =>
  (
    await owner.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sophia.saved_conversation_input_observations WHERE project_id=$1',
      [w.projectId],
    )
  ).rows[0]?.n
const remove = (w: World, target: string) =>
  withActor(api, w.admin, 'write', (c) => removeMember(c, w.projectId, target, key()))
async function prepared(w: World): Promise<AddressedInputObservation> {
  const value = await observe(w)
  assert.ok(value)
  return value
}
const settled = (p: Promise<unknown>) =>
  Promise.race([
    p.then(
      () => true,
      () => true,
    ),
    new Promise<boolean>((r) => setTimeout(() => r(false), 100)),
  ])

it('records immutable typed metadata once; replay returns original without fresh read/policy and no effects', async () => {
  const w = await world(),
    first = await record(w)
  assert.equal(first.state, 'observed')
  assert.equal(first.effect, 'none')
  assert.equal(first.schemaVersion, 1)
  assert.equal(first.payload.source.inputId, w.input.inputId)
  assert.equal(first.payload.observation.provenance.correlation, w.input.inputId)
  assert.equal(first.payload.observation.admission.authority, 'none')
  assert.equal(first.context.audienceKind, 'project_members')
  assert.equal(
    first.context.audienceRevision,
    (await owner.query('SELECT audience_revision::text AS n FROM sophia.projects WHERE id=$1', [w.projectId])).rows[0]
      ?.n,
  )
  assert.ok(!JSON.stringify(first).includes('Public synthetic retained discussion.'))
  assert.ok(!JSON.stringify(first).includes('Private-to-fixture target body'))
  assert.deepEqual(await record(w), first)
  // The definer can validate the context, but a fresh application read cannot execute after this temporary fixture revoke.
  await owner.query(
    'REVOKE EXECUTE ON FUNCTION sophia.read_saved_conversation_input_context(uuid,uuid,uuid) FROM sophia_api',
  )
  try {
    assert.deepEqual(await record(w), first)
  } finally {
    await owner.query(
      'GRANT EXECUTE ON FUNCTION sophia.read_saved_conversation_input_context(uuid,uuid,uuid) TO sophia_api',
    )
  }
  assert.deepEqual(await write(w, { policy: 'future_policy_not_to_be_interpreted' }), first)
  assert.equal(await count(w), 1)
  for (const table of [
    'contribution_mentions',
    'viewer_attention',
    'conversation_replies',
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
      (await owner.query(`SELECT count(*)::int AS n FROM sophia.${table} WHERE project_id=$1`, [w.projectId])).rows[0]
        ?.n,
      0,
      table,
    )
})
it('serializes concurrent creators to one exact receipt and record', async () => {
  const w = await world()
  const [a, b] = await Promise.all([record(w), record(w)])
  assert.deepEqual(a, b)
  assert.equal(await count(w), 1)
})
it('rejects cross-actor/current viewer even on replay, and hides stale records without changing retained metadata', async () => {
  const w = await world()
  const first = await record(w)
  for (const actor of [w.recipient, w.author, w.admin]) await assert.rejects(record(w, actor), refused('42501'))
  await owner.query("UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2", [
    w.projectId,
    w.sender,
  ])
  await assert.rejects(record(w), refused('42501'))
  assert.equal(await count(w), 1)
  assert.equal(first.payload.observation.policy, 'sophia.intake-observation.policy.v26')
})
it('revalidates actual removal, origin/target withdrawal and erasure after preparation before insertion/replay', async () => {
  const mention = await world(),
    m = await prepared(mention)
  await remove(mention, mention.recipient)
  await assert.rejects(write(mention, m), refused('22023'))
  assert.equal(await count(mention), 0)
  const origin = await world(),
    o = await prepared(origin)
  await withActor(api, origin.sender, 'write', (c) =>
    withdrawConversationMessage(c, origin.input.conversationId, origin.input.messageId, key()),
  )
  await assert.rejects(write(origin, o), refused('22023'))
  assert.equal(await count(origin), 0)
  const target = await world(),
    t = await prepared(target)
  await record(target)
  await withActor(api, target.author, 'write', (c) =>
    withdrawConversationMessage(c, target.target.conversationId, target.target.messageId, key()),
  )
  await assert.rejects(write(target, t), refused('22023'))
  assert.equal(await count(target), 1)
  assert.equal(
    (
      await withActor(api, target.sender, 'read', (c) =>
        c.query('SELECT id FROM sophia.saved_conversation_input_observations WHERE project_id=$1', [target.projectId]),
      )
    ).rowCount,
    0,
  )
  const erased = await world()
  await record(erased)
  await withActor(api, erased.admin, 'write', (c) => eraseConversation(c, erased.input.conversationId, key()))
  await assert.rejects(record(erased), refused('22023'))
  assert.equal(await count(erased), 1)
})
it('rejects stale source revisions, wrong digest, spoofed provenance, raw body/authority/effect fields and JSON null without partial rows', async () => {
  const w = await world(),
    payload = await prepared(w)
  const changes = [
    (p: AddressedInputObservation) => ({
      ...p,
      observation: { ...p.observation, policy: 'future_policy_not_installed' },
    }),
    (p: AddressedInputObservation) => ({ ...p, source: { ...p.source, observedConversationRevision: '0' } }),
    (p: AddressedInputObservation) => ({ ...p, observation: { ...p.observation, inputSha256: 'a'.repeat(64) } }),
    (p: AddressedInputObservation) => ({
      ...p,
      observation: { ...p.observation, provenance: { ...p.observation.provenance, origin: 'generated' } },
    }),
    (p: AddressedInputObservation) => ({
      ...p,
      observation: { ...p.observation, admission: { ...p.observation.admission, authority: 'permit' } },
    }),
    (p: AddressedInputObservation) => ({
      ...p,
      observation: { ...p.observation, effects: { ...p.observation.effects, providerInferences: 1 } },
    }),
    (p: AddressedInputObservation) => ({ ...p, rawBody: 'not metadata' }),
  ]
  for (const change of changes) await assert.rejects(write(w, change(payload)), refused('22023'))
  await assert.rejects(write(w, null), refused('22023'))
  assert.equal(await count(w), 0)
  assert.ok(await record(w))
})
it('rollback releases parent locks and leaves no partial row; following caller can finish', async () => {
  const w = await world()
  const client = await api.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('sophia.actor_id',$1,true)", [w.sender])
    await client.query('SELECT sophia.record_saved_conversation_input_observation($1,$2,$3,NULL)', [
      w.projectId,
      w.input.conversationId,
      w.input.inputId,
    ])
    const next = record(w)
    assert.equal(await settled(next), false)
    assert.equal(await count(w), 0)
    await client.query('ROLLBACK')
    assert.ok(await next)
    assert.equal(await count(w), 1)
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
})
it('waiting writer sees a normal committed member removal after the project lock, instead of stale eligibility', async () => {
  const w = await world()
  const payload = await prepared(w)
  const removing = await api.connect()
  try {
    await removing.query('BEGIN')
    await removing.query("SELECT set_config('sophia.actor_id',$1,true)", [w.admin])
    await removeMember(removing, w.projectId, w.recipient, key())
    const pending = write(w, payload)
    const rejection = assert.rejects(pending, refused('22023'))
    assert.equal(await settled(pending), false)
    await removing.query('COMMIT')
    await rejection
    assert.equal(await count(w), 0)
  } finally {
    await removing.query('ROLLBACK')
    removing.release()
  }
})
it('a stale repeatable write snapshot serializes rather than recording removed-member context', async () => {
  const w = await world()
  const client = await api.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    await client.query("SELECT set_config('sophia.actor_id',$1,true)", [w.sender])
    await client.query('SELECT * FROM sophia.read_saved_conversation_input_context($1,$2,$3)', [
      w.projectId,
      w.input.conversationId,
      w.input.inputId,
    ])
    await remove(w, w.recipient)
    await assert.rejects(
      client.query('SELECT sophia.record_saved_conversation_input_observation($1,$2,$3,NULL)', [
        w.projectId,
        w.input.conversationId,
        w.input.inputId,
      ]),
      refused('40001'),
    )
    await client.query('ROLLBACK')
    assert.equal(await count(w), 0)
  } finally {
    await client.query('ROLLBACK')
    client.release()
  }
})
it('API has no direct writes, worker/assembler cannot read/write, helpers stay invoker/private and metadata is immutable', async () => {
  const w = await world()
  await record(w)
  await assert.rejects(
    withActor(api, w.sender, 'write', (c) =>
      c.query('UPDATE sophia.saved_conversation_input_observations SET payload=payload WHERE project_id=$1', [
        w.projectId,
      ]),
    ),
    refused('42501'),
  )
  await assert.rejects(
    owner.query('UPDATE sophia.saved_conversation_input_observations SET payload=payload WHERE project_id=$1', [
      w.projectId,
    ]),
    refused('55000'),
  )
  for (const url of [db.workerUrl, db.assemblerUrl]) {
    assert.ok(url)
    const pool = new pg.Pool({ connectionString: url })
    try {
      await assert.rejects(
        withActor(pool, w.sender, 'read', (c) => c.query('SELECT * FROM sophia.saved_conversation_input_observations')),
        refused('42501'),
      )
      await assert.rejects(recordAddressedInputObservation(pool, w.sender, w.scope), refused('42501'))
    } finally {
      await pool.end()
    }
  }
  const acl = (
    await owner.query(
      "SELECT prosecdef,proconfig,has_function_privilege('public',oid,'EXECUTE') AS public FROM pg_proc WHERE oid='sophia.read_saved_conversation_input_context(uuid,uuid,uuid)'::regprocedure",
    )
  ).rows[0]
  assert.equal(acl?.prosecdef, false)
  assert.equal(acl?.public, false)
  assert.deepEqual(acl?.proconfig, ['search_path=pg_catalog, sophia, pg_temp'])
})
it('validates complete supplementary input transiently and retains no duplicate body-derived digest, even after withdrawal', async () => {
  const w = await world('😀'.repeat(4000)),
    transient = await prepared(w)
  const semantic = async () =>
    (
      await owner.query<{ semantic_request: unknown }>(
        'SELECT semantic_request FROM sophia.conversation_requests WHERE project_id=$1 AND message_id=$2',
        [w.projectId, w.input.messageId],
      )
    ).rows[0]?.semantic_request
  const original = await semantic()
  const result = await record(w)
  assert.deepEqual(await semantic(), original)
  const retained = async () =>
    (
      await owner.query<{ value: unknown }>(
        'SELECT to_jsonb(o) AS value FROM sophia.saved_conversation_input_observations o WHERE project_id=$1',
        [w.projectId],
      )
    ).rows[0]?.value
  const stored = JSON.stringify(await retained())
  assert.ok(typeof stored === 'string')
  assert.ok(!stored.includes(transient.observation.inputSha256))
  assert.ok(!stored.includes(transient.observation.observationId))
  for (const field of ['content_sha256', 'contentSha256', 'inputSha256', 'observationId', '😀'])
    assert.ok(!stored.includes(field), field)
  assert.ok(!JSON.stringify(result).includes('inputSha256'))
  await withActor(api, w.sender, 'write', (c) =>
    withdrawConversationMessage(c, w.input.conversationId, w.input.messageId, key()),
  )
  assert.deepEqual(await semantic(), { redacted: true })
  assert.equal(JSON.stringify(await retained()), stored)
  assert.equal(await count(w), 1)
})

it('rejects an otherwise valid earlier observation after a normal later message advances the context revision', async () => {
  const w = await world(),
    payload = await prepared(w)
  await withActor(api, w.sender, 'write', (c) =>
    sendAddressedConversationInput(
      c,
      w.input.conversationId,
      key(),
      {
        interactionContract: 'automatic_v1',
        addressingVersion: 1,
        text: 'Another public synthetic message.',
        mentions: [],
        replyToMessageId: null,
      },
      null,
    ),
  )
  await assert.rejects(write(w, payload), refused('22023'))
  assert.equal(await count(w), 0)
  const fresh = await record(w)
  assert.notEqual(fresh.payload.source.observedConversationRevision, payload.source.observedConversationRevision)
})

it('durably records a valid ordinary unrecognized input as exact abstain with no effect', async () => {
  const w = await world()
  const input = await withActor(api, w.sender, 'write', (c) =>
    sendAddressedConversationInput(
      c,
      w.input.conversationId,
      key(),
      {
        interactionContract: 'automatic_v1',
        addressingVersion: 1,
        text: 'Mauve pelicans orbit the marzipan telescope.',
        mentions: [],
        replyToMessageId: null,
      },
      null,
    ),
  )
  const recorded = await recordAddressedInputObservation(api, w.sender, {
    projectId: w.projectId,
    conversationId: input.conversationId,
    inputId: input.inputId,
  })
  assert.equal(recorded.payload.observation.proposal.kind, 'abstain')
  assert.equal(recorded.payload.observation.proposal.rule, 'abstain')
  assert.equal(recorded.effect, 'none')
  for (const table of ['conversation_replies', 'work_attempts', 'commands', 'outbox', 'viewer_attention'])
    assert.equal(
      (await owner.query(`SELECT count(*)::int AS n FROM sophia.${table} WHERE project_id=$1`, [w.projectId])).rows[0]
        ?.n,
      0,
      table,
    )
  assert.ok(Object.values(recorded.payload.observation.effects).every((n) => n === 0))
  assert.equal(await count(w), 1)
})

it('rolls back a completed insert on a surrounding application failure and permits one later recovery', async () => {
  const w = await world(),
    payload = await prepared(w)
  const syntheticFailure = new Error('Synthetic application failure after insert')
  await assert.rejects(
    withActor(api, w.sender, 'write', async (c) => {
      const inserted = await c.query('SELECT sophia.record_saved_conversation_input_observation($1,$2,$3,$4::jsonb)', [
        w.projectId,
        w.input.conversationId,
        w.input.inputId,
        JSON.stringify(payload),
      ])
      assert.equal(inserted.rowCount, 1)
      throw syntheticFailure
    }),
    (error) => error instanceof Error && error.cause === syntheticFailure,
  )
  assert.equal(await count(w), 0)
  assert.ok(await record(w))
  assert.equal(await count(w), 1)
})
