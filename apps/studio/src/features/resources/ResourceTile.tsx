// One resource as a tile, to scan many at a glance: its tool as itself and its host, whose it is, what it is doing,
// and how full its account is. Four lines, never more; everything else opens in its sheet (ResourceSheet). Its name
// is whose tool it is; what its lines say is its description, so assistive technology hears them too.
import { useId } from 'react'
import { Tag } from '@sophia/ui'
import { Meter } from './Meter.tsx'
import { followPointer } from './motion.ts'
import { activity, capacity, TOOL, type QuotaObservation, type Resource } from './resource.ts'
import { ToolLogo } from './ToolLogo.tsx'

const HOST = { online: 'Online', offline: 'Offline', unknown: 'Unknown' } as const

interface Props {
  resource: Resource
  observation: QuotaObservation | undefined
  now: Date
  mine: boolean
  /** Requests waiting on this resource's owner: said on the tile, in amber. */
  waiting: number
  onOpen: () => void
}

interface OwnerProps {
  name: string
  mine: boolean
  waiting: number
  /** The id a part of the tile is said under, for the tile's description. */
  said: (part: string) => string
}

/** Whose it is, and the tags that apply: "You", and how many requests wait on its owner. */
function Owner({ name, mine, waiting, said }: OwnerProps) {
  return (
    <span className="resource-tile-owner">
      <span className="resource-initial" aria-hidden>
        {name.charAt(0)}
      </span>
      {name}
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

export function ResourceTile({ resource, observation, now, mine, waiting, onOpen }: Props) {
  const { tool, owner, host } = resource
  const { line, limiting, known } = capacity(observation, now)
  const id = useId()
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
      aria-label={`${owner.name} · ${TOOL[tool]}`}
      aria-haspopup="dialog"
      aria-describedby={described}
      onClick={onOpen}
      onPointerMove={followPointer}
    >
      <span className="resource-tile-head">
        <ToolLogo tool={tool} />
        <span className="resource-tile-name">{TOOL[tool]}</span>
        <span id={said('host')} className={`resource-tile-host ${host.state}`}>
          <span className="resource-dot" aria-hidden />
          {HOST[host.state]}
        </span>
      </span>
      <Owner name={owner.name} mine={mine} waiting={waiting} said={said} />
      <span id={said('activity')} className="resource-tile-activity" title={activity(resource)}>
        {activity(resource)}
      </span>
      <span className="resource-tile-capacity">
        {(limiting || !known) && (
          <Meter
            label={limiting ? `${limiting.name} window` : 'Capacity'}
            percent={limiting?.percent ?? null}
            value={line}
          />
        )}
        <span id={said('capacity')} className="resource-tile-capacity-line" title={line}>
          {line}
        </span>
      </span>
    </button>
  )
}
