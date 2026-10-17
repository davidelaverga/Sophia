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
// - what it assumes and what was decided, one quiet line (PlanNotes.tsx);
// - a review of the lead's that proposes a change: a pill in the bar, its card in the decisions' slot, one or the
//   other (ReviewResult.tsx). The review is the goal's own read, beside the view (review.ts), never part of the plan.
// Everything the viewer did here (commands, drafts, questions, the lens) is theirs: another viewer starts afresh.
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EmptyState, Icon, Menu, MenuItem, usePopover } from '@sophia/ui'
import { saveBlob } from '../../artifacts/download.ts'
import { boardCsv, boardFileName, boardMarkdown, type ExportRow } from './board-export.ts'
import { DECISION, linkedId, showInAddress, TASK } from '../../resources/link.ts'
import { useAddressed } from '../../resources/useAddressed.ts'
import type { QuotaObservation, Resource } from '../../resources/resource.ts'
import { answers, SearchQuery } from '../TaskSearch.tsx'
import '../../resources/resources.css'
import { commandSpace } from '../../resources/command-store.ts'
import { useActs, type SendCommand } from '../../resources/SessionActs.tsx'
import { AwayLine } from '../../resources/AwayLine.tsx'
import { accountOf } from './account.ts'
import { useAsks } from './AskSophia.tsx'
import { NOT_CONNECTED, NOT_READ, type Ask } from './ask.ts'
import { moveOnBoard } from './board-keys.ts'
import type { BoardView, ItemView } from './board-view.ts'
import { Decision, type Decide, type DecisionAnswer } from './Decision.tsx'
import { Lens } from './Lens.tsx'
import { shows, type LensName } from './lenses.ts'
import {
  actionable,
  boardOf,
  decidedFor,
  blockersOf,
  laneOf,
  latestDecisions,
  outsideOf,
  proposed,
  waitsOn,
  type Board,
  type BoardDecision,
  type GoalView,
  type Lane,
  type Mark,
  type Outside,
  type PlanRow,
  type WorkPlan,
} from './plan.ts'
import { answeredHere, answeredKey, nextUp, quoted, sentFrom, waitingFor } from './next-up.ts'
import { answerKey, useAnswerStates } from './answers.ts'
import { useCommands } from '../../../app/useCommands.ts'
import { NextUp } from './NextUp.tsx'
import { Folded } from './PlanNotes.tsx'
import type { Challenge } from './challenges.ts'
import { ProposalBand } from './Proposal.tsx'
import type { ReadResult } from './results.ts'
import { material, type Reviewed } from './review.ts'
import { ReviewResult, type Waiting } from './ReviewResult.tsx'
import { glance, readSeen, seenKey, whileAway, writeSeen, changedSince, type Seen, type SeenAt } from './seen.ts'
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
  /** Where a question to Sophia about a task goes: the shared conversation; absent while none is connected. */
  onAsk?: Ask | undefined
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
  /** The goal's progress review (LFE-07.2), read beside the view: one that proposes a change has its card. */
  review?: Reviewed | undefined
  /** Where a challenge to the lead's review goes (LFE-07.2); absent for whoever can't act on the work. */
  onChallenge?: Challenge
}

type LaneView = { key: Exclude<Lane, 'closed'>; label: string; mark: Mark; empty: string }

/** The board's lanes, each with the mark its head wears. */
const LANES: LaneView[] = [
  { key: 'active', label: 'Active', mark: 'working', empty: 'Nothing active' },
  { key: 'next', label: 'Up next', mark: 'later', empty: 'Nothing waiting to start' },
  { key: 'blocked', label: 'Blocked', mark: 'held', empty: 'Nothing blocked' },
  { key: 'unassigned', label: 'Unassigned', mark: 'free', empty: 'Nothing unassigned' },
  { key: 'complete', label: 'Complete', mark: 'complete', empty: 'Nothing complete yet' },
]

/** The lanes' keys in the board's order (closed is not among them). */
const LANE_KEYS = LANES.map((l) => l.key)

const inLane = (rows: readonly PlanRow[], lane: Lane) => rows.filter((r) => laneOf(r, rows) === lane)

/** The lanes the board shows: Blocked only while something is. */
const shownLanes = (rows: readonly PlanRow[]) =>
  LANES.filter((l) => l.key !== 'blocked' || inLane(rows, 'blocked').length > 0)

/** How many tiles a lane shows before it keeps the rest one press away. */
const SHOWN = 5

interface LaneProps extends Omit<TileProps, 'row' | 'index' | 'flags'> {
  lane: LaneView
  rows: PlanRow[]
  /** Every row of the plan: what a blocked lane's rows wait on is among them. */
  all: readonly PlanRow[]
  flags: (row: PlanRow) => TileFlags
}

/** Under the Blocked lane's head: what its rows wait on, each a press that opens the blocker's sheet. */
function LaneWhy({
  rows,
  all,
  plan,
  onOpen,
}: {
  rows: readonly PlanRow[]
  all: readonly PlanRow[]
  plan: WorkPlan
  onOpen: (id: string) => void
}) {
  const blockers = blockersOf(
    rows,
    all,
    plan.items.map((i) => i.id),
  )
  const [every, setEvery] = useState(false)
  if (blockers.length === 0) return null
  // The first few, named; the rest one press away, as a lane keeps its tiles (a plan may have many: Codex on #244).
  const shown = every ? blockers : blockers.slice(0, WHY_SHOWN)
  const kept = blockers.length - WHY_SHOWN
  return (
    <p className="lane-why">
      <span className="lane-why-word">Waiting on</span>
      {shown.map((b) => (
        <button
          key={b.item.id}
          type="button"
          className="text-button"
          data-blocker={b.item.id}
          onClick={() => onOpen(b.item.id)}
        >
          {b.item.purpose}
        </button>
      ))}
      {/* The press stays where it was, said the other way, as the lane's own «Show fewer»: the focus is never dropped
          (Codex on #244). */}
      {kept > 0 && (
        <button
          type="button"
          className="text-button lane-why-more"
          aria-expanded={every}
          onClick={() => setEvery(!every)}
        >
          {every ? 'fewer' : `and ${String(kept)} more`}
        </button>
      )}
    </p>
  )
}

/** How many blockers a lane names before «and N more». */
const WHY_SHOWN = 3

/** What the focus held stands for when it was on «and N more»: no task's id. */
const WHY_MORE = '\u0000why-more'

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
      {lane.key === 'blocked' && <LaneWhy rows={rows} all={tile.all} plan={tile.plan} onOpen={tile.onOpen} />}
      {rows.length === 0 ? (
        <EmptyState slot className="lane-empty">
          {lane.empty}
        </EmptyState>
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
  const id = seenKey(at)
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
 * A decision as it stands now: of all its revisions on the board, the latest, whatever their order. An older one never
 * stands in for it, answered or still open (Codex F-040).
 */
const latestOf = (decisions: readonly BoardDecision[], decisionId: string) =>
  decisions
    .filter((d) => d.decision_id === decisionId)
    .reduce<BoardDecision | undefined>((latest, d) => (latest && latest.revision >= d.revision ? latest : d), undefined)

/** A decision at its revision: a revised one is new to its decider. */
const askedKey = (d: BoardDecision) => JSON.stringify([d.decision_id, d.revision])

/**
 * What waits on someone's decision: a pill in the board's bar, amber and pinging when it is the viewer's, that opens
 * the decisions over the lanes. Its decider's own opens by itself the first time it is seen, at the board's opening or
 * when it arrives later, so nothing of theirs hides; one the viewer closed stays closed (GitHub review on PR #76).
 */
function useDecisions(decisions: readonly BoardDecision[], viewerId: string | null, now: Date) {
  // Each decision at its latest revision, in any state: an older one still proposed is history (Codex F-048).
  const open = latestDecisions(decisions).filter((d) => d.state === 'proposed')
  // Past its expiry, it is read, not answered: it isn't anyone's to act on now, so it calls no one (Codex F-019).
  const active = open.filter((d) => actionable(d, now))
  const mine = active.filter((d) => d.decider_id === viewerId)
  const [state, setState] = useState(() => ({ shown: mine.length > 0, seen: new Set(mine.map(askedKey)) }))
  const arrived = mine.filter((d) => !state.seen.has(askedKey(d)))
  // One of the viewer's not seen before opens them, once, as the page renders it; nothing else reopens them.
  if (arrived.length > 0) setState({ shown: true, seen: new Set([...state.seen, ...arrived.map(askedKey)]) })
  return { open, active, mine, shown: state.shown, toggle: () => setState((s) => ({ ...s, shown: !s.shown })) }
}

interface PillProps {
  viewerId: string | null
  /** The decisions still answerable. */
  count: number
  /** The proposals past their expiry, read and not answered. */
  expired: number
  mine: number
  shown: boolean
  onToggle: () => void
  people: Record<string, Person>
  deciders: string[]
}

/** How many, in words: "1 decision", "2 decisions". */
const decisionsSaid = (n: number) => `${String(n)} ${n === 1 ? 'decision' : 'decisions'}`

/**
 * The pill: the decisions still answerable, and whose they are; past their expiry, they call no one, so with none
 * answerable it only says how many expired, still opening them to be read (Codex F-019).
 */
function DecisionPill({ viewerId, count, expired, mine, shown, onToggle, people, deciders }: PillProps) {
  if (count === 0 && expired === 0) return null
  const named = (id: string) => (id === viewerId ? 'you' : (people[id]?.name ?? 'someone'))
  const who = mine > 0 ? 'you' : [...new Set(deciders.map(named))].join(' and ')
  const said = count > 0 ? `${decisionsSaid(count)} for ${who}` : `${decisionsSaid(expired)} expired`
  return (
    <button
      type="button"
      className="decision-pill"
      data-mine={mine > 0 || undefined}
      aria-expanded={shown}
      onClick={onToggle}
    >
      <span className="decision-pill-dot" aria-hidden />
      {said}
      <Icon name="chevron" size={12} />
    </button>
  )
}

/** The goal's plans held here: the one in force, then its proposals. */
const plansOf = (goal: GoalView) => [goal.current_plan, ...goal.proposed_plans].filter((p) => p !== null)

/**
 * What a decision is about, in words: its task as the plan it is bound to names it (that plan's id and revision, among
 * the goal's plan in force and its proposals), and the candidate it names. Bound to a plan held nowhere here (an older
 * or unknown revision), it borrows no other plan's words for its task: it says which plan it is bound to (Codex F-029).
 */
const aboutOf = (d: BoardDecision, plans: readonly WorkPlan[]) => {
  const bound = plans.find((p) => p.plan_id === d.plan_id && p.revision === d.plan_revision)
  const purpose = bound?.items.find((i) => i.id === d.work_id)?.purpose
  const what = purpose ?? `${d.work_id}, in plan r${String(d.plan_revision)}, not shown here`
  return `About ${what}${d.candidate_version_ref ? ` · ${d.candidate_version_ref}` : ''}`
}

interface DecisionsProps {
  decisions: readonly BoardDecision[]
  plan: WorkPlan
  /** The goal's plans held here, in force and proposed: a decision's task is named from the one it is bound to. */
  plans: readonly WorkPlan[]
  people: Record<string, Person>
  now: Date
  viewerId: string | null
  onDecide?: Decide | undefined
  className?: string
  /** Opened on one (from a review that waits on it): the focus goes to its first choice. */
  focus?: string | null
  /** Each ask for the focus, counted: the same decision asked for again (a new revision of it) takes it again. */
  focusSeq?: number
}

function Decisions({
  decisions,
  plan: _plan,
  plans,
  className = 'board-decisions',
  focus = null,
  focusSeq = 0,
  ...rest
}: DecisionsProps) {
  const list = useRef<HTMLDivElement>(null)
  // Opened on one (from a review that waits on it), the focus goes to its first choice. Found by comparing ids, never
  // by putting one in a selector: a decision's id is any string.
  useEffect(() => {
    const asked = [...(list.current?.querySelectorAll<HTMLElement>('[data-decision]') ?? [])].find(
      (d) => d.dataset.decision === focus,
    )
    asked?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
  }, [focus, focusSeq])
  if (decisions.length === 0) return null
  return (
    <div ref={list} className={className}>
      {decisions.map((d) => (
        <Decision key={askedKey(d)} decision={d} about={aboutOf(d, plans)} {...rest} />
      ))}
    </div>
  )
}

interface SlotOf {
  decisions: readonly BoardDecision[]
  /** The goal's review, read beside the view; only one that proposes a change has a card. */
  reviewed: Reviewed | undefined
  viewerId: string | null
  now: Date
  /** Whether a decision can be answered on this board now (its plan is in force). */
  answerable: boolean
  decider: (id: string) => string
}

/**
 * The decision asked to take the focus, with a count: asked again for the same id (its next revision, from the next-up
 * line), the focus moves again (Codex on #263).
 */
function useFocusAsk() {
  const [ask, setAsk] = useState<{ id: string | null; n: number }>({ id: null, n: 0 })
  const setFocus = useCallback((id: string | null) => setAsk((was) => ({ id, n: was.n + 1 })), [])
  return { focus: ask.id, focusSeq: ask.n, setFocus }
}

/** The slot under the bar: the decisions, or the lead's review that proposes a change; one at a time. */
function useSlot({ decisions, reviewed, viewerId, now, answerable, decider }: SlotOf) {
  const asks = useDecisions(decisions, viewerId, now)
  // The review opened, by its id: another review, a later one, comes closed.
  const [openId, setOpenId] = useState<string | null>(null)
  const { focus, focusSeq, setFocus } = useFocusAsk()
  const pill = useRef<HTMLButtonElement>(null)
  const review = material(reviewed?.last_review) ? reviewed.last_review : null
  // Its revision is the one the review is read with (null: no plan in force), so the card and the goal's line say the
  // same of it.
  const revision = reviewed?.revision ?? null
  // The decisions shown take the slot: a decision of the viewer's arriving while the card is open takes its place.
  const decisionsShown = asks.shown && asks.open.length > 0
  const reviewShown = review !== null && openId === review.review_id && !decisionsShown
  // A decision named in the address (`#decision-`, from Home's «needs you»): the slot opens on it and names it for the
  // focus (Decisions gives it to the first choice of that decision, in this board's own list), once per address (the
  // sequence is kept: replaceState fires no hashchange), then the address lets it go (Codex on #245).
  const named = useAddressed(DECISION)
  const handled = useRef(-1)
  useEffect(() => {
    if (handled.current === named.seq || !named.id || !asks.open.some((d) => d.decision_id === named.id)) return
    handled.current = named.seq
    setOpenId(null)
    setFocus(named.id)
    if (!asks.shown) asks.toggle()
    showInAddress(null, DECISION)
  }, [named, asks, setFocus])
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
    revision,
    pill,
    reviewShown,
    focus,
    focusSeq,
    // Opening one closes the other, so the slot holds one at a time.
    decisionsShown,
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
     * What a proposal's decision waits on: the viewer's answer (only where a decision can be sent), its decider's, or
     * nothing: it expired (by its date, or marked so). A decision already answered or replaced waits on no one.
     */
    waitsOn: (decisionId: string): Waiting | null => {
      const d = latestOf(decisions, decisionId)
      if (!d || (d.state !== 'proposed' && d.state !== 'expired')) return null
      if (!actionable(d, now)) return { on: 'expired' }
      return d.decider_id === viewerId && answerable ? { on: 'you' } : { on: 'them', name: decider(d.decider_id) }
    },
  }
}

/** A review that proposes a change, waiting in the bar: its pill opens its card. */
function ReviewPill({ slot, onPress }: { slot: ReturnType<typeof useSlot>; onPress: () => void }) {
  if (!slot.review) return null
  return (
    <button
      ref={slot.pill}
      type="button"
      className="decision-pill review-pill"
      aria-expanded={slot.reviewShown}
      onClick={() => {
        // The next-up line goes too, as with the decisions' pill: it would else speak of the review now open (Codex on
        // #263).
        onPress()
        slot.toggleReview()
      }}
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
  // J and K in the sheet follow the board's order, lane by lane, then closed work.
  const order = [...LANES.flatMap((l) => inLane(rows, l.key)), ...inLane(rows, 'closed')]
  const step = (by: 1 | -1) => {
    const at = order.findIndex((r) => r.item.id === open)
    const next = order[(at + by + order.length) % order.length]
    if (next) setOpen(next.item.id)
  }
  return { lit, setLit, open, setOpen, lens, setLens, waited, flags, step }
}

/**
 * A tile with the focus that moves lanes (its blocker complete, in a live update) is mounted anew in the other lane:
 * the focus follows it there, by its task, instead of falling to the page (Codex on #236). A focus moved elsewhere, or
 * a tile left on purpose, is not followed.
 */
function useTileFocus(rows: readonly PlanRow[]) {
  const held = useRef<string | null>(null)
  useEffect(() => {
    const into = (e: FocusEvent) => {
      const at = e.target instanceof Element ? e.target : null
      // A blocker's press stands for its task: gone with the Blocked lane (the blocker done), the focus goes to the
      // blocker's own tile (Codex on #244).
      const why = at?.closest<HTMLElement>('.board [data-blocker]')
      const tile = at?.closest<HTMLElement>('.board [data-task]')
      // «and N more» stands for the line: gone with it shortened (or the lane), the focus goes to the line's last
      // press, else the lane's first tile, never the page (Codex on #244).
      const more = at?.closest('.board .lane-why-more') ? WHY_MORE : null
      held.current = more ?? why?.dataset['blocker'] ?? tile?.dataset['task'] ?? null
    }
    // Left on purpose (the tile still there once the moment passes): not followed. Removed with the focus in it (the
    // browser blurs it while still connected, then removes it): followed. Read after the commit that removes it.
    const out = (e: FocusEvent) => {
      const left = e.target
      if (!(left instanceof Element) || e.relatedTarget) return
      queueMicrotask(() => {
        if (left.isConnected && document.activeElement === document.body) held.current = null
      })
    }
    document.addEventListener('focusin', into)
    document.addEventListener('focusout', out)
    return () => {
      document.removeEventListener('focusin', into)
      document.removeEventListener('focusout', out)
    }
  }, [])
  useLayoutEffect(() => {
    const id = held.current
    if (id === null || document.activeElement !== document.body) return
    if (id === WHY_MORE) {
      const last = [...document.querySelectorAll<HTMLElement>('.board .lane-why [data-blocker]')].at(-1)
      ;(last ?? document.querySelector<HTMLElement>('.board [data-task]'))?.focus({ preventScroll: true })
      return
    }
    const tile = [...document.querySelectorAll<HTMLElement>('.board [data-task]')].find(
      (el) => el.dataset['task'] === id,
    )
    if (tile) {
      tile.focus({ preventScroll: true })
      return
    }
    // Moved into a lane past the tiles it shows (five, the rest one press away): the focus goes to that press, so the
    // keyboard can reveal it; never to the page (Codex on #236).
    const row = rows.find((r) => r.item.id === id)
    const lane = row ? document.querySelector(`.board .lane[data-lane="${laneOf(row, rows)}"]`) : null
    lane?.querySelector<HTMLElement>('.lane-more')?.focus({ preventScroll: true })
  }, [rows])
}

/** The lanes side by side (four; five while something is blocked), moved through by the arrows, with the threads drawn over them. */
function Lanes({
  rows,
  board,
  tile,
}: {
  rows: PlanRow[]
  board: ReturnType<typeof useBoard>
  tile: Omit<LaneProps, 'lane' | 'rows' | 'all'>
}) {
  const lanes = useRef<HTMLDivElement>(null)
  const shown = shownLanes(rows)
  useTileFocus(rows)
  return (
    <div
      ref={lanes}
      className="board-lanes"
      style={{ '--lanes': shown.length }}
      data-lanes={shown.length}
      data-threading={board.waited.length > 0 || undefined}
      onKeyDown={(e) => {
        if (lanes.current && moveOnBoard(lanes.current, e.key)) e.preventDefault()
      }}
    >
      {shown.map((lane) => (
        <LaneSection key={lane.key} lane={lane} rows={inLane(rows, lane.key)} {...tile} all={rows} />
      ))}
      <Threads box={lanes} to={board.lit} from={board.waited} lanes={shown.length} />
    </div>
  )
}

/** What the board couldn't read or doesn't hold together, said plainly over it. */
function Notices({ board, coverage, operable }: { board: Board; coverage: Props['coverage']; operable: boolean }) {
  const notes = [
    coverage === 'partial' && 'Not everything about this plan could be read: some of its state may be missing.',
    coverage === 'unavailable' &&
      'Its live state can’t be read now. What shows is its last read, and may be stale, so nothing is sent from it until it can be read again.',
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

interface SlotProps {
  slot: ReturnType<typeof useSlot>
  rows: readonly PlanRow[]
  onOpenTask: (id: string) => void
  decisions: Omit<DecisionsProps, 'decisions'>
  /** Where a challenge to the review goes; absent, there is no Challenge. */
  onChallenge: Challenge | undefined
}

/** Under the bar, one at a time: the decisions, or the lead's review that proposes a change. */
function Slot({ slot, rows, onOpenTask, decisions, onChallenge }: SlotProps) {
  if (slot.decisionsShown)
    return <Decisions decisions={slot.asks.open} focus={slot.focus} focusSeq={slot.focusSeq} {...decisions} />
  if (!slot.reviewShown || !slot.review) return null
  return (
    <ReviewResult
      review={slot.review}
      plan={{ revision: slot.revision }}
      rows={rows}
      now={decisions.now}
      onOpenTask={onOpenTask}
      waitsOn={slot.waitsOn}
      onOpenDecisions={slot.openDecisions}
      onClose={slot.closeReview}
      viewerId={decisions.viewerId}
      onChallenge={onChallenge}
    />
  )
}

/** What an observed item is doing, in a few words: "running", "ready for review". */
const lifeSaid = (v: ItemView) => v.lifecycle.replaceAll('_', ' ')

/**
 * Work observed for the goal that the plan in force doesn't hold, said rather than hidden: who has it and where it
 * stands, by its work id (the view says no more of it). The goal's own Hold and Stop still reach all of its work.
 */
function OutsideWork({ outside }: { outside: readonly Outside[] }) {
  if (outside.length === 0) return null
  return (
    <section className="board-outside" aria-label="Observed outside the plan">
      <h4 className="field-label">Observed outside the plan</h4>
      <ul className="task-links">
        {outside.map(({ work_id, view }) => (
          // Each work id once; observed more than once, it is said so, with neither observation (Codex F-045).
          <li key={work_id} className="task-link" data-work={work_id} data-ambiguous={view ? undefined : true}>
            <span className="task-link-name">
              {view ? (view.assignment?.executor.display_name ?? 'No one assigned') : 'Observed more than once'} ·{' '}
              {work_id}
            </span>
            <span className="task-link-where">{view ? lifeSaid(view) : 'which is current isn’t known'}</span>
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
    // No plan in force or proposed, and yet work is observed: said, never a goal that looks empty. Each work id once,
    // one observed more than once said so, as on a board (Codex F-045).
    const outside = outsideOf(goal, null)
    if (outside.length === 0) return null
    return (
      <section className="board" aria-label="No plan in force">
        <p className="board-notice" role="note">
          This goal has no plan in force, but {String(outside.length)} of its tasks are observed.
        </p>
        {outside.some((o) => !o.view) && (
          <p className="board-notice" role="note">
            A task is observed twice: which of its observations is current isn’t known.
          </p>
        )}
        <OutsideWork outside={outside} />
      </section>
    )
  }
  // Another viewer, or another project, starts afresh: nothing typed, sent or asked here carries over. Another goal, or
  // another plan shown for it (a distinct plan id), starts its view afresh too: lens, folds and slot (Codex F-018). A
  // new revision of the same plan is a live update, and keeps them. Commands and questions live outside, kept.
  // Each field whole, so ids holding the separator can't meet (Codex F-034).
  const at = JSON.stringify([projectId, viewerId, goal.goal_id, board.plan.plan_id])
  return <BoardBody key={at} {...props} goal={goal} board={board} />
}

interface BodyProps extends Props {
  goal: GoalView
  board: Board
}

/**
 * After the viewer's answer, what waits on them next on this board (docs/plans/next-up.md): the decisions answered in
 * this visit, the line shown until used, the decisions' pill pressed, or (nothing next) the focus gone.
 */
function useNextUp(
  rows: readonly PlanRow[],
  viewerId: string | null,
  slot: ReturnType<typeof useSlot>,
  onOpenTask: (id: string) => void,
  onDecide: Decide | undefined,
) {
  const [recorded, setRecorded] = useState<readonly string[]>([])
  const [shown, setShown] = useState(false)
  // The choice the answer behind the line went from: the one Next up may take the focus from (Codex on #277).
  const [from, setFrom] = useState<Element | null>(null)
  const review = slot.review !== null && !slot.reviewShown
  const waiting = waitingFor(rows, viewerId, (r) => laneOf(r, rows), LANE_KEYS)
  // Followed, not read once: an answer settling as retryable with the decisions closed re-renders the board, so Next up
  // and «For you» offer it again (Codex on #277).
  const keyOf = (d: { decision_id: string; revision: number }) => answerKey(d.decision_id, d.revision, viewerId)
  const states = useAnswerStates(slot.asks.mine.map(keyOf))
  const answered = answeredHere(slot.asks.mine, recorded, (d) => states.get(keyOf(d)) || null)
  const next = shown ? nextUp({ answered, decisions: slot.asks.mine, waiting, review }) : null
  // The same, offered to the palette as «For you» (docs/plans/palette-knows.md). A decision only where the board can
  // take an answer: a read-only proposal or an unavailable board offers none (Codex on #264).
  useCommands([
    // Those answered in this visit are not offered again while the board's next read catches up (Codex on #264).
    ...(onDecide ? slot.asks.mine : [])
      .filter((d) => !answered.includes(answeredKey(d.decision_id, d.revision)))
      .map((d) => ({
        id: `you-decide-${d.decision_id}`,
        words: `Decide “${quoted(d.question)}”`,
        group: 'you' as const,
        run: () => slot.openDecisions(d.decision_id),
      })),
    ...waiting.map((t) => ({
      id: `you-task-${t.id}`,
      words: `“${quoted(t.name)}” waits for you`,
      group: 'you' as const,
      run: () => onOpenTask(t.id),
    })),
  ])
  // The line moves on once the answer is recorded: conflict, denied, expired or unknown keep the decision the one to
  // answer, and the line says nothing yet (Codex on #263).
  const decide =
    onDecide &&
    (async (answer: DecisionAnswer) => {
      // A line already up names what this answer may be answering: it goes as the send starts, and the line for what
      // is next comes only once this one is recorded (Codex P2 on #263).
      setShown(false)
      // Each answer keeps the choice it went from, so two in flight never hand each other's choice to the line.
      const { said, went } = await sentFrom(onDecide, () => document.activeElement)(answer)
      if (said === 'recorded') {
        setRecorded((was) => [...was, answeredKey(answer.decision_id, answer.revision)])
        setFrom(went)
        setShown(true)
      }
      return said
    })
  const close = () => setShown(false)
  const go = () => {
    close()
    if (next?.kind === 'decision' && next.id) slot.openDecisions(next.id)
    else if (next?.kind === 'task' && next.id) onOpenTask(next.id)
    else if (next?.kind === 'review') slot.toggleReview()
  }
  return { next, decide, close, go, from }
}

interface BarProps {
  view: ReturnType<typeof useBoard>
  rows: readonly PlanRow[]
  /** The plan shown: its revision names an export. */
  plan: WorkPlan
  viewerId: string | null
  slot: ReturnType<typeof useSlot>
  people: Record<string, Person>
  away: ReturnType<typeof whileAway>
  onSeen: () => void
  /** The decisions' pill pressed: the line under the bar goes too. */
  onPill: () => void
}

/**
 * The board's bar: the lenses, what waits on a decision, a review that proposes a change, and what changed while the
 * viewer was away.
 */
function Bar({ view, rows, plan, viewerId, slot, people, away, onSeen, onPill }: BarProps) {
  const { asks } = slot
  return (
    <div className="board-bar">
      <Lens lens={view.lens} rows={rows} viewerId={viewerId} onChange={view.setLens} />
      <DecisionPill
        viewerId={viewerId}
        count={asks.active.length}
        expired={asks.open.length - asks.active.length}
        mine={asks.mine.length}
        shown={slot.decisionsShown}
        onToggle={() => {
          onPill()
          slot.toggleDecisions()
        }}
        people={people}
        deciders={asks.active.map((d) => d.decider_id)}
      />
      <ReviewPill slot={slot} onPress={onPill} />
      <AwayLine away={away} onSeen={onSeen} className="board-return" />
      <ExportMenu rows={rows} revision={plan.revision} />
    </div>
  )
}

/** The board's tasks as an export reads them (board-export.md): lane by lane in the board's order, then closed. */
const exportRows = (rows: readonly PlanRow[]): ExportRow[] =>
  [...LANES, { key: 'closed' as const, label: 'Closed' }].flatMap((lane) =>
    inLane(rows, lane.key).map((r) => ({
      lane: lane.label,
      task: r.item.purpose,
      who: r.doer.name,
      status: r.status.text,
    })),
  )

/** «Export»: the board as CSV or Markdown, saved by the plan's revision and the day (board-export.md). */
function ExportMenu({ rows, revision }: { rows: readonly PlanRow[]; revision: number }) {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  const save = (kind: 'csv' | 'md') => () => {
    menu.opener.current?.focus()
    setOpen(false)
    const now = new Date()
    const text = kind === 'csv' ? boardCsv(exportRows(rows)) : boardMarkdown(exportRows(rows), revision, now)
    saveBlob(
      new Blob([text], { type: kind === 'csv' ? 'text/csv' : 'text/markdown' }),
      boardFileName(revision, now, kind),
    )
  }
  return (
    <div ref={menu.wrap} className="board-export">
      <button
        ref={menu.opener}
        type="button"
        className="pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Export
      </button>
      {open && (
        <Menu popover={menu} label="Export" side="bottom" align="end">
          <MenuItem onClick={save('csv')}>Download CSV</MenuItem>
          <MenuItem onClick={save('md')}>Download Markdown</MenuItem>
        </Menu>
      )}
    </div>
  )
}

/** A choice already made, while the plan takes it in. */
/**
 * A choice made for the plan shown, while it takes it in. Another plan's choice is never said as this plan updating:
 * it is listed with its own plan's revision, apart (Folded; Codex F-015).
 */
const decidedOf = (decisions: readonly BoardDecision[], plan: WorkPlan) =>
  decisions.filter(
    (d) =>
      d.state === 'accepted' && (d.plan_reaction === 'pending' || d.plan_reaction === 'unknown') && decidedFor(d, plan),
  )

/** The plan shown's own choices made, while it takes them in, over its board. */
const Updating = ({ decisions, ...props }: DecisionsProps) => (
  <Decisions decisions={decidedOf(decisions, props.plan)} className="board-decisions board-decided" {...props} />
)

/**
 * Where this board sends, now: commands, choices, challenges and questions go only from a plan in force whose live
 * state can be read. From a read that may be stale (coverage unavailable) nothing goes, as from a plan only proposed:
 * what shows stays, results still open, and what was sent stays said, its receipts and replies still landing. A
 * partial read still sends: what it holds was read now (Codex F-022).
 */
function portsOf(props: BodyProps, operable: boolean) {
  const live = operable && props.coverage !== 'unavailable'
  return {
    onCommand: live ? props.onCommand : undefined,
    onDecide: live ? props.onDecide : undefined,
    onChallenge: live ? props.onChallenge : undefined,
    onAsk: live ? props.onAsk : undefined,
    closed: props.coverage === 'unavailable' ? NOT_READ : NOT_CONNECTED,
  }
}

function BoardBody(props: BodyProps) {
  const { goal, board, people, now, viewerId = null } = props
  const { plan, rows, operable } = board
  const ports = portsOf(props, operable)
  const at = { project: props.projectId, goal: goal.goal_id, plan: plan.plan_id, viewer: viewerId }
  // Commands, drafts and questions outlive this board (another goal chosen, a search, Resources and back): kept per
  // project and viewer, in the space Resources shares (command-store.ts).
  const space = commandSpace(props.projectId, viewerId)
  const { seen, markSeen } = useSeen(at, rows, goal.decisions)
  const view = useBoard(rows, viewerId, changedSince(rows, seen))
  const slot = useSlot({
    decisions: goal.decisions,
    reviewed: props.review,
    viewerId,
    now,
    answerable: !!ports.onDecide,
    decider: (id) => people[id]?.name ?? 'someone',
  })
  const acts = useActs(ports.onCommand, props.projectId, space)
  const questions = useAsks(ports.onAsk, space, ports.closed)
  const opened = rows.find((r) => r.item.id === view.open)
  const shortOf = (row: PlanRow) => accountOf(row, props).tile
  const tile = { plan, viewerId, now, onLight: view.setLit, onOpen: view.setOpen, flags: view.flags, shortOf }
  const after = useNextUp(rows, viewerId, slot, view.setOpen, ports.onDecide)
  const decisionProps = { plan, plans: plansOf(goal), people, now, viewerId, onDecide: after.decide }
  const away = whileAway(rows, goal.decisions, seen, { viewerId, people, now })
  const bar = { view, rows, plan, viewerId, slot, people, away, onSeen: markSeen, onPill: after.close }
  return (
    <section className="board" aria-label={`Plan r${String(plan.revision)}`} data-lens={view.lens}>
      <Bar {...bar} />
      {after.next && <NextUp next={after.next} from={after.from} onGo={after.go} onDone={after.close} />}
      <Notices board={board} coverage={props.coverage} operable={operable} />
      <ProposalBand current={plan} proposals={proposed(goal).filter((p) => p !== plan)} operable={operable} />
      <Updating decisions={goal.decisions} {...decisionProps} />
      <Slot
        slot={slot}
        rows={rows}
        onOpenTask={view.setOpen}
        decisions={decisionProps}
        onChallenge={ports.onChallenge}
      />
      <Lanes rows={rows} board={view} tile={tile} />
      <ClosedWork rows={inLane(rows, 'closed')} onOpen={view.setOpen} />
      <OutsideWork outside={board.outside} />
      <Folded plan={plan} decisions={goal.decisions} people={people} />
      {opened && (
        <TaskSheet
          {...props}
          {...{ row: opened, rows, plan, operable, viewerId, acts, asks: questions, account: accountOf(opened, props) }}
          next={goal.next_checkpoint}
          onOpen={view.setOpen}
          onStep={view.step}
          onClose={() => view.setOpen(null)}
        />
      )}
    </section>
  )
}
