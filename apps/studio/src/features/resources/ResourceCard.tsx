// One enrolled resource: its owner and native tool, its host as last observed, each session with what it reported
// and what it works on, its account's capacity, and which controls its route supports (said, not offered: the
// controls themselves come with LFE-06.4).
import { Tag } from '@sophia/ui'
import { CapacityBlock } from './CapacityBlock.tsx'
import { ago, SUPPORT, TOOL, type ControlName, type QuotaObservation, type Resource, type Session } from './resource.ts'

const HOST = {
  online: ['teal', 'Host online'],
  offline: ['rose', 'Host offline'],
  unknown: ['muted', 'Host unknown'],
} as const
const WORK = { recorded: 'Recorded', queued: 'Queued', running: 'Working', waiting: 'Waiting on its owner' } as const
const CONTROL: Record<ControlName, string> = {
  steer: 'Guidance',
  hold: 'Hold',
  stop: 'Stop',
  permissions: 'Answer requests',
}

/** Stop first: it is the control that must always be there. */
const ORDER: ControlName[] = ['stop', 'hold', 'steer', 'permissions']

function SessionRow({ session }: { session: Session }) {
  const reported = [session.model, session.effort && `${session.effort} effort`].filter(Boolean).join(' · ')
  return (
    <li className="resource-session">
      <span className="resource-role">{session.role}</span>
      <span className="resource-model">{reported || 'Model not reported'}</span>
      <span className="resource-work">
        {session.assignment ? `${WORK[session.assignment.state]}: ${session.assignment.title}` : 'No assignment'}
      </span>
    </li>
  )
}

interface Props {
  resource: Resource
  observation: QuotaObservation | undefined
  now: Date
}

export function ResourceCard({ resource, observation, now }: Props) {
  const [tone, host] = HOST[resource.host.state]
  return (
    <article className="resource" aria-labelledby={`resource-${resource.id}`}>
      <header className="resource-head">
        <h3 id={`resource-${resource.id}`}>
          {resource.owner.name} · {TOOL[resource.tool]}
        </h3>
        <Tag tone={tone}>{host}</Tag>
        <span className="resource-age">{ago(resource.host.observedAt, now)}</span>
      </header>
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
      <p className="resource-controls">
        {ORDER.map((name) => `${CONTROL[name]}: ${SUPPORT[resource.controls[name]]}`).join(' · ')}
      </p>
    </article>
  )
}
