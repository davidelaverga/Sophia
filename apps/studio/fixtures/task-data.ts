// A report's tasks (room-passage-task checks), answered as the proposed A17 has them (issue #105): newest first, each
// recorded once per Idempotency-Key, a reply lost when the page asks for that. Every word is synthetic.
import type { ProjectTask, TaskAsk } from '../src/api/vision.ts'

export interface Tasks {
  list: ProjectTask[]
  byKey: Map<string, ProjectTask>
  /** The next write lands, but its reply is lost on the way (`window.fixture.loseNextTaskReply`). */
  loseReply: boolean
  /** A member's name, as the API would give it; the page's people are the fixture's. */
  nameOf: (actorId: string) => string
  /** A version's number, from its id. */
  numberOf: (versionId: string) => number
}

export const noTasks = (nameOf: Tasks['nameOf'], numberOf: Tasks['numberOf']): Tasks => ({
  list: [],
  byKey: new Map(),
  loseReply: false,
  nameOf,
  numberOf,
})

const isStr = (v: unknown): v is string => typeof v === 'string'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const isFrom = (v: unknown): v is TaskAsk['from'] =>
  isRecord(v) && isStr(v.versionId) && isStr(v.passage) && isStr(v.quote)

const isAsk = (v: unknown): v is TaskAsk =>
  isRecord(v) && isStr(v.text) && v.text.trim() !== '' && (v.owner === null || isStr(v.owner)) && isFrom(v.from)

/** A task as the API keeps it: its id, who it is for by name, and the passage's version by number. */
export function taskOf(tasks: Tasks, by: string, ask: TaskAsk): ProjectTask {
  return {
    taskId: `00000000-0000-4000-8000-00000007${String(tasks.list.length + 1).padStart(4, '0')}`,
    text: ask.text,
    owner: ask.owner,
    ownerName: ask.owner === null ? null : tasks.nameOf(ask.owner),
    from: {
      versionId: ask.from.versionId,
      versionNumber: tasks.numberOf(ask.from.versionId),
      passage: ask.from.passage,
      quote: ask.from.quote,
    },
    by,
    at: new Date().toISOString(),
    doneBy: null,
    doneAt: null,
  }
}

/** A task created by `by`, kept under its key: the same key again replays it. Null for a body that is none. */
export function created(tasks: Tasks, by: string, key: string, body: unknown) {
  const keyed = `create ${key}`
  const replayed = tasks.byKey.get(keyed)
  if (replayed) return { task: replayed, first: false }
  const ask: unknown = typeof body === 'string' ? JSON.parse(body) : null
  if (!isAsk(ask)) return null
  const task = taskOf(tasks, by, ask)
  tasks.byKey.set(keyed, task)
  tasks.list.unshift(task)
  return { task, first: true }
}

/** A task done by `by`, once per key; null for a task that isn't there. */
export function finished(tasks: Tasks, taskId: string, by: string, key: string) {
  const keyed = `done ${taskId} ${key}`
  const replayed = tasks.byKey.get(keyed)
  if (replayed) return { task: replayed, first: false }
  const at = tasks.list.findIndex((t) => t.taskId === taskId)
  const was = tasks.list[at]
  if (!was) return null
  const task = was.doneBy === null ? { ...was, doneBy: by, doneAt: new Date().toISOString() } : was
  tasks.list[at] = task
  tasks.byKey.set(keyed, task)
  return { task, first: was.doneBy === null }
}
