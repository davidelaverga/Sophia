// One task on the board, as a compact tile (PlanBoard): who does it (a picture with their tool's badge, or Sophia's
// light for her own workers; a ring around it emptying as the last report ages), the task, where it stands while it
// moves, and its foot: what its current attempt last reported, or what the task hangs on. The ring is the report's
// age and nothing more: an old report during a long, healthy tool call is old, not stuck. The connection is said
// apart, only when it isn't online. It is a button: pressing it opens the task's sheet.
import { Tip } from '@sophia/ui'
import { Avatar } from '../../../app/Avatar.tsx'
import { followPointer } from '../../resources/motion.ts'
import { ToolLogo } from '../../resources/ToolLogo.tsx'
import { freshness, observedAgo, type Resource } from '../../resources/resource.ts'
import { hangsOn, type Mark, type PlanRow, type WorkPlan } from './plan.ts'

type Person = Resource['owner']
type Activity = NonNullable<PlanRow['activity']>

/** The marks a tile says in words: those its lane doesn't already say. */
const SAID: ReadonlySet<Mark> = new Set(['waiting', 'changes', 'review', 'unknown', 'held', 'working', 'queued'])

const face = (p: Person) => ({ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null })

/** Where a task stands, as its tile says it: to the one it waits on, "Waiting on you". */
export function said(row: PlanRow, viewerId: string | null): string {
  if (row.status.mark === 'waiting' && row.status.on && row.status.on.id === viewerId) return 'Waiting on you'
  return row.status.text
}

/** The connection, when it isn't online: said apart from the report's age, never read from it. */
export const connectionSaid = (activity: Activity | null) =>
  activity?.connection === 'offline'
    ? 'connection lost'
    : activity?.connection === 'unknown'
      ? 'connection unknown'
      : null

export interface TileFlags {
  /** A task the hovered one waits on. */
  lit: boolean
  /** The hovered task, whose threads are drawn. */
  hover: boolean
  /** Outside the lens. */
  dim: boolean
  /** Moved since the viewer last looked. */
  changed: boolean
}

/** Who does it, as a face: a person with their tool's badge, Sophia's light for her own worker, or no one. */
function Face({ row }: { row: PlanRow }) {
  const { doer } = row
  if (doer.kind === 'sophia_native') return <span className="plan-sophia" aria-hidden />
  return doer.person ? (
    <Avatar identity={face(doer.person)} />
  ) : (
    <span className="plan-nobody" data-free={doer.name === 'Unassigned' || undefined} />
  )
}

function Who({ row, activity, now }: { row: PlanRow; activity: Activity | null; now: Date }) {
  const { doer } = row
  const who = doer.role ? `${doer.name} · ${doer.role}` : doer.name
  return (
    <span
      className="task-who live-ring has-tip"
      data-live={activity ? true : undefined}
      data-waiting={row.status.mark === 'waiting' || undefined}
      style={activity ? { '--fresh': freshness(activity.observed_at, now) } : undefined}
    >
      <Face row={row} />
      {doer.resource && <ToolLogo tool={doer.resource.tool} size="sm" />}
      <Tip label={who} side="top" align="center" />
    </span>
  )
}

interface FootProps {
  activity: Activity | null
  hangs: string | null
  /** Its session waits: the dot is amber, as its ring is. */
  waiting: boolean
  now: Date
}

/** Its foot: what its session last reported while it moves, else what it hangs on. */
function Foot({ activity, hangs, waiting, now }: FootProps) {
  if (activity) {
    return (
      <span className="task-tile-activity">
        <span className="activity-dot" data-waiting={waiting || undefined} aria-hidden />
        <span className="task-tile-said">{activity.said}</span>
        <span className="task-tile-ago">{observedAgo(activity.observed_at, now)}</span>
        {connectionSaid(activity) && <span className="task-tile-connection">{connectionSaid(activity)}</span>}
      </span>
    )
  }
  return hangs ? <span className="task-tile-hangs">{hangs}</span> : null
}

export interface TileProps {
  row: PlanRow
  /** Its place in its lane: tiles arrive in turn. */
  index: number
  flags: TileFlags
  plan: WorkPlan
  viewerId: string | null
  now: Date
  onLight: (id: string | null) => void
  onOpen: (id: string) => void
  /** What its doer's account is short of, in a tile's few words (room.ts): "out in ~34 min"; null when it isn't. */
  shortOf: (row: PlanRow) => string | null
}

/** Its doer's account running short, said under a task that moves: amber, after a small gauge, on one line. */
function Short({ words }: { words: string }) {
  return (
    <span className="task-tile-short">
      <span className="task-short-gauge" aria-hidden />
      <span className="task-tile-short-words">Account {words}</span>
    </span>
  )
}

/** The name under its task: Sophia's own worker with its role ("Sophia · Source reviewer"), anyone else by name. */
const nameOf = (doer: PlanRow['doer']) =>
  doer.kind === 'sophia_native' && doer.role ? `${doer.name} · ${doer.role}` : doer.name

/** Whose colour the tile takes: its tool's, or Sophia's for her own worker. */
const toolOf = (doer: PlanRow['doer']) => doer.resource?.tool ?? (doer.kind === 'sophia_native' ? 'sophia' : undefined)

/** Where a moving task stands, in its chip. */
function Chip({ row, viewerId }: { row: PlanRow; viewerId: string | null }) {
  return (
    <span className="task-chip" data-mark={row.status.mark}>
      <span className="plan-mark" data-mark={row.status.mark} aria-hidden />
      {said(row, viewerId)}
    </span>
  )
}

export function TaskTile({ row, index, flags, plan, viewerId, now, onLight, onOpen, shortOf }: TileProps) {
  const { item, doer, status } = row
  const moving = SAID.has(status.mark)
  const activity = moving ? row.activity : null
  const short = shortOf(row)
  return (
    <li>
      <button
        type="button"
        className="task-tile"
        data-mark={status.mark}
        data-tool={toolOf(doer)}
        data-lit={flags.lit || undefined}
        data-hover={flags.hover || undefined}
        data-dim={flags.dim || undefined}
        data-changed={flags.changed || undefined}
        data-task={item.id}
        data-short={short ? true : undefined}
        // Its own name for the glide: when where it stands changes, it travels to its new lane.
        style={{ '--i': Math.min(index, 6), viewTransitionName: `task-${item.id.replaceAll(/[^\w-]/g, '-')}` }}
        onPointerMove={followPointer}
        onPointerEnter={() => onLight(item.id)}
        onPointerLeave={() => onLight(null)}
        onFocus={() => onLight(item.id)}
        onBlur={() => onLight(null)}
        onClick={() => onOpen(item.id)}
      >
        <Who row={row} activity={activity} now={now} />
        <span className="task-tile-body">
          <span className="task-tile-title">{item.purpose}</span>
          <span className="task-tile-meta">
            <span className="task-tile-name">{nameOf(doer)}</span>
            {moving && <Chip row={row} viewerId={viewerId} />}
          </span>
          <Foot activity={activity} hangs={hangsOn(row, plan)} waiting={status.mark === 'waiting'} now={now} />
          {short && <Short words={short} />}
        </span>
      </button>
    </li>
  )
}
