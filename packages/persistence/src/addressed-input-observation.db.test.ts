// Real authenticated PG reads into v26 with public synthetic input only: no ledger, native or provider effects.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, after, it } from 'node:test'
import pg from 'pg'
import { observeIntake } from '@sophia/coordination'
import { createTestDatabase, seedProject, type TestDatabase } from '@sophia/test-support'
import { withActor } from './tx.ts'
import { startConversationInput } from './conversation-inputs.ts'
import { sendAddressedConversationInput, startAddressedConversationInput } from './conversation-input-addressing.ts'
import { observeAddressedConversationInput } from './addressed-input-observation.ts'
import { withdrawConversationMessage, eraseConversation } from './conversations.ts'

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
async function world(mentions = true, text = 'Please review this synthetic note.') {
  const admin = key(),
    sender = key(),
    recipient = key(),
    author = key()
  const { projectId } = await seedProject(db.ownerUrl, { admin, editors: [sender, author], viewers: [recipient] })
  await owner.query("SELECT sophia.set_conversation_settings($1,'enabled','Synthetic observation fixture')", [
    projectId,
  ])
  const target = await withActor(api, author, 'write', (c) =>
    startConversationInput(
      c,
      projectId,
      key(),
      { contract: 'automatic_v1', title: 'Synthetic', text: 'Do not copy this target body.' },
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
        mentions: mentions ? [recipient] : [],
        replyToMessageId: target.messageId,
      },
      null,
    ),
  )
  return {
    projectId,
    admin,
    sender,
    recipient,
    author,
    target,
    input,
    scope: { projectId, conversationId: input.conversationId, inputId: input.inputId },
  }
}
type World = Awaited<ReturnType<typeof world>>
const observe = (w: World, actor = w.sender) => observeAddressedConversationInput(api, actor, w.scope)
const remove = (w: World, actor: string) =>
  owner.query('UPDATE sophia.project_members SET active=false WHERE project_id=$1 AND actor_id=$2', [
    w.projectId,
    actor,
  ])
const snapshot = async (w: World) => {
  const tables = [
    'saved_conversation_inputs',
    'saved_conversation_input_addressing',
    'conversation_messages',
    'project_events',
    'contribution_mentions',
    'viewer_attention',
    'conversation_replies',
    'work_attempts',
    'execution_bindings',
    'commands',
    'outbox',
  ]
  return Promise.all(
    tables.map(async (table) => ({
      table,
      n: (await owner.query(`SELECT count(*)::int AS n FROM sophia.${table} WHERE project_id=$1`, [w.projectId]))
        .rows[0]?.n,
    })),
  )
}
it('observes exact retained human mentions once per read, correlated to the original input with no writes or raw text', async () => {
  const w = await world(),
    stateBefore = await snapshot(w)
  const first = await observe(w)
  assert.ok(first)
  assert.equal(first.observation.policy, 'sophia.intake-observation.policy.v26')
  assert.equal(first.observation.proposal.kind, 'human_message')
  assert.equal(first.observation.proposal.rule, 'address.human_directed')
  assert.deepEqual(first.observation.addressee, { ids: [w.recipient], basis: 'structured_mention' })
  assert.equal(first.source.inputId, w.input.inputId)
  assert.equal(first.source.actorId, w.sender)
  assert.equal(first.source.messageId, w.input.messageId)
  assert.equal(first.source.origin, 'text')
  assert.equal(first.observation.provenance.correlation, w.input.inputId)
  assert.equal(first.observation.provenance.origin, 'human')
  assert.equal(first.observation.provenance.humanInstruction, true)
  assert.equal(first.observation.admission.authority, 'none')
  assert.ok(!JSON.stringify(first).includes('Please review this synthetic note.'))
  assert.ok(!JSON.stringify(first).includes('Do not copy this target body.'))
  assert.ok(Object.values(first.observation.effects).every((n) => n === 0))
  assert.deepEqual(await observe(w), first)
  assert.deepEqual(await snapshot(w), stateBefore)
})
it('binds sender before observation: another viewer, target author and admin get no proposal; self remains eligible as viewer', async () => {
  const w = await world()
  for (const actor of [w.recipient, w.author, w.admin]) assert.equal(await observe(w, actor), null)
  await owner.query("UPDATE sophia.project_members SET role='viewer' WHERE project_id=$1 AND actor_id=$2", [
    w.projectId,
    w.sender,
  ])
  assert.ok(await observe(w))
  await remove(w, w.sender)
  assert.equal(await observe(w), null)
})
it('maps exact reply author when no mentions exist and refuses stale reply or recipient without fallback', async () => {
  const reply = await world(false)
  const observed = await observe(reply)
  assert.ok(observed)
  assert.deepEqual(observed.observation.addressee, { ids: [reply.author], basis: 'reply_target' })
  assert.deepEqual(observed.observation.proposal.target, { kind: 'message', id: reply.target.messageId })
  await withActor(api, reply.author, 'write', (c) =>
    withdrawConversationMessage(c, reply.target.conversationId, reply.target.messageId, key()),
  )
  assert.equal(await observe(reply), null)
  const mention = await world()
  await remove(mention, mention.recipient)
  assert.equal(await observe(mention), null)
  const author = await world(false)
  await remove(author, author.author)
  assert.equal(await observe(author), null)
})
it('withdrawn original text, erased thread, different project or thread and A49 source yield no proposal', async () => {
  const w = await world()
  assert.equal(await observeAddressedConversationInput(api, w.sender, { ...w.scope, inputId: w.target.inputId }), null)
  assert.equal(await observeAddressedConversationInput(api, w.sender, { ...w.scope, projectId: key() }), null)
  assert.equal(await observeAddressedConversationInput(api, w.sender, { ...w.scope, conversationId: key() }), null)
  await withActor(api, w.sender, 'write', (c) =>
    withdrawConversationMessage(c, w.input.conversationId, w.input.messageId, key()),
  )
  assert.equal(await observe(w), null)
  const erased = await world()
  await withActor(api, erased.admin, 'write', (c) => eraseConversation(c, erased.input.conversationId, key()))
  assert.equal(await observe(erased), null)
})
it('uses v26 for an actually retained 4000 supplementary-character input without truncation or effects', async () => {
  const text = '😀'.repeat(4000)
  const w = await world(true, text),
    stateBefore = await snapshot(w)
  const observed = await observe(w)
  assert.ok(observed)
  assert.deepEqual(observed.observation.addressee, { ids: [w.recipient], basis: 'structured_mention' })
  assert.equal(observed.observation.policy, 'sophia.intake-observation.policy.v26')
  const wholePayload = observeIntake({
    interaction: { contract: 'automatic_v1' },
    text,
    context: {
      audience: 'project',
      originalAudience: 'project',
      origin: 'human',
      operationId: w.input.inputId,
      trustedMentions: [w.recipient],
      currentMembers: [w.recipient, w.author],
      replyTo: w.target.messageId,
      replyAuthor: w.author,
    },
  })
  assert.ok(wholePayload.ok)
  assert.deepEqual(observed.observation, wholePayload.observation)
  assert.equal(
    (
      await owner.query('SELECT char_length(body)::int AS n FROM sophia.conversation_messages WHERE id=$1', [
        w.input.messageId,
      ])
    ).rows[0]?.n,
    4000,
  )
  assert.ok(!JSON.stringify(observed).includes('😀'))
  assert.deepEqual(await snapshot(w), stateBefore)
})
it('observes a retained start with no explicit addressing without inventing a Sophia or authority default', async () => {
  const w = await world()
  const first = await withActor(api, w.sender, 'write', (c) =>
    startAddressedConversationInput(
      c,
      w.projectId,
      key(),
      {
        interactionContract: 'automatic_v1',
        addressingVersion: 1,
        title: 'Synthetic',
        text: 'A neutral retained note.',
        mentions: [],
      },
      null,
    ),
  )
  const result = await observeAddressedConversationInput(api, w.sender, {
    projectId: w.projectId,
    conversationId: first.conversationId,
    inputId: first.inputId,
  })
  assert.ok(result)
  assert.deepEqual(result.observation.addressee.ids, [])
  assert.equal(result.observation.admission.authority, 'none')
})
