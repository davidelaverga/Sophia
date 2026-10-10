# Implementation-session handoff

Goal and attempt: a Done with no reply, checked without racing the feed (`docs/plans/test-done-no-reply.md`), the
first attempt. Luis: «Fix flaky Done-with-no-reply room task test», then «Fusiona cuando esté en verde».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a test fix named in «Goal and attempt».
Writable scope: `apps/studio/e2e/room-passage-task.spec.ts`, the design note and this handoff.
Runtime unit: the Studio's browser checks (`apps/studio/e2e`); no product, API, contract or CI change.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `test/done-no-reply` from `main` (`0ccc344d`), 2026-10-10
Ending commit/tree: `1870bfe325f6485099d2d3f6c95c2457e321580a` (tree `d6ecdcf7197c6c44689e41fe6021585f4d3f9d0f`). The commit after it changes only this handoff (an earlier commit, `a249499e`, added it with this line empty).

## Outcome

- The test waits for the feed's read of the task it makes before it opens the Tasks tab and presses Done, so no read
  that comes after Done can bring the Done (recorded, its reply lost) and settle the row before Try again. What it
  checks is unchanged.

## Evidence

- The cause, traced in the code: `taskBy` records the task and moves the feed; the feed re-reads the snapshot after
  its debounce and then the tasks; the Tasks tab, opened at once, reads them itself and shows the row, so Done could
  be pressed first. A lost reply moves nothing, and Try again replays the same record.
- Under the machine's guard (1 worker, low priority), repeated 25 times: the fixed test, 25 passed; the old test from
  `main` as the control, 15 of 25 failed, at both steps seen before (the row already «Done by you.», or Try again gone).
- Prettier, `pnpm run lint` (whole repo), `tsc --noEmit` for the Studio.
- Independent review (committed objects): no P1 or P2; the cause and the wait's sufficiency confirmed against the
  fixture and the feed. Its P3s taken: the note's failure rate reconciled with the runs, the comment's wording, why the
  tab's own read can't bring the Done.

## Limitations and next action

- TanStack re-reads on the page's return to view (`visibilitychange`); nothing in a headless run triggers it.
- Next: merge on green CI with no Codex P1.
