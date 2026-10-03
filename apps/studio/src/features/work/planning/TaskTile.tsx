// One task on the board, as a compact tile (PlanBoard): who does it (a picture with their tool's badge; a ring around
// it emptying as its session's last report ages), the task, where it stands while it moves, and its foot: what its
// session last reported, or what the task hangs on. It is a button: pressing it opens the task's sheet.
import { Tip } from '@sophia/ui'
import { Avatar } from '../../../app/Avatar.tsx'
import { followPointer } from '../../resources/motion.ts'
import { ToolLogo } from '../../resources/ToolLogo.tsx'
import { freshness, observedAgo, type Resource } from '../../resources/resource.ts'
import { relation, type Mark, type PlanRow, type WorkPlan } from './plan.ts'

type Person = Resource['owner']
type Activity = NonNullable<NonNullable<PlanRow['doer']['session']>['activity']>

/** The marks a tile says in words: those its lane doesn't already say. */
const SAID: ReadonlySet<Mark> = new Set(['waiting', 'working', 'queued', 'finished', 'checked'])

const face = (p: Person) => ({ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null })

/** Where a task stands, as its tile says it: to the one it waits on, "Waiting on you"; a finished run, unchecked. */
function said(row: PlanRow, viewerId: string | null): string {
  if (row.status.mark === 'waiting' && row.doer.person?.id === viewerId) return 'Waiting on you'
  if (row.status.mark === 'finished') return 'Not checked yet'
  return row.status.text
}

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

function Who({ row, activity, now }: { row: PlanRow; activity: Activity | null; now: Date }) {
  const { doer } = row
  const who = doer.role ? `${doer.name} · ${doer.role}` : doer.name
  return (
    <span
      className="task-who live-ring has-tip"
      data-live={activity ? true : undefined}
      data-waiting={row.status.mark === 'waiting' || undefined}
      style={activity ? { '--fresh': freshness(activity.observedAt, now) } : undefined}
    >
      {doer.person ? (
        <Avatar identity={face(doer.person)} />
      ) : (
        <span className="plan-nobody" data-free={doer.name === 'Unassigned' || undefined} />
      )}
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
        <span className="task-tile-ago">{observedAgo(activity.observedAt, now)}</span>
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

export function TaskTile({ row, index, flags, plan, viewerId, now, onLight, onOpen, shortOf }: TileProps) {
  const { item, doer, status } = row
  const moving = SAID.has(status.mark)
  const activity = (moving && doer.session?.activity) || null
  const short = shortOf(row)
  return (
    <li>
      <button
        type="button"
        className="task-tile"
        data-mark={status.mark}
        data-tool={doer.resource?.tool}
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
            <span className="task-tile-name">{doer.name}</span>
            {moving && (
              <span className="task-chip" data-mark={status.mark}>
                <span className="plan-mark" data-mark={status.mark} aria-hidden />
                {said(row, viewerId)}
              </span>
            )}
          </span>
          <Foot activity={activity} hangs={relation(item, plan)} waiting={status.mark === 'waiting'} now={now} />
          {short && <Short words={short} />}
        </span>
      </button>
    </li>
  )
}
