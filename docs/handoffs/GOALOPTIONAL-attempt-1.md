# Implementation-session handoff

Goal and attempt: a goal's criteria mark the exception, optional, not the rule (`docs/plans/goal-optional.md`),
attempt 1. Found in the «$20» evaluation: «· REQUIRED» on every criterion of the demo's Goals; Luis: «sigue evaluando
e iterando».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a fix named in «Goal and attempt».
Writable scope: `apps/studio/src/features/work/GoalCard.tsx`, its label's rule in `apps/studio/src/app/theme.css`,
`apps/studio/e2e/work.spec.ts`, `apps/studio/e2e/views-goals.spec.ts`, the design note and this handoff.
Runtime unit: the Studio (`apps/studio`); no API change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `studio/goal-optional` from `main` (`ab80958f`), 2026-10-09
Ending commit/tree: `040689f83bdbfb61698c453ce158c02f09a565f0` (tree `48591180ca6f1b46b5894e908b50e6edb5ef6883`). The commit after it adds only this handoff.

## Outcome

- A required criterion now says nothing; an optional one ends «· optional», in the same quiet label (class
  `criterion-optional`). On the demo's Goals that is five labels fewer, the word «required» nowhere.

## Evidence

- The evaluation's measure: 5 of the page's 6 mono capitals on Goals, 5 of 7 on Tasks, were «· REQUIRED».
- Written first and failing first: `work.spec.ts` (the goal's criteria opened: the mark on the required one, none on
  the optional) and `views-goals.spec.ts` (5 «required» on the demo's Goals). With the change: `work.spec`,
  `room-work` and `views-goals` under the machine's guard (1 worker), 186 passed; after the review's rename, the two
  checks and the board's type scale, 3 passed.
- Mutants against the two checks, then removed: the rule marked again, no mark at all, both marked: each killed. The
  control (a comment) passed.
- Prettier, `oxlint --type-aware` on the whole repo.
- Independent review: no P1 or P2. «Required unless said otherwise» holds: the contract requires the field, every
  server writer sets `required: true`, and the server's own fallback reads a missing one as required. Its P3s: the
  class renamed `criterion-optional` (taken); `c.required === false` to match that fallback (not taken: the
  contract types the field as a required boolean and the Studio validates replies, so a missing one never reaches
  the card, and the lint refuses the comparison).

## Limitations and next action

- Next: merge on green CI with no Codex P1.
