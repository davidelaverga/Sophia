// One resource as a tile, to scan many at a glance: its tool as itself and its host, whose it is, what it is doing,
// and how full its account is. Four lines, and a fifth while a session reports live: what its tool last said, with a
// ring around its owner's picture emptying as that ages (as on the plan's board). Everything else opens in its sheet
// (ResourceSheet). Its name is whose tool it is; what its lines say is its description, so assistive technology hears
// them too.
import { useEffect, useId, useRef, useState } from 'react'
import { Tag } from '@sophia/ui'
import type { Buddy } from './buddies.ts'
import { Meter } from './Meter.tsx'
import { ModelChip } from './ModelChip.tsx'
import { followPointer } from './motion.ts'
import { OwnerAvatar } from './OwnerAvatar.tsx'
import {
  activity,
  ago,
  capacity,
  freshness,
  liveSession,
  observedAgo,
  reportsLive,
  tileCapacity,
  TOOL,
  type Capacity,
  type QuotaObservation,
  type Resource,
  type Session,
} from './resource.ts'
import { ToolLogo } from './ToolLogo.tsx'

const HOST = { online: 'Online', offline: 'Offline', unknown: 'Unknown' } as const

/** An offline host says how long it has been gone: "Offline · 26 h". */
function hostLabel({ state, observedAt }: Resource['host'], now: Date): string {
  if (state !== 'offline' || !observedAt) return HOST[state]
  return `${HOST[state]} · ${ago(observedAt, now).replace(/ ago$/, '')}`
}

interface Props {
  resource: Resource
  observation: QuotaObservation | undefined
  now: Date
  mine: boolean
  /** Requests waiting on this resource's owner: said on the tile, in amber. */
  waiting: number
  /** Which requests wait (their ids): a new one is a change even when the count stays. */
  waitingKey?: string
  onOpen: () => void
  /** A Claude Code neighbour in its row, and which way this tile's mark looks at it (buddies.ts). */
  buddy?: Buddy | undefined
  /** Dragging it onto another tile moves it there (TileGrid). */
  drag?: React.HTMLAttributes<HTMLButtonElement> & { draggable: boolean }
  /** It changed since the viewer last looked: a small lavender dot breathes at its corner. */
  away?: boolean
  /** The grid's roving focus: only the current tile is in the Tab order; arrow keys move between them. */
  current: boolean
  onFocus: () => void
  ref?: React.Ref<HTMLButtonElement>
}

interface OwnerProps {
  owner: Resource['owner']
  mine: boolean
  waiting: number
  /** The session reporting live, whose last report's age empties the ring around the picture; null when none is. */
  live: Session | null
  now: Date
  /** The id a part of the tile is said under, for the tile's description. */
  said: (part: string) => string
}

/** Whose it is, and the tags that apply: "You", and how many requests wait on its owner. */
function Owner({ owner, mine, waiting, live, now, said }: OwnerProps) {
  const reported = live?.activity
  return (
    <span className="resource-tile-owner">
      <span
        className="resource-face live-ring"
        data-live={reported ? true : undefined}
        data-waiting={live?.assignment?.state === 'waiting' || undefined}
        style={reported ? { '--fresh': freshness(reported.observedAt, now) } : undefined}
      >
        <OwnerAvatar owner={owner} />
      </span>
      {owner.name}
      {mine && (
        <span id={said('you')}>
          <Tag tone="lav">You</Tag>
        </span>
      )}
      {waiting > 0 && (
        <span id={said('waiting')}>
          <Tag tone="amber">{waiting} waiting</Tag>
        </span>
      )}
    </span>
  )
}

/**
 * Whether what a tile says changed a moment ago: its host, what waits, its capacity. Not its words, which move with
 * the clock. True for a little over a second, so the tile can say it once.
 */
function useChanged(signature: string): boolean {
  const last = useRef(signature)
  const [changed, setChanged] = useState(false)
  useEffect(() => {
    if (last.current === signature) return undefined
    last.current = signature
    setChanged(true)
    const timer = setTimeout(() => setChanged(false), 1400)
    return () => clearTimeout(timer)
  }, [signature])
  return changed
}

/** What the session at work last reported, and how long ago: amber while it waits, still once it isn't live. */
function Live({ session, live, now, id }: { session: Session; live: boolean; now: Date; id: string }) {
  const { activity: reported, assignment } = session
  if (!reported) return null
  return (
    <span id={id} className="resource-tile-live" title={reported.said}>
      <span
        className="activity-dot"
        data-waiting={assignment?.state === 'waiting' || undefined}
        data-still={live ? undefined : true}
        aria-hidden
      />
      <span className="resource-tile-said">{reported.said}</span>
      <span className="resource-tile-ago">{observedAgo(reported.observedAt, now)}</span>
    </span>
  )
}

/**
 * The tile's foot: its capacity over a meter for a percentage, or an empty track for what isn't known. A percentage is
 * said short, the window and how full on one end and what comes on the other ("out in ~35 min", in amber, when it runs
 * out first); its description keeps the whole line.
 */
function TileCapacity({ capacity: held, id }: { capacity: Capacity; id: string }) {
  const { line, limiting, known, pace } = held
  const short = tileCapacity(held)
  return (
    <span className="resource-tile-capacity">
      {(limiting || !known) && (
        <Meter
          label={limiting ? `${limiting.name} window` : 'Capacity'}
          percent={limiting?.percent ?? null}
          value={line}
          passed={pace?.passed}
        />
      )}
      {short ? (
        <span className="resource-tile-capacity-line" title={line} data-out={short.out || undefined}>
          <span id={id} className="sr-only">
            {short.out ? `${line}, ${short.next ?? ''}` : line}
          </span>
          <span aria-hidden>{short.head}</span>
          {short.next && (
            <span className="resource-tile-next" aria-hidden>
              {short.next}
            </span>
          )}
        </span>
      ) : (
        <span id={id} className="resource-tile-capacity-line" title={line}>
          {line}
        </span>
      )}
    </span>
  )
}

/**
 * What a tile says, as one value that changes only when it does: its host, which requests wait, and its capacity's
 * window, value and reset. Never the clock's words, which move every minute.
 */
function saysNow({ resource, observation, waiting, waitingKey }: Props, held: Capacity): string {
  const headline = observation?.windows.find((w) => w.window_id === held.windowId)
  return [
    resource.host.state,
    waitingKey ?? waiting,
    held.known,
    held.windowId,
    headline?.value,
    headline?.resets_at,
  ].join('|')
}

/** What the tile wears for its moments: a change just now, something waiting, a change since the last look. */
const marks = ({ changed, waiting, away }: { changed: boolean; waiting: number; away?: boolean | undefined }) => ({
  'data-changed': changed || undefined,
  'data-waiting': waiting > 0 || undefined,
  'data-away': away || undefined,
})

export function ResourceTile(props: Props) {
  const { resource, observation, now, mine, waiting, onOpen, current, onFocus, ref, buddy, drag } = props
  const { tool, owner, host } = resource
  const held = capacity(observation, now)
  // The model of the session at work, else the first one reported.
  const model = (resource.sessions.find((s) => s.assignment && s.model) ?? resource.sessions.find((s) => s.model))
    ?.model
  const speaks = liveSession(resource)
  const live = reportsLive(resource, speaks, now)
  const id = useId()
  const changed = useChanged(saysNow(props, held))
  const said = (part: string) => `${id}-${part}`
  const described = ['host', mine && 'you', waiting > 0 && 'waiting', 'activity', speaks && 'live', 'capacity']
    .filter((part) => typeof part === 'string')
    .map(said)
    .join(' ')
  return (
    <button
      type="button"
      className="resource-tile"
      data-tool={tool}
      data-resource={resource.id}
      data-buddy={buddy}
      data-host={host.state}
      {...marks({ changed, waiting, away: props.away })}
      aria-label={`${owner.name} · ${TOOL[tool]}`}
      aria-haspopup="dialog"
      aria-describedby={described}
      ref={ref}
      tabIndex={current ? 0 : -1}
      onFocus={onFocus}
      onClick={onOpen}
      onPointerMove={followPointer}
      {...drag}
    >
      <span className="resource-tile-head">
        <ToolLogo tool={tool} />
        <span className="resource-tile-name">{TOOL[tool]}</span>
        <span id={said('host')} className={`resource-tile-host ${host.state}`}>
          <span className="resource-dot" aria-hidden />
          {hostLabel(host, now)}
        </span>
      </span>
      <Owner owner={owner} mine={mine} waiting={waiting} live={live ? speaks : null} now={now} said={said} />
      <span id={said('activity')} className="resource-tile-activity" title={activity(resource)}>
        {model && <ModelChip model={model} />}
        <span className="resource-tile-activity-words">{activity(resource)}</span>
      </span>
      {speaks && <Live session={speaks} live={live} now={now} id={said('live')} />}
      <TileCapacity capacity={held} id={said('capacity')} />
    </button>
  )
}
