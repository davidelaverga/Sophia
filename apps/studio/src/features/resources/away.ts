// What changed in Resources since its viewer last looked (LFE-06.7; LFE-09's "useful return", as on the plan's board):
// a glance at each resource when they marked it seen (its host, the requests waiting on its owner, what each session
// works on, whether its account runs short), compared with now. Only what a phrase says marks a tile, so every mark
// has its words and its Mark seen. A first visit remembers Resources as they are and says nothing. Kept per scope and
// per viewer in this browser; a browser that refuses storage, or holds something unreadable, just forgets.
import { capacity, observationOf, TOOL, type QuotaObservation, type RequiredAction, type Resource } from './resource.ts'
import { short, shortWords } from './room.ts'

/** One resource at a glance: what the line compares. */
export interface Glance {
  host: Resource['host']['state']
  /** The requests waiting on its owner, by id: one gone from here, now answered, is said, even when another came. */
  requests: string[]
  /** Each session's work: `<work id>|<state>|<title>`, by session id; absent when it has none. */
  work: Record<string, string>
  short: boolean
}
export type Seen = Record<string, Glance>

export function glance(
  resources: readonly Resource[],
  actions: readonly RequiredAction[],
  observations: readonly QuotaObservation[],
  now: Date,
): Seen {
  return Object.fromEntries(
    resources.map((r) => [
      r.id,
      {
        host: r.host.state,
        requests: actions.filter((a) => a.resourceId === r.id && a.state === 'open').map((a) => a.id),
        work: Object.fromEntries(
          r.sessions.flatMap((s) =>
            s.assignment ? [[s.id, `${s.assignment.workId}|${s.assignment.state}|${s.assignment.title}`]] : [],
          ),
        ),
        short: short(capacity(observationOf(observations, r), now)),
      },
    ]),
  )
}

const HOSTS: ReadonlySet<unknown> = new Set(['online', 'offline', 'unknown'])
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const isGlance = (v: unknown): v is Glance =>
  isRecord(v) &&
  HOSTS.has(v['host']) &&
  Array.isArray(v['requests']) &&
  v['requests'].every((id) => typeof id === 'string') &&
  typeof v['short'] === 'boolean' &&
  isRecord(v['work']) &&
  Object.values(v['work']).every((w) => typeof w === 'string')

const isSeen = (v: unknown): v is Seen => isRecord(v) && Object.values(v).every(isGlance)

/** A stored glance as it reads back: every resource's glance whole, or nothing. */
export const asSeen = (value: unknown): Seen | null => (isSeen(value) ? value : null)

// v2: requests by id (v1 counted them). A v1 glance reads as none: a first visit, said nothing.
const key = (scope: string, viewerId: string) => `sophia.resources.seen.v2.${scope}.${viewerId}`

export function readSeen(scope: string, viewerId: string): Seen | null {
  try {
    const raw = localStorage.getItem(key(scope, viewerId))
    return asSeen(raw ? JSON.parse(raw) : null)
  } catch {
    return null
  }
}

export function writeSeen(scope: string, viewerId: string, seen: Seen): Seen {
  try {
    localStorage.setItem(key(scope, viewerId), JSON.stringify(seen))
  } catch {
    // Not kept: the next visit starts from here again.
  }
  return seen
}

/** A phrase and how pressing it is: lower first (the design note's order). */
interface Said {
  rank: number
  text: string
}
const RANK = { short: 1, offline: 2, started: 3, queued: 4, letGo: 4, isNew: 4, online: 5, answered: 5 } as const

type Work = ReturnType<typeof parts>
const parts = (work: string | undefined) => {
  const [workId = '', state = '', title = ''] = (work ?? '').split('|')
  return { workId, state, title }
}

/**
 * What one session's work became. Waiting isn't said: its request is said on top while it waits. A title alone
 * changing isn't a move.
 */
function workMoved(name: string, was: Work, is: Work): Said | null {
  if (was.workId === is.workId && was.state === is.state) return null
  if (!is.workId) return { rank: RANK.letGo, text: `${name} is no longer on ${was.title}` }
  if (is.state === 'waiting') return null
  // Back from waiting on its owner, it resumes; from queued, or on other work, it starts.
  const resumed = was.workId === is.workId && was.state === 'waiting'
  if (is.state === 'running') {
    return { rank: RANK.started, text: resumed ? `${name} is back on ${is.title}` : `${name} started ${is.title}` }
  }
  return {
    rank: RANK.queued,
    text: is.state === 'queued' ? `${name} queued ${is.title}` : `${name} was given ${is.title}`,
  }
}

function workSaid(name: string, before: Glance, after: Glance): Said[] {
  const sessions = new Set([...Object.keys(before.work), ...Object.keys(after.work)])
  return [...sessions].flatMap((id) => workMoved(name, parts(before.work[id]), parts(after.work[id])) ?? [])
}

/** A resource as the line names it: "Your Codex", "Davide’s Claude Code". */
const nameOf = (r: Resource, viewerId: string) =>
  `${r.owner.id === viewerId ? 'Your' : `${r.owner.name}’s`} ${TOOL[r.tool]}`

interface Context {
  resource: Resource
  before: Glance
  after: Glance
  viewerId: string
  /** The requests as they are now: one that left the waiting is said only if it was answered (resolved or denied). */
  actions: readonly RequiredAction[]
  /** Its account's short words now, when it runs short: "runs out in ~34 min". */
  shortNow: string | null
}

/** What changed on one resource, each change a phrase; a change no phrase says is no change here. */
function resourceSaid({ resource, before, after, viewerId, shortNow, actions }: Context): Said[] {
  const name = nameOf(resource, viewerId)
  const said: Said[] = []
  // A request that came to wait is said on top, while it waits (Attention): not said twice. One answered is.
  // Superseded (its attempt restarted), expired or not settled yet isn't answered: nothing is said of it here.
  const answered = before.requests.filter((id) => !after.requests.includes(id) && wasAnswered(actions, id)).length
  if (answered > 0) {
    const what = answered === 1 ? 'A request' : `${String(answered)} requests`
    said.push({ rank: RANK.answered, text: `${what} on ${name} ${answered === 1 ? 'was' : 'were'} answered` })
  }
  if (after.short && !before.short && shortNow) said.push({ rank: RANK.short, text: `${name} ${shortNow}` })
  if (after.host !== before.host) {
    if (after.host === 'offline') said.push({ rank: RANK.offline, text: `${name} went offline` })
    // Back online only from offline: from unknown, nothing was known to be away.
    if (after.host === 'online' && before.host === 'offline') {
      said.push({ rank: RANK.online, text: `${name} is back online` })
    }
  }
  return [...said, ...workSaid(name, before, after)]
}

const ANSWERED: ReadonlySet<RequiredAction['state']> = new Set(['resolved', 'denied'])
const wasAnswered = (actions: readonly RequiredAction[], id: string) =>
  actions.some((a) => a.id === id && ANSWERED.has(a.state))

interface AwayInput {
  resources: readonly Resource[]
  /** The requests as they are now. */
  actions: readonly RequiredAction[]
  observations: readonly QuotaObservation[]
  now: Seen
  seen: Seen | null
  at: Date
  viewerId: string
}

export interface Away {
  /** A few phrases, the most pressing first. */
  phrases: string[]
  /** How many more were not said. */
  more: number
  /** The resources a phrase speaks of: only those are marked. */
  ids: ReadonlySet<string>
}

const NOTHING: Away = { phrases: [], more: 0, ids: new Set() }

/** What changed while the viewer was away: a few phrases, the most pressing first, the rest counted. */
export function whileAway({ resources, actions, observations, now, seen, at, viewerId }: AwayInput): Away {
  if (!seen) return NOTHING
  const said = resources.flatMap((resource) => {
    const after = now[resource.id]
    const before = seen[resource.id]
    if (!after) return []
    if (!before) return [{ id: resource.id, rank: RANK.isNew, text: `${nameOf(resource, viewerId)} is new here` }]
    const shortNow = shortWords(capacity(observationOf(observations, resource), at))
    return resourceSaid({ resource, before, after, viewerId, shortNow, actions }).map((s) => ({
      ...s,
      id: resource.id,
    }))
  })
  const ordered = said.toSorted((a, b) => a.rank - b.rank)
  return {
    phrases: ordered.slice(0, 3).map((s) => s.text),
    more: Math.max(0, ordered.length - 3),
    // Only what is said marks a tile: the ones counted in "and N more" aren't named, so they aren't marked.
    ids: new Set(ordered.slice(0, 3).map((s) => s.id)),
  }
}
