// What this view writes into a list read it holds: the data only, never the read's own state. Whether the list was
// answered or is failing, its error, when it was last answered and how often stay as the list's own reads left them,
// so «This may be out of date» stays while its reads fail, whatever is written here (PR #199 r4235976256,
// r4237298620, r4237767985). `setQueryData` would mark the read answered; `Query.setState({ data })` does not.
import type { QueryClient } from '@tanstack/react-query'
import type { ConversationList, ConversationStarted } from '../../api/conversations.ts'
import { listKey, messagesKey } from './conversation-list.ts'

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
 * A start that landed: at the top of the list read and its first message read, at once (then read again). The receipt
 * proves the new row only, so only the list's data takes it: a list read failing stays failing, its error and «This may
 * be out of date» kept, as a send, a withdrawal and an erasure leave it (PR #199 r4237767985). Its thread is stamped
 * where the receipt itself is current (its `cursor`, read in the start's own transaction), never where the page's feed
 * stands as it lands: a withdrawal after the start may already be there (PR #199 r4237924424; followed-thread.ts).
 */
export function putStarted(
  queryClient: QueryClient,
  projectId: string,
  account: string,
  { conversation, message, cursor }: ConversationStarted,
): void {
  const key = listKey(projectId, account)
  setListsData(queryClient, key, (list) => ({
    ...list,
    conversations: [conversation, ...list.conversations.filter((c) => c.id !== conversation.id)],
  }))
  queryClient.setQueryData(messagesKey(conversation.id, account), {
    pages: [{ messages: [message], before: null, readAt: cursor }],
    pageParams: [null],
  })
  void queryClient.invalidateQueries({ queryKey: key })
}
