// The next ask for the open conversation (docs/plans/next-ask.md): the thread and the conversation's open questions from
// the view, the brief from the same read the context pane uses (one query, shared), and what was put away here, kept
// per conversation while the page lives.
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { MissionContext } from '@sophia/contracts'
import { getConversationMessages, type ConversationMessage } from '../../api/vision.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { acceptedOf, pendingOf } from './conversation-list.ts'
import { contextQuery } from './decide.ts'
import { LATELY, nextAsk, olderAsks, quickAsks, threadOf } from './next-ask.ts'

/** What the view gives the field for its suggestion. */
export interface NextAskSource {
  projectId: string
  me: string
  read: { pages: readonly { messages: readonly ConversationMessage[]; before?: string | null }[] } | undefined
  openQuestions: number
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

/** The brief's newest proposal waiting, by its words, and how many decisions it has accepted. */
function briefOf(brief: MissionContext | undefined) {
  if (!brief) return { pending: null, decided: 0 }
  const accepted = acceptedOf(brief.constraints)
  return {
    pending: pendingOf(brief.pending).shown[0]?.statement ?? null,
    decided: accepted.shown.length + accepted.more,
  }
}

/**
 * The viewer's asks before the loaded pages, read only while the loaded ones hold fewer than six of theirs; `waiting`
 * while that read is on its way, so nothing is proposed that they may have asked a page back.
 */
function useOlderAsks(source: NextAskSource, conversationId: string, identity: Identity, loaded: number) {
  const before = source.read?.pages.at(-1)?.before ?? null
  const need = LATELY - loaded
  const enabled = need > 0 && before !== null
  const older = useQuery({
    queryKey: ['vision', 'next-ask-older', accountOf(identity), conversationId, before, need],
    queryFn: ({ signal }) =>
      olderAsks((at) => getConversationMessages(identity.token, conversationId, at, signal), before, source.me, need),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
  return { words: older.data ?? [], waiting: enabled && older.isPending }
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
  const ctx = { ...thread, openQuestions: source.openQuestions, ...briefOf(brief.data), putAway }
  const last = newestId(source.read)
  const hushed = last !== null && hushedAt.get(key) === last
  const suggestion = quiet || hushed || older.waiting ? null : nextAsk(ctx)
  return {
    id,
    suggestion,
    quick: quickAsks(thread.asked, suggestion, putAway),
    putAway: () => {
      if (!suggestion) return
      putAwayIn.set(key, [...putAway, suggestion.words])
      if (last !== null) hushedAt.set(key, last)
      setPutAway((n) => n + 1)
    },
  }
}
