# Implementation-session handoff

Goal and attempt: UIKIT-48 (the board: what changed said as it happened, blockers in the plan's order, the focus kept;
Codex P2s on #236 and #244; Luis: «atiende los P2 en PRs pequeñas»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/p2-board` from `main` at `32854caf`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`), on branch `ui/p2-board`; no service
code, no deploy, no contract.
Runtime unit: Luis's Windows host (node's test runner); CI (GitHub Actions) as the run on record. Playwright on this
host was refused by the machine guard (free RAM under 5 GB with AION2 open).
Existing authority: Luis's standing instructions for the kit follow-ups (push to `ui/*`, answer Codex's threads with a
fix commit, cancel superseded CI runs on `ui/*`); merges are Luis's, with no open P1. Spending: no paid service; CI
minutes only.
Ending commit/tree: `7ac230c394e6` (tree `edd710b49368`), the last commit of `ui/p2-board`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 10 files changed against
`origin/main` at that commit: `e2e/app-auth.spec.ts`, `e2e/board-why.spec.ts`, `e2e/work.spec.ts`, `src/features/work/planning/PlanBoard.tsx`, `src/features/work/planning/plan.test.ts`, `src/features/work/planning/plan.ts`, `src/features/work/planning/seen.test.ts`, `src/features/work/planning/seen.ts`, `docs/handoffs/UIKIT-48-attempt-1.md`, `docs/plans/p2-board.md`. The review notes below name the commit of each later change.

## Outcome

- A task freed by a dropped wait is said so, not as a completion; a v3 look is not read (key v4); «Waiting on» names
  blockers in the plan's order; the focus on «and N more» goes to the line's last blocker when the toggle goes.
- Answers threads 4249597387, 4250196278 on #236 and 4249581789, 4250192304 on #244.

## Evidence

- `seen.test.ts` and `plan.test.ts`: 4 new or changed checks, written first and failing before the change. Whole
  Studio unit suite 1099/1099; lint (type-aware), typecheck and Prettier clean.
- `e2e/board-why.spec.ts`: the toggle's focus check written; `work.spec.ts` and `app-auth.spec.ts` updated to the v4
  key. Not run on this host (guard refused); CI is the run on record.

## Remaining obligations

- CI on the PR, the browser suites among it; the independent review (Codex) with no open P1 before merge.

## Next bounded action

The next follow-up: hover and press states (Codex P2s on #232 and #234).

## Post-review (Codex on #278)

- `7ac230c3`: a look keeps each task's waits by id (`waits`, in the v4 look); a task freed is said «what it waited on is
  complete» only if it still lists every wait it had and each is complete; a wait dropped (some or all) says «it no
  longer waits on another task». Test in `ecf8e52c`, failing first; unit suite 1100/1100.

## CI on record

- Run 38332973669 on `7fc2306f` (this branch's head, every change and review round in it): all jobs green, the browser suites
  among them, the checks this PR wrote included.
