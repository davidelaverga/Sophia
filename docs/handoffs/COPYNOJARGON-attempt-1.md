# Implementation-session handoff

Goal and attempt: what a person reads says what Sophia does, never what runs her (`docs/plans/copy-no-jargon.md`),
attempt 1. The microcopy review's first pattern; Luis: «Empieza con el 3 y el 2, luego sigue la cola».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a copy fix named in «Goal and attempt».
Writable scope: `apps/studio/src/features/conversation/{conversation-view.ts,conversation-view.test.ts}`, `apps/studio/src/features/artifacts/{report-view.ts,report-view.test.ts}`, `apps/studio/src/features/work/{labels.ts,GoalList.tsx}`, `apps/studio/src/features/work/planning/ReviewSources.tsx`, the design note and this handoff.
Runtime unit: the Studio's words (`apps/studio`); no API, contract or data change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `copy/no-jargon` from `main` (`6d21e64f`), 2026-10-10
Ending commit/tree: `7f4d02b338b18163fd20b61f1780d9dac7ea6944` (tree `44f35c8e3ddf2e41696ea86406a9b39ea9f12f6a`). The commit after it adds only this handoff.

## Outcome

- A task of Sophia's speaks of her, not of her runtime: «Queued» · «Waiting for Sophia to start it.», «Sent to Sophia;
  not confirmed started yet.», «Sophia is drafting.», «…waiting for Sophia to confirm.», «Sophia could not finish
  it.»; the heading «Briefs from Sophia»; a research card «Waiting for Sophia to start the research.»; the room's log
  «Brief waiting for Sophia»; the source review «Sophia can’t take the review right now; it starts as soon as she
  can.» What was not confirmed still says so.
- The board's own words for its agents' work («the lead», «observed», «plan in force», «assignment», and «runtime»
  where it means a coding agent's host) stay: a product decision, with the review's fourth pattern.

## Evidence

- The unit checks were written first with the new words: no phase of a brief, a research or a design names a runtime
  or says «admitted»; the headings say Sophia's work; a queued research waits for Sophia. Each failed, then passes.
  The Studio's unit tests: 1018 passed. The repo's whole unit run has 42 failures on this Windows machine, all in the
  PDF renderer's and the runtime's suites (`renderers/web/pdf`, `tests/unit`), which this change doesn't touch; CI
  runs them on Linux.
- Under the machine's guard (1 worker, low priority): `report`, `work`, `room`, 246 passed.
- Mutants with a passing control: «runtime» back in a phase, «Admitted» back, the heading back to the runtime, the
  research's note back: each fails its check. A first run showed the test's word-boundary regex written with
  backspace bytes (a shell's escape), so a mutant survived: the regex was rewritten and checked byte by byte.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc --noEmit` for the Studio.
- Independent review (committed objects): no P1 or P2. Its P3s: a doc comment still said «from the runtime» (taken);
  a session's Hold or Stop says «waiting for the runtime to confirm» beside a brief's «waiting for Sophia to confirm»
  (left with the board's words); the API forbids «queued» in a refused control's reply, a different surface (noted).

## Limitations and next action

- A session's act steps (`receipts.ts`) still say «runtime» for a coding agent's host: with the board's words, for
  Luis and Davide to name.
- Next: merge on green CI with no Codex P1.
