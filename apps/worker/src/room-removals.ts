// Room removal reconciliation (S1-05A, amendment A07, db/migrations/0014). A declined or blocked guest who was let
// in must leave the call: each pass claims the removals that are due (pending past their backoff, or settled but
// still on watch while an earlier token could bring the guest back), asks the LiveKit server, and records its
// answer. Only the server's evidence settles a removal; a failure stays pending and is tried again, with backoff,
// for as long as it takes. Nothing here waits for a token to expire.
import { RoomServiceClient } from 'livekit-server-sdk'
import type pg from 'pg'
import { claimRoomRemovals, settleRoomRemoval, type RemovalOutcome } from '@sophia/persistence'

/** Take one participant out of one room; resolve with evidence or a failure, never throw. */
export type RemoveParticipant = (roomId: string, identity: string) => Promise<RemovalOutcome>

export interface LiveKitServer {
  url: string
  apiKey: string
  apiSecret: string
}

const message = (err: unknown) => (err instanceof Error ? err.message.slice(0, 300) : 'removal failed')

/** The LiveKit server as the worker reaches it: `absent` only when the server itself lists the person gone. */
export function liveKitRemover(server: LiveKitServer): RemoveParticipant {
  const client = new RoomServiceClient(server.url.replace(/^ws(s?):\/\//, 'http$1://'), server.apiKey, server.apiSecret)
  const present = async (roomId: string, identity: string): Promise<boolean | null> => {
    try {
      return (await client.listParticipants(roomId)).some((p) => p.identity === identity)
    } catch (err: unknown) {
      // A room nobody is in does not exist on the server: nobody, this guest included, is in it.
      return err instanceof Error && /not.?found|does not exist/i.test(err.message) ? false : null
    }
  }
  return async (roomId, identity) => {
    if ((await present(roomId, identity)) === false) return { outcome: 'absent' }
    try {
      await client.removeParticipant(roomId, identity)
      return { outcome: 'removed' }
    } catch (err: unknown) {
      if ((await present(roomId, identity)) === false) return { outcome: 'absent' }
      return { outcome: 'failed', error: message(err) }
    }
  }
}

export interface RemovalPass {
  settled: Array<{ id: string; state: string }>
}

/** One pass: claim what is due, ask the server, record each answer under its lease. */
export async function reconcileRemovalsOnce(
  pool: pg.Pool,
  remove: RemoveParticipant,
  workerId: string,
): Promise<RemovalPass> {
  const claims = await claimRoomRemovals(pool, workerId)
  const settled: RemovalPass['settled'] = []
  for (const claim of claims) {
    const result = await remove(claim.roomId, claim.identity).catch((err: unknown): RemovalOutcome => ({
      outcome: 'failed',
      error: message(err),
    }))
    settled.push({ id: claim.id, state: await settleRoomRemoval(pool, claim.id, workerId, result) })
  }
  return { settled }
}

/** Passes every `everyMs` until stopped; a pass that throws (the database away) is logged and tried again. */
export class RemovalReconciler {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private readonly pool: pg.Pool
  private readonly remove: RemoveParticipant
  private readonly workerId: string
  private readonly log: (line: string) => void

  constructor(pool: pg.Pool, remove: RemoveParticipant, workerId: string, log: (line: string) => void) {
    this.pool = pool
    this.remove = remove
    this.workerId = workerId
    this.log = log
  }

  start(everyMs = 2000): void {
    this.timer = setInterval(() => void this.pass(), everyMs)
  }

  private async pass(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const { settled } = await reconcileRemovalsOnce(this.pool, this.remove, this.workerId)
      for (const s of settled) if (s.state === 'pending') this.log(`room removal ${s.id} still pending; retrying`)
    } catch (err: unknown) {
      this.log(`room removal pass failed: ${message(err)}`)
    } finally {
      this.running = false
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }
}
