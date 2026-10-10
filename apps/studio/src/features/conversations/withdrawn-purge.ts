// What a thread read here holds withdrawn is taken out of the list reads this reader holds, in the cache itself, not
// only on the screen (CON-01-CC-0025, CC-0026; Codex: CX-0027, CX-0028 at 7969d40, pack 03 §5: «remove ineligible
// cached material on revalidation and do not resend it»; PR #199 r4236040713). Whichever comes last, the list's answer
// (one that set out before the withdrawal included) or the thread's, the list read as cached no longer holds it.
//
// The boundary, exactly:
// - Purged (rowsKnown): a row's opening where this reader's thread for that same conversation holds that message
//   withdrawn; and its summary, its writer among those who wrote there and Sophia's part (as a withdrawal here leaves
//   them, rowWithdrawn) for a withdrawal the list read may not have known: one this view first saw after that read set
//   out, and no older than the row's last activity. Nothing of another conversation's row or another reader's list.
// - In place: only the list read's data is replaced (`Query.setState`). Whether it was answered or is failing, its
//   error, when it was last answered and how often stay as they were, so «This may be out of date» stays while its
//   reads fail (Codex at 7969d40: the thread's Try again took it away).
// - When: on every change of a list read or of a thread read in this cache, at once (the cache tells its listeners as
//   it changes, before the screen is drawn again), for as long as the cache lives. A list read put back as it was
//   before a read was given up (a cancel that reverts) is one such change, and is purged again.
// - What it rests on: the thread read as cached, and when this view first saw each withdrawal in it. Both are let go
//   only when the thread read has been unread for the cache's 5 minutes, when its conversation is erased (its row goes
//   with it), or with the whole cache (another account, or signing out: App.tsx clears it, lists and threads together).
//   A list read can't outlast that: each is given up after READ_TIMEOUT_MS (30 s) and aborted once nothing reads it. A
//   list read that sets out after this view saw a withdrawal is read after it, and the API then says none of it.
import type { Query, QueryCache } from '@tanstack/react-query'
import type { ConversationList, ConversationMessage } from '../../api/conversations.ts'
import { LISTS, messagesKey, rowsKnown, type ThreadHeld } from './conversation-list.ts'

/** A list read as cached: what the API said, and where in this view's order its read set out. */
export type ListRead = ConversationList & { readFrom?: number }

/** This view's order of what it does: a list read setting out, a withdrawal first seen. A count, never a clock. */
let order = 0

/** A list read setting out: its place in this view's order (the list's query function takes it first). */
export const listReadSetsOut = (): number => (order += 1)

/** Per cache, per thread read (its hash): when this view first saw each of its messages withdrawn. */
const seen = new WeakMap<QueryCache, Map<string, Map<string, number>>>()

const seenIn = (cache: QueryCache) => {
  const was = seen.get(cache)
  if (was) return was
  const made = new Map<string, Map<string, number>>()
  seen.set(cache, made)
  return made
}

/** The thread read's withdrawals not seen before are seen now. */
function noteWithdrawals(cache: QueryCache, query: Query) {
  const held = cache.get<ThreadHeld>(query.queryHash)?.state.data
  const messages = (held?.pages ?? []).flatMap((p) => p.messages)
  if (!messages.some((m) => m.withdrawn)) return
  const byThread = seenIn(cache)
  const at = byThread.get(query.queryHash) ?? new Map<string, number>()
  byThread.set(query.queryHash, at)
  for (const m of messages) if (m.withdrawn && !at.has(m.id)) at.set(m.id, (order += 1))
}

/** This reader's thread for a conversation, as held now; another reader's is never read. */
const heldBy = (cache: QueryCache, account: string) => (conversationId: string) =>
  cache.find<ThreadHeld>({ queryKey: messagesKey(conversationId, account), exact: true })?.state.data

/** The reader a conversation read is for, where it is one (`listKey`, `messagesKey`: the fourth part). */
const readerOf = (query: Query) => {
  const [scope, , , account] = query.queryKey
  return scope === 'conversations' && typeof account === 'string' ? account : null
}

/** One list read (by its hash) purged in place: its data only. */
function purgeList(cache: QueryCache, hash: string, account: string) {
  const query = cache.get<ListRead>(hash)
  const list = query?.state.data
  if (!query || !list) return
  // A list read whose setting out wasn't noted (none here) is taken as older than every withdrawal seen.
  const from = list.readFrom ?? 0
  const thread = (id: string) => cache.find({ queryKey: messagesKey(id, account), exact: true })?.queryHash
  const seenSince = (id: string, m: ConversationMessage) =>
    (seenIn(cache)
      .get(thread(id) ?? '')
      ?.get(m.id) ?? 0) > from
  const conversations = rowsKnown(list.conversations, heldBy(cache, account), seenSince, actorOf(account))
  if (conversations !== list.conversations) query.setState({ data: { ...list, conversations } })
}

/**
 * The reader's actor, from the account their reads are kept under: their token's subject, which the API takes as the
 * actor only as a UUID, in lower case (apps/api/src/auth.ts). An account kept under a name or an email (a token with
 * no subject) is no actor here: no writer is taken for the reader then.
 */
const actorOf = (account: string) => (UUID.test(account) ? account.toLowerCase() : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every list read this reader holds, purged by what their threads hold withdrawn now. */
export function purgeWithdrawn(cache: QueryCache, account: string): void {
  for (const query of cache.findAll({ queryKey: LISTS })) {
    if (readerOf(query) === account) purgeList(cache, query.queryHash, account)
  }
}

const kept = new WeakSet<QueryCache>()

/** From now on, as long as this cache lives, its list reads hold nothing their threads hold withdrawn. Once each. */
export function keepWithdrawnPurged(cache: QueryCache): void {
  if (kept.has(cache)) return
  kept.add(cache)
  for (const query of cache.findAll({ queryKey: LISTS })) {
    const account = readerOf(query)
    if (account !== null) purgeList(cache, query.queryHash, account)
  }
  cache.subscribe((event) => {
    if (event.type === 'removed') seenIn(cache).delete(event.query.queryHash)
    if (event.type !== 'updated') return
    const query = cache.get(event.query.queryHash)
    const account = query ? readerOf(query) : null
    if (!query || account === null) return
    if (query.queryKey[1] === LISTS[1]) return purgeList(cache, query.queryHash, account)
    noteWithdrawals(cache, query)
    purgeWithdrawn(cache, account)
  })
}
