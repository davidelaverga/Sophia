# The invitation page says a sign-out that failed

> 2026-10-19 · residual of #410 (Codex P2, `sign-out-failed.md`), found by the follow-up triage of 2026-10-19
> (`seguimientos-triage-2026-10-19.md`). Luis 2026-10-19: «Entonces sigue trabajando en lo que viene mientras
> esperamos». Studio only, no API.

## Measured

- **App throws the answer away.** `leaving` (`App.tsx`, 169-185) resolves `false` when the sign-out fails and puts the
  person's writes back. The Studio hands that to `SignedIn`, whose toast says `SIGN_OUT_FAILED` with Try again
  (`sayingIfFailed`, 264-275). The join page gets `() => void leaveSession()` (234): the `false` is dropped.
- **The join page's one sign-out** is MemberJoin's «Sign out and continue as {email}» (`JoinFlow.tsx`, 443-466), shown
  when a member invitation is for another address than the one signed in (`otherAccount`: Supabase only). A failed press
  leaves the page as it was: same words, same button, the person still signed in, nothing said.
- **The join page has no toast.** `JoinPage` mounts JoinFlow alone; the toast lives in `SignedIn`. The page's own
  failures are said in place, as Accept's is: a `form-error` paragraph with `role="alert"` under the button.
- **The brief, against the code, twice.** The account menu's toast is `role="status"` (`Toast.tsx`, 51), not an alert.
  A logout answering 503 does not make this device's sign-out fail: supabase-js removes the session on a logout's 5xx
  and `endSession` reads it as ended (`sign-out.ts`, 32-53); #410's check of this failure makes the browser's storage
  refuse to let the session go (`app-auth.spec.ts`, «sign out · one that fails…»). This note follows the code.

## What changes

- **JoinFlow's `onSignOut` answers** `Promise<boolean>`, as `SignedIn`'s does; App hands it `leaveSession` itself.
- **The sign-out as another address is its own part** (`SignOutAs`): pressed, the button is disabled while the sign-out
  is on its way, so a second press starts no second one. Failed, the page stays where it is and says, under the button,
  the account menu's words (`SIGN_OUT_FAILED`) as an alert, the page's own idiom for a failure. The button then reads
  **Try again**, which runs the same sign-out once more; failing again, the words stay.
- **Signed out,** App's state moves on as today: the page asks the invited address to sign in.

## Checks (written first)

- **`app-auth.spec.ts`:** a member invitation for another address (the preview answered in the page), its token stored
  on the device, Davide signed in on `/join`. The storage refuses to let the session go: Sign out and continue says the
  words as an alert, and Davide is still signed in (the line naming him stays). Storage working again, Try again signs
  out: the page asks for the invitation's address.

## Limits

- The guest invitation has no sign-out press; nothing changes there.
- The dev picker's identity switch never fails, and is untouched.
