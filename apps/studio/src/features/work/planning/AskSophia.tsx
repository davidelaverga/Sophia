// Asking Sophia about a task, from its sheet (WBC-01 G5): the questions its state invites, as one-press asks, or one's
// own. It is an entry into the one shared conversation (ask.ts), with this task's exact references, never another
// chatbot, a microphone or a message to the worker; an ordinary question amends nothing. Her answer shows as it is
// received, chunk by chunk, or whole at once, never at a made-up typing speed. Each task's latest question is kept
// while the page lives (useAsks, ask-store.ts), so turning the sheet, closing it, choosing another goal or a reconnect
// forgets nothing, and a late answer to an earlier question is let go. Where she can't be asked from here (the view
// says so, or no conversation is connected), the question is kept with why, and the way to the conversation is
// offered; no answer is made up.
import { useState, useSyncExternalStore } from 'react'
import { ASK_LIMIT_MS, asking, shownOf, unanswerable, type Ask, type Asked, type Question } from './ask.ts'
import { askedOf, asksOf, heardOf, stalledOf, subscribe } from './ask-store.ts'
import { actionOf, type Mark, type PlanRow, type WorkPlan } from './plan.ts'
import { resultsOf } from './results.ts'

/** The board's questions, the latest per task. */
export interface Asks {
  of: (workId: string) => Asked | null
  /** Asks; `unavailable` keeps the question with why instead of sending it. */
  ask: (question: Omit<Question, 'question_id'>, unavailable: string | null) => void
  /** Asks a task's latest question again, the same question, after it failed. */
  again: (workId: string) => void
}

/** The questions of one space (a project as one viewer sees it), kept while the page lives (ask-store.ts). */
export function useAsks(onAsk: Ask | undefined, space: string, newId: () => string = () => crypto.randomUUID()): Asks {
  const asked = useSyncExternalStore(subscribe, () => asksOf(space))
  /** Sends a question and watches its wait: each event starts it again; none within the limit fails it. */
  const send = (question: Question, port: Ask) => {
    const watch = (seq: number) =>
      setTimeout(() => stalledOf(space, question.work_id, question.question_id, seq), ASK_LIMIT_MS)
    askedOf(space, asking(question))
    watch(0)
    port(question, (event) => {
      heardOf(space, question.work_id, event)
      const now = asksOf(space)[question.work_id]
      if (now?.question.question_id === question.question_id && now.state === 'answering') watch(now.seq)
    })
  }
  return {
    of: (workId) => asked[workId] ?? null,
    ask: (q, unavailable) => {
      const question: Question = { ...q, question_id: newId() }
      if (!onAsk || unavailable !== null) {
        askedOf(space, unanswerable(question, unavailable ?? 'Sophia can’t be asked from here yet.'))
        return
      }
      send(question, onAsk)
    },
    again: (workId) => {
      const failed = asksOf(space)[workId]
      if (onAsk && failed?.state === 'failed') send(failed.question, onAsk)
    },
  }
}

/** The questions a task's state invites. Waiting, "say yes" is asked only by the one its request waits on. */
const INVITED: Readonly<Record<Mark, string[]>> = {
  waiting: ['Why is it waiting?', 'What does it wait for?'],
  changes: ['What needs to change?'],
  review: ['What is left to review?', 'Who should review it?'],
  unknown: ['What do we know about it?'],
  held: ['Why is it held?'],
  working: ['What is it doing now?', 'When will it have a candidate?'],
  queued: ['What is it queued behind?'],
  later: ['What does it wait for?', 'Can it start sooner?'],
  free: ['Who could take it?', 'Why isn’t anyone on it?'],
  complete: ['What did the check find?'],
  closed: ['Why did it stop?'],
}

/** The questions a task invites from this viewer. */
const invited = (row: PlanRow, viewerId: string | null) =>
  row.status.mark === 'waiting' && row.status.on && row.status.on.id === viewerId
    ? ['Why is it waiting?', 'What happens if I say yes?']
    : INVITED[row.status.mark]

const FAILED = 'I couldn’t reach the conversation just now. Nothing was changed.'

interface ThreadProps {
  asked: Asked
  onOpenConversation?: (() => void) | undefined
  /** Asks the same question again, after it failed. */
  onAgain?: (() => void) | undefined
}

/** No answer here, and why: a question that failed can be asked again; either can be taken to the conversation. */
function NotAnswered({
  why,
  failed,
  onAgain,
  onOpenConversation,
}: { why: string; failed: boolean } & Omit<ThreadProps, 'asked'>) {
  return (
    <p className="ask-a ask-none">
      {why}{' '}
      {failed && onAgain && (
        <button type="button" className="text-button" onClick={onAgain}>
          Ask again
        </button>
      )}{' '}
      {onOpenConversation && (
        <button type="button" className="text-button" onClick={onOpenConversation}>
          Open the conversation
        </button>
      )}
    </p>
  )
}

/** The question and what came back of it. */
function Thread({ asked, onOpenConversation, onAgain }: ThreadProps) {
  const said = shownOf(asked)
  const failed = asked.state === 'failed'
  const quiet = failed || asked.state === 'unavailable'
  const why = failed ? (asked.reason ?? FAILED) : `Not answered here: ${asked.reason ?? ''}`
  return (
    <div className="ask-thread" data-state={asked.state}>
      <p className="ask-q">{asked.question.text}</p>
      {quiet ? (
        <NotAnswered why={why} failed={failed} onAgain={onAgain} onOpenConversation={onOpenConversation} />
      ) : (
        // Seen as it arrives; heard once, whole.
        <p className="ask-a" data-thinking={said === '' || undefined} aria-hidden>
          <span className="ask-light" />
          {said === '' ? 'Thinking…' : said}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {asked.state === 'answered' ? (asked.answer ?? '') : quiet ? why : 'Sophia is thinking'}
      </p>
    </div>
  )
}

interface Props {
  row: PlanRow
  plan: WorkPlan
  asks?: Asks | undefined
  viewerId: string | null
  /** The way to the existing conversation, offered when she can't be asked from here. */
  onOpenConversation?: (() => void) | undefined
}

export function AskSophia({ row, plan, asks, viewerId, onOpenConversation }: Props) {
  const [question, setQuestion] = useState('')
  const action = actionOf(row, 'ask_sophia')
  if (!asks || !action) return null
  const asked = asks.of(row.item.id)
  const ask = (text: string) => {
    const unavailable = action.availability === 'allowed' ? null : action.reason
    const about = resultsOf(row.view).current?.version_id ?? null
    const ref = { work_id: row.item.id, plan_id: plan.plan_id, plan_revision: plan.revision }
    asks.ask({ ...ref, candidate_version_ref: about, text }, unavailable)
    // A question that can't go keeps its words in the field, to take to the conversation.
    if (unavailable === null) setQuestion('')
  }
  return (
    <section className="sheet-section ask-sophia">
      <h3>
        <span className="ask-light" aria-hidden />
        Ask Sophia
      </h3>
      <div className="ask-chips">
        {invited(row, viewerId).map((q) => (
          <button key={q} type="button" className="ask-chip" onClick={() => ask(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="act-guide"
        onSubmit={(e) => {
          e.preventDefault()
          if (question.trim()) ask(question.trim())
        }}
      >
        <input
          aria-label="Ask Sophia about this task"
          placeholder="Ask about this task…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="pill" disabled={!question.trim()}>
          Ask
        </button>
      </form>
      {asked && (
        <Thread asked={asked} onOpenConversation={onOpenConversation} onAgain={() => asks.again(row.item.id)} />
      )}
    </section>
  )
}
