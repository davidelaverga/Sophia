// What the plan's fixture plays live (fixtures/work.tsx), all simulated and said so on the page: each running task's
// last report, a clock that runs from NOW, the receipts a service would give each command, the events an answer from
// the shared conversation would arrive as, a labelled source text for a result, and a decision's receipt. Nothing
// here reaches a network. The query string chooses how the service behaves: `admission=slow|lost|refused`,
// `settle=confirmed|unknown`, `ask=down|whole|silent|flaky`, `result=down`.
import type { Resource } from '../src/features/resources/resource.ts'
import type { Receipt } from '../src/features/resources/receipts.ts'
import type { SendCommand } from '../src/features/resources/SessionActs.tsx'
import type { Ask, AskEvent, Question } from '../src/features/work/planning/ask.ts'
import type { GoalView } from '../src/features/work/planning/board-view.ts'
import type { Decide, DecisionAnswer } from '../src/features/work/planning/Decision.tsx'
import type { ReadResult } from '../src/features/work/planning/results.ts'
import type { Command } from '../src/features/resources/receipts.ts'
import { NOW } from './resources-data.ts'

const query = () => new URLSearchParams(window.location.search)
const before = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString()

// Resources' page (fixtures/resources.tsx) still shows each session's own reports.

/** What each working session last reported, a little while before NOW, and what it reported before, newest first. */
const ACTIVITY: Record<string, { said: string; ago: number; earlier: [string, number][] }> = {
  'claude-worker': {
    said: 'Asked to run pnpm --filter @sophia/report test',
    ago: 22,
    earlier: [
      ['Edited pdf-retry.ts: retries the render twice', 95],
      ['Wrote the failing test for a timed-out render', 260],
      ['Read ExportStatus.tsx', 420],
    ],
  },
  'codex-reviewer': {
    said: 'Reading ReportPane.tsx',
    ago: 6,
    earlier: [
      ['Opened the review of the report pane', 70],
      ['Read the pane’s spec', 180],
    ],
  },
}

/** How many earlier reports a session keeps. */
const KEPT = 4

export const withActivity = (list: Resource[]): Resource[] =>
  list.map((r) => ({
    ...r,
    sessions: r.sessions.map((s) => {
      const a = ACTIVITY[s.id]
      if (!a) return s
      const recent = a.earlier.map(([said, ago]) => ({ said, observedAt: before(ago) }))
      return { ...s, activity: { said: a.said, observedAt: before(a.ago) }, recent }
    }),
  }))

/** Codex's reviewer goes on reading, one file after another, as its tool would report it. */
const READING = [
  'Reading ExportStatus.tsx',
  'Comparing the pane with the spec',
  'Writing review notes',
  'Reading pdf-retry.ts',
]

/** Its next report on Resources' page; the one before goes to the top of its earlier ones. */
export const nextActivity = (list: Resource[], at: Date, n: number): Resource[] =>
  list.map((r) => ({
    ...r,
    sessions: r.sessions.map((s) =>
      s.id === 'codex-reviewer'
        ? {
            ...s,
            activity: { said: READING[n % READING.length] ?? 'Reading', observedAt: at.toISOString() },
            recent: [...(s.activity ? [s.activity] : []), ...(s.recent ?? [])].slice(0, KEPT),
          }
        : s,
    ),
  }))

/** Its next report on the plan's board: the same attempt, the same generation, a new observation. */
export const nextReport = (g: GoalView, at: Date, n: number): GoalView => ({
  ...g,
  items: g.items.map((v) =>
    v.work_id === 'work-2' && v.lifecycle === 'running' && v.activity
      ? {
          ...v,
          activity: {
            ...v.activity,
            observation_id: `obs-codex-${String(n)}`,
            said: READING[n % READING.length] ?? 'Reading',
            observed_at: at.toISOString(),
          },
        }
      : v,
  ),
})

/** Each command sent from Resources' page, as its checks read it. */
export const acted: { sessionId: string; kind: string; text?: string; workId: string }[] = []
/** Each command sent from either page, with its exact identity, and each receipt sent back. */
export const commands: Command[] = []
export const receipts: Receipt[] = []

/** A receipt for `command`, at `revision`, as the service would observe it. */
export function receiptFor(command: Command, revision: number, over: Partial<Receipt>): Receipt {
  const settled = over.effect === 'held' || over.effect === 'stopped' || over.effect === 'resumed'
  return {
    schema_version: 'sophia.work.receipt.v1',
    operation_id: command.operation_id,
    receipt_id: `receipt-${command.operation_id}`,
    project_id: command.target.project_id,
    work_id: command.target.work_id,
    assignment_id: command.target.assignment_id,
    assignment_generation: command.target.assignment_generation,
    kind: command.kind,
    revision,
    observed_at: new Date().toISOString(),
    admission: 'recorded',
    delivery: 'queued',
    effect: command.kind === 'guidance' ? 'not_applicable' : 'pending',
    rejection: null,
    evidence_refs: settled ? ['fixture-admission', 'fixture-native-settled'] : ['fixture-admission'],
    ...over,
  }
}

const SETTLES = { hold: 'held', stop: 'stopped', resume: 'resumed' } as const

/** The steps a service gives a command, each after its delay: recorded, queued, delivered, then, if asked, its effect. */
function steps(command: Command): [number, Partial<Receipt>][] {
  const q = query()
  if (q.get('admission') === 'refused') {
    return [[300, { admission: 'rejected', delivery: 'not_sent', effect: 'not_applicable', rejection: 'denied' }]]
  }
  const start = q.get('admission') === 'slow' ? 7000 : 150
  const sent: [number, Partial<Receipt>][] = [
    [start, { delivery: 'not_sent' }],
    [start + 550, { delivery: 'queued' }],
    [start + 1550, { delivery: 'delivered' }],
  ]
  if (command.kind === 'guidance') return sent
  const settle = q.get('settle')
  const effect = settle === 'confirmed' ? SETTLES[command.kind] : settle === 'unknown' ? 'unknown' : null
  return effect ? [...sent, [start + 2550, { delivery: 'delivered', effect }]] : sent
}

/** How many times each operation was sent: `admission=lost` loses the first reply of each, never a retry's. */
const sent = new Map<string, number>()
/** Where each operation's receipts go, so a check can send them again, late, or to another operation. */
const listeners = new Map<string, (r: unknown) => void>()

/** Every receipt an operation got, sent to it again newest first: repeated and out of order. */
export function replay(operationId: string): void {
  const listener = listeners.get(operationId)
  for (const r of receipts.filter((x) => x.operation_id === operationId).toReversed()) listener?.(r)
}

/** One operation's receipts, sent to another operation's command: a receipt for other work, which changes nothing. */
export function misdeliver(from: string, to: string): void {
  const listener = listeners.get(to)
  for (const r of receipts.filter((x) => x.operation_id === from)) listener?.({ ...r, operation_id: to })
}

/** Takes a command as a service would: its receipts in turn, or, `admission=lost`, no reply at first. */
export function serve(onSettled?: (command: Command, effect: Receipt['effect']) => void): SendCommand {
  return (command, on) => {
    commands.push(command)
    listeners.set(command.operation_id, on.receipt)
    const times = (sent.get(command.operation_id) ?? 0) + 1
    sent.set(command.operation_id, times)
    if (query().get('admission') === 'lost' && times === 1) {
      setTimeout(on.lost, 1500)
      return
    }
    steps(command).forEach(([delay, over], i) =>
      setTimeout(() => {
        const r = receiptFor(command, i + 1, over)
        receipts.push(r)
        on.receipt(r)
        if (r.effect !== 'pending' && r.effect !== 'not_applicable') onSettled?.(command, r.effect)
      }, delay),
    )
  }
}

/** Resources' page: the same service, its commands also kept as its checks read them. */
export const actOn: SendCommand = (command, on) => {
  acted.push({
    sessionId: command.target.session_id ?? '',
    kind: command.kind,
    ...(command.text ? { text: command.text } : {}),
    workId: command.target.work_id,
  })
  serve()(command, on)
}

/** What one fixture page carries to the other when a link crosses: who is looking, and an account running short. */
export function carried(search: string): string {
  const given = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const key of ['viewer', 'tight']) {
    const value = given.get(key)
    if (value) kept.set(key, value)
  }
  const said = kept.toString()
  return said ? `?${said}` : ''
}

/** Sophia's answers in the fixture, by question: written from the plan's own facts, labelled simulated on the page. */
const ANSWERS: Record<string, string> = {
  'Why is it waiting?':
    'Davide’s Claude Code is waiting for a permission. Its last report: “Asked to run pnpm --filter @sophia/report test”. It goes on as soon as Davide answers it in Claude Code.',
  'What happens if I say yes?':
    'It runs the report tests. If they pass, the retry becomes a candidate, and its review can start.',
  'What is it doing now?': 'Reading the report pane’s files. Nothing has asked for you meanwhile.',
  'When will it have a candidate?':
    'Not said yet: its tool reports steps, not an estimate. I’ll tell you when one arrives.',
  'Who could take it?':
    'Luis’s Claude Code has nothing assigned, but its host hasn’t been seen for 3 h. Davide’s are both busy. The lead decides who takes it.',
  'Why isn’t anyone on it?':
    'The lead left it open until the retry has a candidate: measuring before that would measure the old path.',
  'What does it wait for?': 'The retry: it starts once the retry has a candidate. Nothing else holds it.',
}

/** Every answer event sent, by question, so a reconnect can send them again. */
const answered = new Map<string, { on: (e: AskEvent) => void; events: AskEvent[] }>()

/** The answer as the conversation would send it: in a few chunks as they come, or whole (`ask=whole`). */
function eventsFor(question: Question): AskEvent[] {
  const q = query()
  const id = question.question_id
  if (q.get('ask') === 'down')
    return [{ question_id: id, seq: 1, kind: 'unavailable', text: 'Sophia isn’t reachable right now.' }]
  const text = ANSWERS[question.text] ?? `About this task: “${question.text}” is noted. Ask me anything else about it.`
  if (q.get('ask') === 'whole') return [{ question_id: id, seq: 1, kind: 'complete', text }]
  const words = text.split(' ')
  const third = Math.ceil(words.length / 3)
  const chunks = [0, 1, 2].map((i) => words.slice(i * third, (i + 1) * third).join(' ')).filter(Boolean)
  return [
    ...chunks.map((c, i) => ({ question_id: id, seq: i + 1, kind: 'chunk' as const, text: i === 0 ? c : ` ${c}` })),
    { question_id: id, seq: chunks.length + 1, kind: 'complete', text },
  ]
}

/** Each question sent to the conversation, each send of it included: for the checks to read. */
export const questions: Question[] = []

/**
 * `ask=flaky` (Codex F-004): each send of the same question goes its own way. The first fails at 5 s. The second
 * sends a part at 25 s, then nothing in time, and its whole answer only at 70 s, too late. The third is answered
 * whole at 20 s.
 */
function flaky(question: Question, on: (e: AskEvent) => void) {
  const id = question.question_id
  const n = questions.filter((q) => q.question_id === id).length
  const at = (ms: number, e: Omit<AskEvent, 'question_id'>) => setTimeout(() => on({ question_id: id, ...e }), ms)
  if (n === 1) at(5_000, { seq: 1, kind: 'failed' })
  else if (n === 2) {
    at(25_000, { seq: 1, kind: 'chunk', text: 'It waits ' })
    at(70_000, { seq: 2, kind: 'complete', text: 'Too late: the second send’s answer.' })
  } else at(20_000, { seq: 1, kind: 'complete', text: 'It waits for Davide’s answer, said on the third send.' })
}

/** The shared conversation, simulated: `staggered=1` answers the first question slower than the next. */
export const ask: Ask = (question, on) => {
  questions.push(question)
  // `ask=silent`: the conversation takes the question and never answers (PR #76 review, P2).
  if (query().get('ask') === 'silent') return
  if (query().get('ask') === 'flaky') {
    flaky(question, on)
    return
  }
  const late = query().get('staggered') === '1' && question.text === 'Why is it waiting?'
  const start = late ? 1800 : 900
  const record = { on, events: [] as AskEvent[] }
  answered.set(question.question_id, record)
  eventsFor(question).forEach((event, i) =>
    setTimeout(
      () => {
        record.events.push(event)
        on(event)
      },
      start + i * 150,
    ),
  )
}

/** A reconnect: every event already sent is sent again, as a resumed stream would replay them. */
export function reconnect(): void {
  for (const { on, events } of answered.values()) for (const event of events) on(event)
}

/** A result's text, as the source fixture holds it: labelled, never a real report. */
const TEXT: Record<string, string> = {
  'retry-v1':
    'Retry v1\n\nThe render is retried twice with a backoff of 2 s, then the failure is reported with its cause.',
  'retry-v2': 'Retry v2\n\nAs v1, plus the retry is shown in the report pane.',
  'findings-v1':
    'Review of retry-v1\n\n1. A timed-out render is retried, but its cause is lost on the second failure.\n2. The pane shows no retry.\n\nChanges needed before it ships.',
  'source-review-v1':
    'Source review\n\nThe supplied sources cover the export path and the renderer. They don’t cover the report pane: its spec is missing from the manifest.',
}

export const readResult: ReadResult = (ref) =>
  new Promise((done) =>
    setTimeout(() => {
      const text = query().get('result') === 'down' ? undefined : TEXT[ref.version_id]
      done(text ? { text, label: 'Simulated source — fixture text, not a real result' } : null)
    }, 300),
  )

/** Each answer a decider gave, in order: for the checks to read. */
export const answers: DecisionAnswer[] = []

/** The decider's answer, as the service would take it: recorded, or as the page asks (`conflict=1`, `unknown=1`). */
export const decide: Decide = (answer) => {
  answers.push(answer)
  const q = query()
  const said = q.get('conflict') === '1' ? 'conflict' : q.get('unknown') === '1' ? 'unknown' : 'recorded'
  return new Promise((done) => setTimeout(() => done(said), 300))
}
