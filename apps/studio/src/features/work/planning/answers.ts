// A decider's answers, kept by their decision's revision and by who gave them while the page lives (decision.v1). The decisions close and
// open again, a goal is chosen and then back, and a choice on its way or not confirmed is still there. Otherwise a
// remount would forget it, and the other choice could be sent before the first is resolved: deciding twice. A revised
// decision is a new one, with a new key, so it starts afresh. A reload reads the plan again and starts from it.
import { useSyncExternalStore } from 'react'

/** What came back for an answer: recorded, refused as stale, refused as not the decider's, or not confirmed. */
export type Disposition = 'recorded' | 'conflict' | 'denied' | 'unknown'

export interface Answer {
  state: Disposition | 'sending'
  chosen: string
}

const answers = new Map<string, Answer>()
const listeners = new Set<() => void>()

/** One decision at one revision, as one viewer answered it: its answer's key. */
export const answerKey = (decisionId: string, revision: number, viewerId: string | null) =>
  `${decisionId}:${String(revision)}:${viewerId ?? 'anyone'}`

export const answerOf = (key: string): Answer | null => answers.get(key) ?? null

export function setAnswer(key: string, answer: Answer): void {
  answers.set(key, answer)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The answer given to a decision at its revision, followed as it comes back; null when none was given. */
export const useAnswer = (key: string) => useSyncExternalStore(subscribe, () => answerOf(key))
