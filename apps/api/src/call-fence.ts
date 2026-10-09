// The fence a voice tool call is made under, across API processes (Codex P1 r4234393693, r4234171899, r4234782534 and
// r4234782537 on PR #190). With voice qualification on, one attempt of a call at a time holds its key's fence: a session
// advisory lock on a database session of its own, bounded in number per API process, taken with the key's next
// generation (0047 media_fence_live_call). A recorded call's answer is written only under that generation (media-tools
// CallSeal), so an attempt whose session was lost, and whose fence another attempt then took, commits nothing.
import pg from 'pg'
import { fenceLiveCall } from '@sophia/persistence'

/**
 * At most this many call fences at once in one API process (Codex P1 r4234782537): each is a database session of its
 * own, beside the pool's connections, so an API process holds at most its pool's max plus this many sessions. A call
 * that finds none free within its wait answers that it could not be made now, and runs and marks nothing.
 */
export const CALL_FENCE_SESSIONS = 8

/** The application name a fence's session carries, so an operator (and a test) can tell the fences apart. */
export const CALL_FENCE_APPLICATION = 'sophia-call-fence'

/**
 * The fence sessions of one API process: a count bounded by `max`, and the calls waiting for a slot, oldest first. A
 * slot given back passes to the oldest call still waiting; one whose wait ran out has left the queue.
 */
export class CallFences {
  readonly max: number
  #held = 0
  readonly #waiting: Array<() => void> = []

  constructor(max = CALL_FENCE_SESSIONS) {
    if (!Number.isSafeInteger(max) || max < 1) throw new Error('A call fence bound is a positive whole number')
    this.max = max
  }

  /** The slots taken now. */
  get held(): number {
    return this.#held
  }

  /** A slot within `ms`: true once it is this call's, false when the wait ran out first. */
  take(ms: number): Promise<boolean> {
    if (this.#held < this.max) {
      this.#held += 1
      return Promise.resolve(true)
    }
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer)
        resolve(true)
      }
      const timer = setTimeout(
        () => {
          const at = this.#waiting.indexOf(wake)
          if (at >= 0) this.#waiting.splice(at, 1)
          resolve(false)
        },
        Math.max(0, ms),
      )
      this.#waiting.push(wake)
    })
  }

  /** A slot given back: the oldest call still waiting takes it, or it is free. */
  give(): void {
    const next = this.#waiting.shift()
    if (next) next()
    else this.#held -= 1
  }
}

/** One process's fences, per pool, when the caller passes none (a second API process in a test, say). */
const fencesOfPool = new WeakMap<pg.Pool, CallFences>()

export function fencesOf(pool: pg.Pool): CallFences {
  let fences = fencesOfPool.get(pool)
  if (!fences) {
    fences = new CallFences()
    fencesOfPool.set(pool, fences)
  }
  return fences
}

/** A call key's fence, held by this attempt. */
export interface Fence {
  /** The generation this attempt took the fence at: its answer is written only under it. */
  generation: string
  /**
   * Whether the fence's session was lost (an error, or its end) while this attempt held it: the fence may be another
   * attempt's now, so this one runs and marks nothing more (Codex P1 r4234782534).
   */
  lost: () => boolean
  /** Give the fence back, once: unlocked while the session is still this attempt's, then the session ended. */
  release: () => Promise<void>
}

/** lock_timeout: the fence (or its generation's row) is another attempt's still. */
const lockTimedOut = (err: unknown) => err instanceof Error && 'code' in err && err.code === '55P03'

/**
 * Connect within `ms` (Codex P2 r4235131974): false once that ran out first, the connect left to fail on its own when
 * the client is ended. pg sets no time limit of its own by default.
 */
async function connectWithin(client: pg.Client, ms: number): Promise<boolean> {
  const connecting = client.connect().then(() => true)
  connecting.catch(() => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(1, ms))
  })
  try {
    return await Promise.race([connecting, late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Take a call key's fence within `waitMs`: a slot of `fences`, a session of its own, the key's advisory lock, then the
 * key's next generation on that session, every step within what is left of `waitMs`, its connect included. 'busy'
 * when no slot came free in time, 'held' when another attempt held the fence (or a seal its generation's row) all
 * along, 'late' when the session could not be had in time: nothing was taken, and the slot is given back. It is taken
 * while holding no other lock, and calls under other keys never wait on it, so it adds no lock order. A holder that
 * dies ends its session, which releases the fence.
 */
export async function fenceCall(
  pool: pg.Pool,
  fences: CallFences,
  call: { exchangeId: string; key: string },
  waitMs: number,
): Promise<Fence | 'busy' | 'held' | 'late'> {
  const deadline = Date.now() + waitMs
  const remaining = () => Math.max(1, deadline - Date.now())
  const left = () => `${String(remaining())}ms`
  if (!(await fences.take(waitMs))) return 'busy'
  // pg's own limit is a backstop past the budget; connectWithin is the budget.
  const client = new pg.Client({
    ...pool.options,
    application_name: CALL_FENCE_APPLICATION,
    connectionTimeoutMillis: remaining() + 1000,
  })
  let lost = false
  const lose = () => {
    lost = true
  }
  // A fence's session lost: its fence ended with it, and may be another attempt's now.
  client.on('error', lose)
  client.on('end', lose)
  const lock = `sophia.live_call:${call.key}`
  let generation: string
  try {
    if (!(await connectWithin(client, remaining()))) {
      await client.end().catch(() => undefined)
      fences.give()
      return 'late'
    }
    await client.query(`SELECT set_config('lock_timeout', $1, false)`, [left()])
    await client.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [lock])
    await client.query(`SELECT set_config('lock_timeout', $1, false)`, [left()])
    generation = await fenceLiveCall(client, call.exchangeId, call.key)
  } catch (err: unknown) {
    // Ending the session releases whatever it took.
    await client.end().catch(() => undefined)
    fences.give()
    if (lockTimedOut(err)) return 'held'
    throw err
  }
  let released: Promise<void> | null = null
  return {
    generation,
    lost: () => lost,
    release: () =>
      (released ??= (async () => {
        // Unlocked first, while the session is this attempt's; a session lost is only ended, which released it.
        if (!lost)
          await client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [lock]).catch(() => undefined)
        await client.end().catch(() => undefined)
        fences.give()
      })()),
  }
}
