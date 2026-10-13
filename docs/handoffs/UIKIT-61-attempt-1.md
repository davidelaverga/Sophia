# Implementation-session handoff

Goal and attempt: UIKIT-61 (Personal's day pill steps aside for the divider under it; `informe-personal-real.md`
finding 4; Luis: «sigue con los puntos 2–5»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/personal-day-pill` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no service code, no deploy, no
contract.
Runtime unit: Luis's Windows host (node's test runner; Playwright through `.claude-guards/safe-run.ps1` when it
allowed: `explorer.exe` hovering at 3 GB stopped the last run); CI as the run on record.
Existing authority: Luis's standing instructions for the kit (push to `ui/*`; after the 2026-10-13 freeze, later P2s
go to a follow-up list); merges are Luis's, with no open P1. Spending: CI minutes only.
Ending commit/tree: `46f0a0e5a24a` (tree `6ed2c3d554ef`), the last commit of `ui/personal-day-pill`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 5 files changed against
`origin/main` at that commit: `e2e/menu-scale.spec.ts`, `e2e/personal-day-pill.spec.ts`, `src/features/personal/Conversation.tsx`, `src/features/personal/personal.css`, `docs/plans/personal-day-pill.md`. The review notes below name the commit of each later change.

## Outcome

- See `docs/plans/personal-day-pill.md`. While the next day's divider is within the 68 px band under the pill (the
  list's scrolled fade), the pill carries `data-crowded`: faded out in 140 ms, not pressable, out of the Tab order;
  the divider, which names the day and opens the same menu, stands for it. Once the divider has gone above, the pill is
  back naming it.

## Evidence

- Written first and failing (the «(failing)» commit): `e2e/personal-day-pill.spec.ts`. Its first version used a
  600 px window, where the fixture's two days cannot scroll the divider under the pill (scroll range 90 px, probed):
  440 px now.
- Local, through the guard: the pill spec and personal.spec, 99 passed with the pill spec failing on that window
  height, then fixed. menu-scale's day-menu check scrolled to a spot where today's divider sat 36 px under the top, so
  the pill stepped aside and its click timed out: as designed; the check now places today's divider 120 px under the
  top. Its rerun was stopped by the guard (explorer.exe over 3 GB); CI is its run on record.
- Unit suite: # pass 1149 # fail 0 ; lint (type-aware), typecheck and Prettier clean.
- Commands: `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `pnpm exec tsc --noEmit -p apps/studio`,
  `node --test "apps/studio/src/**/*.test.ts"`; Playwright through `safe-run.ps1`.
- Source-register IDs consulted: none.

## Decisions and changes

- Changed: the pill's presence while a divider is right under it. Preserved: what it names, its menu, the dividers
  (which open the same menu), the list's fade.
- Instruction applied: Luis, 2026-10-13, «sigue con los puntos 2–5».
- Authority: not widened.

## Remaining obligations

- CI on the PR (menu-scale's rerun included); Codex with no open P1 before merge.

## Next bounded action

Finding 5: the toast over the open sheet.

## Local run, after the guard allowed it

- Through the guard, 2 workers: the pill spec and menu-scale (its day-menu check with today's divider 120 px under the top): 6 passed.
