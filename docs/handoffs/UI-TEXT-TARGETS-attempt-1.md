# Handoff: Hold and Stop answer across their row under a mouse, attempt 1

Goal and attempt: UI-TEXT-TARGETS (`docs/plans/text-targets.md`; improvement 12 of the independent evaluation of
2026-11-22, option B of `five-decisions.md`), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-12-target` from `origin/main`
`d1e6b1410`.
Ending commit/tree and changed files: content commit `44966d901` (`apps/studio/src/app/theme.css`,
`apps/studio/e2e/goal-controls.spec.ts`), then the note and this record.

## Outcome

- Under a mouse, a goal's «Hold» and «Stop» press across the row's 28 px and 2 px past their sides (32 × 28 and
  33 × 28, from 28 × 24); nothing drawn changes. Under a finger, 44 × 44 as before.

## Evidence

- Fixtures on the branch (:5181), browser pane, Tasks at 1280 × 800, dark and light: the targets above by
  `elementFromPoint`; the gap's middle presses nothing; drawn height 24; the `::after` paints nothing.
- The new check seen failing with the `::after` removed in the page (every point missed).
- `pnpm format:check`, `lint`, `typecheck` 0.
- Playwright through `pw-gentle.ps1`: `goal-controls`, `control-heights` 22 passed.

## Decisions and changes

- 2 px, not the proposal's 3 (or 2.5): at 2.5 the middle of the 6 px gap was pressed as Stop by the hit test's
  rounding. The targets are 32–33 px wide instead of 34.

## Remaining obligations

- The PR is not merged.

## Next bounded action

Luis reviews the PR. From `five-decisions.md`, 22 waits on Luis picking a glyph and 23 on its mock-up.

Source IDs consulted: `five-decisions.md`, `goal-controls-text.md`, `demo-findings-1.md` (#9), `app/theme.css`
(`.controls .control-row .text-button`), `e2e/goal-controls.spec.ts`.
