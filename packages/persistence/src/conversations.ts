// Saved project conversations (CON-01; db/migrations/0048, contract amendment A16). Reads run under the calling member
// and see only the projects they belong to (RLS); a conversation or message they cannot see answers as one that does
// not exist. Writes are sophia.* functions that check the caller's current role before an earlier request under the
// key is read, are idempotent per project, actor and key, and answer with a receipt of ids, never text: the API reads
// the records back under the caller, so a replay of a since-withdrawn message comes back withdrawn.
import type pg from 'pg'
import type {
  ConversationCapability,
  ConversationList,
  ConversationMessage,
  ConversationMessagePage,
  ConversationPolicy,
  ConversationReply,
  ConversationSummary,
  ProjectionCoverage,
} from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { safeInt } from './bigint.ts'
import { onlyRow } from './rows.ts'

/** Conversations a list holds: the newest by activity (`more` says when there are others). */
export const CONVERSATION_LIST_LIMIT = 200
/** Messages a page holds. */
export const CONVERSATION_PAGE_LIMIT = 50
/** A row's opening: the newest message's first characters, as written. */
export const CONVERSATION_OPENING = 140

/** The saved-text policy's notice (CON-01 binding map §5), shown before a first message. Davide's D-1 sets the words. */
export const CONVERSATION_NOTICE =
  'Messages here are saved for this project and can be read by its members. Live room audio is not saved here.'

/** The write receipt: ids only. */
export interface ConversationReceipt {
  conversationId: string
  messageId: string
  sophia: 'asked' | 'not_asked'
  replyId: string | null
}

export interface ConversationStartWrite {
  title: string
  text: string
  askSophia: boolean
}

export interface ConversationSendWrite {
  text: string
  askSophia: boolean
}

// ---------------------------------------------------------------------------------------------------------------------
// The page cursor: opaque to the client, bound to its conversation, never a permission.

const CURSOR = /^c1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([1-9][0-9]{0,15})$/

export const conversationCursor = (conversationId: string, seq: number) =>
  Buffer.from(`c1.${conversationId}.${seq}`).toString('base64url')

/** The seq a cursor reads before, refused unless it is well-formed and names this conversation. */
export function cursorSeq(conversationId: string, cursor: string): number {
  const decoded = /^[A-Za-z0-9_-]{1,200}$/.test(cursor) ? Buffer.from(cursor, 'base64url').toString('utf8') : ''
  const m = CURSOR.exec(decoded)
  if (!m || m[1] !== conversationId)
    throw new DomainError('invalid_request', 'This cursor is not one of this conversation’s')
  const seq = Number(m[2])
  if (!Number.isSafeInteger(seq))
    throw new DomainError('invalid_request', 'This cursor is not one of this conversation’s')
  return seq
}

// ---------------------------------------------------------------------------------------------------------------------
// Reads.

const NOT_ASSESSED: ProjectionCoverage = {
  state: 'not_assessed',
  complete: false,
  fromSeq: null,
  throughSeq: null,
  newer: 0,
  generatedAt: null,
  replyId: null,
  eligibilityRevision: null,
  ledgerRevision: null,
}

interface SummaryRow {
  id: string
  title: string
  revision: string
  last_at: Date
  contributors: { actorId: string; name: string | null }[]
  sophia: boolean
  last_author: 'member' | 'sophia' | null
  last_actor: string | null
  last_name: string | null
  last_text: string | null
  last_at_message: Date | null
}

// Contributors: members whose messages are not withdrawn, in the order they first wrote, named as their newest message
// carries it. Sophia: an answer of hers that is not withdrawn. The opening: the newest message not withdrawn.
const SUMMARIES = `SELECT c.id, c.title, c.revision, c.last_at,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('actorId', x.actor_id, 'name', x.name) ORDER BY x.first_seq), '[]')
       FROM (SELECT m.actor_id, min(m.seq) AS first_seq, (array_agg(m.author_name ORDER BY m.seq DESC))[1] AS name
               FROM sophia.conversation_messages m
              WHERE m.conversation_id = c.id AND m.author = 'member' AND m.withdrawn_at IS NULL
              GROUP BY m.actor_id) x) AS contributors,
    EXISTS (SELECT 1 FROM sophia.conversation_messages s
             WHERE s.conversation_id = c.id AND s.author = 'sophia' AND s.withdrawn_at IS NULL) AS sophia,
    l.author AS last_author, l.actor_id AS last_actor, l.author_name AS last_name,
    left(l.body, ${CONVERSATION_OPENING}) AS last_text, l.created_at AS last_at_message
  FROM sophia.conversations c
  LEFT JOIN LATERAL (SELECT author, actor_id, author_name, body, created_at FROM sophia.conversation_messages
                      WHERE conversation_id = c.id AND withdrawn_at IS NULL ORDER BY seq DESC LIMIT 1) l ON true`

function summaryOf(r: SummaryRow): ConversationSummary {
  return {
    id: r.id,
    title: r.title,
    revision: safeInt(r.revision, 'conversation.revision'),
    summary: null,
    summaryCoverage: NOT_ASSESSED,
    lastAt: r.last_at.toISOString(),
    contributors: r.contributors.map((c) => ({ actorId: c.actorId, name: c.name ?? 'A member' })),
    sophia: r.sophia,
    openQuestions: 0,
    questionsCoverage: NOT_ASSESSED,
    // No CON-01 path associates an output with a conversation (binding map §10).
    output: null,
    lastMessage:
      r.last_author && r.last_text !== null && r.last_at_message
        ? {
            author: r.last_author,
            actorId: r.last_actor,
            name: r.last_author === 'sophia' ? 'Sophia' : r.last_name,
            text: r.last_text,
            at: r.last_at_message.toISOString(),
          }
        : null,
  }
}

interface Access {
  member: boolean
  writer: boolean
  admin: boolean
  state: 'enabled' | 'read_only' | null
  policy: string | null
}

async function accessOf(c: pg.PoolClient, projectId: string): Promise<Access> {
  const { rows } = await c.query<{ access: Access }>('SELECT sophia.conversation_access($1) AS access', [projectId])
  return onlyRow(rows, 'conversation_access').access
}

function capabilityOf(a: Access): ConversationCapability {
  return {
    state: a.state ?? 'off',
    write: a.writer && a.state === 'enabled',
    moderate: a.admin,
    // No runtime path answers in a conversation yet (CON-01 G2): an ask is recorded and said as blocked.
    ask: 'unavailable',
    askReason: 'replies_not_enabled',
  }
}

const policyOf = (a: Access): ConversationPolicy | null =>
  a.policy === 'conversation-text-v1'
    ? {
        id: 'conversation-text-v1',
        notice: CONVERSATION_NOTICE,
        retention: 'until_withdrawn_or_erased',
        audience: 'project_members',
      }
    : null

/** The project's conversations as a member reads them, newest activity first; a non-member is refused. */
export async function readConversationList(c: pg.PoolClient, projectId: string): Promise<ConversationList> {
  const access = await accessOf(c, projectId)
  if (!access.member) throw new DomainError('forbidden', 'Not permitted')
  const { rows } = await c.query<SummaryRow>(
    `${SUMMARIES} WHERE c.project_id = $1 ORDER BY c.last_at DESC, c.id DESC LIMIT $2`,
    [projectId, CONVERSATION_LIST_LIMIT + 1],
  )
  return {
    projectId,
    conversations: rows.slice(0, CONVERSATION_LIST_LIMIT).map(summaryOf),
    more: rows.length > CONVERSATION_LIST_LIMIT,
    policy: policyOf(access),
    capability: capabilityOf(access),
  }
}

/** One conversation as listed, or not_found when the caller cannot see it. */
export async function readConversationSummary(c: pg.PoolClient, conversationId: string): Promise<ConversationSummary> {
  const { rows } = await c.query<SummaryRow>(`${SUMMARIES} WHERE c.id = $1`, [conversationId])
  const row = rows[0]
  if (!row) throw new DomainError('not_found', 'Conversation not found')
  return summaryOf(row)
}

interface MessageRow {
  id: string
  conversation_id: string
  seq: string
  author: 'member' | 'sophia'
  actor_id: string | null
  author_name: string | null
  body: string | null
  created_at: Date
  withdrawn_at: Date | null
  ask_id: string | null
  ask_state: ConversationReply['state'] | null
  ask_reason: string | null
  ask_answer: string | null
  ask_at: Date | null
  ask_settled: Date | null
  reply_to_message: string | null
  reply_id: string | null
}

const MESSAGES = `SELECT m.id, m.conversation_id, m.seq, m.author, m.actor_id, m.author_name, m.body, m.created_at,
    m.withdrawn_at, a.id AS ask_id, a.state AS ask_state, a.reason AS ask_reason, a.answer_id AS ask_answer,
    a.created_at AS ask_at, a.settled_at AS ask_settled, q.message_id AS reply_to_message, m.reply_id
  FROM sophia.conversation_messages m
  LEFT JOIN sophia.conversation_replies a ON a.project_id = m.project_id AND a.message_id = m.id
  LEFT JOIN sophia.conversation_replies q ON q.project_id = m.project_id AND q.id = m.reply_id`

function messageOf(r: MessageRow): ConversationMessage {
  return {
    id: r.id,
    seq: safeInt(r.seq, 'message.seq'),
    author: r.author,
    actorId: r.actor_id,
    name: r.author === 'sophia' ? 'Sophia' : r.author_name,
    text: r.body,
    at: r.created_at.toISOString(),
    withdrawn: r.withdrawn_at ? { at: r.withdrawn_at.toISOString() } : null,
    ask:
      r.ask_id && r.ask_state && r.ask_at
        ? {
            id: r.ask_id,
            messageId: r.id,
            state: r.ask_state,
            reason: r.ask_reason,
            answerId: r.ask_answer,
            askedAt: r.ask_at.toISOString(),
            settledAt: r.ask_settled?.toISOString() ?? null,
          }
        : null,
    replyTo: r.reply_id && r.reply_to_message ? { messageId: r.reply_to_message, replyId: r.reply_id } : null,
  }
}

/** A conversation the caller can see, else not_found (missing, erased, or another project's alike). */
async function visibleConversation(c: pg.PoolClient, conversationId: string): Promise<void> {
  const { rows } = await c.query('SELECT 1 FROM sophia.conversations WHERE id = $1', [conversationId])
  if (rows.length === 0) throw new DomainError('not_found', 'Conversation not found')
}

/**
 * A page of a conversation's messages in its order, oldest first: the newest, or those before `before`. A cursor is
 * checked against this conversation before anything is read.
 */
export async function readConversationPage(
  c: pg.PoolClient,
  conversationId: string,
  before: string | null,
): Promise<ConversationMessagePage> {
  const below = before === null ? null : cursorSeq(conversationId, before)
  await visibleConversation(c, conversationId)
  const { rows } = await c.query<MessageRow>(
    `${MESSAGES} WHERE m.conversation_id = $1 AND ($2::bigint IS NULL OR m.seq < $2) ORDER BY m.seq DESC LIMIT $3`,
    [conversationId, below, CONVERSATION_PAGE_LIMIT + 1],
  )
  const shown = rows.slice(0, CONVERSATION_PAGE_LIMIT).toReversed().map(messageOf)
  const oldest = shown[0]
  return {
    conversationId,
    messages: shown,
    before: rows.length > CONVERSATION_PAGE_LIMIT && oldest ? conversationCursor(conversationId, oldest.seq) : null,
  }
}

/** One message as a member reads it, or not_found. */
export async function readConversationMessage(c: pg.PoolClient, messageId: string): Promise<ConversationMessage> {
  const { rows } = await c.query<MessageRow>(`${MESSAGES} WHERE m.id = $1`, [messageId])
  const row = rows[0]
  if (!row) throw new DomainError('not_found', 'Message not found')
  return messageOf(row)
}

/** A reply request as a member reads it, or null. */
export async function readConversationReply(c: pg.PoolClient, replyId: string): Promise<ConversationReply | null> {
  const { rows } = await c.query<MessageRow>(`${MESSAGES} WHERE a.id = $1`, [replyId])
  return rows[0] ? messageOf(rows[0]).ask : null
}

// ---------------------------------------------------------------------------------------------------------------------
// Writes. Each is one sophia.* function; call inside withActor(..., "write"). `name` is the verified token's.

async function receipt<T>(c: pg.PoolClient, statement: string, sql: string, params: unknown[]): Promise<T> {
  const { rows } = await c.query<{ receipt: T }>(sql, params)
  return onlyRow(rows, statement).receipt
}

export const startConversation = (
  c: pg.PoolClient,
  projectId: string,
  key: string,
  write: ConversationStartWrite,
  name: string | null,
) =>
  receipt<ConversationReceipt>(
    c,
    'start_conversation',
    'SELECT sophia.start_conversation($1, $2, $3, $4, $5, $6) AS receipt',
    [projectId, key, write.title, write.text, write.askSophia, name],
  )

export const sendConversationMessage = (
  c: pg.PoolClient,
  conversationId: string,
  key: string,
  write: ConversationSendWrite,
  name: string | null,
) =>
  receipt<ConversationReceipt>(
    c,
    'send_conversation_message',
    'SELECT sophia.send_conversation_message($1, $2, $3, $4, $5) AS receipt',
    [conversationId, key, write.text, write.askSophia, name],
  )

export const withdrawConversationMessage = (c: pg.PoolClient, conversationId: string, messageId: string, key: string) =>
  receipt<{ conversationId: string; messageId: string }>(
    c,
    'withdraw_conversation_message',
    'SELECT sophia.withdraw_conversation_message($1, $2, $3) AS receipt',
    [conversationId, messageId, key],
  )

export const eraseConversation = (c: pg.PoolClient, conversationId: string, key: string) =>
  receipt<{ conversationId: string }>(c, 'erase_conversation', 'SELECT sophia.erase_conversation($1, $2) AS receipt', [
    conversationId,
    key,
  ])
