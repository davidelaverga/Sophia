// The next ask for the open conversation (docs/plans/next-ask.md): the thread and the conversation's open questions from
// the view, the brief from the same read the context pane uses (one query, shared), and what was put away here, kept
// per conversation while the page lives.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { getConversationMessages, type ConversationMessage } from '../../api/conversations.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { contextQuery } from './decide.ts'
import { asksNow, briefAsks, LATELY, olderAsks, threadOf } from './next-ask.ts'

/** What the view gives the field for its suggestion. */
export interface NextAskSource {
  projectId: string
  me: string
  read: { pages: readonly { messages: readonly ConversationMessage[]; before?: string | null }[] } | undefined
  /** The transcript read, not being read again, its last read not failed (Codex P2 on #262). */
  fresh: boolean
  /** When the transcript was last read: a read again retries the older asks after a failure (Codex on #275). */
  readAt: number
  /** The conversation's open questions; null when the list's last read failed and the count may be stale. */
  openQuestions: number | null
}

/**
 * Suggestions put away, per account and conversation, while the page lives: one put away does not come back there, and
 * another account on this browser starts with none put away (Codex on #262).
 */
const putAwayIn = new Map<string, readonly string[]>()
/** The answer a suggestion was put away under, per account and conversation: quiet until her next one. */
const hushedAt = new Map<string, string>()

/** The newest message's id, or null with none. */
const newestId = (read: NextAskSource['read']) => read?.pages[0]?.messages.at(-1)?.id ?? null

/**
 * The viewer's asks before the loaded pages, read only while the loaded ones hold fewer than six of theirs; `known`
 * once that read is in and complete (or not needed): on its way, failed or stopped short, nothing is proposed that they
 * may have asked a page back (Codex P2s on #262).
 */
function useOlderAsks(source: NextAskSource, conversationId: string, identity: Identity, loaded: number) {
  const before = source.read?.pages.at(-1)?.before ?? null
  const need = LATELY - loaded
  const enabled = need > 0 && before !== null
  const older = useQuery({
    queryKey: ['vision', 'next-ask-older', accountOf(identity), conversationId, before, need],
    queryFn: ({ signal }) =>
      olderAsks(
        (at) => getConversationMessages(identity.token, source.projectId, conversationId, at, signal),
        before,
        source.me,
        need,
      ),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  })
  // A failed read is tried again each time the thread is read again (the feed moved), the viewer's asks unchanged and
  // so its key the same: a passing failure does not blank the quick asks for the rest of the visit (Codex on #275).
  // Once per read of the thread: a refetch with no data resets the query to pending, so retrying on the error itself
  // would loop for as long as the read keeps failing (Codex P1 on #275).
  const { isError, refetch } = older
  const triedAt = useRef(source.readAt)
  useEffect(() => {
    if (!isError || triedAt.current === source.readAt) return
    triedAt.current = source.readAt
    void refetch()
  }, [source.readAt, isError, refetch])
  return { words: older.data?.asks ?? [], known: !enabled || (older.isSuccess && older.data.complete) }
}

/**
 * The suggestion for the field (none while `quiet`: a message held, a refusal standing, nothing read), the quick asks
 * left, the description's id, and a way to put the suggestion away.
 */
export function useNextAsk(source: NextAskSource, conversationId: string, identity: Identity, quiet: boolean) {
  const brief = useQuery(contextQuery(source.projectId, identity))
  const [, setPutAway] = useState(0)
  const id = useId()
  const loaded = threadOf(source.read, source.me)
  const older = useOlderAsks(source, conversationId, identity, loaded.asked.length)
  const thread = { ...loaded, asked: [...older.words, ...loaded.asked] }
  const key = `${accountOf(identity)}:${conversationId}`
  const putAway = putAwayIn.get(key) ?? []
  const ctx = {
    ...thread,
    // The count unknown (the list's last read failed), nothing is said of open questions (Codex P2 on #262).
    openQuestions: source.openQuestions ?? 0,
    ...briefAsks(brief.data, brief.isError),
    putAway,
  }
  const last = newestId(source.read)
  const hushed = last !== null && hushedAt.get(key) === last
  // The brief being read again (the feed moved) may hold a proposal decided since: nothing is offered until it is in
  // (Codex on #275).
  const fresh = source.fresh && brief.fetchStatus === 'idle'
  const { suggestion, quick } = asksNow(ctx, { fresh, recencyKnown: older.known, quiet, hushed })
  return {
    id,
    suggestion,
    quick,
    putAway: () => {
      if (!suggestion) return
      putAwayIn.set(key, [...putAway, suggestion.words])
      if (last !== null) hushedAt.set(key, last)
      setPutAway((n) => n + 1)
    },
  }
}
