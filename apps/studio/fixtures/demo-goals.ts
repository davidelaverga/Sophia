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

/** Where a goal's command leaves it once Sophia confirms it. */
const AFTER: Record<Exclude<GoalCommand['kind'], 'steer'>, Goal['status']> = {
  request_review: 'checking',
  hold: 'held',
  resume: 'running',
  stop: 'stopped',
}

/**
 * The goals once `command` is confirmed: its goal at its next revision and state, if the command was made at the
 * revision it holds; any other command (a steer, a stale revision) leaves them as they are.
 */
export function goalsAfter(goals: readonly Goal[], command: GoalCommand): Goal[] {
  return goals.map((g) =>
    g.id === command.goalId && command.kind !== 'steer' && command.expectedGoalRevision === g.revision
      ? { ...g, status: AFTER[command.kind], revision: g.revision + 1, stateRevision: g.stateRevision + 1 }
      : g,
  )
}
