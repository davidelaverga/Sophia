// The order of a bridge process's presence reports (item 7 C of the PR #190 review; the presence-order amendment and
// migration 0052, provisional numbers). A presence report may be cut at its bound (POST_ATTEMPT_MS) while the API still
// commits it later, after a newer one; each report therefore carries reportSeq, and the API ignores one that is not above
// its process's last for the room. The numbers come from ONE counter per process, shared by every session of every
// MediaBridge in it, so a session that replaces a lost one continues it and never starts again at 1. A number is taken
// when a report is built and never reused: a report whose attempt failed or was cut is not sent again, the next one has
// the next number.

/** The largest number the wire allows (the amendment's maximum): Number.MAX_SAFE_INTEGER. */
export const PRESENCE_SEQUENCE_MAX = Number.MAX_SAFE_INTEGER

export class PresenceSequence {
  private last: number

  /** `last`: the number given before the first one (0 for a new process; tests start near the bound). */
  constructor(last = 0) {
    if (!Number.isSafeInteger(last) || last < 0)
      throw new RangeError('A presence sequence starts at a safe integer ≥ 0')
    this.last = last
  }

  /**
   * The next number, above every one this counter gave before; null once PRESENCE_SEQUENCE_MAX was given. It is then
   * spent for good: never wrapped, never reused, so the process reports no more presence (its sessions log it once) and
   * the API treats its rooms' presence as it treats a silent bridge. A new process, with a new bridgeInstanceId, starts
   * again from 1. At one report per session every 5 s it is not reached in practice.
   */
  next(): number | null {
    if (this.last >= PRESENCE_SEQUENCE_MAX) return null
    this.last += 1
    return this.last
  }
}

/** This process's counter: every session takes its reports' numbers from it unless a test gives its own. */
export const processPresenceSequence = new PresenceSequence()
