// The questions asked of Sophia about tasks, kept while the page lives (WBC-01 G5), per space (a project as one viewer
// sees it): the latest question of each task and what has come back of it. A board that unmounts and comes back finds
// them, and an answer still arriving lands meanwhile. Another viewer's space is another space. Each wait and each
// event names its send, so an earlier send of a question asked again changes nothing. Tested through ask.ts.
import { ASK_LIMIT_MS, heardOn, stalled, stillOn, type Ask, type AskEvent, type Asked, type Sent } from './ask.ts'

type Space = Readonly<Record<string, Asked>>

const EMPTY: Space = {}
const spaces = new Map<string, Space>()
const listeners = new Set<() => void>()

export const asksOf = (space: string): Space => spaces.get(space) ?? EMPTY

/** A change to a space: told to whoever listens only when something changed (Codex F-031). */
function change(space: string, next: (s: Space) => Space): void {
  const was = asksOf(space)
  const now = next(was)
  if (now === was) return
  spaces.set(space, now)
  for (const listener of listeners) listener()
}

/** The space with a task's latest question as `next` makes it; the same space when that changes nothing. */
const withLatest = (s: Space, workId: string, next: (latest: Asked) => Asked): Space => {
  const latest = s[workId]
  const after = latest ? next(latest) : latest
  return after === latest || !after ? s : { ...s, [workId]: after }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A task's latest question: it replaces the one before, whose late answer is then let go. */
export const askedOf = (space: string, asked: Asked) =>
  change(space, (s) => ({ ...s, [asked.question.work_id]: asked }))

/**
 * No event within the limit since `seq`: the question fails, if it is still the task's latest, on the same send, and
 * still waiting.
 */
export const stalledOf = (space: string, workId: string, wait: Sent & { seq: number }) =>
  change(space, (s) => withLatest(s, workId, (latest) => stalled(latest, wait)))

/** An event of one send of a task's question: taken only if it is that question's, on that send (ask.ts). */
export const heardOf = (space: string, workId: string, sent: Sent, event: AskEvent) =>
  change(space, (s) => withLatest(s, workId, (latest) => heardOn(latest, sent, event)))

/**
 * Sends a question and keeps one wait for it (Codex F-031): begun when it is sent, begun again by each event that
 * moves its answer on, and ended once the send ends (answered, failed, unavailable) or another send takes its place.
 * An event that changes nothing (a repeat, one out of order, another send's) leaves the wait as it was. Nothing heard
 * within the limit fails it (stalled). The wait is the send's, kept here, not a component's: a board that goes and
 * comes back finds it going.
 */
export function sendQuestion(space: string, fresh: Asked, port: Ask, limit = ASK_LIMIT_MS): void {
  const { question } = fresh
  const workId = question.work_id
  const sent = { question_id: question.question_id, send: fresh.send }
  let wait: ReturnType<typeof setTimeout> | undefined
  const watch = (seq: number) => {
    clearTimeout(wait)
    wait = setTimeout(() => stalledOf(space, workId, { ...sent, seq }), limit)
  }
  askedOf(space, fresh)
  watch(0)
  port(question, (event) => {
    const before = asksOf(space)[workId]
    heardOf(space, workId, sent, event)
    const now = asksOf(space)[workId]
    if (!stillOn(now, sent)) clearTimeout(wait)
    else if (now !== before && now) watch(now.seq)
  })
}
