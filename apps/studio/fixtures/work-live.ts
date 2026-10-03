// What the plan's fixture plays live (fixtures/work.tsx), all simulated and said so on the page: each session's last
// reported activity, a clock that runs from NOW, an act's steps as a runtime would report them, and Sophia's answers,
// written from the task's own facts. Nothing here reaches a network.
import type { Resource } from '../src/features/resources/resource.ts'
import type { Ask } from '../src/features/work/planning/AskSophia.tsx'
import type { PlanRow } from '../src/features/work/planning/plan.ts'
import type { Act } from '../src/features/work/planning/TaskActions.tsx'
import { NOW } from './resources-data.ts'

const before = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString()

/** What each working session last reported, a little while before NOW. */
const ACTIVITY: Record<string, { said: string; ago: number }> = {
  'claude-worker': { said: 'Asked to run pnpm --filter @sophia/report test', ago: 22 },
  'codex-reviewer': { said: 'Reading ReportPane.tsx', ago: 6 },
}

export const withActivity = (list: Resource[]): Resource[] =>
  list.map((r) => ({
    ...r,
    sessions: r.sessions.map((s) => {
      const a = ACTIVITY[s.id]
      return a ? { ...s, activity: { said: a.said, observedAt: before(a.ago) } } : s
    }),
  }))

/** Codex's reviewer goes on reading, one file after another, as its tool would report it. */
const READING = [
  'Reading ExportStatus.tsx',
  'Comparing the pane with the spec',
  'Writing review notes',
  'Reading pdf-retry.ts',
]

export const nextActivity = (list: Resource[], at: Date, n: number): Resource[] =>
  list.map((r) => ({
    ...r,
    sessions: r.sessions.map((s) =>
      s.id === 'codex-reviewer'
        ? { ...s, activity: { said: READING[n % READING.length] ?? 'Reading', observedAt: at.toISOString() } }
        : s,
    ),
  }))

/** An act, taken as a runtime would: recorded, then queued, then delivered to its session. */
export const act: Act = (_row, _act, report) => {
  setTimeout(() => report('queued'), 700)
  setTimeout(() => report('delivered'), 1700)
}

/** Sophia's answer, from the task's own facts: who, where it stands, what it waits on. */
export const ask: Ask = (row: PlanRow, question: string) => {
  const who = row.doer.person?.name ?? 'no one yet'
  const said = row.doer.session?.activity?.said
  const answers: Record<string, string> = {
    'Why is it waiting?': `${who}’s Claude Code is waiting for a permission. Its last report: “${said ?? 'a command'}”. It goes on as soon as ${who} answers it in Claude Code.`,
    'What happens if I say yes?':
      'It runs the report tests. If they pass, the retry becomes a candidate, and its review can start.',
    'What is it doing now?': `${said ?? 'Working'}. Nothing has asked for you meanwhile.`,
    'When will it have a candidate?':
      'Not said yet: its tool reports steps, not an estimate. I’ll tell you when one arrives.',
    'Who could take it?':
      'Luis’s Claude Code has nothing assigned, but its host hasn’t been seen for 3 h. Davide’s are both busy. The lead decides who takes it.',
    'Why isn’t anyone on it?':
      'The lead left it open until the retry has a candidate: measuring before that would measure the old path.',
    'What’s left to check it?':
      'Someone other than its author runs it against the failing case and says so. Nothing else.',
    'Who should check it?': 'Davide: he didn’t write it, and the check needs his report fixtures.',
    'What does it wait for?': `${row.status.text}. Nothing else holds it.`,
  }
  return new Promise((done) =>
    setTimeout(
      () =>
        done(answers[question] ?? `About “${row.item.purpose}”: ${row.status.text}. Ask me anything else about it.`),
      900,
    ),
  )
}
