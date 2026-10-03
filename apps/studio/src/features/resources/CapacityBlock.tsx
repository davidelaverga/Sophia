// One account's capacity, once, however many sessions use it: the limiting window in a line with its meter, and every
// window up close on request, each with its own state, value and reset. Never a total across providers.
import { useId, useState } from 'react'
import { Icon, Tag } from '@sophia/ui'
import { Meter } from './Meter.tsx'
import { windowHistory } from './history.ts'
import { pace } from './pace.ts'
import { Sparkline } from './Sparkline.tsx'
import { ago, capacity, expired, windowView, type QuotaObservation, type WindowView } from './resource.ts'

/** A window that isn't observed says so as a tag, in words: never as a number. */
const NOT_OBSERVED_TONE = { unknown: 'muted', refresh_pending: 'amber', expired: 'amber' } as const

interface Props {
  observation: QuotaObservation | undefined
  /** How many sessions share this account: said once, not counted once per session. */
  sessions: number
  reservePercent: number | null
  now: Date
  /** This account's earlier readings, for each window's history (history.ts); none when only the latest is kept. */
  earlier: QuotaObservation[]
}

interface Reading {
  observation: QuotaObservation
  now: Date
  earlier: QuotaObservation[]
}

function Windows({ observation, now, earlier }: Reading) {
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
              {v.state === 'observed' && v.applies === 'known' && v.percent !== null && (
                <Meter
                  label={`${v.name} window`}
                  percent={v.percent}
                  value={v.value}
                  passed={pace(w, observation, now)?.passed}
                />
              )}
              {v.state === 'observed' && (
                <Sparkline name={`${v.name} window`} points={windowHistory(w, [...earlier, observation])} now={now} />
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function Meta({ observation, sessions, reservePercent, now }: Props) {
  const parts = [
    sessions > 1 ? `shared by ${sessions} sessions` : null,
    observation ? ago(observation.observed_at, now) : 'never observed',
    reservePercent !== null ? `${reservePercent}% kept back` : null,
  ]
  return <p className="capacity-meta">{parts.filter(Boolean).join(' · ')}</p>
}

/** Every window of a reading, on request: "All 3 windows", or "Show window" for one. */
function WindowsDisclosure(reading: Reading) {
  const { observation } = reading
  const [open, setOpen] = useState(false)
  const details = useId()
  const count = observation.windows.length
  return (
    <>
      <button
        type="button"
        className="text-button capacity-toggle"
        aria-expanded={open}
        aria-controls={details}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide windows' : count === 1 ? 'Show window' : `All ${count} windows`}
        <Icon name="chevron" />
      </button>
      <div id={details} hidden={!open}>
        <Windows {...reading} />
      </div>
    </>
  )
}

/** The capacity's line, its meter (a percentage; an empty, hatched track for what isn't known; nothing beside a
 * balance) and, when the account runs out before its window resets at this pace, how long before. */
/** The limiting window's readings over time, under its meter. */
function HeadHistory({ observation, now, earlier, limiting }: Reading & { limiting: WindowView }) {
  const window = observation.windows.find((w) => w.window_id === limiting.id)
  if (!window) return null
  return (
    <Sparkline name={`${limiting.name} window`} points={windowHistory(window, [...earlier, observation])} now={now} />
  )
}

function Headline({
  observation,
  now,
  earlier,
}: Omit<Reading, 'observation'> & { observation: QuotaObservation | undefined }) {
  const { line, limiting, known, pace: headPace } = capacity(observation, now)
  return (
    <>
      <p className="capacity-line">{line}</p>
      {(limiting || !known) && (
        <Meter
          label={limiting ? `${limiting.name} window` : 'Capacity'}
          percent={limiting?.percent ?? null}
          value={line}
          passed={headPace?.passed}
        />
      )}
      {headPace?.early && <p className="capacity-pace">{headPace.early}.</p>}
      {observation && limiting && (
        <HeadHistory observation={observation} now={now} earlier={earlier} limiting={limiting} />
      )}
    </>
  )
}

export function CapacityBlock(props: Props) {
  const { observation, now, earlier } = props
  const readable = observation && observation.coverage !== 'unavailable' && observation.windows.length > 0
  const missing = observation?.missing_capabilities ?? []
  return (
    <div className="capacity" role="group" aria-label="Capacity">
      <Headline observation={observation} now={now} earlier={earlier} />
      <Meta {...props} />
      {readable && <WindowsDisclosure observation={observation} now={now} earlier={earlier} />}
      {missing.length > 0 && <p className="capacity-missing">Not reported: {missing.join(', ')}.</p>}
    </div>
  )
}
