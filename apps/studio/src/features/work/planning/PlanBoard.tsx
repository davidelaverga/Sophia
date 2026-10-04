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
// - what it assumes and what was decided, one quiet line (PlanNotes.tsx);
// - a review of the lead's that proposes a change: a pill in the bar, its card in the decisions' slot, one or the
//   other (ReviewResult.tsx).
import { useContext, useEffect, useRef, useState } from 'react'
import { Icon } from '@sophia/ui'
import { linkedId, showInAddress, TASK } from '../../resources/link.ts'
import { useAddressed } from '../../resources/useAddressed.ts'
import type { QuotaObservation, RequiredAction, Resource } from '../../resources/resource.ts'
import { answers, SearchQuery } from '../TaskSearch.tsx'
import '../../resources/resources.css'
import { useActs } from '../../resources/SessionActs.tsx'
import { AwayLine } from '../../resources/AwayLine.tsx'
import { accountOf } from './account.ts'
import { actionable } from './plan.ts'
import type { Ask } from './AskSophia.tsx'
import { moveOnBoard } from './board-keys.ts'
import { Decision, type Decide } from './Decision.tsx'
import { Lens } from './Lens.tsx'
import { shows, type LensName } from './lenses.ts'
import { current, planRows, waitsOn, type Mark, type PlanRow, type WorkPlan } from './plan.ts'
import { Folded } from './PlanNotes.tsx'
import type { Challenge } from './challenges.ts'
import { material } from './review.ts'
import { ReviewResult, type Waiting } from './ReviewResult.tsx'
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
  /** The requests waiting on owners: a waiting task names whom it waits on only from one of these. */
  actions?: readonly RequiredAction[]
  /**
   * The accounts' latest capacity readings (LFE-06.6): a task whose doer's account runs short says so, and its sheet
   * names where there is room. Absent, nothing is said.
   */
  observations?: readonly QuotaObservation[]
  /** Where a challenge to the lead's review goes (LFE-07.2); absent for whoever can't act on the work. */
  onChallenge?: Challenge
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
  const at = plan ? `${plan.plan_id}.${viewerId ?? ''}` : null
  const first = () => (plan ? (readSeen(plan.plan_id, viewerId) ?? writeSeen(plan.plan_id, viewerId, rows)) : null)
  const [kept, setKept] = useState(() => ({ at, seen: first() }))
  // Another plan for the same goal (a new plan id), or another viewer: its own seen state, never the last one's.
  const seen = kept.at === at ? kept.seen : first()
  useEffect(() => {
    if (kept.at !== at) setKept({ at, seen })
  }, [kept.at, at, seen])
  return {
    changed: changedSince(rows, seen),
    markSeen: () => plan && setKept({ at, seen: writeSeen(plan.plan_id, viewerId, rows) }),
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
function useDecisions(plan: WorkPlan, viewerId: string | null, now: Date) {
  const open = plan.decisions.filter((d) => d.state === 'proposed')
  // Past its expiry, it is read, not answered: it isn't the viewer's to act on, so it calls no one.
  const mine = open.filter((d) => d.decider_id === viewerId && actionable(d, now))
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

function Decisions({
  decisions,
  focus,
  ...rest
}: Omit<DecisionsProps, 'plan'> & { decisions: WorkPlan['decisions']; focus: string | null }) {
  const list = useRef<HTMLDivElement>(null)
  // Opened on one (from a review that waits on it), the focus goes to its first choice. Found by comparing ids, never
  // by putting one in a selector: a decision's id is any string.
  useEffect(() => {
    const asked = [...(list.current?.querySelectorAll<HTMLElement>('[data-decision]') ?? [])].find(
      (d) => d.dataset.decision === focus,
    )
    asked?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
  }, [focus])
  return (
    <div ref={list} className="board-decisions">
      {decisions.map((d) => (
        <Decision key={`${d.decision_id}:${String(d.revision)}`} decision={d} {...rest} />
      ))}
    </div>
  )
}

/** The slot under the bar: the decisions, or the lead's review that proposes a change; one at a time. */
function useSlot(plan: WorkPlan, viewerId: string | null, now: Date, decider: (id: string) => string) {
  const asks = useDecisions(plan, viewerId, now)
  // The review opened, by its id: another review, a later one, comes closed.
  const [openId, setOpenId] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const review = material(plan.last_review) ? plan.last_review : null
  const reviewShown = review !== null && openId === review.review_id
  // A card closed by a later review takes the focus with it: it goes back to the pill, as Escape and Close do.
  const wasShown = useRef(reviewShown)
  useEffect(() => {
    if (wasShown.current && !reviewShown && document.activeElement === document.body)
      pill.current?.focus({ preventScroll: true })
    wasShown.current = reviewShown
  }, [reviewShown])
  return {
    asks,
    review,
    pill,
    reviewShown,
    focus,
    // Opening one closes the other, so the slot holds one at a time.
    decisionsShown: asks.shown && asks.open.length > 0,
    toggleDecisions: () => {
      setOpenId(null)
      setFocus(null)
      asks.toggle()
    },
    toggleReview: () => {
      if (!reviewShown && asks.shown) asks.toggle()
      setOpenId(reviewShown ? null : (review?.review_id ?? null))
    },
    openDecisions: (decisionId: string) => {
      setOpenId(null)
      setFocus(decisionId)
      if (!asks.shown) asks.toggle()
    },
    closeReview: () => {
      setOpenId(null)
      pill.current?.focus()
    },
    /**
     * What a proposal's decision waits on: the viewer's answer, its decider's, or nothing: it expired (by its date, or
     * marked so). A decision already answered or replaced waits on no one.
     */
    waitsOn: (decisionId: string): Waiting | null => {
      const d = plan.decisions.find((o) => o.decision_id === decisionId)
      if (!d || (d.state !== 'proposed' && d.state !== 'expired')) return null
      if (!actionable(d, now)) return { on: 'expired' }
      return d.decider_id === viewerId ? { on: 'you' } : { on: 'them', name: decider(d.decider_id) }
    },
  }
}

/** A review that proposes a change, waiting in the bar: its pill opens its card. */
function ReviewPill({ slot }: { slot: ReturnType<typeof useSlot> }) {
  if (!slot.review) return null
  return (
    <button
      ref={slot.pill}
      type="button"
      className="decision-pill review-pill"
      aria-expanded={slot.reviewShown}
      onClick={slot.toggleReview}
    >
      <span className="decision-pill-dot" aria-hidden />
      Review · a change proposed
      <Icon name="chevron" size={12} />
    </button>
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
  const rows = plan ? planRows(plan, resources, people, props.actions) : []
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

/** Under the bar, one at a time: the decisions, or the lead's review that proposes a change. */
function Slot({
  slot,
  rows,
  onOpenTask,
  plan,
  onChallenge,
  ...decisions
}: DecisionsProps & {
  slot: ReturnType<typeof useSlot>
  rows: PlanRow[]
  onOpenTask: (id: string) => void
  onChallenge: Challenge | undefined
}) {
  const { now, viewerId } = decisions
  if (slot.decisionsShown) return <Decisions decisions={slot.asks.open} focus={slot.focus} {...decisions} />
  if (!slot.reviewShown || !slot.review) return null
  return (
    <ReviewResult
      review={slot.review}
      plan={plan}
      rows={rows}
      now={now}
      onOpenTask={onOpenTask}
      waitsOn={slot.waitsOn}
      onOpenDecisions={slot.openDecisions}
      onClose={slot.closeReview}
      viewerId={viewerId}
      onChallenge={onChallenge}
    />
  )
}

interface BoardProps extends Props {
  plan: WorkPlan
  rows: PlanRow[]
  changed: ReadonlySet<string>
  markSeen: () => void
  board: ReturnType<typeof useBoard>
}

/** The board's acts on its tasks' sessions, kept by the board: still said after J or K turn a task's sheet. */
function useBoardActs(rows: readonly PlanRow[], onAct: Act | undefined) {
  return useActs(
    onAct &&
      ((sessionId, act, report) => {
        const row = rows.find((r) => r.doer.session?.id === sessionId)
        if (row) onAct(row, act, report)
      }),
  )
}

function Board(props: BoardProps) {
  const { plan, rows, changed, markSeen, board, people, now, viewerId = null, onDecide, onAsk } = props
  const slot = useSlot(plan, viewerId, now, (id) => people[id]?.name ?? 'someone')
  const { asks } = slot
  const acts = useBoardActs(rows, props.onAct)
  const opened = rows.find((r) => r.item.id === board.open)
  const shortOf = (row: PlanRow) => accountOf(row, props).tile
  const tile = { plan, viewerId, now, onLight: board.setLit, onOpen: board.setOpen, flags: board.flags, shortOf }
  return (
    <section className="board" aria-label={`Plan r${String(plan.revision)}`} data-lens={board.lens}>
      <div className="board-bar">
        <Lens lens={board.lens} rows={rows} viewerId={viewerId} onChange={board.setLens} />
        <DecisionPill
          count={asks.open.length}
          mine={asks.mine.length}
          shown={slot.decisionsShown}
          onToggle={slot.toggleDecisions}
          people={people}
          deciders={asks.open.map((d) => d.decider_id)}
        />
        <ReviewPill slot={slot} />
        <AwayLine away={whileAway(rows, changed, viewerId)} onSeen={markSeen} className="board-return" />
      </div>
      <Slot
        slot={slot}
        plan={plan}
        rows={rows}
        people={people}
        now={now}
        viewerId={viewerId}
        onDecide={onDecide}
        onOpenTask={board.setOpen}
        onChallenge={props.onChallenge}
      />
      <Lanes rows={rows} board={board} tile={tile} />
      <Folded plan={plan} people={people} />
      {opened && (
        <TaskSheet
          row={opened}
          rows={rows}
          plan={plan}
          now={now}
          viewerId={viewerId}
          acts={acts}
          onAsk={onAsk}
          onOpenResource={props.onOpenResource}
          account={accountOf(opened, props)}
          onOpen={board.setOpen}
          onStep={board.step}
          onClose={() => board.setOpen(null)}
        />
      )}
    </section>
  )
}
