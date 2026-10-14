// Goals as a briefing (docs/plans/goals-overview.md): each goal's health as people read it, the brief that leads the
// view, the line under a goal, the order by health, and what a search keeps once there are many goals.
import type { Goal } from '@sophia/contracts'
import type { Noted } from './goal-notes.ts'
import { progressOf, type Ask, type GoalGlance, type Ways } from './planning/plan.ts'

export type { GoalGlance }

export type Health = 'attention' | 'track' | 'new' | 'paused' | 'done'

/** What Goals reads of a goal's plan, and its latest note (goal-notes.md). */
export interface Glanced extends Noted {
  glance?: GoalGlance | undefined
  asks?: readonly Ask[] | undefined
  checkpoint?: string | undefined
  words?: string | undefined
}

type Plans = Readonly<Record<string, Glanced>> | undefined

/** Past this many goals, Goals offers its search. */
export const MANY = 6

export const HEALTH_LABEL: Readonly<Record<Health, string>> = {
  attention: 'Needs attention',
  track: 'On track',
  new: 'Not started',
  paused: 'Paused',
  done: 'Done',
}

/** The order a person reads them in: what needs a look first. */
const ORDER: readonly Health[] = ['attention', 'track', 'new', 'paused', 'done']

const AT_REST: Readonly<Partial<Record<Goal['status'], Health>>> = {
  holding: 'paused',
  held: 'paused',
  stopping: 'paused',
  stopped: 'paused',
  completed: 'done',
}

const counted = (n: number, one: string, many = `${one}s`) => `${String(n)} ${n === 1 ? one : many}`

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

/**
 * A goal's health from what is served: waiting on the viewer, or moving with something in its way, it needs
 * attention, as when its latest note is a difficulty; moving freely, it is on track; ready, not started; holding,
 * held, stopping or stopped, paused.
 */
export function healthOf(goal: Goal, plan: Glanced | undefined): Health {
  const rest = AT_REST[goal.status]
  if (rest) return rest
  if ((plan?.asks?.length ?? 0) > 0 || plan?.note?.kind === 'blocker') return 'attention'
  if (goal.status === 'ready') return 'new'
  return wayLine(plan?.glance) ? 'attention' : 'track'
}

type Said = (goal: Goal, done: string | null, total: number) => string

/** What each state means now. */
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
  completed: (goal) => goal.outcome,
}

export function stateLine(goal: Goal, glance: GoalGlance | undefined): string {
  const { done, total } = progressOf(glance?.lanes ?? [])
  return LINE[goal.status](goal, total > 0 ? `${String(done)} of ${String(total)} done` : null, total)
}

/** Why a goal needs attention: what waits on the viewer, then a difficulty written on it or what stands in its way. */
function attentionLine(plan: Glanced | undefined): string {
  const asks = plan?.asks?.length ?? 0
  const note = plan?.note
  const way = note?.kind === 'blocker' ? note.said : wayLine(plan?.glance)
  return [asks > 0 ? `${String(asks)} waiting on you` : null, way].filter(Boolean).join(' · ')
}

/**
 * What matters now, said after its health word: what waits on the viewer, then a difficulty written on it or what
 * stands in its way; else its latest note, or where it is.
 */
export function rowLine(goal: Goal, plan: Glanced | undefined): string {
  if (healthOf(goal, plan) === 'attention') return attentionLine(plan)
  const note = plan?.note
  if (note) return note.said
  if (goal.status === 'running' && plan?.checkpoint) return `Next · ${plan.checkpoint}`
  return stateLine(goal, plan?.glance)
}

const WORDS = ['Nothing', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']

/** The view's first sentence: what waits on the viewer. */
export function briefOf(asks: number): string {
  const n = WORDS[asks] ?? String(asks)
  if (asks === 0) return 'Nothing waits on you.'
  return asks === 1 ? `${n} thing waits on you.` : `${n} things wait on you.`
}

/** The goals counted by health, in a quiet line; the done ones left out. */
export function healthLine(goals: readonly Goal[], plans: Plans): string {
  const healths = goals.map((g) => healthOf(g, plans?.[g.id]))
  return ORDER.filter((h) => h !== 'done')
    .map((h) => [h, healths.filter((x) => x === h).length] as const)
    .filter(([, n]) => n > 0)
    .map(([h, n]) => `${String(n)} ${HEALTH_LABEL[h].toLowerCase()}`)
    .join(' · ')
}

/** The goals by health, in the order a person reads them; within one health, as they came. */
export const ordered = (goals: readonly Goal[], plans: Plans): Goal[] =>
  ORDER.flatMap((h) => goals.filter((g) => healthOf(g, plans?.[g.id]) === h))

const answers = (goal: Goal, plan: Glanced | undefined, query: string) =>
  [goal.title, goal.outcome, plan?.words ?? ''].some((s) => s.toLowerCase().includes(query))

export function goalsShown(goals: readonly Goal[], plans: Plans, query: string): Goal[] {
  const q = query.trim().toLowerCase()
  return q ? goals.filter((g) => answers(g, plans?.[g.id], q)) : [...goals]
}

/**
 * Whether a goal's sheet offers «Open in Tasks»: only when its board holds tasks. A goal observed with items and no
 * plan has a slot too, and Tasks would show it nothing planned (Codex P2 on #300).
 */
export const canOpenInTasks = (plan: Glanced | undefined): boolean => (plan?.glance?.lanes.length ?? 0) > 0
