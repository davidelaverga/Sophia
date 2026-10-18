# A sign-out that fails says so, with Try again

> 2026-10-17 · a follow-up of #410 (Codex P2): a sign-out that failed kept the person in and said nothing. Settings had
> already closed, so they saw the page as it was and couldn't tell. Studio only.

## What changes

- **The toast says it:** «Couldn’t sign out: this device is still signed in. Check your connection and try again.»
  - It applies to both the menu's Sign out and Settings' «Sign out of all devices».
  - **Try again** runs the same sign-out once more, and says so again if that fails too.
- **App's `leaving`** tells whether the sign-out went through. `SignedIn`, which holds the toast, says the rest.
- **The toast takes an action's words:** «Undo» stays its default, and this notice says «Try again».
- **The words** live in `sign-out.ts` with the sign-out's others.

## Checks

- **`sign-out.test.ts`:** the words.
- **`app-auth.spec.ts`:** a sign-out whose session can't be removed (the browser's storage refuses) keeps the person in,
  and the toast says so. With storage working again, Try again signs out.
