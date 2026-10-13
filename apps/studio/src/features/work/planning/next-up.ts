// Next up (docs/plans/next-up.md): after the viewer answers a decision, what waits on them next on this board: another of
// their decisions not answered in this visit, then a task waiting for them (in the board's order), then a review that
// proposes a change, else nothing, said so. Pure, so a node test holds the order.

export const NOTHING_NEXT = 'Nothing else here waits on you.'

/** Words inside the quotes, at most this long (cut at a word, with an ellipsis). */
const QUOTED = 48

/**
 * A decision as answered in this visit: its id at its revision. A revision proposed later is a new decision to answer,
 * as the decision card treats it (Codex on #263).
 */
export const answeredKey = (decisionId: string, revision: number) => `${decisionId}#${String(revision)}`

export interface NextUpInput {
  /** The decisions answered in this visit, the last one included (`answeredKey`). */
  answered: readonly string[]
  /** The viewer's decisions still answerable here. */
  decisions: readonly { decision_id: string; revision: number; question: string }[]
  /** The tasks waiting for the viewer, in the board's order. */
  waiting: readonly { id: string; name: string }[]
  /** A review that proposes a change waits in the bar. */
  review: boolean
}

export interface NextUp {
  kind: 'decision' | 'task' | 'review' | 'none'
  /** The decision's or the task's id; null for the review and for nothing. */
  id: string | null
  words: string
}

/** Words cut at a word, with an ellipsis, when long: for the quotes of the line and the palette's «For you». */
export function quoted(words: string): string {
  const text = words.trim()
  if (text.length <= QUOTED) return text
  const cut = text.slice(0, QUOTED - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > 0 ? cut.slice(0, at) : cut).trimEnd()}…`
}

/**
 * The decisions answered in this visit as the page knows them: those this board recorded, and any the page's answer
 * memory (answers.ts) holds recorded or on its way, so a board drawn anew (another goal and back) or two answers in
 * flight never point back to one already answered (Codex P2s on #263). Not confirmed or refused, still to answer.
 */
export function answeredHere<D extends { decision_id: string; revision: number }>(
  decisions: readonly D[],
  recorded: readonly string[],
  stateOf: (decision: D) => string | null,
): string[] {
  const known = decisions
    .filter((d) => {
      const state = stateOf(d)
      return state === 'recorded' || state === 'sending'
    })
    .map((d) => answeredKey(d.decision_id, d.revision))
  return [...new Set([...recorded, ...known])]
}

/** A board row as the tasks waiting for the viewer are read from it. */
interface WaitingRow {
  item: { id: string; purpose: string }
  waits: readonly { wait: { state: string; respondent_id: string | null } }[]
}

/**
 * The tasks with a request pending for the viewer, in the board's lane order, then those in a lane it does not show
 * (closed: stopped, cancelled, failed, superseded), which can still hold one (Codex P2 on #263). By the request, not by
 * the mark, so a task planned or queued with the viewer's request open counts too (Codex on #263).
 */
export function waitingFor<R extends WaitingRow>(
  rows: readonly R[],
  viewerId: string | null,
  laneOf: (row: R) => string,
  lanes: readonly string[],
): { id: string; name: string }[] {
  if (viewerId === null) return []
  const rank = (r: R) => {
    const at = lanes.indexOf(laneOf(r))
    return at === -1 ? lanes.length : at
  }
  return rows
    .filter((r) => r.waits.some((w) => w.wait.state === 'pending' && w.wait.respondent_id === viewerId))
    .toSorted((a, b) => rank(a) - rank(b))
    .map((r) => ({ id: r.item.id, name: r.item.purpose }))
}

/**
 * A send that keeps where it went from: the place is taken as each answer is sent, never shared, so two in flight that
 * settle out of order never hand each other's choice to the line (Codex on #277).
 */
export function sentFrom<A, S, P>(send: (answer: A) => Promise<S>, at: () => P) {
  return async (answer: A): Promise<{ said: S; went: P }> => {
    const went = at()
    return { said: await send(answer), went }
  }
}

export function nextUp({ answered, decisions, waiting, review }: NextUpInput): NextUp {
  const decision = decisions.find((d) => !answered.includes(answeredKey(d.decision_id, d.revision)))
  if (decision)
    return { kind: 'decision', id: decision.decision_id, words: `Next: decide “${quoted(decision.question)}”` }
  const task = waiting[0]
  if (task) return { kind: 'task', id: task.id, words: `Next: “${quoted(task.name)}” waits for you` }
  if (review) return { kind: 'review', id: null, words: 'Next: the lead’s review proposes a change' }
  return { kind: 'none', id: null, words: NOTHING_NEXT }
}
