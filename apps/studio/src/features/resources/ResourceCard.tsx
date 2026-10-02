// One enrolled resource: its owner and native tool, its host as last observed, each session with what it reported
// and what it works on, its account's capacity, and which controls its route supports (shown, not offered: the
// controls themselves come with LFE-06.4). A request waiting on its owner is one step away.
import { Tag } from '@sophia/ui'
import { CapacityBlock } from './CapacityBlock.tsx'
import { ToolLogo } from './ToolLogo.tsx'
import {
  ago,
  SUPPORT,
  TOOL,
  VENDOR,
  type ControlName,
  type QuotaObservation,
  type Resource,
  type Session,
  type Support,
} from './resource.ts'

const HOST = { online: 'online', offline: 'offline', unknown: 'unknown' } as const
const WORK = {
  recorded: ['muted', 'Recorded'],
  queued: ['muted', 'Queued'],
  running: ['teal', 'Working'],
  waiting: ['amber', 'Waiting'],
} as const
const CONTROL: Record<ControlName, string> = { stop: 'Stop', hold: 'Hold', steer: 'Guidance', permissions: 'Requests' }
/** Stop first: it is the control that must always be there. */
const ORDER: ControlName[] = ['stop', 'hold', 'steer', 'permissions']
const GLYPH: Record<Support, string> = { supported: '✓', unqualified: '–', unsupported: '×' }

function Since({ at, now }: { at: string | null; now: Date }) {
  if (!at) return <span className="resource-age">never observed</span>
  return (
    <time className="resource-age" dateTime={at} title={new Date(at).toUTCString()}>
      {ago(at, now)}
    </time>
  )
}

function SessionRow({ session }: { session: Session }) {
  const reported = [session.model, session.effort && `${session.effort} effort`].filter(Boolean).join(' · ')
  const work = session.assignment
  return (
    <li className="resource-session">
      <span className="resource-role">{session.role}</span>
      <span className="resource-model">{reported || 'Model not reported'}</span>
      {work ? (
        <span className="resource-work">
          <Tag tone={WORK[work.state][0]}>{WORK[work.state][1]}</Tag>
          {work.title}
        </span>
      ) : (
        <span className="resource-work idle">No assignment</span>
      )}
    </li>
  )
}

function Controls({ controls }: { controls: Resource['controls'] }) {
  return (
    <ul className="resource-controls" aria-label="Controls">
      {ORDER.map((name) => (
        <li key={name} className={`control ${controls[name]}`} title={`${CONTROL[name]}: ${SUPPORT[controls[name]]}`}>
          <span aria-hidden className="control-glyph">
            {GLYPH[controls[name]]}
          </span>
          {CONTROL[name]}
          <span className="sr-only">: {SUPPORT[controls[name]]}</span>
        </li>
      ))}
    </ul>
  )
}

interface Props {
  resource: Resource
  observation: QuotaObservation | undefined
  now: Date
  /** The viewer's own resource says so. */
  mine: boolean
  /** Requests waiting on this resource's owner; the card points to them. */
  waiting: number
  onShowRequests: () => void
}

/** The tool first, as itself: its mark, its name and who makes it; then whose it is. */
function Head({ resource, mine }: { resource: Resource; mine: boolean }) {
  const { owner, tool } = resource
  return (
    <header className="resource-head">
      <ToolLogo tool={tool} />
      <div className="resource-title">
        <h3>
          {TOOL[tool]}
          <span className="resource-vendor">{VENDOR[tool]}</span>
        </h3>
        <p className="resource-owner">
          <span className="resource-initial" aria-hidden>
            {owner.name.charAt(0)}
          </span>
          {owner.name}
        </p>
      </div>
      {mine && <Tag tone="lav">You</Tag>}
    </header>
  )
}

export function ResourceCard({ resource, observation, now, mine, waiting, onShowRequests }: Props) {
  const host = HOST[resource.host.state]
  return (
    <article
      className="resource"
      data-tool={resource.tool}
      aria-label={`${resource.owner.name} · ${TOOL[resource.tool]}`}
    >
      <Head resource={resource} mine={mine} />
      <p className={`resource-host ${host}`}>
        <span className="resource-dot" aria-hidden />
        Host {host} · <Since at={resource.host.observedAt} now={now} />
      </p>
      {waiting > 0 && (
        <button type="button" className="text-button resource-waiting" onClick={onShowRequests}>
          {waiting} request{waiting === 1 ? '' : 's'} waiting
        </button>
      )}
      <ul className="resource-sessions" aria-label="Sessions">
        {resource.sessions.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </ul>
      <div className="resource-foot">
        <CapacityBlock
          observation={observation}
          sessions={resource.sessions.length}
          reservePercent={resource.reservePercent}
          now={now}
        />
        <Controls controls={resource.controls} />
      </div>
    </article>
  )
}
