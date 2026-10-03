// The questions asked of Sophia about tasks, kept while the page lives (WBC-01 G5), per space (a project as one viewer
// sees it): the latest question of each task and what has come back of it. A board that unmounts and comes back finds
// them, and an answer still arriving lands meanwhile. Another viewer's space is another space. Tested through ask.ts.
import { heard, stalled, type AskEvent, type Asked } from './ask.ts'

type Space = Readonly<Record<string, Asked>>

const EMPTY: Space = {}
const spaces = new Map<string, Space>()
const listeners = new Set<() => void>()

export const asksOf = (space: string): Space => spaces.get(space) ?? EMPTY

function change(space: string, next: (s: Space) => Space): void {
  spaces.set(space, next(asksOf(space)))
  for (const listener of listeners) listener()
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

/** No event within the limit since `seq`: the question fails, if it is still the task's latest and still waiting. */
export const stalledOf = (space: string, workId: string, questionId: string, seq: number) =>
  change(space, (s) => {
    const latest = s[workId]
    return latest ? { ...s, [workId]: stalled(latest, questionId, seq) } : s
  })

/** An event for a task's question: taken only if it is that question's (ask.ts). */
export const heardOf = (space: string, workId: string, event: AskEvent) =>
  change(space, (s) => {
    const latest = s[workId]
    return latest ? { ...s, [workId]: heard(latest, event) } : s
  })
