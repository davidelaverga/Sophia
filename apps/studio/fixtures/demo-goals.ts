// The demo's goals (docs/plans/views-goals.md): the onboarding pilot's own, in its report's numbers, and how a goal's
// command moves it once Sophia confirms it. Every name and number is invented, as the rest of the demo.
import type { Goal, GoalCommand } from '@sophia/contracts'
import { PROJECT } from './data.ts'

const made = (id: string, over: Pick<Goal, 'title' | 'status' | 'outcome' | 'criteria'>): Goal => ({
  id,
  projectId: PROJECT,
  revision: 1,
  authorityEpoch: 1,
  stateRevision: 1,
  ...over,
})

export const DEMO_GOALS: readonly Goal[] = [
  made('00000000-0000-4000-8000-000000009001', {
    title: 'Roll the new onboarding out to every region',
    status: 'running',
    outcome: 'Every new team reaches a first shared report inside its first week, in every region.',
    criteria: [
      {
        id: 'rollout-days',
        description: 'Days to a first shared report stay under 3 (the pilot: 2.4)',
        required: true,
        verification: 'Activation dashboard',
      },
      {
        id: 'rollout-tickets',
        description: 'Setup tickets per team stay under 1.5 (the pilot: 1.3)',
        required: true,
        verification: 'Support tickets',
      },
    ],
  }),
  made('00000000-0000-4000-8000-000000009002', {
    title: 'Keep teams through an admin change',
    status: 'ready',
    outcome: 'When a team’s admin changes, the new admin finds the checklist and gets a setup answer within a day.',
    criteria: [
      {
        id: 'admin-checklist',
        description: 'The checklist opens on its first step for a new admin',
        required: true,
        verification: 'Review',
      },
      {
        id: 'admin-answer',
        description: 'A new admin’s setup question is answered inside one working day',
        required: true,
        verification: 'Support tickets',
      },
    ],
  }),
  made('00000000-0000-4000-8000-000000009003', {
    title: 'Run the pilot with fourteen teams',
    status: 'completed',
    outcome: 'Fourteen teams take the new onboarding for four weeks, and the readout says what kept them.',
    criteria: [
      {
        id: 'pilot-readout',
        description: 'The readout is published in Knowledge',
        required: true,
        verification: 'Review',
      },
    ],
  }),
]

/**
 * What a command does to its goal's state, as the API does it (`admit_goal_command`, 0012): Hold, Stop and Resume move
 * it at once, to holding, stopping or running, under a new authority; a review asks the lead and leaves the goal as it
 * is. Holding and stopping then settle, to held and stopped, once the runtime confirms them.
 */
const ADMITTED: Partial<Record<GoalCommand['kind'], Goal['status']>> = {
  hold: 'holding',
  stop: 'stopping',
  resume: 'running',
}
const SETTLED: Partial<Record<Goal['status'], Goal['status']>> = { holding: 'held', stopping: 'stopped' }

const moved = (g: Goal, status: Goal['status']): Goal => ({
  ...g,
  status,
  authorityEpoch: g.authorityEpoch + 1,
  stateRevision: g.stateRevision + 1,
})

/** The goals once `command` is admitted: made at the goal's own revision and authority, it moves the goal's state. */
export function goalsAdmitted(goals: readonly Goal[], command: GoalCommand): Goal[] {
  const status = ADMITTED[command.kind]
  return goals.map((g) =>
    status &&
    g.id === command.goalId &&
    command.expectedGoalRevision === g.revision &&
    command.expectedAuthorityEpoch === g.authorityEpoch
      ? moved(g, status)
      : g,
  )
}

/** The goals once the runtime confirms what `goalId` was asked: holding becomes held, stopping stopped. */
export function goalsSettled(goals: readonly Goal[], goalId: string): Goal[] {
  return goals.map((g) => {
    const status = g.id === goalId ? SETTLED[g.status] : undefined
    return status ? { ...g, status, stateRevision: g.stateRevision + 1 } : g
  })
}
