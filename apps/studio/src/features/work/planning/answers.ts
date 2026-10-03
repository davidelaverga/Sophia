// A decider's answers, kept by their decision's revision and by who gave them while the page lives (decision.v1),
// each with its operation's id, reused when it is tried again (WBC-01 G4). The decisions close and
// open again, a goal is chosen and then back, and a choice on its way or not confirmed is still there. Otherwise a
// remount would forget it, and the other choice could be sent before the first is resolved: deciding twice. A revised
// decision is a new one, with a new key, so it starts afresh. A reload reads the plan again and starts from it.
import { useSyncExternalStore } from 'react'

/** What came back for an answer: recorded, refused (stale, not the decider's, expired), or not confirmed. */
export type Disposition = 'recorded' | 'conflict' | 'denied' | 'expired' | 'unknown'

export interface Answer {
  state: Disposition | 'sending'
  chosen: string
  /** The one submission this answer is: an answer not confirmed is tried again with it, never a new one. */
  operation_id: string
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

/**
 * The operation an answer goes as: the same one when the same choice is tried again after it wasn't confirmed (a lost
 * reply may have been recorded), a new one otherwise. Another choice is never sent while one is unconfirmed.
 */
export function operationFor(answer: Answer | null, choice: string, newId: () => string): string | null {
  if (answer?.state === 'unknown') return answer.chosen === choice ? answer.operation_id : null
  if (answer?.state === 'sending' || answer?.state === 'recorded') return null
  return newId()
}
