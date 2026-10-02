// One enrolled resource as a row of the Resources list, in the Goals list's own form: its tool, as itself, and whose
// it is, with its host on the right; then each session; then its account's capacity and the controls its route
// supports (shown, not offered: the controls themselves come with LFE-06.4). A request waiting on its owner is one
// step away.
import { Tag, Tip } from '@sophia/ui'
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

const HOST = { online: 'Online', offline: 'Offline', unknown: 'Unknown' } as const
const WORK = {
  recorded: ['muted', 'Recorded'],
  queued: ['muted', 'Queued'],
  running: ['teal', 'Working'],
  waiting: ['amber', 'Waiting'],
} as const
const CONTROL: Record<ControlName, string> = { stop: 'Stop', hold: 'Hold', steer: 'Guidance', permissions: 'Requests' }
const CONTROL_TIP: Record<ControlName, string> = {
  stop: 'Ends its work at once, whatever else is waiting',
  hold: 'Pauses its work at the next safe point',
  steer: 'Sends it guidance while it works',
  permissions: 'Answers its tool’s requests from here',
}
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

/** The route's controls in the mono labels the Goals list uses for its own small facts: never buttons. */
function Controls({ controls }: { controls: Resource['controls'] }) {
  return (
    <ul className="resource-controls" aria-label="Controls">
      {ORDER.map((name) => (
        <li key={name} className={`control has-tip ${controls[name]}`}>
          <span aria-hidden className="control-glyph">
            {GLYPH[controls[name]]}
          </span>
          {CONTROL[name]}
          <span className="sr-only">: {SUPPORT[controls[name]]}</span>
          <Tip label={`${CONTROL_TIP[name]}: ${SUPPORT[controls[name]]}`} side="top" />
        </li>
      ))}
    </ul>
  )
}

/** The tool first, as itself: its mark, its name and who makes it; then whose it is. Its host on the right. */
function Head({ resource, mine, now }: { resource: Resource; mine: boolean; now: Date }) {
  const { owner, tool, host } = resource
  return (
    <header className="resource-meta">
      <div className="resource-id">
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
            {mine && <Tag tone="lav">You</Tag>}
          </p>
        </div>
      </div>
      <p className={`resource-host ${host.state}`}>
        <span className="resource-dot" aria-hidden />
        Host {HOST[host.state].toLowerCase()} · <Since at={host.observedAt} now={now} />
      </p>
    </header>
  )
}

interface Props {
  resource: Resource
  observation: QuotaObservation | undefined
  now: Date
  /** The viewer's own resource says so. */
  mine: boolean
  /** Requests waiting on this resource's owner; the row points to them. */
  waiting: number
  onShowRequests: () => void
}

export function ResourceRow({ resource, observation, now, mine, waiting, onShowRequests }: Props) {
  return (
    <article
      className="resource"
      data-tool={resource.tool}
      aria-label={`${resource.owner.name} · ${TOOL[resource.tool]}`}
    >
      <Head resource={resource} mine={mine} now={now} />
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
      <CapacityBlock
        observation={observation}
        sessions={resource.sessions.length}
        reservePercent={resource.reservePercent}
        now={now}
      />
      <Controls controls={resource.controls} />
    </article>
  )
}
