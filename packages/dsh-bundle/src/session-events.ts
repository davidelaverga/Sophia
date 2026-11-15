/**
 * The bridge's durable journal: command correlation, work fences and held
 * input, one append-only JSONL file per native session in the project's
 * Harness home (`$DSH_HOME/sophia-bridge/<session>.jsonl`), fsynced per record.
 *
 * Why not a dsh session extension event (02_DSH_BOOTSTRAP §5's preference):
 * at the pin, persistence refuses to reload a log holding an out-of-repo event
 * type unless the STORED envelope carries `ignorable: true`, and the public
 * `Session.append` cannot set that marker (only seed events carry it). A
 * Sophia event in the dsh log therefore made the session unloadable after a
 * restart (observed in tests/integration/bridge.test.mjs). The journal keeps
 * the same log-first ordering — record, fsync, then act natively — and
 * reconciliation reads it together with the native history: a record says
 * what was intended, and only the native history (or a `sophia/settled`
 * record written after dsh flushed) says it happened.
 * @module @sophia/dsh-bundle/session-events
 */

import { closeSync, existsSync, fsyncSync, ftruncateSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ReceiptStage, RuntimeCommandKind } from './protocol.js'

/** Where a delivered message was routed. */
export type DeliveryTarget = 'next-turn' | 'next-step'

/** A work fence state; `stopped` is terminal for the attempt. */
export type FenceState = 'active' | 'held' | 'stopped'

/** One held message, retained with its content so Resume can redeliver it. */
export interface StashedMessage {
  readonly messageId: string
  readonly target: DeliveryTarget
  readonly content: readonly ContentBlock[]
}

/**
 * The execution configuration an attempt runs under (SMC-M02 G3,
 * CONTRACT_BINDINGS §5): fixed when the attempt is created and restored as is.
 * The native preset carries the role; its digest covers the preset's
 * definition in this runtime unit and the role's tool policy, so a changed
 * composition is detected, never silently adopted.
 */
export interface ExecutionIdentity {
  readonly runtimeUnitId: string
  readonly preset: { readonly id: string; readonly digest: string }
  readonly route: { readonly provider: string; readonly model: string; readonly reasoningEffort: string | null }
}

/** Journal record payloads by type. */
export interface JournalRecordMap {
  /** A Sophia command reached this session; written before any native action. */
  'sophia/command': {
    commandId: string
    kind: RuntimeCommandKind
    attemptId: string
    authorityEpoch: number
    messageId: string | null
    target: DeliveryTarget | null
    content: ContentBlock[] | null
    /** Native seq at which the command's effect became durable, once known. */
    nativeSeq: number | null
    /** Role the attempt was created under (create only). */
    role: string | null
    /**
     * C2A REPAIR-001 (F03): the executor resource of the command's authenticated binding, recorded with the command
     * before any native action. Application identity only: never a provider id, header or credential. Absent in a
     * record written before it (legacy), which folds as unknown.
     */
    resourceId?: string
  }
  /** The attempt's work fence changed. */
  'sophia/fence': { attemptId: string; authorityEpoch: number; state: FenceState; commandId: string }
  /** Input claimed by a step while held; kept here, not in the live inbox, until Resume. */
  'sophia/stash': { attemptId: string; messages: StashedMessage[] }
  /**
   * Held input redelivered by Resume, written before it is sent: `messageIds`
   * leave the stash, and `messages` are the native messages sent in their
   * place. Reconciliation puts back any of those dsh never received.
   */
  'sophia/unstash': { attemptId: string; commandId: string; messageIds: string[]; messages?: StashedMessage[] }
  /**
   * The native seq at which a command's effect became durable (after dsh
   * flushed), with the receipt it earned, so recovery answers a redelivery
   * with the same stage (a Hold's `checked`, not a generic `delivered`).
   */
  'sophia/settled': { commandId: string; nativeSeq: number | null; stage?: ReceiptStage; reason?: string | null }
  /** A Hold-created continuation recovered after a runtime crash, before native delivery. */
  'sophia/resume-recovery': { attemptId: string; commandId: string; afterNativeSeq: number; message: StashedMessage }
  /** The service acknowledged this session's observations up to `nativeSeq`. */
  'sophia/observed': { nativeSeq: number }
  /** The service acknowledged a command's `incorporation_observed` receipt. */
  'sophia/receipted': { commandId: string; stage: 'incorporation_observed' }
  /** An accepted command that changes no other state (inspect) raised the authority epoch. */
  'sophia/epoch': { attemptId: string; authorityEpoch: number }
  /**
   * The attempt's execution identity, written before the native create. An
   * attempt created by a unit before SMC-M02 has none; its first resume writes
   * one resolved from recorded evidence, with `source: 'migrated'`.
   */
  'sophia/identity': ExecutionIdentity & { attemptId: string; source: 'create' | 'migrated'; evidence: string | null }
  /**
   * A model call made for this attempt, by its own Agent or a child it owns, named another route than the recorded
   * one and was refused before any request (SMC-M03). Audit only: replay ignores it.
   */
  'sophia/route-refused': { attemptId: string; sessionId: string; requested: ExecutionIdentity['route']; reason: string }
  /** A model call refused because its allowance could not reserve it (SMC-M03 S4); audit only, like a route refusal. */
  'sophia/spend-refused': { attemptId: string; sessionId: string; reason: string }
  /** A model call that cost more than it reserved, settled at its cost (M03-RF-0010); audit only. */
  'sophia/spend-overrun': { attemptId: string; sessionId: string; reservationId: string; reservedUsd: number; costUsd: number }
  /** The research attempt entered its finalize step (M03-RF-0011); audit only: a restart enters it again. */
  'sophia/finalize': { attemptId: string; sessionId: string }
}

/** One journal line. */
export type JournalRecord = {
  [K in keyof JournalRecordMap]: { readonly seq: number; readonly time: number; readonly type: K; readonly data: JournalRecordMap[K] }
}[keyof JournalRecordMap]

/** Append-only, fsynced journal files for bridge-owned state. */
export class Journal {
  private readonly next = new Map<string, number>()

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  private path(sessionId: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(sessionId)) throw new Error(`unsafe journal name ${JSON.stringify(sessionId)}`)
    return join(this.dir, `${sessionId}.jsonl`)
  }

  /**
   * @returns every record for the session, in order (empty when none). A
   * torn final line (a crash mid-write) is cut from the file here, before any
   * further append could be concatenated onto it; a newline-terminated line
   * that does not parse is corruption.
   */
  read(sessionId: string): JournalRecord[] {
    const file = this.path(sessionId)
    if (!existsSync(file)) return []
    const bytes = readFileSync(file)
    const lines = bytes.toString('utf8').split('\n')
    const records: JournalRecord[] = []
    for (const [index, line] of lines.entries()) {
      if (line.length === 0) continue
      const last = index === lines.length - 1
      try {
        records.push(JSON.parse(line) as JournalRecord)
        // A complete record whose newline was cut: terminate it.
        if (last) this.repairTail(file, bytes.length, '\n')
      } catch (error) {
        if (!last) throw new Error(`journal ${file} is corrupt at line ${index + 1}: ${(error as Error).message}`)
        this.repairTail(file, bytes.length - Buffer.byteLength(line), '')
      }
    }
    this.next.set(sessionId, (records.at(-1)?.seq ?? -1) + 1)
    return records
  }

  /** Cut the file to `length` bytes, append `suffix`, and fsync. */
  private repairTail(file: string, length: number, suffix: string): void {
    const fd = openSync(file, 'r+')
    try {
      ftruncateSync(fd, length)
      if (suffix) writeSync(fd, suffix, length)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }

  /** Append one record and fsync before returning. */
  append<K extends keyof JournalRecordMap>(sessionId: string, type: K, data: JournalRecordMap[K]): JournalRecord {
    if (!this.next.has(sessionId)) this.read(sessionId)
    const seq = this.next.get(sessionId) ?? 0
    const record = { seq, time: Date.now(), type, data } as JournalRecord
    const fd = openSync(this.path(sessionId), 'a')
    try {
      writeSync(fd, `${JSON.stringify(record)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    this.next.set(sessionId, seq + 1)
    return record
  }
}

/** One journaled command, as reconstructed. */
export interface CommandEntry {
  readonly seq: number
  readonly kind: RuntimeCommandKind
  readonly messageId: string | null
  readonly target: DeliveryTarget | null
  readonly content: readonly ContentBlock[] | null
  readonly nativeSeq: number | null
  /** The receipt the settled command earned (null: before settlement, or a journal without it). */
  readonly stage: ReceiptStage | null
  readonly reason: string | null
  /**
   * True once dsh flushed the command's native effect (`sophia/settled`). An
   * unsettled command was journaled, but a restart may have cut it short
   * before the effect was durable, so it is re-executed, not answered.
   */
  readonly settled: boolean
}

/**
 * An attempt's authenticated executor resource (C2A REPAIR-001 F03), private to the bridge. `unknown`: no authenticated
 * command has named one (a new attempt, or a journal written before the field); `known`: the first valid resource an
 * authenticated command named; `ambiguous`: another resource, an invalid value or another attempt's record was seen for
 * the same attempt. Ambiguity is sticky: nothing clears it, switches it or adopts the latest value. Only `known`
 * authorizes a tracked model reservation.
 */
export type ResourceContext =
  | { readonly state: 'unknown' }
  | { readonly state: 'known'; readonly resourceId: string }
  | { readonly state: 'ambiguous' }

/** The wire shape of a binding's resource id (RuntimeCommand.binding.resourceId). */
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/** No resource is known yet. */
export const UNKNOWN_RESOURCE: ResourceContext = { state: 'unknown' }

/**
 * The context after one more authenticated command's resource (`undefined`: a record without the field, which adds
 * nothing). A known resource is never erased or replaced: a different one, or a value that is not a resource id, makes
 * the context ambiguous for good.
 */
export function foldResource(prior: ResourceContext, resourceId: unknown): ResourceContext {
  if (prior.state === 'ambiguous' || resourceId === undefined) return prior
  if (typeof resourceId !== 'string' || !RESOURCE_ID.test(resourceId)) return { state: 'ambiguous' }
  if (prior.state === 'unknown') return { state: 'known', resourceId }
  return prior.resourceId === resourceId ? prior : { state: 'ambiguous' }
}

/** Reconstructed bridge state for one session. */
export interface LoggedState {
  readonly attemptId: string | null
  /** Role recorded by the attempt's create command. */
  readonly role: string | null
  /** The first recorded execution identity, if any; later records never replace it. */
  readonly identity: JournalRecordMap['sophia/identity'] | null
  /** The attempt's authenticated executor resource from its command records (C2A REPAIR-001 F03). */
  readonly resource: ResourceContext
  /**
   * REPAIR-001 R1 (F04): the attempt that owns this journal (the first owner-typed record's), kept apart from
   * `attemptId`, which is only the last such record's, and whether any later owner-typed record named another attempt.
   * A session's journal belongs to one attempt: a mismatch is a corrupt or misplaced context and stays sticky. Audit-only
   * records (route/spend refusals, overruns, finalize) never own a journal. R2: an owner-typed record whose attemptId is
   * not a string (explicit null included) is an invalid owner and also sets the sticky mismatch.
   */
  readonly owner: string | null
  readonly ownerMismatch: boolean
  readonly authorityEpoch: number
  readonly fence: FenceState
  /** Command id -> its journal record and the message it produced. */
  readonly commands: ReadonlyMap<string, CommandEntry>
  /** Held messages not yet redelivered. */
  readonly stash: readonly StashedMessage[]
  /** Native messages a Resume sent in place of held ones; dsh must confirm each. */
  readonly unstashed: readonly StashedMessage[]
  /** Ids of messages that entered a native step (`user/message` events). */
  readonly incorporated: ReadonlySet<string>
  /** Highest native seq whose observation the service acknowledged (-1: none). */
  readonly observedSeq: number
  /** Commands whose `incorporation_observed` receipt the service acknowledged. */
  readonly incorporationReceipted: ReadonlySet<string>
}

const FENCE_RANK: Readonly<Record<FenceState, number>> = { active: 0, held: 1, stopped: 2 }

/**
 * R1 (F04): the record types whose `attemptId` is the journal's own attempt by their source semantics (the attempt's
 * commands, fences, held input, recovered continuation, epoch and identity). Audit-only records are not owners.
 */
const OWNER_RECORDS: ReadonlySet<JournalRecord['type']> = new Set<JournalRecord['type']>([
  'sophia/command', 'sophia/fence', 'sophia/stash', 'sophia/unstash', 'sophia/resume-recovery', 'sophia/epoch', 'sophia/identity',
])

/** The more restrictive of two fences. */
export function strongestFence(a: FenceState, b: FenceState): FenceState {
  return FENCE_RANK[a] >= FENCE_RANK[b] ? a : b
}

/**
 * Fold the journal and the native history into the bridge's state. Pure:
 * restart reconciliation and tests use the same function.
 * @param journal - the session's journal records.
 * @param events - the session's native event list.
 */
export function foldLog(journal: readonly JournalRecord[], events: readonly SessionEvent[] = []): LoggedState {
  let attemptId: string | null = null
  let role: string | null = null
  let identity: JournalRecordMap['sophia/identity'] | null = null
  let resource: ResourceContext = UNKNOWN_RESOURCE
  /** The attempt whose command first carried a resource; another attempt's record in this session is ambiguous. */
  let resourceAttempt: string | null = null
  let owner: string | null = null
  let ownerMismatch = false
  let authorityEpoch = 0
  let fence: FenceState = 'active'
  const commands = new Map<string, CommandEntry>()
  let stash: StashedMessage[] = []
  let unstashed: StashedMessage[] = []
  let observedSeq = -1
  const incorporationReceipted = new Set<string>()
  for (const record of journal) {
    // R1 F04: the owner is the first owner-typed record's attempt; any later one naming another is a sticky mismatch.
    // R2 (F04 null owner): a non-string attemptId (explicit null included; Journal.read only casts parsed JSON) is an
    // invalid owner, marked sticky BEFORE any adoption, so no later valid-looking row can initialize the owner over it.
    if (OWNER_RECORDS.has(record.type)) {
      const named = (record.data as { attemptId?: unknown }).attemptId
      if (typeof named !== 'string') ownerMismatch = true
      else if (owner === null) owner = named
      else if (named !== owner) ownerMismatch = true
    }
    switch (record.type) {
      case 'sophia/command': {
        const data = record.data
        attemptId = data.attemptId
        role ??= data.role ?? null
        if (data.resourceId !== undefined) {
          resourceAttempt ??= data.attemptId
          resource = resourceAttempt === data.attemptId ? foldResource(resource, data.resourceId) : { state: 'ambiguous' }
        }
        authorityEpoch = Math.max(authorityEpoch, data.authorityEpoch)
        // A re-execution of an unsettled command replaces its first record.
        if (!commands.get(data.commandId)?.settled) {
          commands.set(data.commandId, { seq: record.seq, kind: data.kind, messageId: data.messageId, target: data.target, content: data.content, nativeSeq: data.nativeSeq, stage: null, reason: null, settled: false })
        }
        break
      }
      case 'sophia/fence':
        attemptId = record.data.attemptId
        authorityEpoch = Math.max(authorityEpoch, record.data.authorityEpoch)
        if (fence !== 'stopped') fence = record.data.state
        break
      case 'sophia/stash': {
        const again = new Set(record.data.messages.map((m) => m.messageId))
        stash = [...stash, ...record.data.messages]
        unstashed = unstashed.filter((m) => !again.has(m.messageId))
        break
      }
      case 'sophia/unstash': {
        const done = new Set(record.data.messageIds)
        stash = stash.filter((m) => !done.has(m.messageId))
        unstashed = [...unstashed, ...(record.data.messages ?? [])]
        break
      }
      case 'sophia/settled': {
        const entry = commands.get(record.data.commandId)
        if (entry) commands.set(record.data.commandId, { ...entry, nativeSeq: record.data.nativeSeq, stage: record.data.stage ?? null, reason: record.data.reason ?? null, settled: true })
        break
      }
      case 'sophia/observed':
        observedSeq = Math.max(observedSeq, record.data.nativeSeq)
        break
      case 'sophia/receipted':
        incorporationReceipted.add(record.data.commandId)
        break
      case 'sophia/epoch':
        attemptId = record.data.attemptId
        authorityEpoch = Math.max(authorityEpoch, record.data.authorityEpoch)
        break
      case 'sophia/identity':
        identity ??= record.data
        break
    }
  }
  const incorporated = new Set<string>()
  for (const event of events) {
    if (event.type === 'user/message') incorporated.add((event.data as { id: string }).id)
  }
  // R1 F04: records of more than one attempt are never one attempt's context; a resource from them is ambiguous for good.
  if (ownerMismatch) resource = { state: 'ambiguous' }
  return { attemptId, role, identity, resource, owner, ownerMismatch, authorityEpoch, fence, commands, stash, unstashed, incorporated, observedSeq, incorporationReceipted }
}
