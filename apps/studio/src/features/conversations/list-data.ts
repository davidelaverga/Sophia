// What this view writes into a list read it holds: the data only, never the read's own state. Whether the list was
// answered or is failing, its error, when it was last answered and how often stay as the list's own reads left them,
// so «This may be out of date» stays while its reads fail, whatever is written here (PR #199 r4235976256,
// r4237298620, r4237767985). `setQueryData` would mark the read answered; `Query.setState({ data })` does not.
import type { QueryClient } from '@tanstack/react-query'
import type {
  ConversationAsk,
  ConversationList,
  ConversationMessage,
  ConversationStarted,
  ConversationSummary,
} from '../../api/conversations.ts'
import { listKey, messagesKey, replyOf, replyOpen } from './conversation-list.ts'
import { followedAt } from './followed-thread.ts'
import type { Held } from './held-write.ts'
import { NO_WORDS, withEntry, type Kept } from './talk-store.ts'
import { orderNow } from './withdrawn-purge.ts'

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
  const listed = current ? row : titleOnly(row)
  return { ...list, conversations: [listed, ...list.conversations.filter((c) => c.id !== row.id)] }
}

/**
 * A start's row as one not current where the feed stands: its title only, with no opening and no writer, whatever was
 * withdrawn since. A16 changes a title only by erasing it, so while the conversation stands its title is current.
 */
const titleOnly = (row: ConversationStarted['conversation']) => ({ ...row, lastMessage: null, contributors: [] })

/**
 * The list as shown: as read, and, where the read lists the newest only (`more`), each start that landed here after
 * being held back and that it leaves out (talk-store `reached`), by its title only, after the rest. So it stays
 * reachable, and open, across reads of the list (PR #199 r4238533084). A whole list without one says it is gone
 * (useSeen settles it, and it goes from `reached`).
 */
export function shownList(all: readonly ConversationSummary[], k: Kept, more: boolean): readonly ConversationSummary[] {
  const extra = more ? Object.values(k.reached).filter((row) => !all.some((c) => c.id === row.id)) : []
  return extra.length === 0 ? all : [...all, ...extra]
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
 * A start's receipt landed: it is put in the list and its thread (`put`, putStarted), the form's words go, Sophia's
 * wait is noted, and it may be opened. A receipt held back and landing now (`words`: the form's words then) clears only
 * those words, never a draft written since; it is kept reachable by its title only (talk-store `reached`, `shownList`);
 * and it notes its wait only as a thread read set out after this shows it (`after`: its request may have ended
 * meanwhile), and never over a wait noted there since (PR #199 r4238533084, r4238533090, r4238594445, r4238594450).
 *
 * Not where this view knows the conversation erased since (talk-store `erased`: its erasure here, or a whole list read
 * without it): those take its read and its row away, so no read left there proves
 * nothing, and the receipt would bring the erased words and row back (PR #199 r4238111781). Such a receipt is refused
 * before any of it: nothing listed or written, the form's words kept, no wait noted, nothing opened.
 *
 * Nor while an erasure of it pressed here is on its way, has had no reply, or was let go in doubt (talk-store
 * `doubted`, whenever that was): it may have erased already. The receipt is held back with the start (`heldBack`), with
 * none of that done, and the form starts nothing new meanwhile (startHeld): erased, it goes (talk-store `retired`);
 * found by a read set out since, it lands (`releasable`; PR #199 r4238177970, r4238256883, CX-0060, r4238311491). Held
 * back where this view keeps things for this project and account: forgotten with the account, kept while the view is
 * away.
 */
export function landed(talk: Talk, receipt: ConversationStarted, put: () => void, words?: ConversationAsk): boolean {
  const { conversation, reply } = receipt
  const k = talk.latest()
  if (k.erased[conversation.id]) return false
  if ((k.erasures[conversation.id] ?? null) !== null || conversation.id in k.doubted) {
    talk.change((was) => ({ ...was, start: { ...was.start, heldBack: { receipt, fields: was.start.fields } } }))
    return false
  }
  put()
  // Held back and landing now: in this view's order from here, a read of its thread says whether its request is open.
  const after = words === undefined ? undefined : orderNow()
  talk.change((was) => {
    const waited = (was.asked[conversation.id] ?? null) !== null
    return {
      ...was,
      start: {
        ...was.start,
        fields: words === undefined || was.start.fields === words ? NO_WORDS : was.start.fields,
        heldBack: null,
      },
      asked:
        reply && !(after !== undefined && waited)
          ? withEntry(was.asked, conversation.id, {
              replyId: reply.id,
              messageId: reply.messageId,
              here: Date.now(),
              ...(after === undefined ? {} : { after }),
            })
          : was.asked,
      reached: after === undefined ? was.reached : withEntry(was.reached, conversation.id, titleOnly(conversation)),
    }
  })
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
 * A start's receipt held back (talk-store `heldBack`) that may land now: its conversation neither erased, nor with an
 * erasure held here, nor in doubt (a read set out since found it standing: talk-store `withStanding`). It lands once,
 * with the form's words as they stood when it was held back, kept reachable by its title only (`shownList`), its
 * thread unwritten and its wait only as a fresh read shows it (`landed`): what the conversation holds now is the reads'
 * to say, so a row's existence never brings back words withdrawn since (CX-0059; PR #199 r4238311491, r4238533084,
 * r4238533090). Nothing is sent.
 */
export function releasable(k: Kept): Kept['start']['heldBack'] {
  const back = k.start.heldBack
  if (!back) return null
  const id = back.receipt.conversation.id
  return k.erased[id] || (k.erasures[id] ?? null) !== null || id in k.doubted ? null : back
}

/**
 * Where the request asked here stands, as the messages read show it (`awaiting`: the one asked, kept by the view;
 * `readFrom`: where in this view's order that read set out). Only the request itself ends the wait: answered (her
 * answer names it), or said why not; a message of hers to another request, or written later by the clock, settles
 * nothing (A16; CON01-A09). Seen ended (`ended`), the wait is over for good, whichever read showed it: an ended request
 * never opens again, and newer messages may later push the asking message out of the page. One noted from a start's
 * receipt held back (`after`) is waited on only while a read set out after it shows it still open: none such (none
 * yet, one failing, one cached from before), no wait claimed (PR #199 r4238533090, r4238594445).
 */
export function replyWait(
  messages: readonly ConversationMessage[],
  awaiting: { replyId: string | null; messageId: string | null; after: number | null },
  readFrom: number,
): { ended: boolean; waiting: boolean } {
  const { replyId, messageId, after } = awaiting
  const reply = messageId === null ? undefined : replyOf(messages, messageId)
  const read = replyId !== null && reply?.id === replyId
  const ended = read && !replyOpen(reply)
  const shown = after === null || (read && readFrom > after)
  return { ended, waiting: replyId !== null && !ended && shown }
}
