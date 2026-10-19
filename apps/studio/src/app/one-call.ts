// One call at a time, as the signed-in Studio keeps it (SignedIn's useCall): which call runs, what a project's report
// means for it, and why a call ended when another project's opening left it (docs/plans/call-ends-on-open.md). Pure,
// so the order of reports is tested; React holds the call and tells the rest.

/** A call, and the project whose opening is ending it, or null. */
interface Running<C> {
  call: C
  opened: string | null
}

/** What a report from a project's room asks of the app. */
export interface Reported<C> {
  /** Another project's call, ended by this one starting, without a word: the person asked for the new one. */
  leave: C | null
  /** The call that ended, and the project whose opening ended it, or null (this person left it, or its room says why). */
  ended: Running<C> | null
}

/**
 * The call that runs, with the project whose opening is ending it. The cause belongs to that call alone: each call
 * begins with none, and an opening asked after it ended keeps nothing, so a later Leave never borrows another's.
 */
export function oneCall<C extends { projectId: string }>() {
  let running: Running<C> | null = null
  return {
    /** `projectId`'s room holds `next`, or no call; null when that changes nothing. */
    report(projectId: string, next: C | null): Reported<C> | null {
      const prev = running
      if (!next) {
        if (prev?.call.projectId !== projectId) return null // a project without a call ends nobody's call
        running = null
        return { leave: null, ended: prev }
      }
      const begins = prev?.call.projectId !== projectId
      running = { call: next, opened: begins ? null : prev.opened }
      return { leave: begins ? (prev?.call ?? null) : null, ended: null }
    },
    /**
     * `left` is being left because `opened` opened: true when it is to be left. Only the call that runs: a render still
     * holding one that has ended asks too, and keeps nothing.
     */
    leaving(left: C, opened: string): boolean {
      const now = running
      if (now?.call.projectId !== left.projectId) return false
      now.opened = opened
      return true
    },
  }
}
