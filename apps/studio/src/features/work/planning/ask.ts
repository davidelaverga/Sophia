// Asking Sophia about a task (WBC-01 G5): a contextual entry into the one shared conversation, never a second chatbot
// and never a message to the worker. A question names exactly what it is about (the work, the plan and the candidate
// shown) and has its own identity; what comes back are the chunks actually received, or one completed answer, for that
// question only. Nothing is replayed at a typing speed: text shows as it arrives, and a completed answer at once.
// Repeated or late events change nothing, an answer for one question never lands under another, and the latest
// question of each task is the one shown, kept across the sheet turning, closing and a reconnect. Pure: tested.

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
  /** The chunks received in order; a gap waits for the completed answer. */
  chunks: string[]
  /** The completed answer, once it comes: final. */
  answer: string | null
  state: 'waiting' | 'answering' | 'answered' | 'unavailable' | 'failed'
  /** Why it can't be answered here, when it can't. */
  reason: string | null
  seq: number
}

export const asking = (question: Question): Asked => ({
  question,
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

/** An event folded into a question: another question's, a repeat, one out of order, or one after the end, ignored. */
export function heard(asked: Asked, e: AskEvent): Asked {
  if (e.question_id !== asked.question.question_id || asked.state === 'answered' || e.seq <= asked.seq) return asked
  if (e.kind === 'complete') {
    // Without its own text, the chunks are the answer only when none is missing.
    const whole = e.text ?? (e.seq === asked.seq + 1 ? asked.chunks.join('') : null)
    return whole === null
      ? { ...asked, state: 'failed', reason: null, seq: e.seq }
      : { ...asked, answer: whole, state: 'answered', seq: e.seq }
  }
  if (e.kind === 'chunk') {
    if (e.seq !== asked.seq + 1) return asked
    return { ...asked, chunks: [...asked.chunks, e.text ?? ''], state: 'answering', seq: e.seq }
  }
  return { ...asked, state: e.kind, reason: e.text ?? null, seq: e.seq }
}

/**
 * How long a question waits for its next event before it is said not answered (CONTRIBUTING: no wait is endless; a
 * read waits 30 s). Each event that arrives starts the wait again.
 */
export const ASK_LIMIT_MS = 30_000

/**
 * A question that heard nothing more since `seq` within the limit: failed, said so, and can be asked again. A later
 * question, an event since, or an answer already complete is left as it is (PR #76 review, P2).
 */
export function stalled(asked: Asked, questionId: string, seq: number): Asked {
  if (asked.question.question_id !== questionId || asked.seq !== seq) return asked
  if (asked.state !== 'waiting' && asked.state !== 'answering') return asked
  return { ...asked, state: 'failed', reason: 'No answer came in time. Nothing was changed.' }
}

/** What is shown of an answer: the completed one, or what has arrived of it. */
export const shownOf = (asked: Asked) => asked.answer ?? asked.chunks.join('')
