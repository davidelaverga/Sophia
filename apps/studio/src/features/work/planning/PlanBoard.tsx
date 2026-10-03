// The lead's plan as a board, in Resources' language (LFE-07.1). Little to read, much to recognise:
// - one band on top: where the plan goes next, and its revision, quietly;
// - what waits on someone's decision, raised (Decision.tsx);
// - while the viewer was away: one sentence of what changed, and Mark seen (seen.ts);
// - lenses (All, For you, Waiting, Open) that dim what they don't show (Lens.tsx);
// - its tasks in four lanes side by side, In motion, Up next, Open and Done (TaskTile.tsx). A lane shows its first
//   five and keeps the rest one press away;
// - hovering a tile draws the threads to the tasks it waits on (Threads.tsx); pressing it opens the task's sheet, to
//   act on it or ask Sophia (TaskSheet.tsx), and puts it in the address (`#task-<id>`, link.ts), which opens it
//   again; the arrows move across the board (board-keys.ts);
// - what it assumes and what was decided, one quiet line (PlanNotes.tsx).
import { useContext, useEffect, useRef, useState } from 'react'
import { Icon } from '@sophia/ui'
import { linkedId, showInAddress, TASK } from '../../resources/link.ts'
import { useAddressed } from '../../resources/useAddressed.ts'
import type { Resource } from '../../resources/resource.ts'
import { answers, SearchQuery } from '../TaskSearch.tsx'
import '../../resources/resources.css'
import type { Ask } from './AskSophia.tsx'
import { moveOnBoard } from './board-keys.ts'
import { Decision, type Decide } from './Decision.tsx'
import { Lens } from './Lens.tsx'
import { shows, type LensName } from './lenses.ts'
import { current, planRows, waitsOn, type Mark, type PlanRow, type WorkPlan } from './plan.ts'
import { Folded } from './PlanNotes.tsx'
import { changedSince, readSeen, whileAway, writeSeen } from './seen.ts'
import type { Act } from './TaskActions.tsx'
import { TaskSheet } from './TaskSheet.tsx'
import { TaskTile, type TileFlags, type TileProps } from './TaskTile.tsx'
import { Threads } from './Threads.tsx'
import './plan.css'
import './board.css'

type Person = Resource['owner']

interface Props {
  plan: WorkPlan | null
  resources: readonly Resource[]
  people: Record<string, Person>
  now: Date
  viewerId?: string | null
  onDecide?: Decide
  /** Where an owner's guidance, Hold or Stop goes, from a task's sheet. */
  onAct?: Act
  /** Where a question to Sophia about a task goes. */
  onAsk?: Ask
  /** Opens the resource doing a task in Resources (LFE-06.5); absent, who does it is only a name. */
  onOpenResource?: (resourceId: string) => void
}

type Lane = { key: string; label: string; mark: Mark; marks: Mark[]; empty: string }

/** The board's lanes, each with the mark its head wears. */
const LANES: Lane[] = [
  {
    key: 'motion',
    label: 'In motion',
    mark: 'working',
    marks: ['waiting', 'working', 'queued'],
    empty: 'Nothing running',
  },
  { key: 'next', label: 'Up next', mark: 'later', marks: ['later'], empty: 'Nothing waiting to start' },
  { key: 'open', label: 'Open', mark: 'free', marks: ['free'], empty: 'Nothing left to take' },
  { key: 'done', label: 'Done', mark: 'checked', marks: ['finished', 'checked'], empty: 'Nothing finished yet' },
]

const inLane = (rows: readonly PlanRow[], lane: Lane) => rows.filter((r) => lane.marks.includes(r.status.mark))

/** How many tiles a lane shows before it keeps the rest one press away. */
const SHOWN = 5

interface LaneProps extends Omit<TileProps, 'row' | 'index' | 'flags'> {
  lane: Lane
  rows: PlanRow[]
  flags: (row: PlanRow) => TileFlags
}

/** A lane: its head and count, its first tiles, and the rest one press away. */
function LaneView({ lane, rows, flags, ...tile }: LaneProps) {
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

/** What changed since the viewer last looked: remembered per plan; a first visit remembers and says nothing. */
function useSeen(plan: WorkPlan | null, rows: readonly PlanRow[], viewerId: string | null) {
  const [seen, setSeen] = useState(() =>
    plan ? (readSeen(plan.plan_id, viewerId) ?? writeSeen(plan.plan_id, viewerId, rows)) : null,
  )
  return {
    changed: changedSince(rows, seen),
    markSeen: () => plan && setSeen(writeSeen(plan.plan_id, viewerId, rows)),
  }
}

interface DecisionsProps {
  plan: WorkPlan
  people: Record<string, Person>
  now: Date
  viewerId: string | null
  onDecide?: Decide | undefined
}

/**
 * What waits on someone's decision: a pill in the board's bar, amber and pinging when it is the viewer's, that opens
 * the decisions over the lanes. Its decider's own opens by itself the first time, so nothing of theirs hides.
 */
function useDecisions(plan: WorkPlan, viewerId: string | null) {
  const open = plan.decisions.filter((d) => d.state === 'proposed')
  const mine = open.filter((d) => d.decider_id === viewerId)
  const [shown, setShown] = useState(mine.length > 0)
  return { open, mine, shown, toggle: () => setShown((v) => !v) }
}

function DecisionPill({
  count,
  mine,
  shown,
  onToggle,
  people,
  deciders,
}: {
  count: number
  mine: number
  shown: boolean
  onToggle: () => void
  people: Record<string, Person>
  deciders: string[]
}) {
  if (count === 0) return null
  const who = mine > 0 ? 'you' : [...new Set(deciders.map((id) => people[id]?.name ?? 'someone'))].join(' and ')
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

function Decisions({ decisions, ...rest }: Omit<DecisionsProps, 'plan'> & { decisions: WorkPlan['decisions'] }) {
  return (
    <div className="board-decisions">
      {decisions.map((d) => (
        <Decision key={d.decision_id} decision={d} {...rest} />
      ))}
    </div>
  )
}

/** While the viewer was away: one line of what changed, beside the lenses, whole on hover, and Mark seen. */
function WhileAway({ away, onSeen }: { away: ReturnType<typeof whileAway>; onSeen: () => void }) {
  if (away.phrases.length === 0) return null
  const said = away.phrases.join(' · ') + (away.more > 0 ? ` · and ${String(away.more)} more` : '')
  return (
    <p className="board-return" title={said}>
      <span className="ask-light" aria-hidden />
      <span className="board-return-said">
        <span className="field-label">While you were away</span> {said}
      </span>
      <button type="button" className="board-since-act" onClick={onSeen}>
        Mark seen
      </button>
    </p>
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
  // J and K in the sheet follow the board's order, lane by lane.
  const order = LANES.flatMap((l) => inLane(rows, l))
  const step = (by: 1 | -1) => {
    const at = order.findIndex((r) => r.item.id === open)
    const next = order[(at + by + order.length) % order.length]
    if (next) setOpen(next.item.id)
  }
  return { lit, setLit, open, setOpen, lens, setLens, waited, flags, step }
}

export function PlanBoard(props: Props) {
  const { plan: given, resources, people, viewerId = null } = props
  const plan = current(given)
  const rows = plan ? planRows(plan, resources, people) : []
  const { changed, markSeen } = useSeen(plan, rows, viewerId)
  const board = useBoard(rows, viewerId, changed)
  if (!plan) return null
  return <Board {...props} plan={plan} rows={rows} changed={changed} markSeen={markSeen} board={board} />
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
        <LaneView key={lane.key} lane={lane} rows={inLane(rows, lane)} {...tile} />
      ))}
      <Threads box={lanes} to={board.lit} from={board.waited} />
    </div>
  )
}

interface BoardProps extends Props {
  plan: WorkPlan
  rows: PlanRow[]
  changed: ReadonlySet<string>
  markSeen: () => void
  board: ReturnType<typeof useBoard>
}

function Board({
  plan,
  rows,
  changed,
  markSeen,
  board,
  people,
  now,
  viewerId = null,
  onDecide,
  onAct,
  onAsk,
  onOpenResource,
}: BoardProps) {
  const asks = useDecisions(plan, viewerId)
  const opened = rows.find((r) => r.item.id === board.open)
  const tile = { plan, viewerId, now, onLight: board.setLit, onOpen: board.setOpen, flags: board.flags }
  return (
    <section className="board" aria-label={`Plan r${String(plan.revision)}`} data-lens={board.lens}>
      <div className="board-bar">
        <Lens lens={board.lens} rows={rows} viewerId={viewerId} onChange={board.setLens} />
        <DecisionPill
          count={asks.open.length}
          mine={asks.mine.length}
          shown={asks.shown}
          onToggle={asks.toggle}
          people={people}
          deciders={asks.open.map((d) => d.decider_id)}
        />
        <WhileAway away={whileAway(rows, changed, viewerId)} onSeen={markSeen} />
      </div>
      {asks.shown && asks.open.length > 0 && (
        <Decisions decisions={asks.open} people={people} now={now} viewerId={viewerId} onDecide={onDecide} />
      )}
      <Lanes rows={rows} board={board} tile={tile} />
      <Folded plan={plan} people={people} />
      {opened && (
        <TaskSheet
          row={opened}
          rows={rows}
          plan={plan}
          now={now}
          viewerId={viewerId}
          onAct={onAct}
          onAsk={onAsk}
          onOpenResource={onOpenResource}
          onOpen={board.setOpen}
          onStep={board.step}
          onClose={() => board.setOpen(null)}
        />
      )}
    </section>
  )
}
