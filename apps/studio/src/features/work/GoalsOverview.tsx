// Goals as an overview (docs/plans/goals-overview.md): the goals grouped by state in the order a person acts on them.
// A goal in motion is a card: its tasks as a bar by lane, how far it has gone, what is in its way, who is on it and the
// press to its plan in Tasks. Ready and paused goals are rows; done goals fold to one line. Past six goals, a search
// and filters with their counts.
import { useRef, useState } from 'react'
import type { Goal } from '@sophia/contracts'
import { Button, EmptyState, Search, Segmented, Tag } from '@sophia/ui'
import { Avatar } from '../../app/Avatar.tsx'
import { useCommands } from '../../app/useCommands.ts'
import type { GoalPlan } from './GoalList.tsx'
import { Criteria } from './Criteria.tsx'
import { GOAL_STATUS } from './labels.ts'
import {
  countsOf,
  FILTERS,
  goalsShown,
  groupOf,
  MANY,
  stateLine,
  wayLine,
  type Filter,
  type GoalGlance,
  type Group,
} from './goals-glance.ts'
import { progressOf, type Lane } from './planning/plan.ts'

type Plans = Readonly<Record<string, GoalPlan>> | undefined

interface Props {
  goals: readonly Goal[]
  plans: Plans
  /** Tasks, with the goal named in the address; undefined where Tasks can't take it. */
  onOpenGoal: ((goalId: string) => void) | undefined
}

const FILTER_LABEL: Readonly<Record<Filter, string>> = {
  all: 'All',
  motion: 'In motion',
  you: 'Needs you',
  ready: 'Ready',
  paused: 'Paused',
  done: 'Done',
}

/** The bar's order: what is done first, then what moves, what waits to start, what is held, what nobody does. */
const BAR: readonly Lane[] = ['complete', 'active', 'next', 'blocked', 'unassigned']

function Bar({ lanes }: { lanes: readonly Lane[] }) {
  const shown = BAR.flatMap((lane) => lanes.filter((l) => l === lane))
  if (shown.length === 0) return null
  return (
    <span className="goal-bar" aria-hidden>
      {shown.map((lane, i) => (
        <i key={i} data-lane={lane} />
      ))}
    </span>
  )
}

function Faces({ glance }: { glance: GoalGlance | undefined }) {
  const people = glance?.people ?? []
  if (people.length === 0) return null
  const more = people.length - 3
  return (
    <span className="goal-faces" aria-label={`On it: ${people.map((p) => p.name).join(', ')}`}>
      {people.slice(0, 3).map((p) => (
        <Avatar key={p.id} identity={{ name: p.name, displayName: p.name, avatarUrl: p.avatarUrl ?? null }} />
      ))}
      {more > 0 && <span className="goal-faces-more">+{more}</span>}
    </span>
  )
}

interface GoalProps {
  goal: Goal
  plan: GoalPlan | undefined
  onOpen: (() => void) | undefined
}

/** Its tasks as a bar by lane, how many are done, and what is in its way or that nothing is. */
function Progress({ glance }: { glance: GoalGlance | undefined }) {
  const { done, total } = progressOf(glance?.lanes ?? [])
  if (!glance || total === 0) return null
  const way = wayLine(glance)
  return (
    <div className="goal-progress-block">
      <Bar lanes={glance.lanes} />
      <p className="goal-card-line">
        <span className="goal-progress">
          {done} of {total} done
        </span>
        {way ? <span className="goal-way">{way}</span> : <span className="goal-clear">Nothing in the way</span>}
      </p>
    </div>
  )
}

function OpenInTasks({ onOpen }: { onOpen: (() => void) | undefined }) {
  if (!onOpen) return null
  return (
    <Button kind="text" onClick={onOpen}>
      Open in Tasks
    </Button>
  )
}

/** A goal in motion: what it is for, how far it has gone, what is in its way, who is on it, and the way to its plan. */
function GoalCardOverview({ goal, plan, onOpen }: GoalProps) {
  const status = GOAL_STATUS[goal.status]
  return (
    <li className="goal goal-card" data-status={goal.status}>
      <div className="goal-meta">
        <Tag tone={status.tone}>{status.label}</Tag>
        {plan?.attention && <span className="goal-for-you">Needs you</span>}
        <Faces glance={plan?.glance} />
      </div>
      <h4 className="goal-title">{goal.title}</h4>
      <p className="goal-outcome">{goal.outcome}</p>
      {plan?.checkpoint && (
        <p className="goal-next">
          <span className="field-label">Next</span>
          {plan.checkpoint}
        </p>
      )}
      {goal.status !== 'running' && <p className="goal-state">{stateLine(goal, plan?.glance)}</p>}
      <Progress glance={plan?.glance} />
      {goal.criteria.length > 0 && <Criteria goal={goal} />}
      <div className="goal-card-foot">
        <OpenInTasks onOpen={onOpen} />
      </div>
    </li>
  )
}

/**
 * A ready, paused or done goal: its state, its title and one line (what its state means now, or its outcome where the
 * state says it all), and the way to its plan where there is one.
 */
function GoalRow({ goal, plan, onOpen }: GoalProps) {
  const status = GOAL_STATUS[goal.status]
  const line = stateLine(goal, plan?.glance)
  return (
    <li className="goal goal-row" data-status={goal.status}>
      <Tag tone={status.tone}>{status.label}</Tag>
      <div className="goal-row-words">
        <h4 className="goal-title">{goal.title}</h4>
        <p className="goal-row-line">
          {line === status.label ? goal.outcome : line}
          {plan?.attention && <span className="goal-for-you"> · Needs you</span>}
        </p>
      </div>
      <OpenInTasks onOpen={onOpen} />
    </li>
  )
}

const GROUP_LABEL: Readonly<Record<Group, string>> = {
  motion: 'In motion',
  ready: 'Ready',
  paused: 'Paused',
  done: 'Done',
}

interface SectionProps {
  group: Group
  goals: readonly Goal[]
  plans: Plans
  opener: (id: string) => (() => void) | undefined
}

function Section({ group, goals, plans, opener }: SectionProps) {
  const mine = goals.filter((g) => groupOf(g.status) === group)
  if (mine.length === 0) return null
  const Item = group === 'motion' ? GoalCardOverview : GoalRow
  return (
    <section className="goals-group" data-group={group} aria-label={GROUP_LABEL[group]}>
      <h3 className="goals-group-head">
        <span className="field-label">{GROUP_LABEL[group]}</span>
        <span className="count">{mine.length}</span>
      </h3>
      <ol className={group === 'motion' ? 'goal-cards' : 'goal-rows'} data-one={mine.length === 1 || undefined}>
        {mine.map((g) => (
          <Item key={g.id} goal={g} plan={plans?.[g.id]} onOpen={opener(g.id)} />
        ))}
      </ol>
    </section>
  )
}

/** Done goals, folded to one line that opens; a search or the Done filter shows them open. */
function Done({ goals, plans, opener, open }: Omit<SectionProps, 'group'> & { open: boolean }) {
  const [unfolded, setUnfolded] = useState(false)
  const done = goals.filter((g) => groupOf(g.status) === 'done')
  if (done.length === 0) return null
  if (open || unfolded) return <Section group="done" goals={done} plans={plans} opener={opener} />
  return (
    <Button kind="ghost" size="sm" className="goals-done-fold" aria-expanded={false} onClick={() => setUnfolded(true)}>
      {done.length} done
    </Button>
  )
}

interface ToolsProps {
  query: string
  onQuery: (q: string) => void
  filter: Filter
  onFilter: (f: Filter) => void
  counts: Record<Filter, number>
}

/** Past six goals: the search, focused with "/", and the filters with their counts. */
function Tools({ query, onQuery, filter, onFilter, counts }: ToolsProps) {
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
    <div className="goals-tools">
      <Segmented
        role="tablist"
        label="Show"
        items={FILTERS.map((f) => ({ id: f, label: FILTER_LABEL[f], count: counts[f], controls: 'goals-shown' }))}
        value={filter}
        onChange={onFilter}
      />
      <Search
        ref={input}
        className="goals-search"
        aria-label="Search goals"
        aria-keyshortcuts="/"
        placeholder="Search goals, tasks, people…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={onKeyDown}
        tip={{ label: 'Search', keys: '/', side: 'bottom' }}
      />
    </div>
  )
}

function Nothing({ query, onClear, onAll }: { query: string; onClear: () => void; onAll: () => void }) {
  const [words, label, onPress] = query
    ? [`No goal answers “${query}”.`, 'Clear the search', onClear]
    : ['No goal here.', 'Show all goals', onAll]
  return (
    <EmptyState
      actions={
        <Button kind="pill" onClick={onPress}>
          {label}
        </Button>
      }
    >
      {words}
    </EmptyState>
  )
}

export function GoalsOverview({ goals, plans, onOpenGoal }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const many = goals.length > MANY
  const shown = many ? goalsShown(goals, plans, filter, query) : goals
  const opener = (id: string) => (plans?.[id] && onOpenGoal ? () => onOpenGoal(id) : undefined)
  const groups = { goals: shown, plans, opener }
  return (
    <div className="goals-overview">
      {many && (
        <Tools query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} counts={countsOf(goals, plans)} />
      )}
      <div id="goals-shown" className="goals-shown">
        {shown.length === 0 && <Nothing query={query} onClear={() => setQuery('')} onAll={() => setFilter('all')} />}
        <Section group="motion" {...groups} />
        <Section group="ready" {...groups} />
        <Section group="paused" {...groups} />
        <Done {...groups} open={query.trim() !== '' || filter === 'done'} />
      </div>
    </div>
  )
}
