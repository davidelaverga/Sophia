# Implementation-session handoff

Goal and attempt: INVITE-SIGN-OUT-FAILURE (residual of #410, found by the follow-up triage of 2026-10-19,
`evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md`), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-6`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-6`, branch `auth/invite-sign-out-failure` from the local
`group/follow-ups-5` (`56c61c61e`, unpushed, stacked on #468 `group/seams-4`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no kit change.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` and `.claude-guards/safe-run.ps1`, two
workers); CI as the run on record.
Existing authority: Luis 2026-10-19, «Entonces sigue trabajando en lo que viene mientras esperamos»; merges on green
with no open P1. Small, Studio only, to join the next group PR.
Ending commit/tree: `272548d8b02b` (tree `b564dd4f20fd`), the branch's last commit that changes code (this record comes
after). Against `56c61c61e`: `e2e/app-auth.spec.ts`, `fixtures/join.tsx`, `src/app/App.tsx`,
`src/features/access/JoinFlow.tsx`, and the plan note `docs/plans/invite-sign-out-failure.md`.

## Outcome

- Signed in as another address than a member invitation's, «Sign out and continue as {email}» that fails now keeps the
  person on the invitation page and says, under the button, the account menu's words as an alert: «Couldn’t sign out:
  this device is still signed in. Check your connection and try again.» The button then reads **Try again**, which runs
  the same sign-out once more. Signed out, the page asks for the invitation's address, as before.
- While the sign-out is on its way the button is `aria-disabled` (keeps the focus, as InvitedSignIn's does): a second
  press starts no second sign-out.

## Evidence

- Plan: `docs/plans/invite-sign-out-failure.md` (`2e1a0bf25`).
- **Measured first** on the branch's base: `App.tsx` 234 handed JoinFlow `() => void leaveSession()`, dropping
  `leaving`'s `false`; MemberJoin's button (`JoinFlow.tsx`, 443-466) is the join page's only sign-out; the page has no
  toast (`JoinPage` mounts JoinFlow alone) and says its own failures with a `form-error` `role="alert"` (Accept).
- **Written first** (`139059132`), run through the guard (`pw-logs/invsignout-red.txt`, grep «join · a sign-out that
  fails»): 1 failed, on the alert, after the button was found and pressed (`app-auth.spec.ts:483`):
  «Locator: getByRole('alert') / Expected: "Couldn’t sign out: this device is still signed in. Check your connection
  and try again." / Error: element(s) not found».
- **Fixed** (`272548d8b`): JoinFlow's `onSignOut` is `() => Promise<boolean>`; App hands it `leaveSession` itself; the
  button is its own part, `SignOutAs`. The join fixture's `onSignOut` resolves `true`.
- **At the fix**, through the guard: `app-auth` and `join` 49/49 (`pw-logs/invsignout-green.txt`); the specs that open
  the join fixture, `press-answers`, `focus-visible`, `control-heights` and `field-scale`, 58/58
  (`pw-logs/invsignout-neighbours.txt`).
- Units: `sign-out.test.ts`, `route.test.ts`, `access-view.test.ts` 45/45. Whole-repo `oxlint --type-aware`,
  `tsc --noEmit -p apps/studio` and Prettier on the four touched code files: clean.
- **Captures** in the session scratchpad, `auth-invite-sign-out-failure/`, a throwaway spec on the app's page (deleted
  after): `invite-1280x800-dark-{before,failed}.png` and `invite-390x844-light-{before,failed}.png`. Horizontal
  overflow is 0 in all four. The join page draws dark under a light system on the base too (the `before` capture), so
  the 390 light pair is dark; nothing here changes that.

## Decisions and changes

- **Brief against code, the role.** The brief says «role=alert, as the account menu does»; the account menu's toast is
  `role="status"` (`Toast.tsx`, 51). The join page has no toast, and its own failures are alerts, so the words are an
  alert, in place.
- **Brief against code, the failure.** The brief says the synthetic Auth's logout can answer 503, «as the existing #410
  check does». A logout's 5xx makes supabase-js remove this device's session, which `endSession` reads as ended: the
  sign-out succeeds. #410's check of a failed sign-out makes the browser's storage refuse to let the session go; this
  check does the same.
- **Try again replaces the button's words** rather than adding a second button that does the same thing; the line above
  still names both addresses.

## Remaining obligations

- None locally.

## Next bounded action

- Luis: say when to push (with the next group PR); then merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the triage's #410 entries.
