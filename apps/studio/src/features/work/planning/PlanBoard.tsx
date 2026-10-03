// The lead's plan as a board, in Resources' language (LFE-07.1, WBC-01). Little to read, much to recognise:
// - one band on top: where the plan goes next, and its revision, quietly;
// - what waits on someone's decision, raised (Decision.tsx), and a choice already made while the plan takes it in;
// - while the viewer was away: one line of what changed, decisions and results first, and Mark seen (seen.ts);
// - lenses (All, For you, Waiting, Unassigned) that dim what they don't show (Lens.tsx);
// - its tasks in four lanes side by side, Active, Up next, Unassigned and Complete (TaskTile.tsx): a view over each
//   task's observed state (plan.ts), not four more states. A lane shows its first five and keeps the rest one press
//   away. What stopped, failed, was cancelled or superseded is under Closed work, with its reason, never as done;
// - a replacement proposed for the plan, beside it and compared, never operated (proposal.ts); a plan that doesn't
//   hold together says so, and still shows each task once;
// - hovering a tile draws the threads to the tasks it waits on (Threads.tsx); pressing it opens the task's sheet, to
//   act on it or ask Sophia (TaskSheet.tsx), and puts it in the address (`#task-<id>`, link.ts), which opens it
//   again; the arrows move across the board (board-keys.ts);
// - what it assumes and what was decided, one quiet line (PlanNotes.tsx).
// Everything the viewer did here (commands, drafts, questions, the lens) is theirs: another viewer starts afresh.
import { useContext, useEffect, useRef, useState } from 'react'
import { Icon } from '@sophia/ui'
import { linkedId, showInAddress, TASK } from '../../resources/link.ts'
import { useAddressed } from '../../resources/useAddressed.ts'
import type { QuotaObservation, Resource } from '../../resources/resource.ts'
import { answers, SearchQuery } from '../TaskSearch.tsx'
import '../../resources/resources.css'
import { useActs, type SendCommand } from '../../resources/SessionActs.tsx'
import { AwayLine } from '../../resources/AwayLine.tsx'
import { accountOf } from './account.ts'
import { useAsks } from './AskSophia.tsx'
import type { Ask } from './ask.ts'
import { moveOnBoard } from './board-keys.ts'
import type { BoardView, ItemView } from './board-view.ts'
import { Decision, type Decide } from './Decision.tsx'
import { Lens } from './Lens.tsx'
import { shows, type LensName } from './lenses.ts'
import {
  actionable,
  boardOf,
  laneOf,
  proposed,
  waitsOn,
  type Board,
  type BoardDecision,
  type GoalView,
  type Lane,
  type Mark,
  type PlanRow,
  type WorkPlan,
} from './plan.ts'
import { Folded } from './PlanNotes.tsx'
import { ProposalBand } from './Proposal.tsx'
import type { ReadResult } from './results.ts'
import { glance, readSeen, whileAway, writeSeen, changedSince, type Seen, type SeenAt } from './seen.ts'
import { TaskSheet } from './TaskSheet.tsx'
import { TaskTile, type TileFlags, type TileProps } from './TaskTile.tsx'
import { Threads } from './Threads.tsx'
import './plan.css'
import './board.css'

type Person = Resource['owner']

interface Props {
  /** The project being looked at: commands name it, and a plan of another project is never operated here. */
  projectId: string
  /** The goal's view (board-view.ts), as read and accepted; null, nothing is shown. */
  goal: GoalView | null
  /** How much of the project's board could be read, and when: a partial or unavailable read says so. */
  coverage?: BoardView['coverage']
  observedAt?: string
  resources: readonly Resource[]
  people: Record<string, Person>
  now: Date
  viewerId?: string | null
  onDecide?: Decide
  /** Where a command on a task goes (guidance, Hold, Resume, Stop), with its exact target. */
  onCommand?: SendCommand
  /** Where a question to Sophia about a task goes: the shared conversation. */
  onAsk?: Ask
  /** Where a task's result version is read. */
  readResult?: ReadResult
  /** The way to the existing conversation, when Sophia can't be asked from a task. */
  onOpenConversation?: () => void
  /** Opens the resource doing a task in Resources (LFE-06.5); absent, who does it is only a name. */
  onOpenResource?: (resourceId: string) => void
  /**
   * The accounts' latest capacity readings (LFE-06.6): a task whose doer's account runs short says so, and its sheet
   * names where there is room. Absent, nothing is said.
   */
  observations?: readonly QuotaObservation[]
}

type LaneView = { key: Exclude<Lane, 'closed'>; label: string; mark: Mark; empty: string }

/** The board's lanes, each with the mark its head wears. */
const LANES: LaneView[] = [
  { key: 'active', label: 'Active', mark: 'working', empty: 'Nothing active' },
  { key: 'next', label: 'Up next', mark: 'later', empty: 'Nothing waiting to start' },
  { key: 'unassigned', label: 'Unassigned', mark: 'free', empty: 'Nothing unassigned' },
  { key: 'complete', label: 'Complete', mark: 'complete', empty: 'Nothing complete yet' },
]

const inLane = (rows: readonly PlanRow[], lane: Lane) => rows.filter((r) => laneOf(r) === lane)

/** How many tiles a lane shows before it keeps the rest one press away. */
const SHOWN = 5

interface LaneProps extends Omit<TileProps, 'row' | 'index' | 'flags'> {
  lane: LaneView
  rows: PlanRow[]
  flags: (row: PlanRow) => TileFlags
}

/** A lane: its head and count, its first tiles, and the rest one press away. */
function LaneSection({ lane, rows, flags, ...tile }: LaneProps) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, SHOWN)
  const kept = rows.length - SHOWN
  return (
    <section className="lane" data-lane={lane.key} aria-label={lane.label}>
      <h4 className="lane-head">
        <span className="plan-mark" data-mark={lane.mark} aria-hidden />
        <span className="field-label">{lane.label}</span>
        <span className="count">{rows.length}</span>
      </h4>
      {rows.length === 0 ? (
        <p className="lane-empty">{lane.empty}</p>
      ) : (
        <ul className="task-grid">
          {shown.map((row, i) => (
            <TaskTile key={row.item.id} row={row} index={i} flags={flags(row)} {...tile} />
          ))}
        </ul>
      )}
      {kept > 0 && (
        <button type="button" className="ghost lane-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show ${String(kept)} more`}
        </button>
      )}
    </section>
  )
}

/** Closed work, folded under the lanes: each with why, a press away; never counted as done. */
function ClosedWork({ rows, onOpen }: { rows: readonly PlanRow[]; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null
  return (
    <section className="board-closed" aria-label="Closed work">
      <button type="button" className="ghost board-closed-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Closed work
        <span className="count">{rows.length}</span>
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <ul className="task-links board-closed-list">
          {rows.map((r) => (
            <li key={r.item.id}>
              <button type="button" className="task-link" data-task={r.item.id} onClick={() => onOpen(r.item.id)}>
                <span className="plan-mark" data-mark="closed" aria-hidden />
                <span className="task-link-name">{r.item.purpose}</span>
                <span className="task-link-where">
                  {r.status.text}
                  {r.view?.closed_reason ? ` · ${r.view.closed_reason}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** What changed since the viewer last looked: remembered per project, goal, plan and viewer; a first visit, nothing. */
function useSeen(at: SeenAt, rows: readonly PlanRow[], decisions: readonly BoardDecision[]) {
  const id = `${at.project}.${at.goal}.${at.plan}.${at.viewer ?? ''}`
  const first = (): Seen => readSeen(at) ?? writeSeen(at, glance(rows, decisions))
  const [kept, setKept] = useState(() => ({ id, seen: first() }))
  // Another plan for the same goal (a new plan id), or another viewer: its own seen state, never the last one's.
  const seen = kept.id === id ? kept.seen : first()
  useEffect(() => {
    if (kept.id !== id) setKept({ id, seen })
  }, [kept.id, id, seen])
  return { seen, markSeen: () => setKept({ id, seen: writeSeen(at, glance(rows, decisions)) }) }
}

/**
 * What waits on someone's decision: a pill in the board's bar, amber and pinging when it is the viewer's, that opens
 * the decisions over the lanes. Its decider's own opens by itself the first time, so nothing of theirs hides.
 */
function useDecisions(decisions: readonly BoardDecision[], viewerId: string | null, now: Date) {
  const open = decisions.filter((d) => d.state === 'proposed')
  // Past its expiry, it is read, not answered: it isn't the viewer's to act on, so it calls no one.
  const mine = open.filter((d) => d.decider_id === viewerId && actionable(d, now))
  const [shown, setShown] = useState(mine.length > 0)
  return { open, mine, shown, toggle: () => setShown((v) => !v) }
}

interface PillProps {
  viewerId: string | null
  count: number
  mine: number
  shown: boolean
  onToggle: () => void
  people: Record<string, Person>
  deciders: string[]
}

function DecisionPill({ viewerId, count, mine, shown, onToggle, people, deciders }: PillProps) {
  if (count === 0) return null
  const named = (id: string) => (id === viewerId ? 'you' : (people[id]?.name ?? 'someone'))
  const who = mine > 0 ? 'you' : [...new Set(deciders.map(named))].join(' and ')
  return (
    <button
      type="button"
      className="decision-pill"
      data-mine={mine > 0 || undefined}
      aria-expanded={shown}
      onClick={onToggle}
    >
      <span className="decision-pill-dot" aria-hidden />
      {count} {count === 1 ? 'decision' : 'decisions'} for {who}
      <Icon name="chevron" size={12} />
    </button>
  )
}

/** What a decision is about, in words: its task, and the candidate it names. */
const aboutOf = (d: BoardDecision, plan: WorkPlan) => {
  const purpose = plan.items.find((i) => i.id === d.work_id)?.purpose
  return purpose ? `About ${purpose}${d.candidate_version_ref ? ` · ${d.candidate_version_ref}` : ''}` : null
}

interface DecisionsProps {
  decisions: readonly BoardDecision[]
  plan: WorkPlan
  people: Record<string, Person>
  now: Date
  viewerId: string | null
  onDecide?: Decide | undefined
  className?: string
}

function Decisions({ decisions, plan, className = 'board-decisions', ...rest }: DecisionsProps) {
  if (decisions.length === 0) return null
  return (
    <div className={className}>
      {decisions.map((d) => (
        <Decision key={`${d.decision_id}:${String(d.revision)}`} decision={d} about={aboutOf(d, plan)} {...rest} />
      ))}
    </div>
  )
}

/**
 * The open task, kept in the address (`#task-<id>`): the address's task opens with the board, and again each time a
 * link is followed; a task pressed opens over it. Only a task on this board is open: one on none shows nothing, and
 * one a new revision took away closes, its address with it.
 */
function useOpenTask(rows: readonly PlanRow[]) {
  const named = useAddressed(TASK)
  const [pressed, setPressed] = useState<{ id: string | null; seq: number } | null>(null)
  const wanted = pressed?.seq === named.seq ? pressed.id : named.id
  const open = rows.some((r) => r.item.id === wanted) ? wanted : null
  useEffect(() => {
    if (!open) return undefined
    showInAddress(open, TASK)
    return () => {
      if (linkedId(window.location.hash, TASK) === open) showInAddress(null, TASK)
    }
  }, [open])
  return { open, setOpen: (id: string | null) => setPressed({ id, seq: named.seq }) }
}

/** The board's moment-to-moment state: the hovered task and what it waits on, the open task, the lens. */
function useBoard(rows: readonly PlanRow[], viewerId: string | null, changed: ReadonlySet<string>) {
  const query = useContext(SearchQuery)
  const [lit, setLit] = useState<string | null>(null)
  const { open, setOpen } = useOpenTask(rows)
  const [lens, setLens] = useState<LensName>('all')
  const lighting = rows.find((r) => r.item.id === lit)?.item
  const waited = lighting ? waitsOn(lighting) : []
  const flags = (row: PlanRow): TileFlags => ({
    lit: waited.includes(row.item.id),
    hover: waited.length > 0 && row.item.id === lit,
    // Outside the lens, or not what Tasks is searched for: it steps back, and stays where it is.
    dim: !shows(lens, row, viewerId) || !answers(query, row.item.purpose, row.doer.name, row.status.text),
    changed: changed.has(row.item.id),
  })
  // J and K in the sheet follow the board's order, lane by lane, then closed work.
  const order = [...LANES.flatMap((l) => inLane(rows, l.key)), ...inLane(rows, 'closed')]
  const step = (by: 1 | -1) => {
    const at = order.findIndex((r) => r.item.id === open)
    const next = order[(at + by + order.length) % order.length]
    if (next) setOpen(next.item.id)
  }
  return { lit, setLit, open, setOpen, lens, setLens, waited, flags, step }
}

/** The four lanes side by side, moved through by the arrows, with the threads drawn over them. */
function Lanes({
  rows,
  board,
  tile,
}: {
  rows: PlanRow[]
  board: ReturnType<typeof useBoard>
  tile: Omit<LaneProps, 'lane' | 'rows'>
}) {
  const lanes = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={lanes}
      className="board-lanes"
      data-threading={board.waited.length > 0 || undefined}
      onKeyDown={(e) => {
        if (lanes.current && moveOnBoard(lanes.current, e.key)) e.preventDefault()
      }}
    >
      {LANES.map((lane) => (
        <LaneSection key={lane.key} lane={lane} rows={inLane(rows, lane.key)} {...tile} />
      ))}
      <Threads box={lanes} to={board.lit} from={board.waited} />
    </div>
  )
}

/** What the board couldn't read or doesn't hold together, said plainly over it. */
function Notices({ board, coverage, operable }: { board: Board; coverage: Props['coverage']; operable: boolean }) {
  const notes = [
    coverage === 'partial' && 'Not everything about this plan could be read: some of its state may be missing.',
    coverage === 'unavailable' && 'Its live state can’t be read now. What shows is its last read, and may be stale.',
    board.problems.length > 0 &&
      `This plan doesn’t hold together: ${board.problems.join('; ')}. Each task shows once; the lead should correct it.`,
    !operable && 'Proposed, not accepted yet: nothing in it runs.',
  ].filter((n) => typeof n === 'string')
  return notes.map((n) => (
    <p key={n} className="board-notice" role="note">
      {n}
    </p>
  ))
}

/** What an observed item is doing, in a few words: "running", "ready for review". */
const lifeSaid = (v: ItemView) => v.lifecycle.replaceAll('_', ' ')

/**
 * Work observed for the goal that the plan in force doesn't hold, said rather than hidden: who has it and where it
 * stands, by its work id (the view says no more of it). The goal's own Hold and Stop still reach all of its work.
 */
function OutsideWork({ outside }: { outside: readonly ItemView[] }) {
  if (outside.length === 0) return null
  return (
    <section className="board-outside" aria-label="Observed outside the plan">
      <h4 className="field-label">Observed outside the plan</h4>
      <ul className="task-links">
        {outside.map((v) => (
          <li key={v.work_id} className="task-link" data-work={v.work_id}>
            <span className="task-link-name">
              {v.assignment?.executor.display_name ?? 'No one assigned'} · {v.work_id}
            </span>
            <span className="task-link-where">{lifeSaid(v)}</span>
          </li>
        ))}
      </ul>
      <p className="act-note muted">The goal’s own Hold and Stop still reach all of its work.</p>
    </section>
  )
}

export function PlanBoard(props: Props) {
  const { goal, resources, people, viewerId = null, projectId } = props
  const board = boardOf(goal, { resources, people, viewerId, project: projectId })
  if (!goal) return null
  if (!board) {
    // No plan in force or proposed, and yet work is observed: said, never a goal that looks empty.
    if (goal.items.length === 0) return null
    return (
      <section className="board" aria-label="No plan in force">
        <p className="board-notice" role="note">
          This goal has no plan in force, but {String(goal.items.length)} of its tasks are observed.
        </p>
        <OutsideWork outside={goal.items} />
      </section>
    )
  }
  // Another viewer, or another project, starts afresh: nothing typed, sent or asked here carries over.
  return <BoardBody key={`${projectId}|${viewerId ?? ''}`} {...props} goal={goal} board={board} />
}

interface BodyProps extends Props {
  goal: GoalView
  board: Board
}

interface BarProps {
  view: ReturnType<typeof useBoard>
  rows: readonly PlanRow[]
  viewerId: string | null
  asks: ReturnType<typeof useDecisions>
  people: Record<string, Person>
  away: ReturnType<typeof whileAway>
  onSeen: () => void
}

/** The board's bar: the lenses, what waits on a decision, and what changed while the viewer was away. */
function Bar({ view, rows, viewerId, asks, people, away, onSeen }: BarProps) {
  return (
    <div className="board-bar">
      <Lens lens={view.lens} rows={rows} viewerId={viewerId} onChange={view.setLens} />
      <DecisionPill
        viewerId={viewerId}
        count={asks.open.length}
        mine={asks.mine.length}
        shown={asks.shown}
        onToggle={asks.toggle}
        people={people}
        deciders={asks.open.map((d) => d.decider_id)}
      />
      <AwayLine away={away} onSeen={onSeen} className="board-return" />
    </div>
  )
}

/** A choice already made, while the plan takes it in. */
const decidedOf = (decisions: readonly BoardDecision[]) =>
  decisions.filter((d) => d.state === 'accepted' && (d.plan_reaction === 'pending' || d.plan_reaction === 'unknown'))

function BoardBody(props: BodyProps) {
  const { goal, board, people, now, viewerId = null, onDecide } = props
  const { plan, rows, operable } = board
  const at = { project: props.projectId, goal: goal.goal_id, plan: plan.plan_id, viewer: viewerId }
  // Commands, drafts and questions outlive this board (another goal chosen, a search): kept per project and viewer.
  const space = `${props.projectId}|${viewerId ?? ''}`
  const { seen, markSeen } = useSeen(at, rows, goal.decisions)
  const view = useBoard(rows, viewerId, changedSince(rows, seen))
  const asks = useDecisions(goal.decisions, viewerId, now)
  const acts = useActs(operable ? props.onCommand : undefined, props.projectId, space)
  const questions = useAsks(props.onAsk, space)
  const opened = rows.find((r) => r.item.id === view.open)
  const shortOf = (row: PlanRow) => accountOf(row, props).tile
  const tile = { plan, viewerId, now, onLight: view.setLit, onOpen: view.setOpen, flags: view.flags, shortOf }
  const decisionProps = { plan, people, now, viewerId, onDecide: operable ? onDecide : undefined }
  const away = whileAway(rows, goal.decisions, seen, viewerId, people)
  return (
    <section className="board" aria-label={`Plan r${String(plan.revision)}`} data-lens={view.lens}>
      <Bar view={view} rows={rows} viewerId={viewerId} asks={asks} people={people} away={away} onSeen={markSeen} />
      <Notices board={board} coverage={props.coverage} operable={operable} />
      <ProposalBand current={plan} proposals={proposed(goal).filter((p) => p !== plan)} operable={operable} />
      <Decisions decisions={decidedOf(goal.decisions)} className="board-decisions board-decided" {...decisionProps} />
      {asks.shown && <Decisions decisions={asks.open} {...decisionProps} />}
      <Lanes rows={rows} board={view} tile={tile} />
      <ClosedWork rows={inLane(rows, 'closed')} onOpen={view.setOpen} />
      <OutsideWork outside={board.outside} />
      <Folded plan={plan} decisions={goal.decisions} people={people} />
      {opened && (
        <TaskSheet
          {...props}
          row={opened}
          rows={rows}
          plan={plan}
          operable={operable}
          next={goal.next_checkpoint}
          viewerId={viewerId}
          acts={acts}
          asks={questions}
          account={accountOf(opened, props)}
          onOpen={view.setOpen}
          onStep={view.step}
          onClose={() => view.setOpen(null)}
        />
      )}
    </section>
  )
}
