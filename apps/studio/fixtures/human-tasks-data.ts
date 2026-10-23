// A project's human tasks as A39 serves them (the served page: VITE_SOPHIA_TASKS without the vision flag;
// docs/handoffs/FND-C5-HUMAN-TASKS-attempt-1.md). The same rules as the API, so the page meets them:
// * D-TASKS: editors and admins create, claim, assign, release and finish; a viewer finishes only a task theirs.
// * Every owner change and Done against the task's revision (409 stale_revision); a done task is done (invalid_state);
//   create and Done once per key.
// * The origin a link only: a published version of the fixture report and a place; to this reader available, or only
//   {available: false}. Nothing of the passage's words is kept or answered; a request carrying a quote is refused, as
//   A39's schema refuses it.
// Every word is synthetic. This is a fixture, not the API: the API's own proof is human-tasks.db.test.ts.
import type { Membership, ProjectTask as ServedTask } from '@sophia/contracts'

export interface HumanTask {
  taskId: string
  title: string
  ownerId: string | null
  state: 'open' | 'done'
  revision: number
  createdBy: string
  createdAt: string
  doneBy: string | null
  doneAt: string | null
  origin: { artifactId: string; versionId: string; block: number; word: number; count: number } | null
}

export interface HumanTasks {
  list: HumanTask[]
  /** Create and Done keys: what each answered. */
  byKey: Map<string, string>
  /** The tasks whose origin this reader may not follow (another's private source, made ineligible, erased). */
  unavailable: Set<string>
  /** While set, a report's tasks are answered as the A17 proposal (with a quote), which A39's parser refuses. */
  proposed: boolean
  /** The next write never reaches the API: the page can't tell whether it landed (`dropNextTaskWrite`). */
  dropNext?: boolean
}

export interface TaskWorld {
  projectId: string
  me: string
  role: Membership['role']
  /** The project's active members. */
  members: ReadonlySet<string>
  nameOf: (actorId: string) => string | null
  /** The published versions of the fixture report, by id: their number. */
  versions: ReadonlyMap<string, number>
  report: { artifactId: string; title: string }
}

/** The seeded tasks' times, a minute apart. */
const seededAt = (n: number) => new Date(Date.UTC(2026, 9, 16, 9, 0, n)).toISOString()

/** No human task yet (the served page without `humantasks=seed`). */
export const noHumanTasks = (): HumanTasks => ({
  list: [],
  byKey: new Map(),
  unavailable: new Set(),
  proposed: false,
})

export const taskId = (n: number) => `00000000-0000-4000-8000-0000000c${String(n).padStart(4, '0')}`

/**
 * `humantasks=seed`: one for nobody yet, one for the reader from a passage of the report's first version, one for
 * Lucía, one for the reader from a passage they may not follow.
 */
export function seededTasks(
  world: TaskWorld,
  lucia: string,
  marco: string,
  firstVersion: string,
  options: { proposed?: boolean; many?: boolean } = {},
): HumanTasks {
  const { proposed = false, many = false } = options
  const task = (n: number, over: Partial<HumanTask>): HumanTask => ({
    taskId: taskId(n),
    title: `Task ${String(n)}`,
    ownerId: null,
    state: 'open',
    revision: 1,
    createdBy: marco,
    createdAt: seededAt(n),
    doneBy: null,
    doneAt: null,
    origin: null,
    ...over,
  })
  const passage = { artifactId: world.report.artifactId, versionId: firstVersion, block: 2, word: 0, count: 3 }
  // `humantasks=many`: sixty more, newer, so the four above are past the first page of 50.
  const more = many ? Array.from({ length: 60 }, (_, i) => task(10 + i, { title: `Later task ${String(i + 1)}` })) : []
  return {
    list: [
      ...more,
      task(4, { title: 'Read the private draft', ownerId: world.me, origin: { ...passage, block: 5 } }),
      task(3, { title: 'Call the venue', ownerId: lucia }),
      task(2, { title: 'Check the March figure', ownerId: world.me, origin: passage }),
      task(1, { title: 'Book the room' }),
    ],
    byKey: new Map(),
    unavailable: new Set([taskId(4)]),
    proposed,
  }
}

/** A task as A39 answers it to this reader: its origin decided for them. */
export function servedOf(tasks: HumanTasks, world: TaskWorld, t: HumanTask): ServedTask {
  const o = t.origin
  const origin: ServedTask['origin'] =
    o === null
      ? null
      : tasks.unavailable.has(t.taskId)
        ? { available: false }
        : {
            available: true,
            artifactId: o.artifactId,
            versionId: o.versionId,
            versionNumber: world.versions.get(o.versionId) ?? null,
            title: world.report.title,
            at: { block: o.block, word: o.word, count: o.count },
          }
  return {
    taskId: t.taskId,
    projectId: world.projectId,
    title: t.title,
    ownerId: t.ownerId,
    ownerName: t.ownerId === null ? null : world.nameOf(t.ownerId),
    state: t.state,
    revision: t.revision,
    createdBy: t.createdBy,
    createdByName: world.nameOf(t.createdBy),
    createdAt: t.createdAt,
    doneBy: t.doneBy,
    doneByName: t.doneBy === null ? null : world.nameOf(t.doneBy),
    doneAt: t.doneAt,
    origin,
  }
}

/** An answer: its status and body. */
export interface Answer {
  status: number
  body: unknown
}

const problem = (status: number, code: string, message: string): Answer => ({
  status,
  body: { code, message, requestId: '00000000-0000-4000-8000-0000000000c0', retry: 'never' },
})

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const onlyKeys = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).every((k) => keys.includes(k))
const isInt = (v: unknown, least: number, most: number) =>
  Number.isInteger(v) && Number(v) >= least && Number(v) <= most
const mayAssign = (role: Membership['role']) => role === 'admin' || role === 'editor'

/** A page of the project's tasks, 50 a page from an offset cursor (`o50`), as A39 pages them. */
export function projectPage(tasks: HumanTasks, world: TaskWorld, cursor: string | null) {
  const from = cursor && /^o[0-9]{1,6}$/.test(cursor) ? Number(cursor.slice(1)) : 0
  const all = listed(tasks)
  const page = all.slice(from, from + 50)
  return {
    tasks: page.map((t) => servedOf(tasks, world, t)),
    next: from + 50 < all.length ? `o${String(from + 50)}` : null,
  }
}

/** Open first, newest first. */
export const listed = (tasks: HumanTasks) =>
  tasks.list.toSorted(
    (a, b) => Number(a.state === 'done') - Number(b.state === 'done') || b.createdAt.localeCompare(a.createdAt),
  )

/** The A39 origin as a request names it: exactly its five fields, the place in its bounds, a published version. */
function originAsked(world: TaskWorld, o: unknown): HumanTask['origin'] | 'refused' {
  if (o === undefined || o === null) return null
  if (!isRecord(o) || !onlyKeys(o, ['artifactId', 'versionId', 'block', 'word', 'count'])) return 'refused'
  const ok =
    o.artifactId === world.report.artifactId &&
    typeof o.versionId === 'string' &&
    world.versions.has(o.versionId) &&
    isInt(o.block, 0, 9999) &&
    isInt(o.word, 0, 99999) &&
    isInt(o.count, 1, 60)
  return ok
    ? {
        artifactId: world.report.artifactId,
        versionId: String(o.versionId),
        block: Number(o.block),
        word: Number(o.word),
        count: Number(o.count),
      }
    : 'refused'
}

/** What a create asks, as A39's schema and rules read it; else the refusal. */
function asked(world: TaskWorld, body: unknown): Pick<HumanTask, 'title' | 'ownerId' | 'origin'> | Answer {
  if (!isRecord(body) || !onlyKeys(body, ['title', 'ownerId', 'origin'])) {
    return problem(422, 'invalid_request', 'Request fails the declared schema')
  }
  const title = typeof body.title === 'string' ? body.title : ''
  if (title.trim() === '' || title.length > 500) return problem(422, 'invalid_request', 'A task needs words')
  const ownerId = body.ownerId ?? null
  if (ownerId !== null && (typeof ownerId !== 'string' || !world.members.has(ownerId))) {
    return problem(422, 'invalid_request', 'The owner must be a member of the project')
  }
  const origin = originAsked(world, body.origin)
  if (origin === 'refused') return problem(422, 'invalid_request', 'The passage can’t be linked')
  return { title, ownerId, origin }
}

/** createProjectTask: an editor's or an admin's, once per key. */
export function createAnswer(tasks: HumanTasks, world: TaskWorld, key: string, body: unknown): Answer {
  if (!mayAssign(world.role)) return problem(403, 'forbidden', 'Not permitted')
  const replayed = tasks.byKey.get(`create ${key}`)
  const found = replayed ? tasks.list.find((t) => t.taskId === replayed) : undefined
  if (found) return { status: 201, body: servedOf(tasks, world, found) }
  const ask = asked(world, body)
  if ('status' in ask) return ask
  const task: HumanTask = {
    taskId: taskId(100 + tasks.list.length),
    ...ask,
    state: 'open',
    revision: 1,
    createdBy: world.me,
    createdAt: new Date().toISOString(),
    doneBy: null,
    doneAt: null,
  }
  tasks.list.push(task)
  tasks.byKey.set(`create ${key}`, task.taskId)
  return { status: 201, body: servedOf(tasks, world, task) }
}

const notFound = () => problem(422, 'not_found', 'Task not found')

/** setTaskOwner: an editor's or an admin's, against the revision shown. */
export function ownerAnswer(tasks: HumanTasks, world: TaskWorld, id: string, body: unknown): Answer {
  if (!mayAssign(world.role)) return problem(403, 'forbidden', 'Not permitted')
  const t = tasks.list.find((x) => x.taskId === id)
  if (!t) return notFound()
  if (!isRecord(body) || !onlyKeys(body, ['ownerId', 'expectedRevision'])) {
    return problem(422, 'invalid_request', 'Request fails the declared schema')
  }
  if (body.expectedRevision !== t.revision) return problem(409, 'stale_revision', 'Stale task revision')
  if (t.state === 'done') return problem(409, 'invalid_state', 'The task is done')
  const ownerId = body.ownerId ?? null
  if (ownerId !== null && (typeof ownerId !== 'string' || !world.members.has(ownerId))) {
    return problem(422, 'invalid_request', 'The owner must be a member of the project')
  }
  if (t.ownerId !== ownerId) Object.assign(t, { ownerId, revision: t.revision + 1 })
  return { status: 200, body: servedOf(tasks, world, t) }
}

/** finishProjectTask: an editor or an admin, any open task; a viewer, only one theirs. Once per key, on its revision. */
export function doneAnswer(tasks: HumanTasks, world: TaskWorld, id: string, key: string, body: unknown): Answer {
  const t = tasks.list.find((x) => x.taskId === id)
  if (!t) return notFound()
  if (!mayAssign(world.role) && t.ownerId !== world.me) return problem(403, 'forbidden', 'Not permitted')
  if (tasks.byKey.get(`done ${key}`) === id) return { status: 200, body: servedOf(tasks, world, t) }
  if (!isRecord(body) || !onlyKeys(body, ['expectedRevision'])) {
    return problem(422, 'invalid_request', 'Request fails the declared schema')
  }
  if (body.expectedRevision !== t.revision) return problem(409, 'stale_revision', 'Stale task revision')
  if (t.state === 'done') return problem(409, 'invalid_state', 'The task is done')
  Object.assign(t, { state: 'done', doneBy: world.me, doneAt: new Date().toISOString(), revision: t.revision + 1 })
  tasks.byKey.set(`done ${key}`, id)
  return { status: 200, body: servedOf(tasks, world, t) }
}

/** A report's tasks: those whose origin is that report and is available to this reader. */
export function reportTasks(tasks: HumanTasks, world: TaskWorld, artifactId: string): Answer {
  if (tasks.proposed) {
    // The A17 proposal's shape (a quote, no revision): A39's generated parser refuses it.
    return {
      status: 200,
      body: { tasks: [{ taskId: taskId(9), text: 'x', from: { quote: 'The fixture holds.' } }] },
    }
  }
  const shown = listed(tasks).filter((t) => t.origin?.artifactId === artifactId && !tasks.unavailable.has(t.taskId))
  return { status: 200, body: { tasks: shown.map((t) => servedOf(tasks, world, t)), next: null } }
}
