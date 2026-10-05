// Asking Sophia about a task (WBC-01 G5): a contextual entry into the one shared conversation, never a second chatbot
// and never a message to the worker. A question names exactly what it is about (the work, the plan and the candidate
// shown) and has its own identity; what comes back are the chunks actually received, or one completed answer, for that
// question only. Nothing is replayed at a typing speed: text shows as it arrives, and a completed answer at once.
// Repeated or late events change nothing, an answer for one question never lands under another, and the latest
// question of each task is the one shown, kept across the sheet turning, closing and a reconnect. Asked again, the
// same question is a new send: nothing of an earlier send (its wait, its late events) reaches it. It is asked again
// only while the view still allows asking about its task. Pure: tested.
import type { ItemAction } from './board-view.ts'

/** What a question is about, exactly, and its words. */
export interface Question {
  question_id: string
  work_id: string
  plan_id: string
  plan_revision: number
  candidate_version_ref: string | null
  text: string
}

/** One event of an answer, as received: a chunk in order, the whole answer, or why there is none. */
export interface AskEvent {
  question_id: string
  seq: number
  kind: 'chunk' | 'complete' | 'unavailable' | 'failed'
  text?: string
}

/** Sends a question into the shared conversation; `on` takes each event as it arrives. */
export type Ask = (question: Question, on: (event: AskEvent) => void) => void

export interface Asked {
  question: Question
  /** Which send of the question this is: 1, then one more each time it is asked again (askedAgain). */
  send: number
  /** The chunks received in order; a gap waits for the completed answer. */
  chunks: string[]
  /** The completed answer, once it comes: final. */
  answer: string | null
  state: 'waiting' | 'answering' | 'answered' | 'unavailable' | 'failed'
  /** Why it can't be answered here, when it can't. */
  reason: string | null
  seq: number
}

export const asking = (question: Question, send = 1): Asked => ({
  question,
  send,
  chunks: [],
  answer: null,
  state: 'waiting',
  reason: null,
  seq: 0,
})

/** Asked where no answer can come: the question kept, with the reason. */
export const unanswerable = (question: Question, reason: string): Asked => ({
  ...asking(question),
  state: 'unavailable',
  reason,
})

/** Why an answer that came back with no words is no answer. */
export const EMPTY_ANSWER = 'Her answer came back empty. Nothing was changed.'

/**
 * A send that has ended: answered, failed (said so, or past its wait) or unavailable. Nothing more of it is taken: a
 * late chunk or answer can't take back what was said and the Ask again offered (Codex F-025). Only a new send, asked
 * again, hears anything more.
 */
const ended = (asked: Asked) => asked.state === 'answered' || asked.state === 'failed' || asked.state === 'unavailable'

/**
 * A send completed: its whole answer, its own text or, without it, the chunks when none is missing. Complete with no
 * words, or only blank ones, is no answer: failed, said so, and can be asked again (Codex F-046).
 */
function completed(asked: Asked, e: AskEvent): Asked {
  const whole = e.text ?? (e.seq === asked.seq + 1 ? asked.chunks.join('') : null)
  if (whole === null) return { ...asked, state: 'failed', reason: null, seq: e.seq }
  if (whole.trim() === '') return { ...asked, state: 'failed', reason: EMPTY_ANSWER, seq: e.seq }
  return { ...asked, answer: whole, state: 'answered', seq: e.seq }
}

/** An event folded into a question: another question's, a repeat, one out of order, or one after the end, ignored. */
export function heard(asked: Asked, e: AskEvent): Asked {
  if (e.question_id !== asked.question.question_id || ended(asked) || e.seq <= asked.seq) return asked
  if (e.kind === 'complete') return completed(asked, e)
  if (e.kind === 'chunk') {
    if (e.seq !== asked.seq + 1) return asked
    return { ...asked, chunks: [...asked.chunks, e.text ?? ''], state: 'answering', seq: e.seq }
  }
  return { ...asked, state: e.kind, reason: e.text ?? null, seq: e.seq }
}

/** A question failed, asked once more: the same question, its next send, nothing of the last send's answer kept. */
export const askedAgain = (asked: Asked): Asked => asking(asked.question, asked.send + 1)

/**
 * What Ask again sends: a task's latest question on its next send, only when it failed and nothing blocks it now
 * (askBlocked); otherwise nothing, and the question stays as it is (Codex F-005).
 */
export const againOf = (latest: Asked | undefined, blocked: string | null): Asked | null =>
  latest?.state === 'failed' && blocked === null ? askedAgain(latest) : null

/** Which send something belongs to: an event's callback, or a wait begun at `seq`. */
export interface Sent {
  question_id: string
  send: number
}

const isSend = (asked: Asked, sent: Sent) => asked.question.question_id === sent.question_id && asked.send === sent.send

/** Whether a send is still going: the task's latest, on that send, and not ended (Codex F-031). */
export const stillOn = (asked: Asked | undefined, sent: Sent) =>
  asked !== undefined && isSend(asked, sent) && !ended(asked)

/** An event of one send: taken only while that send is the question's latest (Codex F-004). */
export const heardOn = (asked: Asked, sent: Sent, e: AskEvent): Asked => (isSend(asked, sent) ? heard(asked, e) : asked)

/**
 * How long a question waits for its next event before it is said not answered (CONTRIBUTING: no wait is endless; a
 * read waits 30 s). Each event that arrives starts the wait again.
 */
export const ASK_LIMIT_MS = 30_000

/**
 * A question that heard nothing more since `seq` within the limit: failed, said so, and can be asked again. A later
 * question, a later send of the same question (Codex F-004), an event since, or an answer already complete is left
 * as it is (PR #76 review, P2).
 */
export function stalled(asked: Asked, wait: Sent & { seq: number }): Asked {
  if (!isSend(asked, wait) || asked.seq !== wait.seq) return asked
  if (asked.state !== 'waiting' && asked.state !== 'answering') return asked
  return { ...asked, state: 'failed', reason: 'No answer came in time. Nothing was changed.' }
}

const NOT_OFFERED = 'Asking about this task isn’t offered here now.'
export const NOT_CONNECTED = 'The conversation isn’t connected here now.'
/** Why nothing is asked from a board whose live state can't be read: its view may be stale (Codex F-022). */
export const NOT_READ =
  'This plan’s live state can’t be read now, so nothing is asked about it from here until it can be.'

/**
 * Why a question about a task can't be sent from here now: as the view says it (its reason, or nothing offered), or
 * nowhere to send it (`closed`: no conversation, or a board read stale); null when it can. A first question and a
 * question asked again go by the same rule (Codex F-005, its port-loss residual).
 */
export function askBlocked(action: ItemAction | null, connected: boolean, closed = NOT_CONNECTED): string | null {
  if (!action) return NOT_OFFERED
  if (action.availability !== 'allowed') return action.reason
  return connected ? null : closed
}

/** What is shown of an answer: the completed one, or what has arrived of it. */
export const shownOf = (asked: Asked) => asked.answer ?? asked.chunks.join('')
