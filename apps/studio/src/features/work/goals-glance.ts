// Goals as an overview (docs/plans/goals-overview.md): each goal's group by state, the line under it, what stands in
// its way in a line, and which goals a filter and a search keep once there are many.
import type { Goal } from '@sophia/contracts'
import { progressOf, type GoalGlance, type Ways } from './planning/plan.ts'

export type { GoalGlance }

export type Group = 'motion' | 'ready' | 'paused' | 'done'
export type Filter = 'all' | 'you' | Group

/** Past this many goals, Goals offers its search and its filters. */
export const MANY = 6

const GROUP: Readonly<Record<Goal['status'], Group>> = {
  running: 'motion',
  checking: 'motion',
  holding: 'motion',
  stopping: 'motion',
  ready: 'ready',
  held: 'paused',
  stopped: 'paused',
  completed: 'done',
}

export const groupOf = (status: Goal['status']): Group => GROUP[status]

const counted = (n: number, one: string, many = `${one}s`) => `${String(n)} ${n === 1 ? one : many}`

type Said = (goal: Goal, done: string | null, total: number) => string

/** What each state means now, said under its title. */
const LINE: Readonly<Record<Goal['status'], Said>> = {
  ready: (_, __, total) => (total > 0 ? `${counted(total, 'task')} planned` : 'No plan yet'),
  running: (_, done) => done ?? 'No plan on the board yet',
  checking: (goal) =>
    goal.criteria.length > 0
      ? `Checking the outcome against ${counted(goal.criteria.length, 'criterion', 'criteria')}`
      : 'Checking the outcome',
  holding: () => 'Holding · stops after its current step',
  held: (_, done) => (done ? `Held · ${done}` : 'Held'),
  stopping: () => 'Stopping · finished work is kept',
  stopped: (_, done) => (done ? `Stopped · ${done}` : 'Stopped'),
  completed: () => 'Completed',
}

export function stateLine(goal: Goal, glance: GoalGlance | undefined): string {
  const { done, total } = progressOf(glance?.lanes ?? [])
  return LINE[goal.status](goal, total > 0 ? `${String(done)} of ${String(total)} done` : null, total)
}

const WAYS: readonly [keyof Ways, string][] = [
  ['permissions', 'waiting on a permission'],
  ['decisions', 'waiting on a decision'],
  ['capacity', 'waiting for capacity'],
  ['outside', 'waiting on another service'],
  ['blocked', 'blocked'],
]

/** What stands in its way, by kind, in one line; null when nothing does. */
export function wayLine(glance: GoalGlance | undefined): string | null {
  if (!glance) return null
  const parts = WAYS.filter(([k]) => glance.ways[k] > 0).map(([k, words]) => `${String(glance.ways[k])} ${words}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** What Goals reads of a goal's plan to filter and search it. */
export interface Findable {
  attention?: boolean | undefined
  words?: string | undefined
}

const keeps = (goal: Goal, plan: Findable | undefined, filter: Filter) =>
  filter === 'all' || (filter === 'you' ? plan?.attention === true : groupOf(goal.status) === filter)

const answers = (goal: Goal, plan: Findable | undefined, query: string) =>
  [goal.title, goal.outcome, plan?.words ?? ''].some((s) => s.toLowerCase().includes(query))

export function goalsShown(
  goals: readonly Goal[],
  plans: Readonly<Record<string, Findable>> | undefined,
  filter: Filter,
  query: string,
): Goal[] {
  const q = query.trim().toLowerCase()
  return goals.filter((g) => keeps(g, plans?.[g.id], filter) && (!q || answers(g, plans?.[g.id], q)))
}

export const FILTERS: readonly Filter[] = ['all', 'motion', 'you', 'ready', 'paused', 'done']

export function countsOf(
  goals: readonly Goal[],
  plans: Readonly<Record<string, Findable>> | undefined,
): Record<Filter, number> {
  const n = (f: Filter) => goalsShown(goals, plans, f, '').length
  return { all: n('all'), motion: n('motion'), you: n('you'), ready: n('ready'), paused: n('paused'), done: n('done') }
}
