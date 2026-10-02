// One resource as a tile, to scan many at a glance: its tool as itself and its host, whose it is, what it is doing,
// and how full its account is. Four lines, never more; everything else opens in its sheet (ResourceSheet).
import { Tag } from '@sophia/ui'
import { Meter } from './Meter.tsx'
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

export function ResourceTile({ resource, observation, now, mine, waiting, onOpen }: Props) {
  const { tool, owner, host } = resource
  const { line, limiting, known } = capacity(observation, now)
  return (
    <button
      type="button"
      className="resource-tile"
      data-tool={tool}
      aria-label={`${owner.name} · ${TOOL[tool]}`}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <span className="resource-tile-head">
        <ToolLogo tool={tool} />
        <span className="resource-tile-name">{TOOL[tool]}</span>
        <span className={`resource-tile-host ${host.state}`}>
          <span className="resource-dot" aria-hidden />
          {HOST[host.state]}
        </span>
      </span>
      <span className="resource-tile-owner">
        <span className="resource-initial" aria-hidden>
          {owner.name.charAt(0)}
        </span>
        {owner.name}
        {mine && <Tag tone="lav">You</Tag>}
        {waiting > 0 && <Tag tone="amber">{waiting} waiting</Tag>}
      </span>
      <span className="resource-tile-activity" title={activity(resource)}>
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
        <span className="resource-tile-capacity-line" title={line}>
          {line}
        </span>
      </span>
    </button>
  )
}
