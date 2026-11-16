// One resource up close, in the app's sheet (as Invite opens): its host, each session with what it reported and what
// it works on (a way to that task, when it is on the plan's board), its account's capacity window by window and, when
// it runs short, a resource with room. Its owner acts on a session at work from its row (Act: guidance, Hold, Stop, as
// its route supports them, LFE-06.4). Then what its route supports, in words, and that a control sent is a request
// until its runtime confirms it (status-words.ts). Its host is said as observed, never as a ready tool. Esc or Close
// returns to the tile it was opened from.
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Icon, Tag, Tip } from '@sophia/ui'
import { Sheet } from '../../app/Sheet.tsx'
import { CapacityBlock } from './CapacityBlock.tsx'
import { ResourceRequests } from './RequiredActions.tsx'
import {
  observedAgo,
  reportsLive,
  TOOL,
  VENDOR,
  WORK_STATE,
  type QuotaObservation,
  type CatalogFacts,
  type RequiredAction,
  type Resource,
  type Session,
} from './resource.ts'
import { CopyLink } from './CopyLink.tsx'
import { EffortMeter } from './EffortMeter.tsx'
import { changeLine, currentLevel, levelName, type ChangeLine, type EffortAsk } from './change.ts'
import { EffortPicker } from './EffortPicker.tsx'
import { ModelChip } from './ModelChip.tsx'
import { OwnerAvatar } from './OwnerAvatar.tsx'
import type { Room } from './room.ts'
import { scopeOf, sessionTarget, UNFENCED, type CommandTarget } from './receipts.ts'
import { canAct, offersSaid, routeOffers, SessionActs, type Acts } from './SessionActs.tsx'
import {
  CATALOG_EVIDENCE,
  CATALOG_LIVE_UNREPORTED,
  CATALOG_PRIVATE,
  CATALOG_UNREPORTED,
  catalogHostLines,
  catalogState,
  connectionSaid,
  CONTROL_NAME,
  controlGroups,
  controlsNote,
  hostAge,
  hostState,
  qualificationSaid,
  readinessRows,
  readinessSummary,
  SESSIONS_UNREPORTED,
} from './status-words.ts'
import { ToolLogo } from './ToolLogo.tsx'
import { stillOffered, workState, type ControlSaid, type WorkState } from './work-control.ts'
import { when } from '../../app/time-words.ts'

/**
 * After its host's state: " · observed 2 min ago", or " · never observed" without a time; nothing at all for a time
 * that isn't an instant, no bare "observed", empty time or dangling separator (r3 repair 7, UI58E-F10).
 */
function Since({ at, now }: { at: string | null; now: Date }) {
  const age = hostAge(at, now)
  if (age === '') return null
  return (
    <>
      {' · '}
      {age === null || at === null ? (
        <span className="resource-age">never observed</span>
      ) : (
        <span className="resource-age">
          observed{' '}
          <time dateTime={at} title={when(at, now.getTime())}>
            {age}
          </time>
        </span>
      )}
    </>
  )
}

/**
 * Its host as observed, and under it that its tool's sign-in and readiness aren't reported: a host seen online is not
 * a tool ready to work (C01-R05). Readiness details, on request, keep each fact apart, the unknown ones said as such.
 */
function Host({
  resource,
  observation,
  now,
}: {
  resource: Resource
  observation: QuotaObservation | undefined
  now: Date
}) {
  const { host } = resource
  const summary = readinessSummary(resource, observation, now)
  const [open, setOpen] = useState(false)
  const details = useId()
  return (
    <div className="resource-host">
      <p className={host.state}>
        <span className="resource-dot" aria-hidden />
        {hostState(host)}
        <Since at={host.observedAt} now={now} />
      </p>
      <p className="resource-readiness" data-tone={summary.tone}>
        <span className="readiness-line">{summary.line}</span>
        {summary.more && <span className="readiness-more">{summary.more}</span>}
        <button
          type="button"
          className="text-button readiness-toggle"
          aria-expanded={open}
          aria-controls={details}
          onClick={() => setOpen((o) => !o)}
        >
          Readiness details
          <Icon name="chevron" />
        </button>
      </p>
      <dl id={details} className="readiness-details" hidden={!open}>
        {readinessRows(resource, now).map((row) => (
          <div key={row.label} data-observed={row.observed || undefined}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** When a recorded qualification was made and until when, where those times are representable; else nothing. */
function QualificationTimes({ q, now }: { q: NonNullable<CatalogFacts['mine']>['qualification']; now: Date }) {
  if (q.qualifiedAt === null && q.expiresAt === null) return null
  return (
    <span className="resource-recorded-times">
      {q.qualifiedAt !== null && (
        <>
          {' '}
          Recorded <time dateTime={q.qualifiedAt}>{when(q.qualifiedAt, now.getTime())}</time>.
        </>
      )}
      {q.expiresAt !== null && (
        <>
          {' '}
          Recorded expiry <time dateTime={q.expiresAt}>{when(q.expiresAt, now.getTime())}</time>.
        </>
      )}
    </span>
  )
}

/**
 * The owner's own recorded facts (UX02), behind one closed disclosure: the host as recorded and its handshake, any
 * conflict, and the recorded qualification with its exact operations and its own recorded times; or that none is
 * recorded. Evidence, read as the server judged it at the page's time: never online, signed in, ready or a control.
 */
function CatalogEvidence({ mine, now }: { mine: NonNullable<CatalogFacts['mine']>; now: Date }) {
  const qualification = qualificationSaid(mine.qualification)
  return (
    <details className="resource-evidence">
      <summary>{CATALOG_EVIDENCE}</summary>
      <div className="resource-evidence-body">
        {catalogHostLines(mine.host).map((line) => (
          <p key={line} className="resource-recorded">
            {line}
          </p>
        ))}
        <p className="resource-recorded" data-qualification={mine.qualification.state}>
          {qualification ?? 'No qualification recorded'}
          <QualificationTimes q={mine.qualification} now={now} />
        </p>
      </div>
    </details>
  )
}

/**
 * A resource read from A51's catalog (INC01-DES-002), its meaning before its record (UX02): the connection as recorded,
 * or, to a teammate, that it is private to its owner; its state; when the service observed it; and that live sign-in
 * and readiness aren't reported. Then, for its owner only, the recorded evidence, closed. A teammate's sheet holds no
 * evidence at all, not even hidden. Every state is the server's at the page's time, said with it.
 */
function CatalogHost({ facts, now }: { facts: CatalogFacts; now: Date }) {
  const state = catalogState(facts)
  return (
    <div className="resource-host resource-catalog">
      <p className={facts.mine === null ? 'unknown resource-private' : 'unknown resource-connection'}>
        <span className="resource-dot" aria-hidden />
        {facts.mine === null ? CATALOG_PRIVATE : connectionSaid(facts.mine.connection)}
      </p>
      {state && <p className="resource-recorded resource-catalog-state">{state}</p>}
      <p className="resource-as-read">
        As observed by the service <time dateTime={facts.observedAt}>{when(facts.observedAt, now.getTime())}</time>
      </p>
      <p className="resource-readiness" data-tone="unknown">
        <span className="readiness-line">{CATALOG_LIVE_UNREPORTED}</span>
      </p>
      {facts.mine !== null && <CatalogEvidence mine={facts.mine} now={now} />}
    </div>
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

/** A session's change line, and its request let go once done or refused, after a moment. */
function useChangeNote(session: Session, control: EffortControl | undefined) {
  const line = changeLine(session, control?.asked[session.id])
  useSettled(line?.tone === 'done' || line?.tone === 'refused', control?.settle, session.id)
  return line && <ChangeNote line={line} onUndo={() => control?.undo(session.id)} />
}

interface BarProps {
  level: string | null
  open: boolean
  /** A change is underway: the bar stays, read only. */
  busy: boolean
  onToggle: () => void
  children: React.ReactNode
  ref: React.Ref<HTMLButtonElement>
}

/** The owner's way into a session's effort: its bar, which opens the picker; read only while a change is underway. */
function EffortBar({ level, open, busy, onToggle, children, ref }: BarProps) {
  const name = level ? levelName(level) : 'not reported'
  return (
    <button
      ref={ref}
      type="button"
      className="effort-button has-tip"
      aria-expanded={open && !busy}
      aria-disabled={busy || undefined}
      aria-label={`Effort: ${name}. ${busy ? 'A change is underway' : 'Change it'}`}
      onClick={() => !busy && onToggle()}
    >
      {children ?? <span className="effort-set">Set effort</span>}
      <Icon name="chevron" />
      <Tip label={busy ? 'A change is underway' : 'Choose its effort'} side="top" />
    </button>
  )
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
  const note = useChangeNote(session, control)
  // While a change is underway (stopping, starting, unconfirmed), no other is asked: the bar stays, read only, so the
  // focus stays on it; the scale closes, and doesn't come back by itself once the change is done.
  const busy = Boolean(session.change)
  useEffect(() => {
    if (!busy) return
    // The scale closes: the focus, if it was in it, comes back to the bar first, so it is never dropped to the page.
    if (open) button.current?.focus()
    setOpen(false)
  }, [busy, open])
  const shown = session.effort ? <EffortMeter effort={session.effort} tool={tool} mode={session.mode} /> : null
  if (!control || levels.length === 0) {
    return (
      <>
        {shown}
        {note}
      </>
    )
  }
  return (
    <>
      <EffortBar ref={button} level={currentLevel(session)} open={open} busy={busy} onToggle={() => setOpen((o) => !o)}>
        {shown}
      </EffortBar>
      {note}
      {open && !busy && (
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

/** A session's task: a way to it on the board when that task is on one, its title otherwise. */
function WorkTitle({ work, tasks }: { work: NonNullable<Session['assignment']>; tasks: TaskLinks | undefined }) {
  if (!tasks?.has(work.workId)) return <>{work.title}</>
  return (
    <button type="button" className="resource-work-link has-tip" onClick={() => tasks.open(work.workId)}>
      {work.title}
      <span className="sr-only">, open in Tasks</span>
      <Icon name="forward" />
      <Tip label="Open in Tasks" side="top" />
    </button>
  )
}

/** What a session at work last reported, and how long ago; still once it isn't live. */
function SessionLive({ session, live, now }: { session: Session; live: boolean; now: Date }) {
  const reported = session.activity
  if (!reported || !session.assignment) return null
  return (
    <span className="resource-session-live">
      <span
        className="activity-dot"
        data-waiting={session.assignment.state === 'waiting' || undefined}
        data-still={live ? undefined : true}
        aria-hidden
      />
      <span className="resource-session-said" title={reported.said}>
        {reported.said}
      </span>
      <span className="resource-session-ago">{observedAgo(reported.observedAt, now)}</span>
    </span>
  )
}

/**
 * What a session at work reported before its last report: folded under it ("3 earlier"), then a short thread, newest
 * first, each with how long ago.
 */
function SessionEarlier({ session, now }: { session: Session; now: Date }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const earlier = session.recent ?? []
  if (!session.assignment || !session.activity || earlier.length === 0) return null
  return (
    <div className="session-earlier">
      <button
        type="button"
        className="session-earlier-toggle"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {earlier.length} earlier
        <Icon name="chevron" />
      </button>
      {open && (
        <ol id={listId} className="session-earlier-list" aria-label="Earlier reports">
          {earlier.map((r) => (
            <li key={`${r.observedAt}-${r.said}`}>
              <span className="session-earlier-said" title={r.said}>
                {r.said}
              </span>
              <span className="resource-session-ago">{observedAgo(r.observedAt, now)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** The way to a session's task on the plan's board: whether a task is on one, and opening it there. */
export interface TaskLinks {
  has: (workId: string) => boolean
  open: (workId: string) => void
}

interface SessionProps {
  session: Session
  resource: Resource
  /** Whether its report is live now (reportsLive). */
  live: boolean
  now: Date
  control?: EffortControl | undefined
  tasks?: TaskLinks | undefined
  /** Its owner's acts, kept by the view; absent for anyone else, or where its route supports none. */
  acts?: Acts | undefined
}

interface ToggleProps {
  open: boolean
  controls: string
  /** What its route's acts are, in words: "Hold or Stop". */
  said: string
  onToggle: () => void
}

/** Act, under its role, level with its task: it opens the acts under its row, and closes them. */
function ActToggle({ open, controls, said, onToggle }: ToggleProps) {
  return (
    <button
      type="button"
      className="session-act-toggle has-tip"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      onClick={onToggle}
    >
      Act
      <Icon name="chevron" />
      <Tip label={said} side="top" align="end" />
    </button>
  )
}

/** What Act holds, in its tip: what its route supports and its work's control state still allows, or why nothing. */
const actTip = (resource: Resource, target: CommandTarget | null, acts: Acts, state: WorkState) => {
  if (!target) return 'Nothing can be sent yet'
  if (!acts.canSend) return 'Nothing can be sent from here now'
  const left = stillOffered(routeOffers(resource), state)
  return left.length > 0 ? offersSaid(left) : 'What was sent to it'
}

/**
 * Work with a control in play (work-control.ts): one sentence, and Open work, its one primary action, to the same work
 * in Tasks. Opening it sends nothing. Where the work is on no board there is nothing to open, and the status stands.
 */
function WorkStatus({ said, work, tasks }: { said: ControlSaid; work: Work; tasks: TaskLinks | undefined }) {
  return (
    <div className="work-control">
      <p className="work-control-sentence">{said.sentence}</p>
      {tasks?.has(work.workId) && (
        <button
          type="button"
          className="pill primary work-open"
          aria-label={`Open work: ${work.title}`}
          onClick={() => tasks.open(work.workId)}
        >
          Open work
          <Icon name="forward" />
        </button>
      )}
    </div>
  )
}

type Work = NonNullable<Session['assignment']>

/** What a session works on: its status (its control's, while one is in play, else its view's) and its task. */
function WorkLine({
  work,
  said,
  tasks,
}: {
  work: Work | null
  said: ControlSaid | null
  tasks: TaskLinks | undefined
}) {
  if (!work) return <span className="resource-work idle">No assignment</span>
  return (
    <span className="resource-work">
      {said ? (
        <Tag tone={said.tone}>{said.status}</Tag>
      ) : (
        <Tag tone={WORK_STATE[work.state][0]}>{WORK_STATE[work.state][1]}</Tag>
      )}
      <WorkTitle work={work} tasks={tasks} />
    </span>
  )
}

interface OwnerWorkProps {
  work: Work
  resource: Resource
  target: CommandTarget | null
  state: WorkState
  tasks: TaskLinks | undefined
  acts: Acts
}

/**
 * Its owner's way with the work: Act (opening what may be sent, and what was), and while a control is in play its one
 * sentence with Open work. The status line is mounted with the row, so a change while Act is closed is still announced.
 */
function OwnerWork({ work, resource, target, state, tasks, acts }: OwnerWorkProps) {
  const [acting, setActing] = useState(false)
  const actsId = useId()
  const said = state.said
  return (
    <>
      <ActToggle
        open={acting}
        controls={actsId}
        said={actTip(resource, target, acts, state)}
        onToggle={() => setActing((o) => !o)}
      />
      <div role="status" className="work-control-live">
        {said && <WorkStatus said={said} work={work} tasks={tasks} />}
      </div>
      {acting && (
        <div id={actsId} className="resource-session-acts">
          {target ? (
            <SessionActs
              target={target}
              offer={routeOffers(resource)}
              acts={acts}
              observed={work.runtimeControl ?? null}
            />
          ) : (
            <p className="act-note muted">{UNFENCED}</p>
          )}
        </div>
      )}
    </>
  )
}

function SessionRow({ session, resource, live, now, control, tasks, acts }: SessionProps) {
  const work = session.assignment
  const target = acts ? sessionTarget(acts.project, session) : null
  // Its control state (work-control.ts): from every control sent for it and from what its view reports. A teammate's
  // space holds none of the owner's commands, so a teammate sees the view's own state only.
  const state = workState(acts && target ? acts.of(scopeOf(target)) : [], target, work?.runtimeControl ?? null)
  return (
    <li className="resource-session">
      <span className="resource-role">{session.role}</span>
      <span className="resource-model">
        {session.model ? <ModelChip model={session.model} /> : 'Model not reported'}
        <Effort session={session} tool={resource.tool} control={control} />
      </span>
      <WorkLine work={work} said={state.said} tasks={tasks} />
      {work && acts && (
        <OwnerWork work={work} resource={resource} target={target} state={state} tasks={tasks} acts={acts} />
      )}
      <SessionLive session={session} live={live} now={now} />
      <SessionEarlier session={session} now={now} />
    </li>
  )
}

/**
 * What the route supports, in words, grouped: qualified, not qualified yet, not offered. Then one line: a control sent is
 * a request until its runtime confirms it, who may send it and from where. Nothing here sends anything.
 */
function Controls({ resource, mine, offered }: { resource: Resource; mine: boolean; offered: boolean }) {
  const note = controlsNote({ resource, mine, offered })
  return (
    <>
      <dl className="resource-controls">
        {controlGroups(resource.controls).map((group) => (
          <div key={group.support} className={`control-group ${group.support}`}>
            <dt>{group.label}</dt>
            <dd>
              <ul aria-label={group.label}>
                {group.names.map((name) => (
                  <li key={name} className="control">
                    {CONTROL_NAME[name]}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="resource-controls-note">{note}</p>}
    </>
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

/** The head's own content: the tool's logo, its name and vendor, its owner. The frame adds the actions and Close. */
function Head({ resource, mine }: { resource: Resource; mine: boolean }) {
  const { tool, owner } = resource
  return (
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
          {owner.former && <Tag tone="muted">Former member</Tag>}
        </span>
      </span>
    </span>
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
  /** The way to a session's task on the plan's board; absent where Tasks has no plan to open it in. */
  tasks?: TaskLinks | undefined
  /** Where there is room when this one runs short (room.ts); absent when none is, or it isn't short. */
  room?: Room | null
  /** Shows another resource's sheet: the one with room. */
  onShow?: (id: string) => void
  /** Its owner's acts on its sessions, kept by the panel (LFE-06.6); absent, nothing is offered. */
  acts?: Acts | undefined
}

/** Each session: its role, model, effort (its owner can choose it), what it works on and what it last reported. */
function Sessions({
  resource,
  now,
  control,
  tasks,
  acts,
}: {
  resource: Resource
  now: Date
  control?: EffortControl | undefined
  tasks?: TaskLinks | undefined
  acts?: Acts | undefined
}) {
  if (resource.sessions === null) {
    // Not reported (A51's catalog): said, never an empty list, which would say there are none.
    return (
      <section className="sheet-section" aria-labelledby="sessions-title">
        <h3 id="sessions-title">Sessions</h3>
        <p className="resource-unreported">{SESSIONS_UNREPORTED}</p>
      </section>
    )
  }
  return (
    <section className="sheet-section" aria-labelledby="sessions-title">
      <h3 id="sessions-title">Sessions</h3>
      <ul className="resource-sessions" aria-label="Sessions">
        {resource.sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            resource={resource}
            live={reportsLive(resource, s, now)}
            now={now}
            control={control}
            tasks={tasks}
            acts={acts}
          />
        ))}
      </ul>
    </section>
  )
}

/** Where there is room, when this account runs short: whose, how full, and a way to its sheet. It assigns nothing. */
function RoomLine({ room, onShow }: { room: Room; onShow: ((id: string) => void) | undefined }) {
  return (
    <p className="capacity-room">
      <ToolLogo tool={room.resource.tool} size="sm" />
      <span className="capacity-room-words">{room.line}</span>
      {onShow && (
        <button type="button" className="text-button" onClick={() => onShow(room.resource.id)}>
          Show
        </button>
      )}
    </p>
  )
}

/**
 * Turning the page (a step, or Show) replaces all the sheet holds, its content keyed by the resource, the control
 * pressed with it. So the focus goes to the sheet itself first, which stays: J and K work at once on the next page,
 * never lost to the page behind until a later frame (Codex F-033).
 */
function usePageTurns(panel: React.RefObject<HTMLDivElement | null>, onStep: Props['onStep'], onShow: Props['onShow']) {
  const keepFocus = () => {
    if (document.activeElement !== panel.current) panel.current?.focus()
  }
  const turn = onStep
    ? (by: 1 | -1) => {
        keepFocus()
        onStep(by)
      }
    : undefined
  const show = onShow
    ? (id: string) => {
        keepFocus()
        onShow(id)
      }
    : undefined
  return { turn, show }
}

/**
 * What a known-data resource reports below its host: its sessions, its capacity and its controls. A catalog record
 * reports none of them, said once instead (UX02): never three empty sections, never none or zero.
 */
function Reported(props: Props & { mine: boolean; acts: Acts | undefined; show: ((id: string) => void) | undefined }) {
  const { resource, observation, earlier, now, effort, room, mine, acts, show } = props
  if (resource.catalog) {
    return (
      <section className="sheet-section resource-unreported-group" aria-label="Not reported">
        <p className="resource-unreported">{CATALOG_UNREPORTED}</p>
      </section>
    )
  }
  return (
    <>
      <Sessions resource={resource} now={now} control={mine ? effort : undefined} tasks={props.tasks} acts={acts} />
      <section className="sheet-section" aria-labelledby="capacity-title">
        <h3 id="capacity-title">Capacity</h3>
        <CapacityBlock
          observation={observation}
          sessions={resource.sessions?.length ?? 0}
          reservePercent={resource.reservePercent}
          now={now}
          earlier={earlier}
          room={room && <RoomLine room={room} onShow={show} />}
        />
      </section>
      <section className="sheet-section" aria-labelledby="controls-title">
        <h3 id="controls-title">Controls</h3>
        <Controls resource={resource} mine={mine} offered={acts?.canSend === true} />
      </section>
    </>
  )
}

export function ResourceSheet(props: Props) {
  const { resource, observation, actions, viewerId, now, onClose, onStep, onShow } = props
  const panel = useRef<HTMLDivElement>(null)
  const { turn, show } = usePageTurns(panel, onStep, onShow)
  const mine = resource.owner.id === viewerId
  const acts = mine && canAct(resource) ? props.acts : undefined
  return (
    <Sheet
      className="resource-sheet"
      headClassName="resource-sheet-head"
      label={`${resource.owner.name} · ${TOOL[resource.tool]}`}
      head={<Head resource={resource} mine={mine} />}
      actions={
        <>
          {turn && <Steps onStep={turn} />}
          {/* Keyed by the resource, as the body is: a copy half done, or just said, stays with its page. */}
          <CopyLink key={resource.id} />
        </>
      }
      onClose={onClose}
      panelRef={panel}
      onKeyDown={(e) => stepKey(e, turn)}
      data={{ tool: resource.tool }}
    >
      {/* Keyed by the resource: stepping to another plays the sheet's arrival again, a page turned, its evidence closed. */}
      <Fragment key={resource.id}>
        {resource.catalog ? (
          <CatalogHost facts={resource.catalog} now={now} />
        ) : (
          <Host resource={resource} observation={observation} now={now} />
        )}
        <ResourceRequests actions={actions} resource={resource} viewerId={viewerId} now={now} />
        <Reported {...props} mine={mine} acts={acts} show={show} />
      </Fragment>
    </Sheet>
  )
}
