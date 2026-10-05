// A decider's answers, kept by their decision's revision and by who gave them while the page lives (decision.v1,
// page-memory.ts), each with its operation's id, reused when it is tried again (WBC-01 G4). The decisions close and
// open again, a goal is chosen and then back, and a choice on its way or not confirmed is still there. Otherwise a
// remount would forget it, and the other choice could be sent before the first is resolved: deciding twice. A revised
// decision is a new one, with a new key, so it starts afresh. No answer waits for good: each send has the Studio's
// write limit, then is not confirmed, and only its own reply, in time, says what became of it (Codex F-023).
import { WRITE_TIMEOUT_MS } from '../../../api/client.ts'
import { pageMemory, useMemory } from './page-memory.ts'

/** What came back for an answer: recorded, refused (stale, not the decider's, expired), or not confirmed. */
export type Disposition = 'recorded' | 'conflict' | 'denied' | 'expired' | 'unknown'

export interface Answer {
  state: Disposition | 'sending'
  chosen: string
  /** The one submission this answer is: an answer not confirmed is tried again with it, never a new one. */
  operation_id: string
  /** Which send of it this is: a reply counts only for the send still waiting on it. */
  send?: number
}

const answers = pageMemory<Answer>()

/**
 * One decision at one revision, as one viewer answered it: its answer's key. Each field whole, so ids holding the
 * separator never meet, and no viewer isn't one called "anyone" (Codex F-037).
 */
export const answerKey = (decisionId: string, revision: number, viewerId: string | null) =>
  JSON.stringify([decisionId, revision, viewerId])

export const answerOf = (key: string): Answer | null => answers.get(key)

export const setAnswer = (key: string, answer: Answer): void => answers.set(key, answer)

/** The answer given to a decision at its revision, followed as it comes back; null when none was given. */
export const useAnswer = (key: string) => useMemory(answers, key)

/**
 * The operation an answer goes as: the same one when the same choice is tried again after it wasn't confirmed (a lost
 * reply may have been recorded), a new one otherwise. Another choice is never sent while one is unconfirmed.
 */
export function operationFor(answer: Answer | null, choice: string, newId: () => string): string | null {
  if (answer?.state === 'unknown') return answer.chosen === choice ? answer.operation_id : null
  if (answer?.state === 'sending' || answer?.state === 'recorded') return null
  return newId()
}

/** The sends made while the page lives, counted: each one's own number. */
let sends = 0

/**
 * Sends an answer (`post`) and waits for its reply at most a write's limit, then says it isn't confirmed (Codex F-023):
 * from there only the same choice goes again, with the same operation (operationFor). A reply counts only while its
 * own send is the one waiting, so a reply after its limit, or after the answer was sent again, changes nothing. The
 * wait is the answer's, not a component's: closing the decision or leaving the board leaves no answer sending for good.
 */
export function sendAnswer(
  key: string,
  { chosen, operation_id }: Pick<Answer, 'chosen' | 'operation_id'>,
  post: () => Promise<Disposition>,
  limit = WRITE_TIMEOUT_MS,
): void {
  sends += 1
  const send = sends
  setAnswer(key, { state: 'sending', chosen, operation_id, send })
  const settle = (state: Disposition) => {
    const now = answerOf(key)
    if (now?.send === send && now.state === 'sending') setAnswer(key, { state, chosen, operation_id, send })
  }
  const deadline = setTimeout(() => settle('unknown'), limit)
  const replied = (state: Disposition) => {
    clearTimeout(deadline)
    settle(state)
  }
  post().then(replied, () => replied('unknown'))
}
