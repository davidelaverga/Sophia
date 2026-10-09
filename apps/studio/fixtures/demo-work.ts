// The demo's board (docs/plans/demo-board.md): the rollout goal's plan, as Sophia serves it, so the demo's Tasks draw a
// board as a planned goal's do. It is the board fixture's plan (work-data.ts: its shape, its sessions, its decisions,
// exactly as the service would admit them) told in the onboarding pilot's words, and read by the board's own reader:
// a plan the Studio would refuse fails here, never on screen. Every name and number is invented, as the rest of the demo.
import { readBoardView, type GoalView } from '../src/features/work/planning/board-view.ts'
import { PROJECT } from './data.ts'
import { DEMO_GOALS } from './demo-goals.ts'
import { unexpected } from './fixture-api.ts'
import { NOW } from './resources-data.ts'
import { firstGoal } from './work-data.ts'

/** The board fixture's words, and the pilot's. Longest first, so no shorter one rewrites part of a longer one. */
const WORDS: readonly (readonly [string, string])[] = [
  ['Asked to run pnpm --filter @sophia/report test', 'Asked to open the shared onboarding folder'],
  ['Run a shell command: pnpm --filter @sophia/report test', 'Open the shared onboarding folder'],
  [
    'Ship the retry before the report pane’s review is done?',
    'Send the translation before the report’s review is done?',
  ],
  ['How many times may a failed render be retried?', 'How many regions start in the first wave?'],
  ['The PDF renderer keeps running on its current host.', 'The pilot’s checklist holds for larger teams.'],
  ['Measure render time on large reports', 'Measure days to a first shared report'],
  ['A retry candidate passes its review', 'The translation passes its review'],
  ['Write the export’s release note', 'Write the rollout note'],
  ['Reports stay under 20 MB.', 'The second region’s teams start in the same week.'],
  ['Write the retry’s failing test', 'Write the admin-change checklist'],
  ['Review the retry’s candidate', 'Review the translation'],
  ['Reproduce the failed render', 'Map where new admins get stuck'],
  ['Implement the PDF retry', 'Translate the checklist for the second region'],
  ['Review the report pane', 'Review the first-week report'],
  ['Reading ReportPane.tsx', 'Reading the first-week report'],
  ['Three times', 'Three regions'],
  ['Ship it now', 'Send it now'],
  ['Twice', 'Two regions'],
  ['Davide’s', 'Marco’s'],
]

/** The board fixture's people the demo doesn't have, by the demo's own: Davide is Marco. */
const CAST: Readonly<Record<string, string>> = { davide: 'marco' }

/**
 * A session's commands (guidance, hold, stop): the room's demo has no lead to take them, so a task offers only what
 * the page can answer (asking Sophia), never a press that fails (no dead affordances).
 */
const COMMANDS = new Set(['guidance', 'hold', 'stop'])

/** The board fixture's clock is fixed (resources-data.ts); the demo's is now: every time moves by the difference. */
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/

/** One string as the demo tells it: a person's id the demo's cast, a time moved to now, words the pilot's. */
function told(text: string, shift: number): string {
  const cast = CAST[text]
  if (cast) return cast
  if (ISO.test(text)) return new Date(Date.parse(text) + shift).toISOString()
  return WORDS.reduce((t, [from, to]) => t.split(from).join(to), text)
}

/** Every string in a value as the demo tells it; anything else as it is. */
function inPilotWords(value: unknown, shift: number): unknown {
  if (typeof value === 'string') return told(value, shift)
  if (Array.isArray(value)) return value.map((v) => inPilotWords(v, shift))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, inPilotWords(inner, shift)]))
  }
  return value
}

/** The demo's running goal: the one its plan serves. */
const ROLLOUT = DEMO_GOALS.find((g) => g.status === 'running')

/** The demo's board: the rollout's plan, the other goals with none (a ready goal and a completed one aren't planned). */
export function demoServedGoals(): GoalView[] {
  if (!ROLLOUT) return []
  const view = firstGoal('luis')
  const plan = view.current_plan && { ...view.current_plan, goal_id: ROLLOUT.id, goal_revision: ROLLOUT.revision }
  const items = view.items.map((i) => ({
    ...i,
    available_actions: i.available_actions.filter((a) => !COMMANDS.has(a.kind)),
  }))
  const read = readBoardView({
    schema_version: 'sophia.work.board.v1',
    project_id: PROJECT,
    snapshot_cursor: '1',
    observed_at: new Date().toISOString(),
    coverage: 'complete',
    goals: [inPilotWords({ ...view, goal_id: ROLLOUT.id, current_plan: plan, items }, Date.now() - NOW.getTime())],
  })
  if (read.ok) return [...read.value.goals]
  // Loud in development and in every check (`unexpected`), never a blank demo: the goals then show without a plan.
  const said = `The demo's board doesn't read: ${read.problems.join('; ')}`
  console.error(said)
  unexpected.push(said)
  return []
}
