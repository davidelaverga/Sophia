// Goals as a briefing (docs/plans/goals-overview.md): one sentence on what waits on the viewer, then each of those as a
// sentence with its press to Tasks, then the goals by health in one list. A row is one press: it opens the goal's
// sheet. Done goals fold to one line; past six goals, a search. One accent, amber, only where something waits. Each
// goal's latest note is read from the project's ledger (goal-notes.md).
import { useRef, useState, type KeyboardEvent } from 'react'
import type { Goal } from '@sophia/contracts'
import { Button, EmptyState, Search } from '@sophia/ui'
import { useCommands } from '../../app/useCommands.ts'
import { DECISION, TASK } from '../resources/link.ts'
import type { GoalPlan } from './GoalList.tsx'
import { useLedger, type NotesFor } from './GoalNotes.tsx'
import { withNotes } from './goal-notes.ts'
import { Asks, Faces, Meter, type Asked } from './GoalParts.tsx'
import { GoalSheet } from './GoalSheet.tsx'
import {
  briefOf,
  goalsShown,
  HEALTH_LABEL,
  healthLine,
  healthOf,
  MANY,
  ordered,
  rowLine,
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
}

/** One goal: its title (the press that opens its sheet), its health and what matters now, its progress, its people. */
function GoalRow({ goal, plan, onOpen }: { goal: Goal; plan: Glanced | undefined; onOpen: () => void }) {
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
    { id: 'search-goals', words: 'Search the goals', group: 'view', key: '/', run: () => input.current?.focus() },
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

export function GoalsOverview({ goals, plans: served, notes, onOpenGoal }: Props) {
  const ledger = useLedger(notes)
  const plans: Plans = withNotes(goals, served, ledger.data?.entries ?? [], notes.me, notes.names)
  const { many, query, setQuery, shown, listed, folded, unfold } = useListed(goals, plans)
  const [open, setOpen] = useState<string | null>(null)
  const asks = asksIn(goals, plans)
  const openAsk = askOpener(onOpenGoal)
  const opened = goals.find((g) => g.id === open)
  const health = healthLine(goals, plans)
  return (
    <div className="goals-briefing">
      <p className="goals-brief">
        <span className="goals-brief-you">{briefOf(asks.length)}</span>
        {health && ` ${health}`}
      </p>
      <Asks asks={asks} onOpen={openAsk} />
      <div className="goals-list-head">
        <h3 className="field-label">Goals</h3>
        {many && <SearchGoals query={query} onQuery={setQuery} />}
      </div>
      {shown.length === 0 && <NoAnswer query={query} onClear={() => setQuery('')} />}
      <ul className="goal-rows" onKeyDown={moveAlong}>
        {listed.map((g) => (
          <GoalRow key={g.id} goal={g} plan={plans[g.id]} onOpen={() => setOpen(g.id)} />
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
          onOpenTasks={served?.[opened.id] && onOpenGoal ? () => onOpenGoal(opened.id) : undefined}
        />
      )}
    </div>
  )
}
