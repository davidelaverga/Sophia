// One call at a time, as the signed-in Studio keeps it (SignedIn's useCall): which call runs, what a project's report
// means for it, and why a call ended when another project's opening left it (docs/plans/call-ends-on-open.md). Pure,
// so the order of reports is tested; React holds the call and tells the rest.

/** What a report from a project's room asks of the app. */
export interface Reported<C> {
  /** Another project's call, ended by this one starting, without a word: the person asked for the new one. */
  leave: C | null
  /** The call that ended, and the project whose opening ended it, or null (this person left it, or its room says why). */
  ended: { call: C; opened: string | null } | null
}

/** The call that runs, and the project whose opening is ending it, kept until its end reads it. */
export function oneCall<C extends { projectId: string }>() {
  let current: C | null = null
  let leftFor: { call: string; opened: string } | null = null
  /** The project whose opening ended `call`, read once: every end forgets it, so a later Leave never borrows it. */
  const takeOpened = (call: C): string | null => {
    const left = leftFor
    leftFor = null
    return left?.call === call.projectId ? left.opened : null
  }
  return {
    /** `projectId`'s room holds `next`, or no call; null when that changes nothing. */
    report(projectId: string, next: C | null): Reported<C> | null {
      const prev = current
      if (!next && prev?.projectId !== projectId) return null // a project without a call ends nobody's call
      current = next
      const leave = next && prev && prev.projectId !== projectId ? prev : null
      return { leave, ended: next || !prev ? null : { call: prev, opened: takeOpened(prev) } }
    },
    /** `left` is being left because `opened` opened; true when it is to be left. */
    leaving(left: C, opened: string): boolean {
      leftFor = { call: left.projectId, opened }
      return true
    },
  }
}
