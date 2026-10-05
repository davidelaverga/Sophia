import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type {
  CoordinationObservation,
  CoordinationPermit,
  CoordinationPermitRequest,
  CoordinationRunRequest,
  CoordinationStart,
  CoordinationUsage,
} from '@sophia/contracts'
import { SophiaRefusal, SophiaUnreachable, type SophiaClient } from './client.ts'
import { execute, type ExecuteDeps } from './execute.ts'
import type { AdapterExecutionContext, AdapterExecutionResult } from './types.ts'

const WORK = '00000000-0000-4000-8000-000000000001'
const ATTEMPT = '00000000-0000-4000-8000-000000000002'

type Answer<T> = T | Error
type Call = { readonly op: string; readonly body?: unknown }

interface Script {
  permit?: Answer<CoordinationPermit>
  start?: Answer<CoordinationStart>[]
  observe?: Answer<CoordinationObservation>[]
  cancel?: Answer<CoordinationObservation>[]
}

const usage: CoordinationUsage = {
  calls: 2,
  uncertainCalls: 0,
  inputTokens: 1200,
  outputTokens: 300,
  cachedInputTokens: 100,
  costUsd: 0.000275,
  models: ['gpt-6-luna'],
  providers: ['openai-review'],
  basis: 'per_run',
}

const observation = (
  phase: CoordinationObservation['phase'],
  over: Partial<CoordinationObservation> = {},
): CoordinationObservation => ({
  phase,
  workId: WORK,
  attemptId: ATTEMPT,
  nativeSessionId: 'native-1',
  reason: null,
  result: null,
  usage: null,
  ...over,
})

/** A fake Sophia that answers from a script and records every call in order, beside the run's own events. */
function fakeSophia(script: Script, log: Call[]): SophiaClient {
  const next = <T>(op: string, answers: Answer<T>[] | undefined, body: unknown): Promise<T> => {
    log.push({ op, body })
    const answer = answers && answers.length > 1 ? answers.shift() : answers?.[0]
    if (answer === undefined) return Promise.reject(new SophiaUnreachable(`no scripted ${op}`))
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)
  }
  return {
    permit: (request: CoordinationPermitRequest) =>
      next('permit', script.permit ? [script.permit] : undefined, request),
    start: (request: CoordinationRunRequest) => next('start', script.start, request),
    observe: (request: CoordinationRunRequest) =>
      next(request.final === true ? 'observe-final' : 'observe', script.observe, request),
    cancel: (request: CoordinationRunRequest) => next('cancel', script.cancel, request),
  }
}

function harness(
  script: Script,
  options: { controller?: AbortController; abortAfterObserves?: number; context?: Record<string, unknown> } = {},
) {
  const log: Call[] = []
  let clock = 0
  const controller = options.controller ?? new AbortController()
  let observes = 0
  const deps: ExecuteDeps = {
    client: fakeSophia(script, log),
    pollMs: 1000,
    settleMs: 5000,
    maxRunMs: 60_000,
    now: () => clock,
    sleep: (ms) => {
      clock += ms
      observes += 1
      if (options.abortAfterObserves !== undefined && observes >= options.abortAfterObserves) controller.abort()
      return Promise.resolve()
    },
  }
  const ctx: AdapterExecutionContext = {
    signal: controller.signal,
    onCancellationReady: () => {
      log.push({ op: 'cancellation-ready' })
      return Promise.resolve()
    },
    onDispatch: () => log.push({ op: 'dispatch' }),
    runId: 'run-1',
    agent: { id: 'agent-1', companyId: 'company-a', name: 'Sophia source reviewer' },
    runtime: { sessionParams: null, sessionDisplayId: null },
    config: {},
    context: options.context ?? { issueId: 'issue-1' },
    onLog: () => Promise.resolve(),
  }
  return { log, ops: () => log.map((c) => c.op), run: () => execute(ctx, deps) }
}

const down = () => new SophiaUnreachable('Sophia is unreachable')
/** Sophia's outcome as the run reports it: its own error code, or the outcome a completed run carries. */
const outcome = (result: AdapterExecutionResult): unknown => result.errorCode ?? result.resultJson?.sophiaOutcome

/**
 * How the pinned host reads an adapter result that it did not cancel (`heartbeat.ts` 25132–25139): succeeded when the
 * exit code is 0 or absent, with no error message and no signal; failed otherwise, which leaves the agent in error.
 */
const hostReads = (result: AdapterExecutionResult) =>
  (result.exitCode ?? 0) === 0 && !result.errorMessage && !result.signal ? 'succeeded' : 'failed'

const cancels = (h: ReturnType<typeof harness>) => h.log.filter((c) => c.op === 'cancel')

const start = (): CoordinationPermit => ({ decision: 'start', workId: WORK, state: 'permitted' })
const started = (): CoordinationStart => ({
  workId: WORK,
  attemptId: ATTEMPT,
  nativeSessionId: 'native-1',
  started: true,
})
const published = observation('result_ready', {
  usage,
  result: {
    resultId: 'r1',
    sourceId: 's1',
    sha256: 'a'.repeat(64),
    verdict: 'changes_required',
    findings: 2,
    state: 'current',
  },
})

describe('sophia_dsh execute', () => {
  it('asks Sophia nothing when the run was cancelled before it started (INT-07)', async () => {
    const controller = new AbortController()
    controller.abort()
    const h = harness({ permit: start(), start: [started()], observe: [published] }, { controller })
    const result = await h.run()
    assert.equal(result.errorCode, 'cancelled_before_start')
    assert.deepEqual(h.ops(), ['cancellation-ready'])
  })

  it('opts into cancellation before the permit, dispatches immediately before start, then observes', async () => {
    const h = harness({ permit: start(), start: [started()], observe: [observation('running'), published] })
    const result = await h.run()
    assert.deepEqual(h.ops(), [
      'cancellation-ready',
      'permit',
      'dispatch',
      'start',
      'observe',
      'observe',
      'observe-final',
    ])
    assert.equal(result.exitCode, 0)
    assert.match(result.summary ?? '', /changes_required/)
    assert.equal(
      h.log[1]?.body && JSON.stringify(h.log[1].body),
      JSON.stringify({ companyId: 'company-a', runId: 'run-1', issueId: 'issue-1', agentId: 'agent-1' }),
    )
  })

  it('attaches to a live attempt without dispatching or starting another', async () => {
    const h = harness({
      permit: { decision: 'attach', workId: WORK, attemptId: ATTEMPT, state: 'attached' },
      observe: [published],
    })
    await h.run()
    assert.ok(!h.ops().includes('dispatch'))
    assert.ok(!h.ops().includes('start'))
  })

  it('returns a denial before any effect', async () => {
    const h = harness({ permit: { decision: 'deny', code: 'held', reason: 'The work is held in Sophia.' } })
    const result = await h.run()
    assert.equal(outcome(result), 'sophia_permit_denied:held')
    assert.equal(hostReads(result), 'succeeded', "Sophia's answer, not a failed run: the reviewer stays runnable")
    assert.deepEqual(h.ops(), ['cancellation-ready', 'permit'])
  })

  it('treats an unanswered permit as no decision and starts nothing', async () => {
    const h = harness({ permit: new SophiaUnreachable('timeout') })
    const result = await h.run()
    assert.equal(result.errorCode, 'sophia_unreachable')
    assert.deepEqual(h.ops(), ['cancellation-ready', 'permit'])
  })

  it('reports a refusal by its code', async () => {
    const h = harness({
      permit: new SophiaRefusal(401, 'coordination_capability_required', 'Integration credential required'),
    })
    const result = await h.run()
    assert.equal(result.errorCode, 'sophia_refused:coordination_capability_required')
  })

  it('asks again under the same run when a start answer is lost, never dispatching twice', async () => {
    const h = harness({ permit: start(), start: [new SophiaUnreachable('reset'), started()], observe: [published] })
    const result = await h.run()
    assert.equal(h.ops().filter((op) => op === 'dispatch').length, 1)
    assert.equal(h.ops().filter((op) => op === 'start').length, 2)
    assert.equal(result.exitCode, 0)
  })

  it('returns a start refusal without observing', async () => {
    const h = harness({
      permit: start(),
      start: [{ workId: WORK, denied: true, code: 'allowance_spent', reason: 'The allowance is spent.' }],
    })
    const result = await h.run()
    assert.equal(outcome(result), 'sophia_permit_denied:allowance_spent')
    assert.ok(!h.ops().includes('observe'))
  })

  it('cancels into a Hold and reports held only once Sophia confirms it', async () => {
    const h = harness(
      {
        permit: start(),
        start: [started()],
        observe: [observation('running'), observation('held')],
        cancel: [observation('holding')],
      },
      { abortAfterObserves: 1 },
    )
    const result = await h.run()
    assert.deepEqual(h.ops().slice(0, 6), ['cancellation-ready', 'permit', 'dispatch', 'start', 'observe', 'cancel'])
    assert.equal(result.errorCode, 'sophia_held')
  })

  it('never says held when the Hold did not settle within the wait', async () => {
    const holding = observation('holding')
    const h = harness(
      { permit: start(), start: [started()], observe: [observation('running'), holding], cancel: [holding] },
      { abortAfterObserves: 1 },
    )
    const result = await h.run()
    assert.equal(result.errorCode, 'sophia_hold_unsettled')
    assert.equal(h.ops().filter((op) => op === 'cancel').length, 1)
    assert.ok(h.ops().filter((op) => op === 'observe').length >= 4, 'it waited, observing, for the Hold to settle')
  })

  it('asks again, under the same run, a cancel that never reached Sophia, until it answers (WBC-02-CX-0002)', async () => {
    const h = harness(
      {
        permit: start(),
        start: [started()],
        observe: [observation('running'), observation('held')],
        cancel: [down(), down(), observation('holding')],
      },
      { abortAfterObserves: 1 },
    )
    const result = await h.run()
    assert.equal(cancels(h).length, 3, 'asked until Sophia answered')
    for (const c of cancels(h)) assert.deepEqual(c.body, { companyId: 'company-a', runId: 'run-1' })
    assert.equal(result.errorCode, 'sophia_held')
  })

  it('a cancel whose reply was lost after the Hold arrived is answered by the next one, held', async () => {
    const h = harness(
      {
        permit: start(),
        start: [started()],
        observe: [observation('running'), observation('held')],
        // Sophia held the work on the first cancel; only its reply was lost. The next cancel answers what it holds.
        cancel: [new SophiaUnreachable('reply lost'), observation('holding')],
      },
      { abortAfterObserves: 1 },
    )
    const result = await h.run()
    assert.equal(cancels(h).length, 2)
    assert.equal(result.errorCode, 'sophia_held')
  })

  it('says the Hold is unconfirmed when no cancel reached Sophia within the wait, never released', async () => {
    const h = harness(
      {
        permit: start(),
        start: [started()],
        observe: [observation('running')],
        cancel: [new SophiaUnreachable('Sophia is unreachable')],
      },
      { abortAfterObserves: 1 },
    )
    const result = await h.run()
    assert.equal(result.errorCode, 'sophia_hold_unconfirmed')
    assert.match(result.errorMessage ?? '', /may still be running/)
    assert.ok(cancels(h).length >= 4, 'it kept asking through the settle wait')
    assert.ok(
      !h.ops().slice(h.ops().indexOf('cancel')).includes('observe'),
      'no look took an observation for the cancel',
    )
  })

  it('says the Hold is unconfirmed when Sophia answered nothing after the cancel', async () => {
    const h = harness(
      { permit: start(), start: [started()], observe: [observation('running'), new SophiaUnreachable('down')] },
      { abortAfterObserves: 1 },
    )
    const result = await h.run()
    assert.equal(result.errorCode, 'sophia_hold_unconfirmed')
  })

  it('reports per-run usage, and an unknown cost as null rather than zero', async () => {
    const h = harness({
      permit: start(),
      start: [started()],
      observe: [observation('result_ready', { ...published, usage: { ...usage, uncertainCalls: 1, costUsd: null } })],
    })
    const result = await h.run()
    assert.equal(result.usageBasis, 'per_run')
    assert.equal(result.costUsd, null)
    assert.equal(result.provider, 'openai-review')
    assert.equal(result.model, 'gpt-6-luna')
    assert.deepEqual(result.sessionParams, {
      sophiaWorkId: WORK,
      sophiaAttemptId: ATTEMPT,
      nativeSessionId: 'native-1',
    })
  })

  it('lets go of a long attempt without claiming an outcome', async () => {
    const h = harness({ permit: start(), start: [started()], observe: [observation('running')] })
    const result = await h.run()
    assert.equal(outcome(result), 'sophia_observer_released')
    assert.equal(hostReads(result), 'succeeded')
    assert.equal(result.costUsd, null)
  })

  it('a Hold made in Sophia ends the run as completed, so the reviewer can be woken for the Resume (WBC-02-CX-0007)', async () => {
    const h = harness({ permit: start(), start: [started()], observe: [observation('running'), observation('held')] })
    const result = await h.run()
    assert.equal(hostReads(result), 'succeeded', 'a failed run would leave the managed reviewer in error')
    assert.equal(result.errorMessage, undefined)
    assert.equal(outcome(result), 'sophia_held')
    assert.match(result.summary ?? '', /^Held in Sophia/)
    assert.equal(result.resultJson?.phase, 'held', "Sophia's record of the work is unchanged")
  })

  it('a review that ended blocked, a Stop and a withdrawal complete the run, each saying so', async () => {
    for (const [phase, code] of [
      ['blocked', 'sophia_review_blocked'],
      ['stopped', 'sophia_stopped'],
      ['withdrawn', 'sophia_withdrawn'],
    ] as const) {
      const h = harness({ permit: start(), start: [started()], observe: [observation(phase, { reason: 'why' })] })
      const result = await h.run()
      assert.deepEqual([hostReads(result), outcome(result)], ['succeeded', code])
      assert.match(result.summary ?? '', /why$/)
    }
  })

  it('a run Paperclip cancelled keeps its error: the host records it cancelled, the reviewer stays idle', async () => {
    const h = harness(
      { permit: start(), start: [started()], observe: [observation('running')], cancel: [down()] },
      { abortAfterObserves: 1 },
    )
    const result = await h.run()
    assert.equal(result.errorCode, 'sophia_hold_unconfirmed', 'an unconfirmed Hold is never hidden')
    assert.ok(result.errorMessage)
  })

  it('a run that could not work with Sophia at all fails, for an operator', async () => {
    const unreachable = await harness({ permit: new SophiaUnreachable('down') }).run()
    assert.deepEqual([hostReads(unreachable), unreachable.errorCode], ['failed', 'sophia_unreachable'])
    const refused = await harness({ permit: new SophiaRefusal(401, 'unauthenticated', 'no') }).run()
    assert.equal(hostReads(refused), 'failed')
  })

  it('runs only issue-driven runs', async () => {
    const h = harness({ permit: start() }, { context: {} })
    const result = await h.run()
    assert.equal(result.errorCode, 'sophia_no_issue')
    assert.deepEqual(h.ops(), [])
  })
})
