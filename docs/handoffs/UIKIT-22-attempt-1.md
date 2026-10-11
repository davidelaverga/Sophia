# Implementation-session handoff

Goal and attempt: UIKIT-22 (the Blocked lane says why; the goal's chip counts what is blocked), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/board-why` from `ui/places-commands` at
`7234a98c` (stacked on PR #243 → #242 → … → #220; the base retargets as each merges)
Ending commit/tree: `70d8d558` (tree `6db658eb7e4e`): 7 files, 2 new (`e2e/board-why.spec.ts`,
`docs/plans/board-why-blocked.md`); `plan.ts` (+ its test), `PlanBoard.tsx`, `PlanTab.tsx`, `board.css`. The commit
after it adds only this handoff.

## Outcome

- `plan.ts`: `blockersOf(blocked, rows)`, the items of the plan the blocked rows wait on that are not complete, once
  each, in their order; unit-tested (two dependents of one blocker, a complete one skipped, one outside the plan
  skipped).
- `PlanBoard`: under the Blocked lane's head, `LaneWhy` says «Waiting on» and each blocker's purpose as a
  `text-button` that opens its sheet with the tiles' own opener.
- `PlanTab`: «N blocked» after the tasks' count on the goal's chip, in the held tone, when any task is blocked.
- `e2e/board-why.spec.ts` (2): the lane's words and the press opening the blocker's sheet; the first goal's chip «1
  blocked» and the fonts goal's chip without it.
- Unverified here: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck`: clean; `plan.test.ts` 32 pass.
- Measured in the page (the pane at 1280×800, the Tasks fixture): under the Blocked lane's head «Waiting on ·
  Implement the PDF retry» (one press, 24 px); pressed → the sheet «Implement the PDF retry» (`task-work-1`). With
  `goals=6`: the first goal's chip «7 tasks · 1 blocked»; the five others none (the second goal's blocked item is
  unassigned, so it stands in Unassigned, not Blocked, as #236 says).

## Decisions and changes

- The «why» lives under the lane's head, not in the tile's foot: a tile is one press (its sheet) and can hold no
  press of its own.
- Named once per blocker, in the plan's order; a blocker outside the plan is not named (the board already says the
  plan does not hold together).

## Remaining obligations

- Watch CI for `board-why.spec.ts` and `work.spec.ts`; the independent review (Codex) with no P1/P2 before merge. The
  base is `ui/places-commands` until #243 merges.

## Next bounded action

The queue from informe-pasada-3 §5 is done but for what needs an API (undo after Hold/Stop, «Needs you» badge and
its API, «remind»); next is Luis's call: the API work with Davide (F2b, F8), or the lenses' product call.
