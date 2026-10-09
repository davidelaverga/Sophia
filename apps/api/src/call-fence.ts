// The fence a voice tool call is made under, across API processes (Codex P1 r4234393693, r4234171899, r4234782534 and
// r4234782537 on PR #190). With voice qualification on, one attempt of a call at a time holds its key's fence: a session
// advisory lock on a database session of its own, bounded in number per API process, taken with the key's next
// generation (0047 media_fence_live_call). A recorded call's answer is written only under that generation (media-tools
// CallSeal), so an attempt whose session was lost, and whose fence another attempt then took, commits nothing.
import net from 'node:net'
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

/** How long a release may wait for its unlock's answer, then for its session's end, before its socket is destroyed. */
export const FENCE_UNLOCK_MS = 1000
export const FENCE_END_MS = 250
/**
 * How long before the call's deadline the server's own lock_timeout answers: a fence held all along is then 'held'
 * (another attempt is making the call), not 'late', and the call's own deadline stays the backstop.
 */
const LOCK_MARGIN_MS = 100

/** The answer of work that ran out of time. */
const LATE = Symbol('late')

/**
 * `work`'s value within `ms`, or LATE once that ran out first (Codex P2 r4235131974, root r4235308990): the work is
 * left to fail on its own once its socket is destroyed. pg sets no connect limit of its own by default, and a query on
 * a stalled socket never answers.
 */
async function within<T>(work: Promise<T>, ms: number): Promise<T | typeof LATE> {
  work.catch(() => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => resolve(LATE), Math.max(1, ms))
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Take a call key's fence within `waitMs`: a slot of `fences`, a session of its own, the key's advisory lock, then the
 * key's next generation on that session, all of it within what is left of `waitMs` (its connect and every query
 * included). 'busy' when no slot came free in time, 'held' when another attempt held the fence (or a seal its
 * generation's row) all along, 'late' when the session could not be had in time: nothing was taken. Whenever it gives
 * up, its socket is destroyed at once and its slot given back before it returns, never after an end that may stall
 * (root r4235308990); the server ends the session, and whatever it took, when it sees that. It is taken while holding
 * no other lock, and calls under other keys never wait on it, so it adds no lock order. A holder that dies ends its
 * session, which releases the fence.
 */
export async function fenceCall(
  pool: pg.Pool,
  fences: CallFences,
  call: { exchangeId: string; key: string },
  waitMs: number,
): Promise<Fence | 'busy' | 'held' | 'late'> {
  const deadline = Date.now() + waitMs
  const remaining = () => Math.max(1, deadline - Date.now())
  if (!(await fences.take(waitMs))) return 'busy'
  const session = new FenceSession(pool, fences, remaining() + 1000)
  const lock = `sophia.live_call:${call.key}`
  const acquire = async (): Promise<string> => {
    const left = () => `${String(Math.max(1, remaining() - LOCK_MARGIN_MS))}ms`
    await session.client.connect()
    await session.client.query(`SELECT set_config('lock_timeout', $1, false)`, [left()])
    await session.client.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [lock])
    await session.client.query(`SELECT set_config('lock_timeout', $1, false)`, [left()])
    return fenceLiveCall(session.client, call.exchangeId, call.key)
  }
  let generation: string | typeof LATE
  try {
    generation = await within(acquire(), remaining())
  } catch (err: unknown) {
    session.abort()
    if (lockTimedOut(err)) return 'held'
    throw err
  }
  if (generation === LATE) {
    session.abort()
    return 'late'
  }
  let released: Promise<void> | null = null
  return {
    generation,
    lost: () => session.lost,
    release: () => (released ??= session.release(lock)),
  }
}

/**
 * A fence's database session: a client of its own on a socket of its own, so the socket can be destroyed at once,
 * with pg's connect limit (`backstopMs`) only past the call's budget. Its `error` or `end` marks it lost: its fence
 * ended with it, and may be another attempt's now.
 */
class FenceSession {
  readonly client: pg.Client
  lost = false
  #socket: net.Socket | null = null
  readonly #fences: CallFences

  constructor(pool: pg.Pool, fences: CallFences, backstopMs: number) {
    this.#fences = fences
    this.client = new pg.Client({
      ...pool.options,
      application_name: CALL_FENCE_APPLICATION,
      connectionTimeoutMillis: backstopMs,
      stream: () => {
        this.#socket = new net.Socket()
        return this.#socket
      },
    })
    const lose = () => {
      this.lost = true
    }
    this.client.on('error', lose)
    this.client.on('end', lose)
  }

  /** Give up the session now: its socket destroyed, its slot given back; pg's end is never waited for. */
  abort(): void {
    this.#socket?.destroy()
    this.#fences.give()
  }

  /**
   * Unlocked first, while the session is this attempt's (a session lost is not asked), then ended; each within its
   * bound (FENCE_UNLOCK_MS, FENCE_END_MS), else the socket is destroyed. The slot goes back once the session is ended
   * or destroyed.
   */
  async release(lock: string): Promise<void> {
    const unlock = () => this.client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [lock])
    const unlocked = this.lost ? LATE : await within(unlock(), FENCE_UNLOCK_MS).catch(() => LATE)
    const ended = unlocked === LATE ? LATE : await within(this.client.end(), FENCE_END_MS).catch(() => LATE)
    if (ended === LATE) this.#socket?.destroy()
    this.#fences.give()
  }
}
