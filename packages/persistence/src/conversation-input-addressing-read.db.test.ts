// Authenticated read-only observation preparation: synthetic retained input, never an assessment or dispatch.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, after, it } from 'node:test'
import pg from 'pg'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { withActor } from './tx.ts'
import { startConversationInput } from './conversation-inputs.ts'
import {
  startAddressedConversationInput,
  sendAddressedConversationInput,
  readAddressedConversationInput,
} from './conversation-input-addressing.ts'
import { eraseConversation, withdrawConversationMessage, startConversation } from './conversations.ts'

let db: TestDatabase, api: pg.Pool, owner: pg.Pool
const key = randomUUID
before(async () => {
  db = await createTestDatabase(undefined, { assembler: false })
  api = new pg.Pool({ connectionString: db.apiUrl, statement_timeout: 5000, connectionTimeoutMillis: 5000 })
  owner = new pg.Pool({ connectionString: db.ownerUrl, statement_timeout: 5000, connectionTimeoutMillis: 5000 })
})
after(async () => {
  await api?.end()
  await owner?.end()
  await db?.drop()
})
async function world() {
  const admin = key(),
    writer = key(),
    member = key(),
    author = key()
  const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [writer, author], viewers: [member] })
  await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','Synthetic read fixture')", [projectId])
  const target = await withActor(api, author, 'write', (c) =>
    startConversationInput(
      c,
      projectId,
      key(),
      {
        contract: 'automatic_v1',
        title: 'Synthetic',
        text: 'Target body must never enter observation.',
      },
      null,
    ),
  )
  const input = await withActor(api, writer, 'write', (c) =>
    sendAddressedConversationInput(
      c,
      target.conversationId,
      key(),
      {
        interactionContract: 'automatic_v1',
        addressingVersion: 1,
        text: 'Original public synthetic input @untrusted',
        mentions: [member],
        replyToMessageId: target.messageId,
      },
      null,
    ),
  )
  return { projectId, admin, writer, member, author, target, input }
}
type World = Awaited<ReturnType<typeof world>>
const read = (w: World, actor = w.member) =>
  withActor(api, actor, 'read', (c) =>
    readAddressedConversationInput(c, w.projectId, w.input.conversationId, w.input.inputId),
  )
const remove = (w: World, actor: string) =>
  owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
    w.projectId,
    actor,
  ])

it('reads one exact retained addressed input through a viewer read transaction with no target body or writes', async () => {
  const w = await world()
  const eventsBefore = (
    await owner.query('SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id=$1', [w.projectId])
  ).rows
  const result = await read(w)
  assert.ok(result)
  assert.equal(result.inputId, w.input.inputId)
  assert.equal(result.actorId, w.writer)
  assert.equal(result.text, 'Original public synthetic input @untrusted')
  assert.deepEqual(result.mentions, [w.member])
  assert.deepEqual(result.replyTarget, { messageId: w.target.messageId, seq: '1', author: 'member', actorId: w.author })
  assert.ok(!JSON.stringify(result).includes('Target body'))
  assert.deepEqual(await read(w), result)
  assert.deepEqual(
    (await owner.query('SELECT count(*)::int AS n FROM sophia.project_events WHERE project_id=$1', [w.projectId])).rows,
    eventsBefore,
  )
  for (const table of [
    'contribution_mentions',
    'viewer_attention',
    'conversation_replies',
    'work_attempts',
    'execution_bindings',
    'commands',
    'outbox',
  ])
    assert.equal(
      (await owner.query(`SELECT count(*)::int AS n FROM sophia.${table} WHERE project_id=$1`, [w.projectId])).rows[0]
        ?.n,
      0,
      table,
    )
})
it('reads addressed start with no reply without guessing identities from text', async () => {
  const w = await world()
  const input = await withActor(api, w.writer, 'write', (c) =>
    startAddressedConversationInput(
      c,
      w.projectId,
      key(),
      {
        interactionContract: 'automatic_v1',
        addressingVersion: 1,
        title: 'Synthetic',
        text: '@Sophia and quoted @someone are text',
        mentions: [],
      },
      null,
    ),
  )
  const result = await withActor(api, w.member, 'read', (c) =>
    readAddressedConversationInput(c, w.projectId, input.conversationId, input.inputId),
  )
  assert.ok(result)
  assert.equal(result.replyTarget, null)
  assert.deepEqual(result.mentions, [])
})
it('refuses withdrawn originating text and erased conversation without returning partial content', async () => {
  const w = await world()
  await withActor(api, w.writer, 'write', (c) =>
    withdrawConversationMessage(c, w.input.conversationId, w.input.messageId, key()),
  )
  assert.equal(await read(w), null)
  const other = await world()
  await withActor(api, other.admin, 'write', (c) => eraseConversation(c, other.input.conversationId, key()))
  assert.equal(await read(other), null)
})
it('refuses exact target withdrawal despite a later visible message; it never substitutes', async () => {
  const w = await world()
  await withActor(api, w.author, 'write', (c) =>
    withdrawConversationMessage(c, w.target.conversationId, w.target.messageId, key()),
  )
  assert.equal(await read(w), null)
})
it('revalidates mention and target-author membership, without trimming either reference', async () => {
  const mention = await world()
  await remove(mention, mention.member)
  assert.equal(await read(mention, mention.admin), null)
  const target = await world()
  await remove(target, target.author)
  assert.equal(await read(target), null)
})
it('RLS refuses removed/nonmember readers and exact cross-project or cross-conversation scope', async () => {
  const w = await world(),
    other = await world()
  assert.equal(await read(w, other.member), null)
  await remove(w, w.member)
  assert.equal(await read(w), null)
  const wrong = (project: string, conversation: string) =>
    withActor(api, w.admin, 'read', (c) => readAddressedConversationInput(c, project, conversation, w.input.inputId))
  assert.equal(await wrong(other.projectId, w.input.conversationId), null)
  assert.equal(await wrong(w.projectId, other.input.conversationId), null)
})
it('never promotes an A49 unaddressed record into trusted addressing', async () => {
  const w = await world()
  assert.equal(
    await withActor(api, w.member, 'read', (c) =>
      readAddressedConversationInput(c, w.projectId, w.target.conversationId, w.target.inputId),
    ),
    null,
  )
})
it('gives no additional read capability to the worker role', async () => {
  const w = await world(),
    worker = new pg.Pool({ connectionString: db.workerUrl })
  try {
    await assert.rejects(
      withActor(worker, w.admin, 'read', (c) =>
        readAddressedConversationInput(c, w.projectId, w.input.conversationId, w.input.inputId),
      ),
      (error) =>
        error instanceof Error &&
        typeof error.cause === 'object' &&
        error.cause !== null &&
        'code' in error.cause &&
        error.cause.code === '42501',
    )
  } finally {
    await worker.end()
  }
})

it('does not reinterpret a legacy quiet message as an addressed automatic input', async () => {
  const w = await world()
  const legacy = await withActor(api, w.writer, 'write', (c) =>
    startConversation(
      c,
      w.projectId,
      key(),
      {
        title: 'Legacy synthetic',
        text: '@Someone remains legacy text',
        askSophia: false,
      },
      null,
    ),
  )
  assert.equal(
    (
      await owner.query(
        'SELECT count(*)::int AS n FROM sophia.saved_conversation_inputs WHERE project_id=$1 AND message_id=$2',
        [w.projectId, legacy.messageId],
      )
    ).rows[0]?.n,
    0,
  )
  assert.equal(
    await withActor(api, w.member, 'read', (c) =>
      readAddressedConversationInput(c, w.projectId, legacy.conversationId, legacy.messageId),
    ),
    null,
  )
})
