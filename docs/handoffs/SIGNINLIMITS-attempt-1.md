# Implementation-session handoff

Goal and attempt: every email and code wait on the way in ends (`docs/plans/signin-limits.md`), attempt 1. Found while
fixing the send-again check (#186); Luis: «Sigue con lo siguiente de la cola».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a fix named in «Goal and attempt».
Writable scope: `apps/studio/src/app/{SignIn.tsx,deadline.ts,deadline.test.ts,auth-words.ts}`,
`apps/studio/src/features/access/JoinFlow.tsx`, `apps/studio/fixtures/signin.tsx`, `apps/studio/e2e/signin.spec.ts`,
the design note and this handoff.
Runtime unit: the Studio (`apps/studio`); no API change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `fix/signin-limits` from `main` (`8ca6d706`), 2026-10-08
Ending commit/tree: `d41b8101ac4adc64314ef22a2ef07a2b7f0cfc34` (tree `a64ec9ad36172f5f1d22fed580b2737b2a75aaf9`), after the waiting primary under the pointer (CI), after the waiting press's look (Codex P1 on #187), after main merged in (with #186, the send-again checks without the light). The commit after it adds only this handoff.

## Outcome

- The first «Email me a link», «Sign in with code», and the invited person's «Email me a sign-in code» / «Send it
  again» each wait a write's 90 s, as «Send again» already did, and show the long wait's line (`SlowNote`) after six
  seconds. Past 90 s each ends as not confirmed, in words that say what may still happen: a first email «may still
  arrive, and its link works in this browser» (no code field there yet, and a second email would void it), a code
  sent again the words «Send again» uses, a code checked «may still sign you in». The address or the code stays,
  ready to press again; the invited buttons now wait aria-disabled, so the focus stays through the wait.
- One helper for all four: `endsWithin(work, ms, words)` in `deadline.ts`, beside `orLate`; `SignIn.tsx`'s own `inTime`
  went. The words are in `auth-words.ts`.

## Evidence

- Written first and failing first: `deadline.test.ts` (no `endsWithin`), and the two new `signin.spec.ts` checks (no long
  wait's line).
- `node --test` on `deadline.test.ts` and `auth-words.test.ts`: 13 pass. `signin.spec` and `join.spec` under the gentle
  guard (1 worker): 27 passed, before and after the review's changes.
- Mutants, each run against the unit test and the two new checks, then removed: a late wait that never fails, the
  first send without a limit, the code without a limit, the code without the long wait's line, the code said in the
  email's words: each killed. The control (a comment changed) passed.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc`.
- Independent review: no P1 or P2 (late outcomes dropped safely, `stall=1` unchanged, no StrictMode or HMR issue). Its
  P3s taken: the first email's own words, `AUTH_LIMIT_MS` no longer exported, the invited buttons' focus, the test's
  comment on the light and a second of margin after each clock jump.

## Limitations and next action

- The invited person's sign-in has no fixture page (a member's sign-in needs real Auth): it uses the same helper and
  words, read in review, not run.
- Not taken, already so before: `SlowNote` arrives with its words in a new `role="status"`, which some screen readers
  skip; `SLOW_NOTE` speaks of our API waking, roughly true for Auth.
- Still without a limit near sign-in (the review's notes, a later PR): the passkey picker (`PasskeySignIn.tsx`), the
  provider buttons (`ProviderButtons.tsx`), and the unlock checks in `reauth.ts`.
- CI's first run failed on the send-again check fixed by #186 (main then lacked it). Main merged in; not run again
  locally (a heavy app open, so the guard starts no browser): CI runs it.
- Codex's P1 on #187: the invited «Email me a sign-in code», waiting aria-disabled, looked like a dimmed fill, not
  the waiting primary's outline; and its P2: «Send it again» looked live. `theme.css` now gives `aria-disabled` the
  look `disabled` had (`.pill.primary` as an outline, `.text-button` dimmed, no pointer). That reaches every waiting
  text button in the Studio (14 more); asserted on the sign-in fixture, not run locally (a heavy app open): CI runs
  the whole suite.
- Next: merge on green CI with no Codex P1.
