// A task up close, in the app's sheet (as Resources opens a resource): who does it (picture and tool, or Sophia's own
// worker as herself, and a way to their resource), where it stands, everything it waits on and who answers each, its
// result, what it waits on in the plan and what waits on it, each of those one press away, and whether it is the
// plan's next checkpoint. Then what the viewer may do to it (TaskActions) and a question to Sophia (AskSophia).
// Everything is said in words, without hovering. Escape or Close returns to the tile it was opened from; J and K step.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Chip, Icon, Tip } from '@sophia/ui'
import { Sheet } from '../../../app/Sheet.tsx'
import { Avatar } from '../../../app/Avatar.tsx'
import { ToolLogo } from '../../resources/ToolLogo.tsx'
import { observedAgo, type Resource } from '../../resources/resource.ts'
import type { Room } from '../../resources/room.ts'
import type { Acts } from '../../resources/SessionActs.tsx'
import { AskSophia, type Asks } from './AskSophia.tsx'
import type { GoalView } from './board-view.ts'
import { MARK_TONE, open, waitsOn, type PlanRow, type WaitRow, type WorkPlan } from './plan.ts'
import type { ReadResult } from './results.ts'
import { TaskActions } from './TaskActions.tsx'
import { TaskResult } from './TaskResult.tsx'
import { connectionSaid, said } from './TaskTile.tsx'

type Person = Resource['owner']

interface Props {
  row: PlanRow
  rows: readonly PlanRow[]
  plan: WorkPlan
  /** Whether the plan is in force: a proposed plan's task is read, never acted on. */
  operable: boolean
  next: GoalView['next_checkpoint']
  onOpen: (id: string) => void
  /** Opens the resource doing it in Resources; absent, who does it is only a name. */
  onOpenResource?: ((resourceId: string) => void) | undefined
  /** J and K: the next task on the board, or the one before, without closing. */
  onStep: (by: 1 | -1) => void
  onClose: () => void
  now: Date
  viewerId: string | null
  /** The board's commands, kept by scope; absent, none is offered. */
  acts?: Acts | undefined
  asks?: Asks | undefined
  readResult?: ReadResult | undefined
  onOpenConversation?: (() => void) | undefined
  /** Its doer's account: what it is short of, in a few words, and where there is room (room.ts). */
  account?: { short: string | null; room: Room | null } | undefined
}

/** Its doer's account running short, and where there is room, one press from it in Resources. It assigns nothing. */
function Account({ account, onOpenResource }: Pick<Props, 'account' | 'onOpenResource'>) {
  if (!account?.short) return null
  const { short, room } = account
  return (
    <div className="task-sheet-account">
      <p className="task-sheet-short">
        <span className="task-short-gauge" aria-hidden />
        Its account {short}.
      </p>
      {room && (
        <p className="capacity-room">
          <ToolLogo tool={room.resource.tool} size="sm" />
          <span className="capacity-room-words">{room.line}</span>
          {onOpenResource && (
            <button type="button" className="text-button" onClick={() => onOpenResource(room.resource.id)}>
              Show
            </button>
          )}
        </p>
      )}
    </div>
  )
}

const face = (p: Person) => ({ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null })

/** Tasks linked to this one, each a press away. */
function Links({ title, rows, onOpen }: { title: string; rows: readonly PlanRow[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) return null
  return (
    <section className="sheet-section">
      <h3>{title}</h3>
      <ul className="task-links">
        {rows.map((r) => (
          <li key={r.item.id}>
            <button type="button" className="task-link" onClick={() => onOpen(r.item.id)}>
              <span className="plan-mark" data-mark={r.status.mark} aria-hidden />
              <span className="task-link-name">{r.item.purpose}</span>
              <span className="task-link-where">{r.status.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const WAIT_NAME: Readonly<Record<WaitRow['wait']['kind'], string>> = {
  product_decision: 'Decision',
  native_permission: 'Permission in its tool',
  dependency: 'Other work',
  capacity: 'Capacity',
  connection: 'Connection',
  external: 'Outside',
}

/** Who answers a wait, said to this viewer: "you", a name, or no one in particular. */
const answeredBy = (w: WaitRow, viewerId: string | null) =>
  w.who ? (w.who.id === viewerId ? 'You answer it' : `${w.who.name} answers it`) : null

/** Everything it waits on now, each with what it is and who answers it: the whole of it, without hovering. */
function Waits({ waits, viewerId }: { waits: readonly WaitRow[]; viewerId: string | null }) {
  const now = open(waits)
  if (now.length === 0) return null
  return (
    <section className="sheet-section">
      <h3>Waiting for</h3>
      <ul className="task-waits">
        {now.map((w) => (
          <li
            // Its kind and reference as a tuple: a reference holding a colon names no other wait (Codex F-049).
            key={JSON.stringify([w.wait.kind, w.wait.reference_id])}
            data-mine={(w.who !== null && w.who.id === viewerId) || undefined}
          >
            <span className="field-label">{WAIT_NAME[w.wait.kind]}</span>
            <span className="task-wait-detail">{w.wait.detail}</span>
            <span className="task-wait-who">
              {[answeredBy(w, viewerId), w.wait.state === 'unknown' ? 'not known to be over' : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The press in «Act on it» whose words (its name, which carries its tip, else its text) say `is`, if offered now. */
const pressOf = (sheet: HTMLElement, is: (words: string) => boolean) =>
  [...sheet.querySelectorAll<HTMLButtonElement>('.task-actions button')].find((b) =>
    is((b.getAttribute('aria-label') ?? b.textContent).trim()),
  )

/**
 * The sheet's keys (docs/plans/task-keys-micro-type.md): J and K turn to the next task or the one before; H presses
 * Hold, or Resume when that is what is offered; S presses Stop, which asks first with the focus on the safe answer, and
 * asks nothing more while it asks. None while a field has the keys.
 */
const KEYS: Readonly<Record<string, (sheet: HTMLElement, onStep: Props['onStep']) => void>> = {
  j: (_, onStep) => onStep(1),
  k: (_, onStep) => onStep(-1),
  h: (sheet) => pressOf(sheet, (words) => /^(Hold|Resume)\b/.test(words))?.click(),
  s: (sheet) => {
    if (sheet.querySelector('[role="group"][aria-label="Stop"]')) return
    pressOf(sheet, (words) => words === 'Stop')?.click()
  },
}

function useSteps(onStep: Props['onStep']) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target instanceof HTMLElement && e.target.closest('input, textarea'))
      )
        return
      const act = KEYS[e.key]
      const sheet = document.querySelector<HTMLElement>('.task-sheet')
      if (!act || !sheet) return
      e.preventDefault()
      act(sheet, onStep)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onStep])
}

function WhoFace({ row }: { row: PlanRow }) {
  const { doer } = row
  if (doer.kind === 'sophia_native') return <span className="plan-sophia" />
  return doer.person ? <Avatar identity={face(doer.person)} /> : <span className="plan-nobody" />
}

/** Who does it, large, and where it stands: to the one it waits on, "Waiting on you". */
function Who({ row, viewerId, onOpenResource }: Pick<Props, 'row' | 'viewerId' | 'onOpenResource'>) {
  const { doer, status } = row
  const resource = doer.resource
  return (
    <div className="task-sheet-who">
      <span className="task-who" data-size="lg">
        <WhoFace row={row} />
        {doer.resource && <ToolLogo tool={doer.resource.tool} size="sm" />}
      </span>
      <span className="task-sheet-name">
        {resource && onOpenResource ? (
          <button type="button" className="task-who-link has-tip" onClick={() => onOpenResource(resource.id)}>
            {doer.name}
            <span className="sr-only">, open in Resources</span>
            <Icon name="forward" />
            <Tip label="Open in Resources" side="top" />
          </button>
        ) : (
          doer.name
        )}
        {doer.role && <span className="muted">{doer.role}</span>}
      </span>
      <Chip tone={MARK_TONE[status.mark] ?? 'muted'} className="task-chip" data-mark={status.mark}>
        <span className="plan-mark" data-mark={status.mark} aria-hidden />
        {said(row, viewerId)}
      </Chip>
    </div>
  )
}

/** What its current attempt last reported, how long ago, and its connection when it isn't online. */
function Activity({ row, now }: { row: PlanRow; now: Date }) {
  const { activity } = row
  if (!activity) {
    return row.view?.activity ? (
      <p className="task-sheet-activity muted">Its last report is from an earlier attempt.</p>
    ) : null
  }
  const connection = connectionSaid(activity)
  return (
    <p className="task-sheet-activity">
      <span className="activity-dot" data-waiting={row.status.mark === 'waiting' || undefined} aria-hidden />
      {activity.said}
      <span className="muted">{observedAgo(activity.observed_at, now)}</span>
      {connection && <span className="task-sheet-connection">{connection}</span>}
    </p>
  )
}

/** Why it stands as its chip says, when the chip's few words can't say it (Codex F-011): a line that wraps. */
function Detail({ row }: { row: PlanRow }) {
  return row.status.detail ? <p className="task-sheet-detail muted">{row.status.detail}</p> : null
}

/** Why a closed task closed, in its own words. */
function Closed({ row }: { row: PlanRow }) {
  if (row.status.mark !== 'closed') return null
  return (
    <p className="task-sheet-closed">
      <span className="field-label">{row.status.text}</span>
      {row.view?.closed_reason ?? 'No reason was given.'}
    </p>
  )
}

export function TaskSheet(props: Props) {
  const { row, rows, plan, onOpen, onStep, onClose, now, viewerId, onOpenResource } = props
  useSteps(onStep)
  const { item } = row
  const before = rows.filter((r) => waitsOn(item).includes(r.item.id))
  const after = rows.filter((r) => waitsOn(r.item).includes(item.id))
  const next = props.next?.item_id === item.id
  // Over the whole page, not inside the board: a moving ancestor would hold a fixed sheet inside itself.
  return createPortal(
    <Sheet id={`task-${item.id}`} title={item.purpose} onClose={onClose}>
      <div className="task-sheet">
        <Who row={row} viewerId={viewerId} onOpenResource={onOpenResource} />
        <Detail row={row} />
        <Activity row={row} now={now} />
        <Closed row={row} />
        <Account account={props.account} onOpenResource={onOpenResource} />
        {next && (
          <p className="task-sheet-next">
            <span className="field-label">Next checkpoint</span>
            {props.next?.label}
          </p>
        )}
        <Waits waits={row.waits} viewerId={viewerId} />
        <TaskResult key={`result-${item.id}`} row={row} readResult={props.readResult} />
        <Links title="Waits on" rows={before} onOpen={onOpen} />
        <Links title="Waited on by" rows={after} onOpen={onOpen} />
        {props.operable && <TaskActions key={`acts-${item.id}`} row={row} acts={props.acts} />}
        {props.operable && (
          <AskSophia
            key={`ask-${item.id}`}
            row={row}
            plan={plan}
            asks={props.asks}
            viewerId={viewerId}
            onOpenConversation={props.onOpenConversation}
          />
        )}
        <p className="task-sheet-plan muted">
          Plan r{plan.revision} · {props.operable ? 'accepted' : 'proposed, not accepted yet'} · <kbd>J</kbd>{' '}
          <kbd>K</kbd> the next and the one before
          {props.operable && (
            <>
              {' '}
              · <kbd>H</kbd> hold or resume · <kbd>S</kbd> stop
            </>
          )}
        </p>
      </div>
    </Sheet>,
    document.body,
  )
}
