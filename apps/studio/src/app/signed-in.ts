// Who is signed in on this page, as App knows it. A write that outlives the part that started it (a package of notes
// mid-carry, while the person opens a project or goes home) asks before each step whether its account still is:
// signing out, or another identity, and nothing more goes under the account that left. Mounting has nothing to say
// about it: places and projects come and go within one session.

let current: string | null = null

/** App's: the identity signed in now, or null (signed out, or leaving). */
export function setSignedIn(name: string | null): void {
  current = name
}

/** Whether `name` is the account signed in on this page now. */
export const stillSignedIn = (name: string): boolean => current === name
