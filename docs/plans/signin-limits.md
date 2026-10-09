# Sign-in: every email and code wait ends

> 2026-10-08 · Luis: «Sigue con lo siguiente de la cola». Found while fixing the send-again check (#186): «Send again»
> waits a write's 90 s (`signin-write-limit.md`), but the three other Auth waits on the way in have no limit. No API
> change.

## What is wrong

- The first «Email me a link», the invited person's «Email me a sign-in code» / «Send it again», and «Sign in with
  code» each wait on Supabase Auth, whose calls have no limit of their own. A hosted Auth that never answers leaves
  «Sending…» or «Checking…» for good, with no line saying the wait is long (`CONTRIBUTING.md`, «No wait is endless,
  and a long one says so»).

## What changes

- Each waits a write's 90 s (`WRITE_TIMEOUT_MS`), as «Send again» does, and adds the long wait's line once it has
  lasted six seconds (`useSlow`, `SLOW_NOTE`).
- Past 90 s it ends as not confirmed, never as failed, since the call is not cancelled:
  - a first email, where there is no code field yet: «Not confirmed: the email may still arrive, and its link works in
    this browser. If it doesn’t come, ask for it again.» (a second email voids the first one's link and code). The
    address stays, and the button can be pressed again; asked again inside Auth's window, Auth answers how long is
    left, which the page already says;
  - an invited code sent again: the words «Send again» already uses («…Wait for it, then send again.»). The invited
    buttons wait aria-disabled, as «Send again» does, so the focus stays through the wait;
  - the code: «Not confirmed: the code may still sign you in. If nothing changes, try it again.» A code that lands late
    still signs in: the auth listener replaces the screen.
- One helper for the three and «Send again»: `endsWithin(work, ms, words)` in `deadline.ts`, beside `orLate`; the words
  in `auth-words.ts`. `SignIn.tsx`'s own `inTime` goes.

## Checks (written first)

- `deadline.test.ts`: `endsWithin` gives the work's value, keeps its failure, and fails with its words once late.
- `signin.spec.ts` (the fixture's `stall=first` and `stall=code`): a first email that never answers says the wait is
  long at 30 s, then not confirmed at 90 s, the address kept and the button ready; a code that never answers the same,
  the field ready to press again.
- The invited person's sign-in has no fixture page (a member's sign-in needs real Auth): it uses the same helper and
  words, read in review.
