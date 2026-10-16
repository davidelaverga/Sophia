// The room's messages that came while the tab was hidden (docs/plans/unread-title.md). Stub: none counted yet.
import type { DiscussionEntry } from '@sophia/contracts'

export const unseenCount = (
  _entries: readonly DiscussionEntry[],
  _seen: ReadonlySet<string>,
  _me: string | null,
): number => 0
