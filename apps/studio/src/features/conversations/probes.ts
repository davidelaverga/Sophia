// Reading directly a conversation left out of a list of the newest only (PR #199 r4235397313, r4235629899; Codex's
// countercases on d13029c): a project past the newest 200 may never be listed whole, so a conversation something is
// kept for here, once out of the list, is read on its own. The API refuses an erased one as not found (422 `not_found`;
// 0048 hides it), and that alone settles it. A read that answers says it stands, which only a conversation in doubt
// asks (`found`: an erasure let go without being known erased; PR #199 r4238311491). One that fails otherwise
// (unavailable, no connection) or runs past its deadline proves nothing: what is kept stays (a draft, an erasure's
// key), and it is read again later.

/** What a conversation's direct read needs: the read itself, what it is for, and what a not found does. */
export interface ProbeWork {
  /** Reads the conversation's newest page; rejects as the API does (an `ApiError` with its `code`). */
  read: (id: string, signal: AbortSignal) => Promise<unknown>
  /** Whether something is still kept here for it: when nothing is, it is no longer read. */
  keeps: (id: string) => boolean
  /** Not found: erased (or gone from this reader): let go of what is kept for it. */
  settle: (id: string) => void
  /** Answered: it stands as this read found it (its answer, as `read` resolved). */
  found: (id: string, answer: unknown) => void
  /** Whether a read's failure is the API's not found. */
  notFound: (err: unknown) => boolean
}

/** The schedule: the first read again, the longest wait between two, a read's deadline, and reads at once. */
export const PROBE = { first: 30_000, longest: 300_000, deadline: 15_000, atOnce: 3 } as const

interface On {
  /** Its next read, waiting on its clock. */
  timer?: ReturnType<typeof setTimeout>
  /** Its read in flight: its transport's abort, and the attempt's end (its slot given back), whatever the read does. */
  abort?: AbortController
  end?: () => void
}

/**
 * The conversations being read directly: each read once at a time, at most `atOnce` reads in flight (the rest wait their
 * turn), each attempt ended at its deadline whatever its read does (its slot given back, its answer inconclusive, a
 * later answer to it ignored: never a settlement), each read again after an inconclusive answer on its own clock (30 s,
 * then doubling up to 5 min: a list read again unchanged moves nothing), and each stopped as soon as it is listed
 * again, nothing is kept for it, or the view goes.
 */
export class Probes {
  private readonly on = new Map<string, On>()
  private readonly waiting: { id: string; wait: number }[] = []
  private flying = 0
  private closed = false
  private readonly work: ProbeWork

  constructor(work: ProbeWork) {
    this.work = work
  }

  /** Out of a list of the newest: read it now (or in its turn), unless it already is being read or waits to be. */
  start(id: string): void {
    if (this.closed || this.on.has(id)) return
    this.on.set(id, {})
    this.enqueue(id, PROBE.first)
  }

  /** Listed again, settled, or the view gone: no read of it goes on, and none comes. */
  stop(id: string): void {
    const at = this.on.get(id)
    if (!at) return
    this.on.delete(id)
    clearTimeout(at.timer)
    at.abort?.abort()
    at.end?.()
    const queued = this.waiting.findIndex((w) => w.id === id)
    if (queued >= 0) this.waiting.splice(queued, 1)
  }

  /**
   * The view here (again): reads may start. A view mounted twice over (React's StrictMode runs an effect's setup, its
   * cleanup, then its setup again) opens what its cleanup closed.
   */
  open(): void {
    this.closed = false
  }

  /** The view gone: nothing more starts, every read stops (until it is opened again). */
  stopAll(): void {
    this.closed = true
    for (const id of this.on.keys()) this.stop(id)
  }

  /** How many reads are in flight now, and how many conversations are being read or wait to be (a check reads it). */
  get load(): { flying: number; watched: number } {
    return { flying: this.flying, watched: this.on.size }
  }

  private enqueue(id: string, wait: number): void {
    this.waiting.push({ id, wait })
    this.pump()
  }

  private pump(): void {
    while (!this.closed && this.flying < PROBE.atOnce && this.waiting.length > 0) {
      const next = this.waiting.shift()
      if (next) this.readNow(next.id, next.wait)
    }
  }

  private readNow(id: string, wait: number): void {
    if (!this.on.has(id)) return
    if (!this.work.keeps(id)) return this.stop(id)
    const abort = new AbortController()
    this.flying += 1
    let done = false
    // The attempt ends once: by its answer, its deadline, or its stop. Its slot is given back then, whatever the read
    // does after (one that ignores its abort included); an answer that comes after its end is ignored.
    const end = (then: () => void) => {
      if (done) return
      done = true
      clearTimeout(deadline)
      this.flying -= 1
      then()
      this.pump()
    }
    const current = () => this.on.get(id)?.abort === abort
    const deadline = setTimeout(
      () =>
        end(() => {
          abort.abort()
          if (current()) this.later(id, wait)
        }),
      PROBE.deadline,
    )
    this.on.set(id, { abort, end: () => end(() => undefined) })
    this.work.read(id, abort.signal).then(
      (answer) =>
        end(() => {
          if (!current()) return
          this.work.found(id, answer)
          this.later(id, wait)
        }),
      (err: unknown) =>
        end(() => {
          if (!current()) return
          // Any failure but not found proves nothing: read again later.
          if (!this.work.notFound(err)) return this.later(id, wait)
          this.stop(id)
          this.work.settle(id)
        }),
    )
  }

  private later(id: string, wait: number): void {
    const next = Math.min(wait * 2, PROBE.longest)
    this.on.set(id, { timer: setTimeout(() => this.enqueue(id, next), wait) })
  }
}
