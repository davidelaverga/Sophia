// What a thread read here holds withdrawn is taken out of the list reads this reader holds, in the cache itself, not
// only on the screen (CON-01-CC-0025; Codex: CX-0027, CX-0028 at 7969d40, and pack 03 §5: «remove ineligible cached
// material on revalidation and do not resend it»). Whichever comes last, the list's answer (one that set out before
// the withdrawal included) or the thread's, the list read as cached no longer holds the words.
//
// The boundary, exactly:
// - Purged: a list row's opening (`lastMessage`) where this reader's thread for that same conversation is held with
//   that message withdrawn (rowsKnown: by its place; else by writer, actor and time). Nothing else of the row, no other
//   conversation's row, and no other reader's list: places are never compared across conversations or readers.
// - In place: only the list read's data is replaced (`Query.setState`). Whether it was answered or is failing, its
//   error, when it was last answered and how often stay as they were, so «This may be out of date» stays while its
//   reads fail (Codex at 7969d40: the thread's Try again took it away).
// - When: on every change of a list read or of a thread read in this cache, at once (the cache tells its listeners as
//   it changes, before the screen is drawn again), for as long as the cache lives. A list read put back as it was
//   before a read was given up (a cancel that reverts) is one such change, and is purged again.
// - What it rests on: the thread read as cached. It is let go only when it has been unread for the cache's 5 minutes,
//   when its conversation is erased (its row goes with it), or with the whole cache (another account, or signing out:
//   App.tsx clears it, lists and threads together). A list read can't outlast that: each is given up after
//   READ_TIMEOUT_MS (30 s) and aborted once nothing reads it. A list read that sets out after the thread is let go is
//   read after the withdrawal, and the API never says a withdrawn message's words.
import type { Query, QueryCache } from '@tanstack/react-query'
import type { ConversationList } from '../../api/conversations.ts'
import { LISTS, messagesKey, rowsKnown, type ThreadHeld } from './conversation-list.ts'

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
  const query = cache.get<ConversationList>(hash)
  const list = query?.state.data
  if (!query || !list) return
  const conversations = rowsKnown(list.conversations, heldBy(cache, account))
  if (conversations !== list.conversations) query.setState({ data: { ...list, conversations } })
}

/** Every list read this reader holds, purged by what their threads hold withdrawn now. */
export function purgeWithdrawn(cache: QueryCache, account: string): void {
  for (const query of cache.findAll({ queryKey: LISTS })) {
    if (readerOf(query) === account) purgeList(cache, query.queryHash, account)
  }
}

const kept = new WeakSet<QueryCache>()

/** From now on, as long as this cache lives, its list reads hold no words their threads hold withdrawn. Once each. */
export function keepWithdrawnPurged(cache: QueryCache): void {
  if (kept.has(cache)) return
  kept.add(cache)
  for (const query of cache.findAll({ queryKey: LISTS })) {
    const account = readerOf(query)
    if (account !== null) purgeList(cache, query.queryHash, account)
  }
  cache.subscribe((event) => {
    if (event.type !== 'updated') return
    const query = cache.get(event.query.queryHash)
    const account = query ? readerOf(query) : null
    if (!query || account === null) return
    if (query.queryKey[1] === LISTS[1]) purgeList(cache, query.queryHash, account)
    else purgeWithdrawn(cache, account)
  })
}
