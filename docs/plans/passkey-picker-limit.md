# Sign-in: «Use a passkey» ends

> 2026-10-08 · Luis: «Sigue con lo siguiente de la cola». Named by the review of #187 (every email and code wait
> ends): the passkey picker on the sign-in page has no limit. No API change.

## What is wrong

- «Use a passkey» first waits for the autofill offer to let the browser go, then asks Supabase Auth for a challenge,
  opens the browser's prompt, and sends its answer back. The prompt is the person's, and the browser ends it at its
  own timeout; but the two requests and the offer's letting go have no limit. If one never answers, the link says
  «Waiting for your passkey…» for good (`CONTRIBUTING.md`, «No wait is endless»).
- The rest named with it is already bounded: the unlock checks (`reauth.ts`, each request 20 s), the account's ways
  (`orLate`), a provider's leave (`leaveFor`). The provider buttons fetch nothing: Supabase builds the address and the
  page leaves.

## What changes

- The picker's whole wait ends once a challenge's life (5 minutes) and a write's 90 s have passed: past both, no answer
  can still sign in. It then closes the prompt and says what an expired challenge already says: «That took too long.
  Try the passkey again.»
- An offer that lets go only after that starts no picker: nobody is waiting for it any more.
- The person's time in the prompt is not cut short before then, and no «taking longer» line shows: the wait is theirs.
- Pure and unit-tested: `pickInTime` in `passkey-pick.ts`; `signInWithPasskey` takes the picker's signal, as it
  already takes the offer's.

## Checks (written first)

- `passkey-pick.test.ts`: the outcome in time; «late» at the limit, not before, with the prompt's signal aborted; the
  picker asked only once the offer has let go, and never when it lets go after the limit.
- No fixture page offers passkeys (they need Supabase Auth on their domain): the hook is read in review.
