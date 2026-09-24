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
 * reconciliation reads it together with the native history.
 * @module @sophia/dsh-bundle/session-events
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { RuntimeCommandKind } from './protocol.js'

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
  }
  /** The attempt's work fence changed. */
  'sophia/fence': { attemptId: string; authorityEpoch: number; state: FenceState; commandId: string }
  /** Input claimed by a step while held; kept here, not in the live inbox, until Resume. */
  'sophia/stash': { attemptId: string; messages: StashedMessage[] }
  /** Held input redelivered by Resume. */
  'sophia/unstash': { attemptId: string; commandId: string; messageIds: string[] }
  /** The native seq at which a command's effect became durable (after dsh flushed). */
  'sophia/settled': { commandId: string; nativeSeq: number | null }
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

  /** @returns every record for the session, in order (empty when none). */
  read(sessionId: string): JournalRecord[] {
    const file = this.path(sessionId)
    if (!existsSync(file)) return []
    const lines = readFileSync(file, 'utf8').split('\n')
    const records: JournalRecord[] = []
    for (const [index, line] of lines.entries()) {
      if (line.length === 0) continue
      try {
        records.push(JSON.parse(line) as JournalRecord)
      } catch (error) {
        // Only a torn final line (crash mid-write) is tolerated.
        if (index < lines.length - 2) throw new Error(`journal ${file} is corrupt at line ${index + 1}: ${(error as Error).message}`)
      }
    }
    this.next.set(sessionId, (records.at(-1)?.seq ?? -1) + 1)
    return records
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

/** Reconstructed bridge state for one session. */
export interface LoggedState {
  readonly attemptId: string | null
  readonly authorityEpoch: number
  readonly fence: FenceState
  /** Command id -> its journal record and the message it produced. */
  readonly commands: ReadonlyMap<string, { seq: number; kind: RuntimeCommandKind; messageId: string | null; nativeSeq: number | null }>
  /** Held messages not yet redelivered. */
  readonly stash: readonly StashedMessage[]
  /** Ids of messages that entered a native step (`user/message` events). */
  readonly incorporated: ReadonlySet<string>
}

/**
 * Fold the journal and the native history into the bridge's state. Pure:
 * restart reconciliation and tests use the same function.
 * @param journal - the session's journal records.
 * @param events - the session's native event list.
 */
export function foldLog(journal: readonly JournalRecord[], events: readonly SessionEvent[] = []): LoggedState {
  let attemptId: string | null = null
  let authorityEpoch = 0
  let fence: FenceState = 'active'
  const commands = new Map<string, { seq: number; kind: RuntimeCommandKind; messageId: string | null; nativeSeq: number | null }>()
  let stash: StashedMessage[] = []
  for (const record of journal) {
    switch (record.type) {
      case 'sophia/command': {
        const data = record.data
        attemptId = data.attemptId
        authorityEpoch = Math.max(authorityEpoch, data.authorityEpoch)
        if (!commands.has(data.commandId)) commands.set(data.commandId, { seq: record.seq, kind: data.kind, messageId: data.messageId, nativeSeq: data.nativeSeq })
        break
      }
      case 'sophia/fence':
        attemptId = record.data.attemptId
        authorityEpoch = Math.max(authorityEpoch, record.data.authorityEpoch)
        if (fence !== 'stopped') fence = record.data.state
        break
      case 'sophia/stash':
        stash = [...stash, ...record.data.messages]
        break
      case 'sophia/unstash': {
        const done = new Set(record.data.messageIds)
        stash = stash.filter((m) => !done.has(m.messageId))
        break
      }
      case 'sophia/settled': {
        const entry = commands.get(record.data.commandId)
        if (entry) commands.set(record.data.commandId, { ...entry, nativeSeq: record.data.nativeSeq })
        break
      }
    }
  }
  const incorporated = new Set<string>()
  for (const event of events) {
    if (event.type === 'user/message') incorporated.add((event.data as { id: string }).id)
  }
  return { attemptId, authorityEpoch, fence, commands, stash, incorporated }
}
