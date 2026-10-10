// What this view writes into a list read it holds: the data only, never the read's own state. Whether the list was
// answered or is failing, its error, when it was last answered and how often stay as the list's own reads left them,
// so «This may be out of date» stays while its reads fail, whatever is written here (PR #199 r4235976256,
// r4237298620, r4237767985). `setQueryData` would mark the read answered; `Query.setState({ data })` does not.
import type { QueryClient } from '@tanstack/react-query'
import type { ConversationAsk, ConversationList, ConversationStarted } from '../../api/conversations.ts'
import { listKey, messagesKey } from './conversation-list.ts'
import { followedAt } from './followed-thread.ts'
import type { Held } from './held-write.ts'
import { NO_WORDS, awaiting, withEntry, withStanding, type Kept } from './talk-store.ts'

/** Each list read under `queryKey` that holds data, changed in place; one the change leaves as it was is not touched. */
export function setListsData(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  change: (list: ConversationList) => ConversationList,
): void {
  const cache = queryClient.getQueryCache()
  for (const found of cache.findAll({ queryKey })) {
    const query = cache.get<ConversationList>(found.queryHash)
    const list = query?.state.data
    if (!query || !list) continue
    const next = change(list)
    if (next !== list) query.setState({ data: next })
  }
}

/**
 * The list read with a start's row: the row it already holds, where that is at the receipt's revision or later (read
 * after the start, a withdrawal since included), kept as it is; else the receipt's row at the top. A receipt not
 * current where the page's feed stands lists the conversation without what its first message says (no opening, no
 * writer), which may have been withdrawn since (PR #199 r4237924424).
 */
function startedIn(list: ConversationList, row: ConversationStarted['conversation'], current: boolean) {
  const held = list.conversations.find((c) => c.id === row.id)
  if (held && held.revision >= row.revision) return list
  const listed = current ? row : { ...row, lastMessage: null, contributors: [] }
  return { ...list, conversations: [listed, ...list.conversations.filter((c) => c.id !== row.id)] }
}

/**
 * A start that landed: at the top of the list read and its first message read, at once (then read again). The receipt
 * proves the new row only, so only the list's data takes it: a list read failing stays failing, its error and «This may
 * be out of date» kept, as a send, a withdrawal and an erasure leave it (PR #199 r4237767985).
 *
 * Its first message goes into the thread only where no read of it exists yet and the receipt is current where this
 * page's feed stands (`pageAt`): a receipt landing after a withdrawal the page already knows of, or onto a read made
 * meanwhile (the conversation opened from the list while the start was on its way), writes nothing there, and the
 * thread's own read says what is so. What it writes is stamped where the receipt itself is current (its `cursor`, read in
 * the start's own transaction), never where the page's feed is (PR #199 r4237924424; followed-thread.ts).

 * Never called for a conversation this view knows erased since, nor while an erasure of it pressed here is unanswered
 * (`landed`, PR #199 r4238111781, r4238177970).
 */
export function putStarted(
  queryClient: QueryClient,
  projectId: string,
  account: string,
  { conversation, message, cursor }: ConversationStarted,
  pageAt: string | undefined,
): void {
  const key = listKey(projectId, account)
  const current = followedAt(cursor, pageAt)
  setListsData(queryClient, key, (list) => startedIn(list, conversation, current))
  const thread = messagesKey(conversation.id, account)
  // Only into a thread with no read at all: one opened meanwhile, its read under way, failed (a 404 once erased) or
  // answered, says what is so, and is never written over (PR #199 r4238023979).
  if (current && queryClient.getQueryCache().find({ queryKey: thread, exact: true }) === undefined) {
    queryClient.setQueryData(thread, {
      pages: [{ messages: [message], before: null, readAt: cursor }],
      pageParams: [null],
    })
  }
  void queryClient.invalidateQueries({ queryKey: key })
}

/** What a start's landing needs of what this view keeps for this project and account: what is kept now, a change. */
interface Talk {
  latest: () => Kept
  change: (f: (k: Kept) => Kept) => void
}

/**
 * A start's receipt landed: it is put in the list and its thread (`put`, putStarted), the form's words go (a receipt
 * held back: only if the form still holds the `words` it held then, never a draft written since) and Sophia's wait is
 * noted, and it may be opened. Unless this view knows the conversation erased since (talk-store `erased`: its
 * erasure here, or a whole list read without it): those take its read and its row away, so no read left there proves
 * nothing, and the receipt would bring the erased words and row back (PR #199 r4238111781). Such a receipt is refused
 * before any of it: nothing listed or written, the form's words kept, no wait noted, nothing opened.
 *
 * Nor while an erasure of it pressed here is on its way, has had no reply, or was let go in doubt (talk-store
 * `doubted`, whenever that was): it may have erased already. The receipt is held back with the start (`heldBack`), with
 * none of that done, and the form starts nothing new meanwhile (startHeld): erased, it goes (talk-store `retired`);
 * listed by a read made since, it lands (`standing`; PR #199 r4238177970, r4238256883, CX-0060). Held back where this
 * view keeps things for this project and account: forgotten with the account, kept while the view is away.
 */
export function landed(talk: Talk, receipt: ConversationStarted, put: () => void, words?: ConversationAsk): boolean {
  const { conversation, reply } = receipt
  const k = talk.latest()
  if (k.erased[conversation.id]) return false
  if ((k.erasures[conversation.id] ?? null) !== null || k.doubted[conversation.id]) {
    talk.change((was) => ({ ...was, start: { ...was.start, heldBack: { receipt, fields: was.start.fields } } }))
    return false
  }
  put()
  talk.change((was) => ({
    ...was,
    start: {
      ...was.start,
      fields: words === undefined || was.start.fields === words ? NO_WORDS : was.start.fields,
      heldBack: null,
    },
    asked: reply
      ? withEntry(was.asked, conversation.id, { replyId: reply.id, messageId: reply.messageId, here: Date.now() })
      : was.asked,
  }))
  return true
}

/**
 * The start as the form holds it: its intent on its way or with no reply, or, while a receipt is held back (`landed`),
 * on its way still, its words as they are, so no press starts it again before that receipt lands or goes.
 */
export function startHeld(start: Kept['start']): Held<ConversationAsk> | null {
  if (start.held || !start.heldBack) return start.held
  return { key: start.heldBack.receipt.conversation.id, ask: start.fields, sending: true }
}

/**
 * The conversations in doubt here (talk-store `doubted`: an erasure let go without being known erased, whose refusal
 * proves nothing of an earlier try that had no reply; PR #199 r4238256883, CX-0059, CX-0060) that a list read set out
 * since (`read.readFrom` past `since`, this view's order when it asked: a read cached or under way before says
 * nothing) lists: they stand, no longer in doubt, and a start's receipt held back for one lands, once (`land`, as if it
 * had just come, with the form's words as they stood when it was held back; putStarted's gates as ever). Nothing is
 * sent. One not listed stays in doubt: a whole list without it lets it go (useSeen settles it, goneFrom naming it), and
 * one of the newest only has it read directly (probes, keepsFor): its not found lets it go, any other answer keeps the
 * doubt.
 */
export function standing(
  talk: Talk,
  read: { listed: readonly string[]; readFrom: number },
  since: number | null,
  land: (receipt: ConversationStarted, words: ConversationAsk) => void,
): void {
  if (since === null || read.readFrom <= since) return
  const k = talk.latest()
  const stood = awaiting(k).filter((id) => read.listed.includes(id))
  if (stood.length === 0) return
  talk.change((was) => withStanding(was, stood))
  const back = k.start.heldBack
  if (back && stood.includes(back.receipt.conversation.id)) land(back.receipt, back.fields)
}
