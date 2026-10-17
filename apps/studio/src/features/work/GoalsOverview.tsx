// Goals as a briefing (docs/plans/goals-overview.md): one sentence on what waits on the viewer, then each of those as a
// sentence with its press to Tasks, then the goals by health in one list. A row is one press: it opens the goal's
// sheet. Done goals fold to one line; past six goals, a search. One accent, amber, only where something waits. Each
// goal's latest note is read from the project's ledger (goal-notes.md).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ArtifactVersion, Goal, GoalTarget } from '@sophia/contracts'
import { Button, EmptyState, Search } from '@sophia/ui'
import { useCommands } from '../../app/useCommands.ts'
import { DECISION, GOAL, showInAddress, TASK } from '../resources/link.ts'
import { useAddressed } from '../resources/useAddressed.ts'
import type { GoalPlan } from './GoalList.tsx'
import { useLedger, type NotesFor } from './GoalNotes.tsx'
import { notesRead, withNotes } from './goal-notes.ts'
import { Asks, Faces, Meter, type Asked } from './GoalParts.tsx'
import { GoalSheet } from './GoalSheet.tsx'
import { targetLine, useGoalTargets, useMembers } from './GoalTargets.tsx'
import { todayOf } from './goal-due.ts'
import { useNow } from '../../app/use-now.ts'
import {
  briefOf,
  canOpenInTasks,
  goalsShown,
  HEALTH_LABEL,
  healthLine,
  healthOf,
  MANY,
  ordered,
  rowLine,
  withDue,
  type Glanced,
} from './goals-glance.ts'
import type { Ask } from './planning/plan.ts'

type Plans = Readonly<Record<string, Glanced>> | undefined

interface Props {
  goals: readonly Goal[]
  plans: Readonly<Record<string, GoalPlan>> | undefined
  /** Where the notes are read and written, and how their authors are named. */
  notes: NotesFor
  /** Tasks, with the goal, or a task or decision of it, named in the address; undefined where Tasks can't take it. */
  onOpenGoal: ((id: string, address?: string) => void) | undefined
  /** A goal's reports, from the snapshot (goal-reports.md). */
  reports?: (goalId: string) => readonly ArtifactVersion[]
}

/**
 * One goal: its title (the press that opens its sheet), its health and what matters now, its owner and date
 * (goal-owner-date.md), its progress, its people.
 */
function GoalRow(props: {
  goal: Goal
  plan: Glanced | undefined
  target: ReturnType<typeof targetLine>
  onOpen: () => void
}) {
  const { goal, plan, target, onOpen } = props
  const health = healthOf(goal, plan)
  const line = rowLine(goal, plan)
  return (
    <li className="goal" data-health={health} data-status={goal.status}>
      <div className="goal-row-words">
        <h3 className="goal-title">
          <button type="button" className="goal-press" onClick={onOpen}>
            {goal.title}
          </button>
        </h3>
        <p className="goal-row-line">
          {/* Paused: its state says which pause («Held · 2 of 6 done»); otherwise the health word leads. */}
          <span className="goal-health">{health === 'paused' ? line : HEALTH_LABEL[health]}</span>
          {health !== 'paused' && line && ` · ${line}`}
        </p>
        {target && (
          <p className="goal-row-target" data-due={target.due ?? undefined}>
            {target.text}
          </p>
        )}
      </div>
      <Meter glance={plan?.glance} />
      <Faces glance={plan?.glance} />
    </li>
  )
}

/** ↑ ↓, Home and End along the rows' presses. */
function moveAlong(event: KeyboardEvent<HTMLUListElement>) {
  const presses = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.goal-press')]
  const at = presses.findIndex((p) => p === document.activeElement)
  const step: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: presses.length - 1 }
  const next = step[event.key]
  if (at < 0 || next === undefined) return
  event.preventDefault()
  presses[Math.min(presses.length - 1, Math.max(0, next))]?.focus()
}

/** Past six goals: the search, focused with "/"; Escape clears it, then leaves it. */
function SearchGoals({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  useCommands([
    {
      id: 'search-goals',
      words: 'Search the goals',
      group: 'view',
      key: '/',
      also: ['find'],
      run: () => input.current?.focus(),
    },
  ])
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return
    if (query) onQuery('')
    else input.current?.blur()
  }
  return (
    <Search
      ref={input}
      className="goals-search"
      aria-label="Search goals"
      aria-keyshortcuts="/"
      placeholder="Search goals and tasks…"
      value={query}
      onChange={(e) => onQuery(e.target.value)}
      onKeyDown={onKeyDown}
      tip={{ label: 'Search', keys: '/', side: 'bottom' }}
    />
  )
}

/** Done goals, folded to one line that opens. */
function DoneFold({ done, onOpen }: { done: readonly Goal[]; onOpen: () => void }) {
  if (done.length === 0) return null
  return (
    <Button kind="text" className="goals-done-fold" aria-expanded={false} onClick={onOpen}>
      {done.length} done · {done.map((g) => g.title).join(' · ')}
    </Button>
  )
}

function NoAnswer({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      actions={
        <Button kind="pill" onClick={onClear}>
          Clear the search
        </Button>
      }
    >
      No goal answers “{query}”.
    </EmptyState>
  )
}

/** Everything that waits on the viewer, goal by goal. */
const asksIn = (goals: readonly Goal[], plans: Plans): Asked[] =>
  goals.flatMap((goal) => (plans?.[goal.id]?.asks ?? []).map((ask) => ({ ask, goal })))

/** A request opens its task in Tasks; a decision, the decision. */
const askOpener = (onOpenGoal: Props['onOpenGoal']) =>
  onOpenGoal ? (ask: Ask) => onOpenGoal(ask.target, ask.kind === 'request' ? TASK : DECISION) : undefined

/** The goals shown, by health: past six, as the search keeps them; done ones folded until opened or searched. */
function useListed(goals: readonly Goal[], plans: Plans) {
  const [query, setQuery] = useState('')
  const [unfolded, setUnfolded] = useState(false)
  const many = goals.length > MANY
  const shown = ordered(goalsShown(goals, plans, many ? query : ''), plans)
  const all = unfolded || (many && query.trim() !== '')
  const listed = all ? shown : shown.filter((g) => g.status !== 'completed')
  const folded = shown.filter((g) => !listed.includes(g))
  return { many, query, setQuery, shown, listed, folded, unfold: () => setUnfolded(true) }
}

/**
 * The goal whose sheet is open: pressed in the list, or named in the address (`#goal-`, from the project's search;
 * search-goals.md). Closing it lets the address go, so it doesn't open again.
 */
function useOpenGoal(goals: readonly Goal[]): [string | null, (id: string | null) => void] {
  const [open, setOpen] = useState<string | null>(null)
  const named = useAddressed(GOAL)
  const known = named.id !== null && goals.some((g) => g.id === named.id) ? named.id : null
  useEffect(() => {
    if (known) setOpen(known)
  }, [known, named.seq])
  const set = (id: string | null) => {
    if (id === null && known) showInAddress(null, GOAL)
    setOpen(id)
  }
  return [open, set]
}

/** «Mine» (goal-overdue.md): whether only the viewer's own goals are listed, offered while one of the open goals is. */
function useMine(goals: readonly Goal[], targets: ReadonlyMap<string, GoalTarget>, me: string) {
  const [on, setOn] = useState(false)
  const owned = (g: Goal) => targets.get(g.id)?.ownerId === me
  const offered = goals.some((g) => g.status !== 'completed' && owned(g))
  return { offered, on: on && offered, toggle: () => setOn(!on), keeps: (g: Goal) => !(on && offered) || owned(g) }
}

function MineSwitch({ mine }: { mine: ReturnType<typeof useMine> }) {
  if (!mine.offered) return null
  return (
    <button type="button" className="ghost goals-mine" aria-pressed={mine.on} onClick={mine.toggle}>
      Mine
    </button>
  )
}

/** The notes unread: a difficulty may be missing from the health, said with the way to read them again. */
function NotesFailed({ ledger }: { ledger: ReturnType<typeof useLedger> }) {
  if (notesRead(ledger) !== 'failed') return null
  return (
    <p className="goals-notes-failed" role="alert">
      The notes can’t be read right now, so a difficulty may be missing.{' '}
      <button type="button" className="text-button" onClick={() => void ledger.refetch()}>
        Try again
      </button>
    </p>
  )
}

/** The viewer's own goals past their date, for the brief (goal-overdue-health.md). */
const lateMine = (goals: readonly Goal[], plans: Plans, targets: ReadonlyMap<string, GoalTarget>, me: string) =>
  goals.filter((g) => plans?.[g.id]?.overdue && targets.get(g.id)?.ownerId === me).length

export function GoalsOverview({ goals, plans: served, notes, onOpenGoal, reports }: Props) {
  const ledger = useLedger(notes)
  const [targets, members] = [useGoalTargets(notes), useMembers(notes)]
  const today = todayOf(new Date(useNow(60 * 60_000)))
  const noted = withNotes(goals, served, ledger.data?.entries ?? [], notes.me, notes.names)
  const plans: Plans = withDue(goals, noted, targets, today)
  const { many, query, setQuery, shown, listed, folded, unfold } = useListed(goals, plans)
  const [open, setOpen] = useOpenGoal(goals)
  const asks = asksIn(goals, plans)
  const openAsk = askOpener(onOpenGoal)
  const opened = goals.find((g) => g.id === open)
  const health = healthLine(goals, plans)
  const mine = useMine(goals, targets, notes.me)
  return (
    <div className="goals-briefing">
      <p className="goals-brief">
        <span className="goals-brief-you">{briefOf(asks.length, lateMine(goals, plans, targets, notes.me))}</span>
        {health && ` ${health}`}
        {/* Until the notes are read a difficulty may be missing from the health: said (notes-robust.md). */}
        {notesRead(ledger) === 'reading' && ' · Reading the notes…'}
      </p>
      <NotesFailed ledger={ledger} />
      <Asks asks={asks} onOpen={openAsk} />
      <div className="goals-list-head">
        <h3 className="field-label">Goals</h3>
        <MineSwitch mine={mine} />
        {many && <SearchGoals query={query} onQuery={setQuery} />}
      </div>
      {shown.length === 0 && <NoAnswer query={query} onClear={() => setQuery('')} />}
      <ul className="goal-rows" onKeyDown={moveAlong}>
        {listed.filter(mine.keeps).map((g) => (
          <GoalRow
            key={g.id}
            goal={g}
            plan={plans[g.id]}
            target={targetLine(targets.get(g.id), members, { me: notes.me, today, done: g.status === 'completed' })}
            onOpen={() => setOpen(g.id)}
          />
        ))}
      </ul>
      <DoneFold done={folded} onOpen={unfold} />
      {opened && (
        <GoalSheet
          goal={opened}
          plan={plans[opened.id]}
          onClose={() => setOpen(null)}
          onOpenAsk={openAsk}
          notes={notes}
          reports={reports?.(opened.id) ?? []}
          onOpenTasks={canOpenInTasks(plans[opened.id]) && onOpenGoal ? () => onOpenGoal(opened.id) : undefined}
        />
      )}
    </div>
  )
}
