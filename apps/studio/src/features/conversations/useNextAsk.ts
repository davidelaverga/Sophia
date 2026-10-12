// The next ask for the open conversation (docs/plans/next-ask.md): the thread and the conversation's open questions from
// the view, the brief from the same read the context pane uses (one query, shared), and what was put away here, kept
// per conversation while the page lives.
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { MissionContext } from '@sophia/contracts'
import type { ConversationMessage } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { acceptedOf, pendingOf } from './conversation-list.ts'
import { contextQuery } from './decide.ts'
import { nextAsk, quickAsks, threadOf } from './next-ask.ts'

/** What the view gives the field for its suggestion. */
export interface NextAskSource {
  projectId: string
  me: string
  read: { pages: readonly { messages: readonly ConversationMessage[] }[] } | undefined
  openQuestions: number
}

/** Suggestions put away, per conversation, while the page lives: one put away does not come back there. */
const putAwayIn = new Map<string, readonly string[]>()
/** The answer a suggestion was put away under, per conversation: the field stays quiet until her next one. */
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
 * The suggestion for the field (none while `quiet`: a message held, a refusal standing, nothing read), the quick asks
 * left, the description's id, and a way to put the suggestion away.
 */
export function useNextAsk(source: NextAskSource, conversationId: string, identity: Identity, quiet: boolean) {
  const brief = useQuery(contextQuery(source.projectId, identity))
  const [, setPutAway] = useState(0)
  const id = useId()
  const thread = threadOf(source.read, source.me)
  const putAway = putAwayIn.get(conversationId) ?? []
  const ctx = { ...thread, openQuestions: source.openQuestions, ...briefOf(brief.data), putAway }
  const last = newestId(source.read)
  const hushed = last !== null && hushedAt.get(conversationId) === last
  const suggestion = quiet || hushed ? null : nextAsk(ctx)
  return {
    id,
    suggestion,
    quick: quickAsks(thread.asked, suggestion),
    putAway: () => {
      if (!suggestion) return
      putAwayIn.set(conversationId, [...putAway, suggestion.words])
      if (last !== null) hushedAt.set(conversationId, last)
      setPutAway((n) => n + 1)
    },
  }
}
