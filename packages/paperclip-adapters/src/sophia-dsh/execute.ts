/**
 * One Paperclip run of a Sophia-commissioned issue (WBC-02 G3/G4). The adapter is an observer with a permit, never
 * a second writer: Sophia's existing native path runs the review, Sophia decides whether this run may act, and a
 * cancelled or lost run never starts another attempt. In order:
 *
 * 1. Opt into cancellation (`onCancellationReady`) before anything else; an already-aborted run returns at once,
 *    having asked Sophia nothing.
 * 2. Ask Sophia for an effect permit for this exact issue and run: start (the work's first attempt), attach (an
 *    attempt that is live or whose state is uncertain), or deny (unknown or foreign issue, held, stopped, finished or
 *    withdrawn work, spent allowance). A denial returns before any effect.
 * 3. To start: `onDispatch` immediately before asking Sophia to start, and only then. A start whose answer was lost is
 *    never repeated: the run observes what Sophia recorded.
 * 4. Observe until the work settles. On cancellation Sophia holds the work (fenced and settled through its native
 *    path) and the run waits, bounded, for that settlement. Until Sophia answers the cancel, every look asks it again
 *    under the same run (Sophia's cancel is idempotent per run): a cancel lost before or after it arrived is never
 *    taken for an observation. A Hold Sophia never confirmed is said as unconfirmed, never as held or released.
 * 5. Report: the run's own usage (per_run; a cost Sophia could not settle is null, never zero), the native session, and
 *    a published review as success. A review with adverse findings is a successful review, not acceptance.
 * 6. As the pinned host reads a result, an error message makes a failed run and a failed run leaves the managed
 *    reviewer in error, so no later wakeup of it is queued (Codex WBC-02-CX-0007). A run that ended on Sophia's own
 *    definite answer (held, stopped, withdrawn, a review that ended blocked or failed, a denied permit, an observer let
 *    go) did its job: it completes, with Sophia's outcome as its summary and `resultJson.sophiaOutcome`; Sophia's
 *    record of the work is unchanged. A run Paperclip cancelled keeps its error (the host records it cancelled, which
 *    leaves the agent idle), and so does a run that could not work with Sophia at all (unreachable, a refused
 *    credential, no issue): those need an operator.
 * @module @sophia/paperclip-adapters/sophia-dsh/execute
 */
import type { CoordinationObservation, CoordinationPermitRequest, CoordinationRunRequest } from '@sophia/contracts'
import { SophiaRefusal, SophiaUnreachable, type SophiaClient } from './client.ts'
import type { AdapterExecutionContext, AdapterExecutionResult } from './types.ts'

export interface ExecuteDeps {
  readonly client: SophiaClient
  /** How often the run looks at Sophia while the work runs. */
  readonly pollMs: number
  /** How long a cancelled run waits for Sophia to confirm the Hold settled. */
  readonly settleMs: number
  /** How long one run observes before it lets go (the attempt continues; a later run attaches). */
  readonly maxRunMs: number
  readonly now: () => number
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}

/** Phases after which nothing more will happen without a person: the run reports and ends. */
const SETTLED: ReadonlySet<CoordinationObservation['phase']> = new Set([
  'held',
  'stopped',
  'result_ready',
  'blocked',
  'failed',
  'withdrawn',
])

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

const failure = (
  errorCode: string,
  errorMessage: string,
  extra: Partial<AdapterExecutionResult> = {},
): AdapterExecutionResult => ({
  exitCode: null,
  signal: null,
  timedOut: false,
  errorCode,
  errorMessage,
  ...extra,
})

const CANCELLED_BEFORE_START = failure(
  'cancelled_before_start',
  'The run was cancelled before it asked Sophia for anything; nothing was started.',
)

/** Ask Sophia; null when it did not answer (the caller keeps what it last knew), a refusal is rethrown. */
async function ask<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call()
  } catch (err: unknown) {
    if (err instanceof SophiaUnreachable) return null
    throw err
  }
}

interface Watch {
  last: CoordinationObservation | null
  cancelledAt: number | null
  /** Whether Sophia answered this run's cancel; until it does, each look asks it again. */
  cancelAnswered: boolean
}

/** One look: the cancel again while Sophia has not answered it, else an observation; what Sophia said is kept. */
async function look(deps: ExecuteDeps, run: CoordinationRunRequest, state: Watch): Promise<void> {
  const cancelling = state.cancelledAt !== null && !state.cancelAnswered
  const seen = await ask(() => (cancelling ? deps.client.cancel(run) : deps.client.observe(run)))
  if (cancelling && seen !== null) state.cancelAnswered = true
  state.last = seen ?? state.last
}

/** Settled, or out of time: the settle wait once cancelled, else the run's observation limit. */
function done(state: Watch, deps: ExecuteDeps, deadline: number): boolean {
  if (state.last !== null && SETTLED.has(state.last.phase)) return true
  return state.cancelledAt !== null ? deps.now() - state.cancelledAt >= deps.settleMs : deps.now() >= deadline
}

/** Observe until settled, cancelled and settled (or the settle wait ends), or the run's observation limit. */
async function watch(ctx: AdapterExecutionContext, deps: ExecuteDeps, run: CoordinationRunRequest): Promise<Watch> {
  const state: Watch = { last: null, cancelledAt: null, cancelAnswered: false }
  const deadline = deps.now() + deps.maxRunMs
  for (;;) {
    if (ctx.signal?.aborted === true && state.cancelledAt === null) state.cancelledAt = deps.now()
    await look(deps, run, state)
    if (done(state, deps, deadline)) return state
    await deps.sleep(deps.pollMs, state.cancelledAt === null ? ctx.signal : undefined)
  }
}

const UNSETTLED: Readonly<Record<string, readonly [string, string]>> = {
  holding: [
    'sophia_hold_unsettled',
    "Hold requested; Sophia has not confirmed that the runtime settled. The work's state is not confirmed.",
  ],
  stopping: [
    'sophia_stop_unsettled',
    "Stop requested; Sophia has not confirmed that the runtime stopped. The work's state is not confirmed.",
  ],
}

const ENDED: Readonly<Record<string, readonly [number | null, string, string]>> = {
  held: [
    null,
    'sophia_held',
    'Held in Sophia. Work and remaining allowance are kept; only an explicit Resume in Sophia continues it.',
  ],
  stopped: [null, 'sophia_stopped', 'Stopped in Sophia. Completed work is kept.'],
  withdrawn: [null, 'sophia_withdrawn', 'An input of this review was withdrawn; its result is not served.'],
  blocked: [1, 'sophia_review_blocked', 'The review reported a blocker.'],
  failed: [1, 'sophia_review_failed', 'The review ended without a result.'],
}

const HOLD_UNCONFIRMED =
  'This run was cancelled, but Sophia never confirmed that it received the Hold: the review may still be running. ' +
  'Hold it in Sophia.'

/**
 * A cancelled run whose cancel Sophia never answered, unless what Sophia last said already settles or names the Hold
 * (a person's Hold, or a lost reply whose Hold arrived): the work's state is unconfirmed, and so is the Hold.
 */
function unconfirmedHold(seen: CoordinationObservation | null, watched: Watch): boolean {
  if (watched.cancelledAt === null || watched.cancelAnswered) return false
  return seen === null || !(SETTLED.has(seen.phase) || seen.phase in UNSETTLED)
}

/** What every report of an observed attempt carries: its session, its phase and result, and the run's usage. */
function commonOf(seen: CoordinationObservation): Partial<AdapterExecutionResult> {
  const usage = seen.usage
  return {
    sessionParams: {
      sophiaWorkId: seen.workId,
      sophiaAttemptId: seen.attemptId,
      nativeSessionId: seen.nativeSessionId,
    },
    sessionDisplayId: seen.nativeSessionId,
    resultJson: { workId: seen.workId, attemptId: seen.attemptId, phase: seen.phase, result: seen.result },
    ...(usage
      ? {
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cachedInputTokens: usage.cachedInputTokens,
          },
          usageBasis: 'per_run' as const,
          costUsd: usage.costUsd,
          billingType: 'metered_api' as const,
          biller: 'sophia',
          provider: usage.providers[0] ?? null,
          model: usage.models[0] ?? null,
        }
      : { usageBasis: null, costUsd: null }),
  }
}

/** A run that ends without a published result: unsettled, ended in Sophia, or let go while the attempt continues. */
function unfinished(seen: CoordinationObservation, common: Partial<AdapterExecutionResult>): AdapterExecutionResult {
  const unsettled = UNSETTLED[seen.phase]
  if (unsettled) return failure(unsettled[0], unsettled[1], common)
  const ended = ENDED[seen.phase]
  if (ended)
    return { ...failure(ended[1], seen.reason ? `${ended[2]} ${seen.reason}` : ended[2], common), exitCode: ended[0] }
  return failure(
    'sophia_observer_released',
    'This run stopped observing; the attempt continues in Sophia under its own controls, and a later run attaches to it.',
    common,
  )
}

/** The run's report from what Sophia last said. */
function report(final: CoordinationObservation | null, watched: Watch): AdapterExecutionResult {
  const seen = final ?? watched.last
  const unconfirmed = unconfirmedHold(seen, watched)
  if (seen === null)
    return unconfirmed
      ? failure('sophia_hold_unconfirmed', HOLD_UNCONFIRMED)
      : failure('sophia_unreachable', "Sophia did not answer; this run cannot say what the work's attempt did.")
  const common = commonOf(seen)
  if (seen.phase === 'result_ready' && seen.result !== null) {
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      summary: `Source review published (${seen.result.verdict}); result ${seen.result.sourceId}.`,
      ...common,
    }
  }
  return unconfirmed ? failure('sophia_hold_unconfirmed', HOLD_UNCONFIRMED, common) : unfinished(seen, common)
}

/** How many times a start whose answer was lost is asked again: Sophia starts once per run, so asking again reconciles. */
const START_TRIES = 3

/**
 * Start the permitted attempt, `onDispatch` first. A refusal ends the run. A lost answer is asked again under the same
 * run: Sophia's start is idempotent per run (it answers the attempt it already started), so this never starts a second
 * attempt; if Sophia still does not answer, the run observes what Sophia recorded.
 */
async function start(
  ctx: AdapterExecutionContext,
  deps: ExecuteDeps,
  run: CoordinationRunRequest,
): Promise<AdapterExecutionResult | null> {
  if (ctx.signal?.aborted === true) return CANCELLED_BEFORE_START
  ctx.onDispatch?.()
  for (let tries = 1; tries <= START_TRIES; tries += 1) {
    const started = await ask(() => deps.client.start(run))
    if (started?.denied === true)
      return failure(
        `sophia_permit_denied:${started.code ?? 'denied'}`,
        started.reason ?? 'Sophia refused to start the work.',
      )
    if (started !== null) return null
    await deps.sleep(deps.pollMs)
  }
  return null
}

/** Permit, start when permitted to, observe, report. */
/**
 * How long a run keeps asking for its permit while Sophia does not answer, and the waits between asks. Sophia's API may
 * be waking from sleep (a free instance answers its first request after a sleep in more than one 15 s call), and a run
 * that fails for it leaves its issue under the host's recovery hold. Asking again is safe: Sophia answers a run's
 * second permit with the decision it recorded for the first (`coordination_permit`, keyed by the run).
 */
const PERMIT_PATIENCE_MS = 120_000
const PERMIT_WAITS_MS: readonly number[] = [5000, 10_000, 20_000]
const PERMIT_LAST_WAIT_MS = 40_000

async function askPermit(ctx: AdapterExecutionContext, deps: ExecuteDeps, request: CoordinationPermitRequest) {
  const deadline = deps.now() + PERMIT_PATIENCE_MS
  const cancelled = () => ctx.signal?.aborted === true
  for (let asked = 0; ; asked += 1) {
    try {
      return await deps.client.permit(request)
    } catch (err: unknown) {
      const wait = PERMIT_WAITS_MS[asked] ?? PERMIT_LAST_WAIT_MS
      if (!(err instanceof SophiaUnreachable) || cancelled() || deps.now() + wait > deadline) throw err
      await deps.sleep(wait, ctx.signal)
      if (cancelled()) throw err
    }
  }
}

async function permitted(
  ctx: AdapterExecutionContext,
  deps: ExecuteDeps,
  run: CoordinationRunRequest,
  issueId: string,
): Promise<AdapterExecutionResult> {
  const permit = await askPermit(ctx, deps, { ...run, issueId, agentId: ctx.agent.id })
  if (permit.decision === 'deny')
    return failure(`sophia_permit_denied:${permit.code ?? 'denied'}`, permit.reason ?? 'Sophia denied this run.')
  const refused = permit.decision === 'start' ? await start(ctx, deps, run) : null
  if (refused !== null) return refused
  const watched = await watch(ctx, deps, run)
  return report(await ask(() => deps.client.observe({ ...run, final: true })), watched)
}

/** The codes of an ending that is Sophia's definite answer, not a failure of this run. */
const SOPHIA_ANSWERED =
  /^sophia_(held|stopped|withdrawn|review_blocked|review_failed|observer_released|hold_unsettled|stop_unsettled|permit_denied:.+)$/

/**
 * The result as the pinned host should read it (`heartbeat.ts` 25132–25139: exit code 0, no error message, no signal
 * is a succeeded run; anything else failed, unless the host cancelled the run itself). Step 6 above.
 */
export function forHost(result: AdapterExecutionResult, cancelled: boolean): AdapterExecutionResult {
  const code = result.errorCode ?? null
  if (cancelled || code === null || !SOPHIA_ANSWERED.test(code)) return result
  const { errorCode: _code, errorMessage, ...rest } = result
  return {
    ...rest,
    exitCode: 0,
    signal: null,
    timedOut: false,
    summary: errorMessage ?? code,
    resultJson: { ...rest.resultJson, sophiaOutcome: code },
  }
}

export async function execute(ctx: AdapterExecutionContext, deps: ExecuteDeps): Promise<AdapterExecutionResult> {
  const result = await observe(ctx, deps)
  return forHost(result, ctx.signal?.aborted === true)
}

/** The run itself: its issue, its permit, its observation, its report. */
async function observe(ctx: AdapterExecutionContext, deps: ExecuteDeps): Promise<AdapterExecutionResult> {
  const issueId = text(ctx.context.issueId) ?? text(ctx.context.taskId)
  if (issueId === null)
    return failure(
      'sophia_no_issue',
      'This run names no issue; the Sophia adapter runs only issues Sophia commissioned.',
    )
  await ctx.onCancellationReady?.()
  if (ctx.signal?.aborted === true) return CANCELLED_BEFORE_START
  try {
    return await permitted(ctx, deps, { companyId: ctx.agent.companyId, runId: ctx.runId }, issueId)
  } catch (err: unknown) {
    if (err instanceof SophiaRefusal) return failure(`sophia_refused:${err.code}`, err.message)
    if (err instanceof SophiaUnreachable)
      return failure('sophia_unreachable', `${err.message}; nothing was started by this run.`)
    throw err
  }
}
