// Search admission (SEC 4306450775): searches share the application pool (max 10) with everything else the API does,
// so at most SEARCH_IN_FLIGHT of them run at once in this process, and at most SEARCH_PER_ACTOR for one verified actor
// (its subject, whatever token carried it). No queue: a search over either bound is refused at once, before any
// database client is asked for, with the existing «unavailable» refusal (a read that may be asked again). A permit is
// held until the search's own work has settled (its transaction, rollback and client release), even when the caller has
// gone or timed out. Capacity kept for the rest of the API in this process; not a distributed or global rate limit.
import { DomainError } from '@sophia/domain'

export const SEARCH_IN_FLIGHT = 2
export const SEARCH_PER_ACTOR = 1

export class SearchAdmission {
  #inFlight = 0
  readonly #byActor = new Map<string, number>()

  readonly max: number
  readonly perActor: number

  constructor(max = SEARCH_IN_FLIGHT, perActor = SEARCH_PER_ACTOR) {
    this.max = max
    this.perActor = perActor
  }

  /** A permit for this actor's search, or the fixed refusal; its release is idempotent. */
  admit(actorId: string): () => void {
    const held = this.#byActor.get(actorId) ?? 0
    if (this.#inFlight >= this.max || held >= this.perActor) throw new DomainError('unavailable', 'Search is busy')
    this.#inFlight += 1
    this.#byActor.set(actorId, held + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      this.#inFlight -= 1
      const left = (this.#byActor.get(actorId) ?? 1) - 1
      if (left > 0) this.#byActor.set(actorId, left)
      else this.#byActor.delete(actorId)
    }
  }

  /** Searches running now, and the actors holding them (none kept once settled). */
  get state(): { inFlight: number; actors: number } {
    return { inFlight: this.#inFlight, actors: this.#byActor.size }
  }
}
