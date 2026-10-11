# Implementation-session handoff

Goal and attempt: UIKIT-14 (a fifth lane, Blocked, while something is), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/board-blocked` from `ui/shadow` at `292f64d3`
(stacked on PR #235 → #234 → … → #220; the base retargets as each merges)
Ending commit/tree: `3ff86c5c` (tree `bcc06fb746b9`): 7 files, 1 new (`docs/plans/board-blocked.md`); `plan.ts`,
`PlanBoard.tsx`, `board.css`, `plan.test.ts`, `served-board.test.ts`, `e2e/work.spec.ts`. The commit after it adds
only this handoff.

## Outcome

- `laneOf(row, rows)`: a row up next whose `blocked_by` names an item of its plan not complete or closed stands in
  `blocked`; a blocker outside the plan, or a candidate review, does not hold it.
- The board's lanes: Active · Up next · Blocked · Unassigned · Complete; Blocked only while it holds something
  (`shownLanes`); `.board-lanes` takes `--lanes` (4 or 5); the fifth lane's arrival delay 320 ms.
- `plan.test.ts`: four cases (active blocker → blocked; complete blocker → next; outside the plan → next; candidate
  review → next). `work.spec.ts`: the lane test names five lanes and the foot «After Implement the PDF retry» on the
  blocked tile; the deep case; `many=1` folds in Blocked (5 shown, «Show 2 more», 7); `goals=6` → the fonts goal keeps
  four lanes and four columns.
- Unverified here: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck`: clean. Planning unit tests: 157 pass, 0 fail.
- Measured in the page (the pane at 1280×800, the Tasks fixture): lanes `active · next · blocked · unassigned ·
  complete`; Up next «Review the retry's candidate»; Blocked «Write the export's release note», no chip, foot «After
  Implement the PDF retry»; columns 5 × 229 px, no lane overflows; `--lane-delay` on the fifth 320 ms. `many=1`:
  Blocked 5 tiles, «Show 2 more». `goals=6`: 5 lanes on the first goal, 4 lanes / 4 columns (292 px) on «Exports keep
  the report's fonts», no Blocked region.
- Before the change (the same page): four lanes; the release note stood in Up next beside the candidate review.

## Decisions and changes

- Blocked after Up next, in the order of time, and only while something is: a board with nothing blocked keeps its
  four lanes and its widths.
- Blocked is read from the plan (`blocked_by`) against the rows' marks, not from a `dependency` wait: the plan says it
  before any service reports a wait, and a proposed plan shows it too.
- A candidate review stays Up next: it is sequenced by design and already reads «Reviews …».

## Remaining obligations

- Watch CI for `work.spec.ts` (the lane test, deep, many, goals); the independent review (Codex) with no P1/P2 before
  merge. The base is `ui/shadow` until #235 merges.

## Next bounded action

Home's right half «Needs you» (F2, UIKIT-15) behind the vision flag with fixture data; then the re-evaluation.
