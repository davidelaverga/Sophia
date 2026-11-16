/**
 * A FAKE T3 transport for tests: an in-memory stand-in that derives identities the way the pin does
 * (t3-port-mapping.ts) and counts every native effect. Synthetic only: it proves the gateway's and the service's
 * transitions, never that a T3 install, an account or a provider works. It is never a live transport.
 *
 * Its launch takes the pin's optional `workspaceStrategy` and `modelSelection` in their exact shapes
 * (packages/contracts/src/orchestrationV2.ts:654-670, modelSelection.ts:9-50; refused `invalid_request` before any effect
 * otherwise) and echoes the thread's stored selection as the pin's launch result does (project/tools.ts:157-164). Like
 * the pin, the echo is the thread's selection, not what a run used, and nothing checks out a base here.
 * @module @sophia/coordination/runner-fake-t3
 */
import { launchCommandId, stableMessageId, type T3Call, type T3Reply, type T3Transport } from './t3-port-mapping.ts'

interface FakeRun {
  runId: string
  status: string
}
interface FakeMessage {
  messageId: string
  runId: string
}
interface FakeThread {
  threadId: string
  projectId: string
  runs: FakeRun[]
  messages: FakeMessage[]
  /** What the launch asked for, as given: the pin keeps both on the thread. */
  workspaceStrategy: unknown
  modelSelection: unknown
}

/** The selection a fake thread gets when its launch names none: a stand-in for T3's project defaults, never real. */
export const FAKE_DEFAULT_SELECTION = { instanceId: 'fake-default', model: 'fake-default-model' } as const

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nonBlank = (v: unknown) => typeof v === 'string' && v.trim().length > 0
const keysIn = (v: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(v).every((k) => allowed.includes(k))

/** The pin's OrchestrationV2ThreadLaunchWorkspaceStrategy, or false. */
function workspaceOk(v: unknown): boolean {
  if (!isObj(v)) return false
  if (v.type === 'root') return keysIn(v, ['type', 'branch'])
  if (v.type === 'existing_worktree') return keysIn(v, ['type', 'worktreePath', 'branch']) && nonBlank(v.worktreePath)
  if (v.type !== 'worktree' || !keysIn(v, ['type', 'baseRef', 'branch', 'startFromOrigin'])) return false
  return nonBlank(v.baseRef) && (v.startFromOrigin === undefined || typeof v.startFromOrigin === 'boolean')
}

/** The pin's ModelSelection: a slug instance, a model, and options of {id, value: non-blank text or boolean}. */
function selectionOk(v: unknown): boolean {
  if (!isObj(v) || !keysIn(v, ['instanceId', 'model', 'options'])) return false
  if (typeof v.instanceId !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(v.instanceId) || !nonBlank(v.model))
    return false
  if (v.options === undefined) return true
  return (
    Array.isArray(v.options) &&
    v.options.every(
      (o: unknown) =>
        isObj(o) && keysIn(o, ['id', 'value']) && nonBlank(o.id) && (typeof o.value === 'boolean' || nonBlank(o.value)),
    )
  )
}

/** A fault for the next call of a tool: answered with a typed failure, lost after (or before) the effect, or altered. */
export type FakeFault =
  | { readonly kind: 'failure'; readonly code: string }
  | { readonly kind: 'lose_after_effect' }
  | { readonly kind: 'lose_before_effect' }
  | { readonly kind: 'deliver_as'; readonly delivery: 'steered' | 'restarted' }
  /** A read answered `ok` with an empty object: no evidence of anything. */
  | { readonly kind: 'malformed_read' }
  /** A read answered for another thread. */
  | { readonly kind: 'foreign_read' }

const ACTIVE = ['preparing', 'queued', 'starting', 'running', 'waiting']
/** T3's isActiveRun at the pin: `queued` is not active there (ThreadManagementService.ts). */
const T3_ACTIVE = ['preparing', 'starting', 'running', 'waiting']

/** The reply a fault gives before any effect is applied, or null when the call goes ahead. */
function before(fault: FakeFault): T3Reply | null {
  if (fault.kind === 'failure') return { kind: 'failure', code: fault.code, message: `fake ${fault.code}` }
  if (fault.kind === 'lose_before_effect')
    return { kind: 'transport_error', reason: 'fake connection reset before the request' }
  return fault.kind === 'malformed_read' ? { kind: 'ok', body: {} } : null
}

export class FakeT3 implements T3Transport {
  /** Every call made, by tool. */
  readonly calls: T3Call[] = []
  /** Native effects actually applied: threads launched, messages accepted, stops applied. */
  readonly effects = { launches: 0, messages: 0, stops: 0 }
  readonly threads = new Map<string, FakeThread>()
  private session: string
  private runSeq = 0
  private readonly faults = new Map<string, FakeFault[]>()
  /** A read answers at most this many items per page, so tests can make a message fall past the bounded pages. */
  pageSize = 100

  constructor(namespace = 'client:fake-session-1') {
    this.session = namespace
  }

  namespace(): string {
    return this.session
  }

  /** A re-authorized MCP client: a new namespace, so the same key would be new work. */
  renewSession(namespace: string): void {
    this.session = namespace
  }

  inject(tool: T3Call['tool'], fault: FakeFault): void {
    const list = this.faults.get(tool) ?? []
    list.push(fault)
    this.faults.set(tool, list)
  }

  /** End a run, as the native agent finishing (or failing) would. */
  finishRun(runId: string, status = 'completed'): void {
    for (const t of this.threads.values()) for (const r of t.runs) if (r.runId === runId) r.status = status
  }

  count(tool: T3Call['tool']): number {
    return this.calls.filter((c) => c.tool === tool).length
  }

  private nextRun(status: string): FakeRun {
    this.runSeq += 1
    return { runId: `run-${this.runSeq}`, status }
  }

  async call(call: T3Call): Promise<T3Reply> {
    this.calls.push(call)
    await Promise.resolve()
    const fault = this.faults.get(call.tool)?.shift()
    const early = fault ? before(fault) : null
    if (early) return early
    const reply = this.apply(call, fault?.kind === 'deliver_as' ? fault.delivery : null, fault?.kind === 'foreign_read')
    return fault?.kind === 'lose_after_effect'
      ? { kind: 'transport_error', reason: 'fake connection reset after the request' }
      : reply
  }

  private apply(call: T3Call, deliverAs: string | null, foreignRead = false): T3Reply {
    if (call.tool === 't3_thread_launch') return this.launch(call.args)
    const thread = this.threads.get(String(call.args.threadId))
    if (!thread) return { kind: 'failure', code: 'thread_not_found', message: 'fake thread_not_found' }
    if (call.tool === 't3_thread_send') return this.send(thread, call.args, deliverAs)
    if (call.tool === 't3_thread_interrupt') return this.interrupt(thread)
    return this.read(thread, call.args, foreignRead)
  }

  private launch(a: T3Call['args']): T3Reply {
    const threadId = launchCommandId(this.session, String(a.clientRequestId))
    let thread = this.threads.get(threadId)
    if (!thread) {
      // The pin decodes its input before anything happens: a malformed strategy or selection is no effect at all.
      if (a.workspaceStrategy !== undefined && !workspaceOk(a.workspaceStrategy))
        return { kind: 'failure', code: 'invalid_request', message: 'fake: malformed workspaceStrategy' }
      if (a.modelSelection !== undefined && !selectionOk(a.modelSelection))
        return { kind: 'failure', code: 'invalid_request', message: 'fake: malformed modelSelection' }
      const run = this.nextRun('running')
      thread = {
        threadId,
        projectId: String(a.projectId),
        runs: [run],
        messages: [{ messageId: threadId, runId: run.runId }],
        workspaceStrategy: a.workspaceStrategy ?? { type: 'root' },
        modelSelection: a.modelSelection ?? FAKE_DEFAULT_SELECTION,
      }
      this.threads.set(threadId, thread)
      this.effects.launches += 1
    }
    const run = thread.runs[0]
    return {
      kind: 'ok',
      body: {
        threadId,
        projectId: thread.projectId,
        modelSelection: thread.modelSelection,
        runId: run?.runId ?? null,
        status: run?.status ?? null,
      },
    }
  }

  private send(thread: FakeThread, a: T3Call['args'], deliverAs: string | null): T3Reply {
    const messageId = stableMessageId(this.session, 'thread-send', String(a.clientRequestId))
    let message = thread.messages.find((m) => m.messageId === messageId)
    let delivery = 'queued'
    if (!message) {
      const busy = thread.runs.some((r) => ACTIVE.includes(r.status))
      const run = this.nextRun(busy ? 'queued' : 'running')
      delivery = busy ? 'queued' : 'started'
      thread.runs.push(run)
      message = { messageId, runId: run.runId }
      thread.messages.push(message)
      this.effects.messages += 1
    }
    const runId = message.runId
    const status = thread.runs.find((r) => r.runId === runId)?.status
    return {
      kind: 'ok',
      body: { threadId: thread.threadId, messageId, runId, status, delivery: deliverAs ?? delivery },
    }
  }

  private interrupt(thread: FakeThread): T3Reply {
    const active = thread.runs.filter((r) => ACTIVE.includes(r.status))
    if (active.length === 0)
      return { kind: 'ok', body: { threadId: thread.threadId, runId: null, status: 'no_active_run' } }
    // Stop: the running turn is interrupted (it settles later), queued turns are held.
    for (const r of active) if (r.status !== 'running') r.status = 'cancelled'
    this.effects.stops += 1
    return {
      kind: 'ok',
      body: { threadId: thread.threadId, runId: active[0]?.runId ?? null, status: 'interrupt_requested' },
    }
  }

  private read(thread: FakeThread, a: T3Call['args'], foreign = false): T3Reply {
    const after = typeof a.afterPosition === 'number' ? a.afterPosition : 0
    const runLimit = typeof a.runLimit === 'number' ? a.runLimit : 50
    const items = thread.messages.map((m, position) => ({ position, messageId: m.messageId, runId: m.runId }))
    const hasMore = after + this.pageSize < items.length
    const active = thread.runs.filter((r) => T3_ACTIVE.includes(r.status)).at(-1)
    return {
      kind: 'ok',
      body: {
        thread: {
          threadId: foreign ? `${thread.threadId}-other` : thread.threadId,
          activeRunId: active?.runId ?? null,
          latestRunId: thread.runs.at(-1)?.runId ?? null,
          runCount: thread.runs.length,
          // The pin's user-interface marker: never evidence of run settlement.
          settled: true,
        },
        // Newest first, as the pin's recentRuns (sorted by descending ordinal, then cut to runLimit); repair 12.
        recentRuns: thread.runs
          .slice(-runLimit)
          .toReversed()
          .map((r) => ({ runId: r.runId, status: r.status })),
        items: items.slice(after, after + this.pageSize),
        hasMore,
        nextPosition: hasMore ? after + this.pageSize : null,
      },
    }
  }
}
