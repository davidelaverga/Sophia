// The bridge's assignment loop (amendment A06): the API says which room exchanges are live; the bridge keeps exactly one
// RoomSession per live exchange, updates it as epochs move, and closes it when the exchange ends. Assignments
// are long-polled with the version the bridge last saw, so a change (a floor transfer, Stop Speaking, a guest)
// arrives within the NOTIFY round trip; each response carries fresh short-lived room tokens.
import type { MediaAssignment } from '@sophia/contracts'
import { type Handover, RoomSession, type SessionDeps } from './room-session.ts'

/** How long one assignment poll may wait for a change. */
export const ASSIGNMENT_WAIT_MS = 25_000
const RETRY_DELAYS_MS = [500, 1000, 2000, 5000, 10_000]

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export class MediaBridge {
  private readonly deps: SessionDeps
  private readonly sessions = new Map<string, RoomSession>()
  /**
   * Each live exchange's voice qualification receipt sequence (A15), shared by the sessions that replace one another on
   * it, so a replacement never reuses a number the one it replaced sent. A process restart starts again at 1.
   */
  private readonly sequences = new Map<string, () => number>()
  private version: string | null = null
  private poll: AbortController | null = null
  private stopped = false

  constructor(deps: SessionDeps) {
    this.deps = {
      ...deps,
      lost: (exchangeId) => this.onLost(exchangeId),
      evidenceSequence: (exchangeId) => this.sequenceOf(exchangeId),
    }
  }

  /** Poll until stopped. A failed poll backs off; sessions keep running on their last assignment meanwhile. */
  async run(): Promise<void> {
    let failures = 0
    while (!this.isStopped()) {
      this.poll = new AbortController()
      try {
        const batch = await this.deps.service.assignments(this.version, ASSIGNMENT_WAIT_MS, this.poll.signal)
        this.version = batch.version
        await this.apply(batch.assignments)
        failures = 0
      } catch (err: unknown) {
        if (this.isStopped()) break
        if (!this.poll.signal.aborted) {
          this.deps.log('assignments.failed', { error: message(err) })
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[failures] ?? 10_000))
          failures += 1
        }
      }
    }
  }

  /**
   * Bring the sessions in line with the API. What ended leaves its room first, so a room's next exchange can join; no
   * update waits on what a closing session still owes. A session replaced on a live exchange (its room was lost) hands
   * what it still owes the room to the one that replaces it, which announces nothing until it has it.
   */
  async apply(assignments: readonly MediaAssignment[]): Promise<void> {
    const live = new Set(assignments.map((a) => a.exchangeId))
    // A closing session keeps its own reference: what it still sends stays in its exchange's sequence.
    for (const exchangeId of this.sequences.keys()) if (!live.has(exchangeId)) this.sequences.delete(exchangeId)
    const leaving: Promise<void>[] = []
    const handovers = new Map<string, Promise<Handover>>()
    for (const [exchangeId, session] of this.sessions) {
      if (live.has(exchangeId) && !session.lost) continue
      this.sessions.delete(exchangeId)
      const closed = session.close()
      leaving.push(session.left())
      if (live.has(exchangeId))
        handovers.set(
          exchangeId,
          closed.then(() => session.handover()),
        )
    }
    await Promise.all(leaving)
    for (const assignment of assignments) {
      const session = this.sessions.get(assignment.exchangeId)
      if (session) {
        session.update(assignment)
        continue
      }
      const created = new RoomSession(assignment, this.deps, handovers.get(assignment.exchangeId) ?? null)
      this.sessions.set(assignment.exchangeId, created)
      created.start().catch((err: unknown) => this.deps.log('session.start_failed', { error: message(err) }))
    }
  }

  private sequenceOf(exchangeId: string): () => number {
    const known = this.sequences.get(exchangeId)
    if (known) return known
    let seq = 0
    const next = () => (seq += 1)
    this.sequences.set(exchangeId, next)
    return next
  }

  /** A room was lost: re-read assignments now (fresh tokens) instead of waiting out the poll. */
  private onLost(exchangeId: string): void {
    this.deps.log('session.lost', { exchangeId })
    this.version = null
    this.poll?.abort()
  }

  private isStopped(): boolean {
    return this.stopped
  }

  session(exchangeId: string): RoomSession | undefined {
    return this.sessions.get(exchangeId)
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.poll?.abort()
    const open = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(open.map((s) => s.close()))
  }
}
