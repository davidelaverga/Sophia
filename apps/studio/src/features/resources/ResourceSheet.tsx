// One resource up close, in the app's sheet (as Invite opens): its host, each session with what it reported and what
// it works on, its account's capacity window by window, the controls its route supports (shown, not offered: they
// come with LFE-06.4) and the requests waiting on its owner. Esc or Close returns to the tile it was opened from.
import { Fragment, useEffect, useRef, useState } from 'react'
import { Icon, Tag, Tip } from '@sophia/ui'
import { useDialog } from '../../app/useDialog.ts'
import { CapacityBlock } from './CapacityBlock.tsx'
import { ResourceRequests } from './RequiredActions.tsx'
import {
  ago,
  SUPPORT,
  TOOL,
  VENDOR,
  type ControlName,
  type QuotaObservation,
  type RequiredAction,
  type Resource,
  type Session,
  type Support,
} from './resource.ts'
import { CopyLink } from './CopyLink.tsx'
import { EffortMeter } from './EffortMeter.tsx'
import { changeLine, currentLevel, levelName, type ChangeLine, type EffortAsk } from './change.ts'
import { EffortPicker } from './EffortPicker.tsx'
import { ModelChip } from './ModelChip.tsx'
import { OwnerAvatar } from './OwnerAvatar.tsx'
import { ToolLogo } from './ToolLogo.tsx'

const HOST = { online: 'online', offline: 'offline', unknown: 'unknown' } as const
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

/** The owner's way to a session's effort: its bar, which opens the picker; a request waits beside it, with Undo. */
export interface EffortControl {
  asked: Record<string, EffortAsk | undefined>
  set: (sessionId: string, ask: EffortAsk) => void
  undo: (sessionId: string) => void
  /** Lets a request go once what the session runs is what was asked. */
  settle: (sessionId: string) => void
}

/** How long "Now on Low" stays once the change is done. */
const SETTLED_MS = 4000

/** The line beside the bar: a request, with Undo while it is still its owner's; then each step its runtime reports. */
function ChangeNote({ line, onUndo }: { line: ChangeLine; onUndo: () => void }) {
  return (
    <span className="effort-asked" role="status" data-tone={line.tone}>
      <span className="effort-asked-dot" aria-hidden />
      {line.text}
      {line.tone === 'asked' && (
        <button type="button" className="text-button" onClick={onUndo}>
          Undo
        </button>
      )}
    </span>
  )
}

/** Once what it runs is what was asked, the request is done: said for a moment, then let go. */
function useSettled(done: boolean, settle: ((sessionId: string) => void) | undefined, sessionId: string) {
  useEffect(() => {
    if (!done || !settle) return undefined
    const t = setTimeout(() => settle(sessionId), SETTLED_MS)
    return () => clearTimeout(t)
  }, [done, settle, sessionId])
}

function Effort({
  session,
  tool,
  control,
}: {
  session: Session
  tool: Resource['tool']
  control?: EffortControl | undefined
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  // Closing the scale (set, cancelled or Escape) hands the focus back to its bar, so the sheet's keys keep working.
  const close = () => {
    button.current?.focus()
    setOpen(false)
  }
  const levels = session.efforts ?? []
  const line = changeLine(session, control?.asked[session.id])
  useSettled(line?.tone === 'done', control?.settle, session.id)
  const shown = session.effort ? <EffortMeter effort={session.effort} tool={tool} mode={session.mode} /> : null
  const note = line && <ChangeNote line={line} onUndo={() => control?.undo(session.id)} />
  if (!control || levels.length === 0) {
    return (
      <>
        {shown}
        {note}
      </>
    )
  }
  const now = currentLevel(session)
  return (
    <>
      <button
        ref={button}
        type="button"
        className="effort-button has-tip"
        aria-expanded={open}
        aria-label={`Effort: ${now ? levelName(now) : 'not reported'}. Change it`}
        onClick={() => setOpen((o) => !o)}
      >
        {shown ?? <span className="effort-set">Set effort</span>}
        <Icon name="chevron" />
        <Tip label="Choose its effort" side="top" />
      </button>
      {note}
      {open && (
        <EffortPicker
          session={session}
          tool={tool}
          levels={levels}
          onSet={(next) => {
            control.set(session.id, next)
            close()
          }}
          onCancel={close}
        />
      )}
    </>
  )
}

function SessionRow({
  session,
  tool,
  control,
}: {
  session: Session
  tool: Resource['tool']
  control?: EffortControl | undefined
}) {
  const work = session.assignment
  return (
    <li className="resource-session">
      <span className="resource-role">{session.role}</span>
      <span className="resource-model">
        {session.model ? <ModelChip model={session.model} /> : 'Model not reported'}
        <Effort session={session} tool={tool} control={control} />
      </span>
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

/** The route's controls as small mono labels with a glyph: never buttons; a tip says what each does. */
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

/** Previous and next resource, as the viewer's list orders them; K and J from anywhere in the sheet. */
function Steps({ onStep }: { onStep: (by: 1 | -1) => void }) {
  return (
    <>
      <button type="button" className="round has-tip" aria-label="Previous resource" onClick={() => onStep(-1)}>
        <Icon name="back" />
        <Tip label="Previous" keys="K" side="bottom" align="end" />
      </button>
      <button type="button" className="round has-tip" aria-label="Next resource" onClick={() => onStep(1)}>
        <Icon name="forward" />
        <Tip label="Next" keys="J" side="bottom" align="end" />
      </button>
    </>
  )
}

const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** J and K step through the resources from anywhere in the sheet, as in a list of messages; never while typing. */
function stepKey(e: React.KeyboardEvent, onStep: ((by: 1 | -1) => void) | undefined) {
  if (!onStep || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.target instanceof HTMLElement && FIELDS.has(e.target.tagName)) return
  const by = { j: 1, k: -1 } as const
  const key = e.key.toLowerCase()
  if (key !== 'j' && key !== 'k') return
  e.preventDefault()
  onStep(by[key])
}

interface HeadProps {
  resource: Resource
  mine: boolean
  onClose: () => void
  onStep: ((by: 1 | -1) => void) | undefined
}

function Head({ resource, mine, onClose, onStep }: HeadProps) {
  const { tool, owner } = resource
  return (
    <div className="sheet-top">
      <header className="sheet-head resource-sheet-head">
        <span className="resource-id">
          <ToolLogo tool={tool} />
          <span className="resource-title">
            <h2 id="resource-sheet-title">
              {TOOL[tool]}
              <span className="resource-vendor">{VENDOR[tool]}</span>
            </h2>
            <span className="resource-owner">
              <OwnerAvatar owner={owner} />
              {owner.name}
              {mine && <Tag tone="lav">You</Tag>}
            </span>
          </span>
        </span>
        <span className="resource-sheet-actions">
          {onStep && <Steps onStep={onStep} />}
          <CopyLink />
          <button type="button" className="round has-tip" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
            <Tip label="Close" keys="Esc" side="bottom" align="end" />
          </button>
        </span>
      </header>
    </div>
  )
}

interface Props {
  resource: Resource
  observation: QuotaObservation | undefined
  /** This account's earlier readings, for its windows' history. */
  earlier: QuotaObservation[]
  actions: RequiredAction[]
  viewerId: string
  now: Date
  onClose: () => void
  /** Steps to the previous or next resource; absent when there is only this one. */
  onStep?: ((by: 1 | -1) => void) | undefined
  /** Its owner's way to choose each session's effort; absent where none can be asked for. */
  effort?: EffortControl | undefined
}

/** Each session: its role, model, effort (its owner can choose it) and what it works on. */
function Sessions({ resource, control }: { resource: Resource; control?: EffortControl | undefined }) {
  return (
    <section className="sheet-section" aria-labelledby="sessions-title">
      <h3 id="sessions-title">Sessions</h3>
      <ul className="resource-sessions" aria-label="Sessions">
        {resource.sessions.map((s) => (
          <SessionRow key={s.id} session={s} tool={resource.tool} control={control} />
        ))}
      </ul>
    </section>
  )
}

export function ResourceSheet(props: Props) {
  const { resource, observation, earlier, actions, viewerId, now, onClose, onStep, effort } = props
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose)
  // A step turns the page: the control pressed may go with it, so the focus stays in the sheet, where J and K work.
  const turn = onStep
    ? (by: 1 | -1) => {
        onStep(by)
        requestAnimationFrame(() => {
          if (!panel.current?.contains(document.activeElement)) panel.current?.focus()
        })
      }
    : undefined
  const host = resource.host
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        className="sheet resource-sheet"
        data-tool={resource.tool}
        role="dialog"
        aria-modal="true"
        aria-label={`${resource.owner.name} · ${TOOL[resource.tool]}`}
        tabIndex={-1}
        onKeyDown={(e) => stepKey(e, turn)}
      >
        {/* Keyed by the resource: stepping to another plays the sheet's arrival again, a page turned. */}
        <Fragment key={resource.id}>
          <Head resource={resource} mine={resource.owner.id === viewerId} onClose={onClose} onStep={turn} />
          <p className={`resource-host ${host.state}`}>
            <span className="resource-dot" aria-hidden />
            Host {HOST[host.state]} · <Since at={host.observedAt} now={now} />
          </p>
          <ResourceRequests actions={actions} resource={resource} viewerId={viewerId} now={now} />
          <Sessions resource={resource} control={resource.owner.id === viewerId ? effort : undefined} />
          <section className="sheet-section" aria-labelledby="capacity-title">
            <h3 id="capacity-title">Capacity</h3>
            <CapacityBlock
              observation={observation}
              sessions={resource.sessions.length}
              reservePercent={resource.reservePercent}
              now={now}
              earlier={earlier}
            />
          </section>
          <section className="sheet-section" aria-labelledby="controls-title">
            <h3 id="controls-title">Controls</h3>
            <Controls controls={resource.controls} />
          </section>
        </Fragment>
      </div>
    </div>
  )
}
