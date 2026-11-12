/**
 * The SophiaRunnerPort's mapping onto T3 Code's MCP tools at the inspected pin (pingdotgg/t3code
 * ade473018d32003658b7d38693e083ee2e314bd8, docs/SOURCE_MAP.md). Pure: it builds the only calls the gateway may make
 * and classifies their replies. It derives each native identity exactly as T3 does, so a lost reply is reconciled by
 * the original identity and never by text:
 *   - t3_thread_launch (toolkits/project/handlers.ts launchCommandId): command, thread and message id are all
 *     `mcp:launch:<sha256 hex of JSON.stringify([requestNamespace, clientRequestId])>`.
 *   - t3_thread_send and t3_thread_interrupt (OrchestratorMcpService.ts stableCommandId / stableOperationMessageId):
 *     `command|message:mcp:<enc(namespace)>:<operation>:<enc(key)>`, each segment encodeURIComponent-ed.
 * The namespace is the provider session (McpSessionRegistry) or `client:<MCP client session id>` (McpOAuth). A new
 * namespace with the same key is new work at T3, so an uncertain operation is never sent again under one.
 * @module @sophia/coordination/t3-port-mapping
 */
import { createHash } from 'node:crypto'
import {
  envelopeV2,
  type NativeIdentity,
  type RunnerAnswer,
  type RunnerDelivery,
  type RunnerEnvelope,
  type RunnerPayload,
} from './runner-port.ts'

export const T3_SOURCE_PIN = 'ade473018d32003658b7d38693e083ee2e314bd8'

/** The only tools a gateway may call. No other name can be built, whatever a request carries. */
export const T3_TOOLS = ['t3_thread_launch', 't3_thread_send', 't3_thread_interrupt', 't3_thread_read'] as const
export type T3Tool = (typeof T3_TOOLS)[number]

export interface T3Call {
  readonly tool: T3Tool
  readonly args: Readonly<Record<string, unknown>>
}

/**
 * What a transport answers: T3's success body, its typed OrchestratorMcpFailure, or no certain answer (a timeout, a
 * reset, a malformed reply).
 */
export type T3Reply =
  | { readonly kind: 'ok'; readonly body: unknown }
  | { readonly kind: 'failure'; readonly code: string; readonly message: string }
  | { readonly kind: 'transport_error'; readonly reason: string }

/** The owner host's authenticated MCP session. The gateway never sees its credential, only its namespace. */
export interface T3Transport {
  /** The request namespace T3 derives identities under for this session, as the host observes it. */
  namespace(): string
  call(call: T3Call): Promise<T3Reply>
}

/** Read-only qualification profile: T3 runtime mode under which Codex's adapter defaults to a read-only sandbox. */
export const T3_RUNTIME_MODE = 'approval-required'
export const T3_READ_PAGE = 100
export const T3_RUN_LIMIT = 50

/** Statuses of a run that has ended (OrchestrationV2RunStatus at the pin). */
const TERMINAL = new Set(['completed', 'interrupted', 'failed', 'cancelled', 'rolled_back'])
const ACTIVE = new Set(['preparing', 'queued', 'starting', 'running', 'waiting'])
/** T3's isActiveRun at the pin (ThreadManagementService 506-513): exactly these; `queued` and terminal are not active. */
const PROVIDER_ACTIVE = new Set(['preparing', 'starting', 'running', 'waiting'])
export const isTerminalRun = (status: string): boolean => TERMINAL.has(status)

/**
 * OrchestratorMcpFailure codes that T3 returns before dispatching anything. `orchestration_error` and any code not
 * listed may follow a partial effect, so they stay unknown. Live qualification must confirm these are pre-effect.
 */
const DEFINITE_REFUSALS = new Set([
  'capability_denied',
  'parent_not_active',
  'provider_unavailable',
  'model_unavailable',
  'runtime_mode_escalation_denied',
  'interaction_mode_escalation_denied',
  'thread_not_found',
  'run_not_found',
  'thread_not_sendable',
  'thread_not_interruptible',
  'invalid_request',
])

/**
 * Repair 1 (CC005-E7-F01): a native code is named in a diagnostic only when it is one the pin defines and this mapping
 * lists; nothing else a runner or transport says (a failure's message, an unlisted code, a delivery or status, a
 * transport or thrown error's text) is ever copied into an answer, a journal record, a reason or a view. It may echo
 * the private instruction it was sent.
 */
const KNOWN_CODES = new Set([...DEFINITE_REFUSALS, 'orchestration_error'])
export const codeLabel = (code: unknown): string =>
  typeof code === 'string' && KNOWN_CODES.has(code) ? code : 'an unlisted code'
const KNOWN_DELIVERIES = new Set(['auto', 'steered', 'restarted'])
/** The fixed diagnostic of an uncertain call: the reply was lost, or the transport failed or threw. */
export const NO_CERTAIN_ANSWER = 'no certain answer: the call failed or its reply was lost'

/** The key T3 derives identities from: Sophia's global operation id, never a member's idempotency key. */
export const clientRequestIdOf = (operationId: string): string => `sophia:${operationId}`

export function launchCommandId(namespace: string, key: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([namespace, key]), 'utf8')
    .digest('hex')
  return `mcp:launch:${digest}`
}

const enc = encodeURIComponent
export const stableCommandId = (namespace: string, operation: string, key: string): string =>
  ['command', 'mcp', enc(namespace), enc(operation), enc(key)].join(':')
export const stableMessageId = (namespace: string, operation: string, key: string): string =>
  ['message', 'mcp', enc(namespace), enc(operation), enc(key)].join(':')

/** The identities T3 will give this operation's call under `namespace`, derived before the call. */
export function deriveIdentity(envelope: RunnerEnvelope, namespace: string): NativeIdentity {
  const key = clientRequestIdOf(envelope.operationId)
  if (envelope.kind === 'create') {
    const id = launchCommandId(namespace, key)
    return { namespace, commandId: id, messageId: id, threadId: id }
  }
  const threadId = envelope.nativeThreadId ?? ''
  if (envelope.kind === 'input') {
    return {
      namespace,
      commandId: stableCommandId(namespace, 'thread-send', key),
      messageId: stableMessageId(namespace, 'thread-send', key),
      threadId,
    }
  }
  return { namespace, commandId: stableCommandId(namespace, 'thread-stop', key), messageId: null, threadId }
}

/**
 * The one call an operation maps to. An input is always queued: never auto, steer or restart.
 *
 * A v2 envelope (0096) carries no text: its instruction is `payload`, which the gateway checked against the envelope's
 * digest before calling this. A v2 create also asks for its requested base and settings in the pin's exact shapes:
 * `workspaceStrategy: {type: "worktree", baseRef}` (packages/contracts/src/orchestrationV2.ts:654-670) and
 * `modelSelection: {instanceId, model, options: [{id, value}]}` (modelSelection.ts:9-50), both accepted by
 * t3_thread_launch (apps/server/src/mcp/toolkits/project/tools.ts:124-164). t3_thread_send takes neither
 * (orchestratorMcp.ts:501-513): an input runs in its create's thread. Asking is not proof: T3's base check is
 * permissive and its echo of the selection is the thread's stored one, never what a run used.
 */
export function callFor(envelope: RunnerEnvelope, environmentId: string, payload?: RunnerPayload): T3Call {
  const clientRequestId = clientRequestIdOf(envelope.operationId)
  const v2 = envelopeV2(envelope)
  if (v2) {
    if (!payload) throw new Error('a v2 envelope is sent with its checked payload')
    if (v2.kind === 'input') {
      return {
        tool: 't3_thread_send',
        args: { environmentId, threadId: v2.nativeThreadId, message: payload.message, mode: 'queue', clientRequestId },
      }
    }
    return {
      tool: 't3_thread_launch',
      args: {
        environmentId,
        projectId: v2.nativeProjectRef,
        title: payload.title,
        message: payload.message,
        runtimeMode: T3_RUNTIME_MODE,
        workspaceStrategy: { type: 'worktree', baseRef: v2.baseCommit },
        modelSelection: {
          instanceId: v2.settings.instanceId,
          model: v2.settings.model,
          options: v2.settings.options.map((o) => ({ id: o.id, value: o.value })),
        },
        clientRequestId,
      },
    }
  }
  if (envelope.kind === 'create') {
    return {
      tool: 't3_thread_launch',
      args: {
        environmentId,
        projectId: envelope.nativeProjectRef,
        title: envelope.title,
        message: envelope.message,
        runtimeMode: T3_RUNTIME_MODE,
        clientRequestId,
      },
    }
  }
  if (envelope.kind === 'input') {
    return {
      tool: 't3_thread_send',
      args: {
        environmentId,
        threadId: envelope.nativeThreadId,
        message: envelope.message,
        mode: 'queue',
        clientRequestId,
      },
    }
  }
  return {
    tool: 't3_thread_interrupt',
    args: { environmentId, threadId: envelope.nativeThreadId, stop: true, clientRequestId },
  }
}

/** A bounded read of one thread's messages and runs, from `afterPosition`. Observation only: it starts no turn. */
export const readCall = (environmentId: string, threadId: string, afterPosition?: number): T3Call => ({
  tool: 't3_thread_read',
  args: {
    environmentId,
    threadId,
    view: 'messages',
    limit: T3_READ_PAGE,
    runLimit: T3_RUN_LIMIT,
    ...(afterPosition === undefined ? {} : { afterPosition }),
  },
})

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
/** An entity id at the pin (RunId, MessageId: a trimmed, non-blank string), or null when it is not one. */
const entityId = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null)
/**
 * A result's run field (integrated r3, F01): `run` is a run id, `none` an explicit null, `invalid` anything else: a
 * missing key, a non-string, an empty or blank string. Only `run` is evidence that a run was accepted.
 */
function runField(
  body: Record<string, unknown>,
): { kind: 'run'; runId: string } | { kind: 'none' } | { kind: 'invalid' } {
  if (!('runId' in body)) return { kind: 'invalid' }
  if (body.runId === null) return { kind: 'none' }
  const runId = entityId(body.runId)
  return runId === null ? { kind: 'invalid' } : { kind: 'run', runId }
}

const unknownWith = (identity: NativeIdentity, reason: string): RunnerAnswer => ({ kind: 'unknown', identity, reason })

/**
 * An input's receipt: queued or started only; a stronger delivery is an effect, but not the one admitted. Its run must be
 * a run id (the pin's send result never omits it): anything else proves no accepted run, so the input stays unknown.
 */
function inputAnswer(identity: NativeIdentity, body: Record<string, unknown>): RunnerAnswer {
  if (str(body.messageId) !== identity.messageId) return unknownWith(identity, 'T3 answered with another message')
  const run = runField(body)
  if (run.kind !== 'run')
    return unknownWith(identity, 'T3 named no valid run for the message; no accepted run is proven')
  const runId = run.runId
  const delivery = body.delivery
  if (delivery === 'queued' || delivery === 'started') return { kind: 'received', identity, runId, delivery }
  return {
    kind: 'unknown',
    identity,
    reason: `T3 reported ${typeof delivery === 'string' && KNOWN_DELIVERIES.has(delivery) ? `a ${delivery}` : 'another'} delivery; queue was requested`,
    violation: true,
  }
}

/** A stop's acknowledgement: requested, nothing to stop, or already ended. Never its settlement. */
function stopDelivery(status: unknown): RunnerDelivery | null {
  if (status === 'interrupt_requested') return 'stop_requested'
  if (status === 'no_active_run') return 'no_active_run'
  return typeof status === 'string' && TERMINAL.has(status) ? 'already_ended' : null
}

/** Classify a reply to the operation's own call, against the identities derived before it was made. */
export function classifyReply(envelope: RunnerEnvelope, identity: NativeIdentity, reply: T3Reply): RunnerAnswer {
  if (reply.kind === 'transport_error') return unknownWith(identity, NO_CERTAIN_ANSWER)
  if (reply.kind === 'failure') {
    return DEFINITE_REFUSALS.has(reply.code)
      ? { kind: 'rejected', identity, code: reply.code, reason: 'refused before any effect' }
      : unknownWith(identity, `T3 failed with ${codeLabel(reply.code)}; an effect is not ruled out`)
  }
  const body = reply.body
  if (!isRecord(body)) return unknownWith(identity, 'T3 answered without a result')
  if (str(body.threadId) !== identity.threadId) return unknownWith(identity, 'T3 answered for another thread')
  if (envelope.kind === 'input') return inputAnswer(identity, body)
  const run = runField(body)
  // Sophia always launches with a message, so a create's receipt needs its run; a null one (an idle launch) proves none.
  if (envelope.kind === 'create') {
    return run.kind === 'run'
      ? { kind: 'received', identity, runId: run.runId, delivery: 'started' }
      : unknownWith(identity, 'T3 named no valid run for the launch; no accepted run is proven')
  }
  // A Stop's acknowledgement may name no run (no_active_run); a run it names must be a run id.
  if (run.kind === 'invalid') return unknownWith(identity, 'T3 answered the stop with a malformed run')
  const delivery = stopDelivery(body.status)
  return delivery
    ? { kind: 'received', identity, runId: run.kind === 'run' ? run.runId : null, delivery }
    : unknownWith(identity, 'T3 answered an unknown stop status')
}

/**
 * One decoded page of `t3_thread_read` (OrchestratorMcpThreadReadResult at the pin): the thread's own detail, its
 * recent runs and the page's items. Decoded strictly (R1-F04): a reply that is not this exact thread's read, or whose
 * fields are missing or of the wrong type, is no evidence at all.
 */
export interface ThreadRead {
  readonly threadId: string
  /** The latest run in preparing, starting, running or waiting (T3 isActiveRun). `queued` is not counted by T3. */
  readonly activeRunId: string | null
  /** How many runs the thread has in all; `recentRuns` is limited by `runLimit`. */
  readonly runCount: number
  readonly runs: ReadonlyMap<string, string>
  /** The items of this page, by exact message id, with the run each started. */
  readonly messages: ReadonlyMap<string, string | null>
  readonly nextPosition: number | null
}

const nonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

/**
 * The read's recent runs by exact run id. Repair 9 (NATIVE8-F01): a run id is an entity id, as on items and replies; a
 * missing, null, non-string, empty or whitespace-only one makes the page no evidence. It is never trimmed or dropped.
 */
function runsIn(list: unknown): Map<string, string> | null {
  if (!Array.isArray(list)) return null
  const runs = new Map<string, string>()
  for (const run of list) {
    const id = isRecord(run) ? entityId(run.runId) : null
    const status = isRecord(run) ? str(run.status) : null
    if (!id || !status || runs.has(id)) return null
    runs.set(id, status)
  }
  return runs
}

/**
 * The page's items by exact message id, with the run each names (OrchestratorMcpThreadTimelineItem: `runId` and
 * `messageId` are required and nullable). Integrated r3 (F01): an item whose `runId` or non-null `messageId` is not a
 * valid id (missing, not a string, empty or blank) makes the page no evidence; it is never turned into null. An explicit
 * null stays null: it names no run.
 */
function messagesIn(list: unknown): Map<string, string | null> | null {
  if (!Array.isArray(list)) return null
  const messages = new Map<string, string | null>()
  for (const item of list) {
    const row = itemOf(item)
    if (row === null) return null
    if (row.messageId === null) continue
    // Repair 10 (NATIVE9-F01): the pin does not make message ids unique across rows, so the same association repeated is
    // coherent; but one message named with no run and with a run, or with two runs, is no evidence in either order.
    if (messages.has(row.messageId) && messages.get(row.messageId) !== row.runId) return null
    messages.set(row.messageId, row.runId)
  }
  return messages
}

/** One timeline row's message id and run id (each may be null), or null when either is malformed. */
function itemOf(item: unknown): { messageId: string | null; runId: string | null } | null {
  if (!isRecord(item) || !('messageId' in item)) return null
  const messageId = item.messageId === null ? null : entityId(item.messageId)
  if (item.messageId !== null && messageId === null) return null
  const run = runField(item)
  if (run.kind === 'invalid') return null
  return { messageId, runId: run.kind === 'run' ? run.runId : null }
}

/** The thread detail of the read (OrchestratorMcpThreadDetail): exactly `threadId`, its activeRunId and runCount. */
function detailOf(
  thread: unknown,
  threadId: string,
): { activeRunId: string | null; runCount: number } | { error: string } {
  if (!isRecord(thread)) return { error: 'the read has no thread' }
  if (str(thread.threadId) !== threadId) return { error: 'the read is of another thread' }
  // Repair 9 (NATIVE8-F01): a non-null active run is an entity id too; null alone is the idle answer.
  const activeRunId = thread.activeRunId === null ? null : entityId(thread.activeRunId)
  if (thread.activeRunId !== null && activeRunId === null) return { error: 'the read has no activeRunId' }
  if (!nonNegative(thread.runCount)) return { error: 'the read has no runCount' }
  return { activeRunId, runCount: thread.runCount }
}

/**
 * Repair 10 (NATIVE9-F02): at the pin runCount, activeRunId and recentRuns come from the same runs. So more listed runs
 * than counted, or a complete list without its active run, is a summary inconsistent with itself: no evidence. A
 * truncated list may omit the active run.
 */
function summaryError(
  runs: Map<string, string>,
  detail: { activeRunId: string | null; runCount: number },
): string | null {
  if (runs.size > detail.runCount) return 'the read lists more runs than it counts'
  if (runs.size === detail.runCount && detail.activeRunId !== null && !runs.has(detail.activeRunId))
    return 'the read lists every run but not its active run'
  return activeStatusError(runs, detail.activeRunId)
}

/**
 * Repair 11 (NATIVE10-F02 and its pinned sibling): T3 names as active the latest run whose status is one of
 * PROVIDER_ACTIVE, from the same runs it lists. So a listed active run must have such a status, and with no active run
 * no listed run may have one; either contradiction makes the page no evidence, complete or truncated.
 */
function activeStatusError(runs: Map<string, string>, activeRunId: string | null): string | null {
  if (activeRunId === null) {
    return [...runs.values()].some((status) => PROVIDER_ACTIVE.has(status))
      ? 'the read names no active run but lists one'
      : null
  }
  const status = runs.get(activeRunId)
  return status === undefined || PROVIDER_ACTIVE.has(status)
    ? null
    : 'the read names an active run it lists as not active'
}

/** The decoded read of exactly `threadId`, or why it is not evidence. */
export function decodeThreadRead(body: unknown, threadId: string): ThreadRead | { error: string } {
  if (!isRecord(body)) return { error: 'the read is not an object' }
  const detail = detailOf(body.thread, threadId)
  if ('error' in detail) return detail
  const runs = runsIn(body.recentRuns)
  const messages = messagesIn(body.items)
  if (!runs || !messages) return { error: 'the read has malformed runs or items' }
  const summary = summaryError(runs, detail)
  if (summary) return { error: summary }
  const next = nextOf(body)
  if (typeof next === 'object' && next !== null) return next
  return { threadId, ...detail, runs, messages, nextPosition: next }
}

/** The read's next page position (null when it has no more), or why its paging fields are malformed. */
function nextOf(body: Record<string, unknown>): number | null | { error: string } {
  if (typeof body.hasMore !== 'boolean') return { error: 'the read has no hasMore' }
  const next = body.nextPosition === null ? null : nonNegative(body.nextPosition) ? body.nextPosition : undefined
  if (next === undefined || (body.hasMore && next === null)) return { error: 'the read has a malformed nextPosition' }
  return body.hasMore ? next : null
}

/** Whether the read shows every run of the thread (none cut off by `runLimit`). */
export const runsComplete = (read: ThreadRead): boolean => read.runs.size === read.runCount

/**
 * Positive Stop settlement: the exact thread, no active run, every run visible and every one in a known terminal
 * status. A `queued` (held) run is unsettled work; an unknown status is not evidence. T3's `settled` flag is a
 * user-interface marker at the pin and is never read.
 */
export function stopSettled(read: ThreadRead): boolean {
  return read.activeRunId === null && runsComplete(read) && [...read.runs.values()].every((s) => TERMINAL.has(s))
}

/** A run's state in a read: terminal, still going, or no evidence (absent, or a status this mapping does not know). */
export function runState(read: ThreadRead, runId: string): 'terminal' | 'running' | 'unknown' {
  const status = read.runs.get(runId)
  if (status === undefined) return 'unknown'
  if (TERMINAL.has(status)) return 'terminal'
  return ACTIVE.has(status) ? 'running' : 'unknown'
}
