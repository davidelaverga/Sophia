// One resource as a tile, to scan many at a glance: its tool as itself and its host, whose it is, what it is doing,
// and how full its account is. Four lines, never more; everything else opens in its sheet (ResourceSheet). Its name
// is whose tool it is; what its lines say is its description, so assistive technology hears them too.
import { useEffect, useId, useRef, useState } from 'react'
import { Tag } from '@sophia/ui'
import type { Buddy } from './buddies.ts'
import { Meter } from './Meter.tsx'
import { ModelChip } from './ModelChip.tsx'
import { followPointer } from './motion.ts'
import { OwnerAvatar } from './OwnerAvatar.tsx'
import { activity, ago, capacity, TOOL, type Capacity, type QuotaObservation, type Resource } from './resource.ts'
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
  onOpen: () => void
  /** A Claude Code neighbour in its row, and which way this tile's mark looks at it (buddies.ts). */
  buddy?: Buddy | undefined
  /** The grid's roving focus: only the current tile is in the Tab order; arrow keys move between them. */
  current: boolean
  onFocus: () => void
  ref?: React.Ref<HTMLButtonElement>
}

interface OwnerProps {
  owner: Resource['owner']
  mine: boolean
  waiting: number
  /** The id a part of the tile is said under, for the tile's description. */
  said: (part: string) => string
}

/** Whose it is, and the tags that apply: "You", and how many requests wait on its owner. */
function Owner({ owner, mine, waiting, said }: OwnerProps) {
  return (
    <span className="resource-tile-owner">
      <OwnerAvatar owner={owner} />
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

/** The tile's foot: its capacity in a line, over a meter for a percentage or an empty track for what isn't known. */
function TileCapacity({ capacity: { line, limiting, known, pace }, id }: { capacity: Capacity; id: string }) {
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
      <span id={id} className="resource-tile-capacity-line" title={line}>
        {line}
      </span>
    </span>
  )
}

export function ResourceTile(props: Props) {
  const { resource, observation, now, mine, waiting, onOpen, current, onFocus, ref, buddy } = props
  const { tool, owner, host } = resource
  const held = capacity(observation, now)
  // The model of the session at work, else the first one reported.
  const model = (resource.sessions.find((s) => s.assignment && s.model) ?? resource.sessions.find((s) => s.model))
    ?.model
  const id = useId()
  const changed = useChanged(`${host.state}|${waiting}|${held.limiting?.percent ?? ''}|${held.known}`)
  const said = (part: string) => `${id}-${part}`
  const described = ['host', mine && 'you', waiting > 0 && 'waiting', 'activity', 'capacity']
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
      data-changed={changed || undefined}
      data-waiting={waiting > 0 || undefined}
      aria-label={`${owner.name} · ${TOOL[tool]}`}
      aria-haspopup="dialog"
      aria-describedby={described}
      ref={ref}
      tabIndex={current ? 0 : -1}
      onFocus={onFocus}
      onClick={onOpen}
      onPointerMove={followPointer}
    >
      <span className="resource-tile-head">
        <ToolLogo tool={tool} />
        <span className="resource-tile-name">{TOOL[tool]}</span>
        <span id={said('host')} className={`resource-tile-host ${host.state}`}>
          <span className="resource-dot" aria-hidden />
          {hostLabel(host, now)}
        </span>
      </span>
      <Owner owner={owner} mine={mine} waiting={waiting} said={said} />
      <span id={said('activity')} className="resource-tile-activity" title={activity(resource)}>
        {model && <ModelChip model={model} />}
        <span className="resource-tile-activity-words">{activity(resource)}</span>
      </span>
      <TileCapacity capacity={held} id={said('capacity')} />
    </button>
  )
}
