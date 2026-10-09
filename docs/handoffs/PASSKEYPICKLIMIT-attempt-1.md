# Implementation-session handoff

Goal and attempt: «Use a passkey» on the sign-in page ends (`docs/plans/passkey-picker-limit.md`), attempt 1. Named by
the review of #187; Luis: «Sigue con lo siguiente de la cola».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a fix named in «Goal and attempt».
Writable scope: `apps/studio/src/app/{passkey-pick.ts,passkey-pick.test.ts,PasskeySignIn.tsx,auth.ts}`, the design
note and this handoff.
Runtime unit: the Studio (`apps/studio`); no API change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `fix/auth-limits-rest` from `main` (`409cd340`), 2026-10-08
Ending commit/tree: `9990060d808a722c93b19607ebe2c12deec0dc61` (tree `8915c5fc938e7332cccdf1a2974d5502c6516484`). The commit after it adds only this handoff.

## Outcome

- «Use a passkey» waited with no limit on the autofill offer letting the browser go and on Supabase Auth's challenge
  and verification. Its whole wait now ends after a challenge's five minutes and a write's 90 s, counted from the
  press; the offer letting go has a read's 30 s of its own. Ended, the prompt closes and it says what an expired
  challenge already said: «That took too long. Try the passkey again.» An offer that lets go late starts no picker.
- `pickInTime` in `passkey-pick.ts` (pure); `signInWithPasskey` now takes the picker's signal as it took the offer's.
- The rest the review of #187 named was already bounded: the unlock checks (`reauth.ts`, each request 20 s), the
  account's ways (`orLate`), a provider's leave (`leaveFor`); the provider buttons fetch nothing (the page leaves).

## Evidence

- `passkey-pick.test.ts`, written first and failing first (no module): 5 pass.
- Mutants, each against that test, then removed: the prompt not closed at the limit, a five-minute limit, the offer's
  letting go unbounded, a picker started after a late letting go: each killed. The control (a comment) passed.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc`.
- Independent review (with the supabase-js source): no P1 or P2. Our own signal costs nothing (Supabase's own
  cancellation never covered the offer); an aborted ceremony comes back as dismissed. Its P3s taken: the offer's own
  30 s, the limit's claim softened, a late success named in the plan, the comment, a test for an answer just after.

## Limitations and next action

- No fixture page offers passkeys (they need Supabase Auth on their domain): the hook was read in review, not run.
- The challenge request is inside Supabase's call and can't be bounded apart: a challenge that never comes waits the
  whole limit, silently.
- Next: merge on green CI with no Codex P1.
