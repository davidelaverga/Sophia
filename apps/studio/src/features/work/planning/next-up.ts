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

export function nextUp({ answered, decisions, waiting, review }: NextUpInput): NextUp {
  const decision = decisions.find((d) => !answered.includes(answeredKey(d.decision_id, d.revision)))
  if (decision)
    return { kind: 'decision', id: decision.decision_id, words: `Next: decide “${quoted(decision.question)}”` }
  const task = waiting[0]
  if (task) return { kind: 'task', id: task.id, words: `Next: “${quoted(task.name)}” waits for you` }
  if (review) return { kind: 'review', id: null, words: 'Next: the lead’s review proposes a change' }
  return { kind: 'none', id: null, words: NOTHING_NEXT }
}
