// What this view writes into a list read it holds: the data only, never the read's own state. Whether the list was
// answered or is failing, its error, when it was last answered and how often stay as the list's own reads left them,
// so «This may be out of date» stays while its reads fail, whatever is written here (PR #199 r4235976256,
// r4237298620). `setQueryData` would mark the read answered; `Query.setState({ data })` does not.
import type { QueryClient } from '@tanstack/react-query'
import type { ConversationList } from '../../api/conversations.ts'

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
