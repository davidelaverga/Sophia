// A task up close, in the app's sheet (as Resources opens a resource): who does it (picture, tool, role, and a way to
// their resource), where it stands, what it waits on and what waits on it, each of those one press away, and whether
// it is the plan's next checkpoint. Escape or Close returns to the tile it was opened from. It reads; acting on a task (guidance, Hold,
// Stop, discussion) comes with LFE-06.4 and LFE-07.3.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon, Tip } from '@sophia/ui'
import { Sheet } from '../../../app/Sheet.tsx'
import { Avatar } from '../../../app/Avatar.tsx'
import { ToolLogo } from '../../resources/ToolLogo.tsx'
import { observedAgo, type Resource } from '../../resources/resource.ts'
import type { Room } from '../../resources/room.ts'
import { AskSophia, type Ask } from './AskSophia.tsx'
import { waitsOn, type PlanRow, type WorkPlan } from './plan.ts'
import type { Acts } from '../../resources/SessionActs.tsx'
import { TaskActions } from './TaskActions.tsx'

type Person = Resource['owner']

interface Props {
  row: PlanRow
  rows: readonly PlanRow[]
  plan: WorkPlan
  onOpen: (id: string) => void
  /** Opens the resource doing it in Resources; absent, who does it is only a name. */
  onOpenResource?: ((resourceId: string) => void) | undefined
  /** J and K: the next task on the board, or the one before, without closing. */
  onStep: (by: 1 | -1) => void
  onClose: () => void
  now: Date
  viewerId: string | null
  /** The acts on its session, kept by the board; absent, none is offered. */
  acts?: Acts | undefined
  onAsk?: Ask | undefined
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

/** J and K turn the sheet to the next task or the one before, unless a field has the keys. */
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
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        onStep(e.key === 'j' ? 1 : -1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onStep])
}

/** Who does it, large, and where it stands: to the one it waits on, "Waiting on you". */
function Who({ row, viewerId, onOpenResource }: Pick<Props, 'row' | 'viewerId' | 'onOpenResource'>) {
  const { doer, status } = row
  const resource = doer.resource
  return (
    <div className="task-sheet-who">
      <span className="task-who" data-size="lg">
        {doer.person ? <Avatar identity={face(doer.person)} /> : <span className="plan-nobody" />}
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
      <span className="task-chip" data-mark={status.mark}>
        <span className="plan-mark" data-mark={status.mark} aria-hidden />
        {status.mark === 'waiting' && doer.person?.id === viewerId ? 'Waiting on you' : status.text}
      </span>
    </div>
  )
}

/** What its session last reported, and how long ago. */
function Activity({ row, now }: { row: PlanRow; now: Date }) {
  const activity = row.doer.session?.activity
  if (!activity) return null
  return (
    <p className="task-sheet-activity">
      <span className="activity-dot" data-waiting={row.status.mark === 'waiting' || undefined} aria-hidden />
      {activity.said}
      <span className="muted">{observedAgo(activity.observedAt, now)}</span>
    </p>
  )
}

export function TaskSheet(props: Props) {
  const { row, rows, plan, onOpen, onStep, onClose, now, viewerId, acts, onAsk, onOpenResource } = props
  useSteps(onStep)
  const { item } = row
  const before = rows.filter((r) => waitsOn(item).includes(r.item.id))
  const after = rows.filter((r) => waitsOn(r.item).includes(item.id))
  const next = plan.next_checkpoint?.item_id === item.id
  // Over the whole page, not inside the board: a moving ancestor would hold a fixed sheet inside itself.
  return createPortal(
    <Sheet id={`task-${item.id}`} title={item.purpose} onClose={onClose}>
      <div className="task-sheet">
        <Who row={row} viewerId={viewerId} onOpenResource={onOpenResource} />
        <Activity row={row} now={now} />
        <Account account={props.account} onOpenResource={onOpenResource} />
        {next && (
          <p className="task-sheet-next">
            <span className="field-label">Next checkpoint</span>
            {plan.next_checkpoint?.label}
          </p>
        )}
        <Links title="Waits on" rows={before} onOpen={onOpen} />
        <Links title="Waited on by" rows={after} onOpen={onOpen} />
        <TaskActions row={row} viewerId={viewerId} acts={acts} />
        <AskSophia key={item.id} row={row} onAsk={onAsk} />
        <p className="task-sheet-plan muted">
          Plan r{plan.revision} · {plan.state === 'accepted' ? 'accepted' : 'proposed, not accepted yet'} · <kbd>J</kbd>{' '}
          <kbd>K</kbd> the next and the one before
        </p>
      </div>
    </Sheet>,
    document.body,
  )
}
