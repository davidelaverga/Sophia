// One account's capacity, once, however many sessions use it: the limiting window in a line, and every window up
// close on request, each with its own state, value and reset. Never a total across providers.
import { useId, useState } from 'react'
import { Tag } from '@sophia/ui'
import { ago, capacityLine, expired, windowView, type QuotaObservation } from './resource.ts'

/** A window that isn't observed says so as a tag, in words: never as a number. */
const NOT_OBSERVED_TONE = { unknown: 'muted', refresh_pending: 'amber', expired: 'amber' } as const

interface Props {
  observation: QuotaObservation | undefined
  /** How many sessions share this account: said once, not counted once per session. */
  sessions: number
  reservePercent: number | null
  now: Date
}

function Windows({ observation, now }: { observation: QuotaObservation; now: Date }) {
  const stale = expired(observation, now)
  return (
    <dl className="capacity-windows">
      {observation.windows.map((w) => {
        const v = windowView(w, now, stale)
        return (
          <div key={w.window_id}>
            <dt>{v.name}</dt>
            <dd>
              {v.state === 'observed' ? <span>{v.value}</span> : <Tag tone={NOT_OBSERVED_TONE[v.state]}>{v.value}</Tag>}
              {v.reset && <span className="capacity-reset">{v.reset}</span>}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

export function CapacityBlock({ observation, sessions, reservePercent, now }: Props) {
  const [open, setOpen] = useState(false)
  const details = useId()
  const known = observation && observation.coverage !== 'unavailable'
  return (
    <div className="capacity" role="group" aria-label="Capacity">
      <p className="capacity-line">{capacityLine(observation, now)}</p>
      <p className="capacity-meta">
        {sessions > 1 ? `${sessions} sessions share this account · ` : ''}
        {observation ? `observed ${ago(observation.observed_at, now)}` : 'never observed'}
        {reservePercent !== null ? ` · the owner keeps ${reservePercent}% back` : ''}
      </p>
      {known && observation.windows.length > 0 && (
        <>
          <button
            type="button"
            className="text-button"
            aria-expanded={open}
            aria-controls={details}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide the windows' : 'Every window'}
          </button>
          <div id={details} hidden={!open}>
            <Windows observation={observation} now={now} />
          </div>
        </>
      )}
      {observation && observation.missing_capabilities.length > 0 && (
        <p className="capacity-missing">Not visible from this tool: {observation.missing_capabilities.join(', ')}.</p>
      )}
    </div>
  )
}
