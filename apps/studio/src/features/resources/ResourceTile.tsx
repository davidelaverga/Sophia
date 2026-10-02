// One resource as a tile, to scan many at a glance: its tool as itself and its host, whose it is, what it is doing,
// and how full its account is. Four lines, never more; everything else opens in its sheet (ResourceSheet). Its name
// is whose tool it is; what its lines say is its description, so assistive technology hears them too.
import { useId } from 'react'
import { Tag } from '@sophia/ui'
import { Meter } from './Meter.tsx'
import { followPointer } from './motion.ts'
import { OwnerAvatar } from './OwnerAvatar.tsx'
import { activity, ago, capacity, TOOL, type QuotaObservation, type Resource } from './resource.ts'
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

export function ResourceTile(props: Props) {
  const { resource, observation, now, mine, waiting, onOpen, current, onFocus, ref } = props
  const { tool, owner, host } = resource
  const { line, limiting, known, pace } = capacity(observation, now)
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
      data-host={host.state}
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
        {activity(resource)}
      </span>
      <span className="resource-tile-capacity">
        {(limiting || !known) && (
          <Meter
            label={limiting ? `${limiting.name} window` : 'Capacity'}
            percent={limiting?.percent ?? null}
            value={line}
            passed={pace?.passed}
          />
        )}
        <span id={said('capacity')} className="resource-tile-capacity-line" title={line}>
          {line}
        </span>
      </span>
    </button>
  )
}
