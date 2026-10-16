# Implementation-session handoff

Goal and attempt: UIKIT-83 (a notice clears an open sheet in a narrow and short window; Codex P2 on #293; Luis's
queue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/toast-short` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/handoffs`); no service code, no deploy, no contract.
Runtime unit: Luis's Windows host (headless captures of the preview); CI as the run on record.
Existing authority: Luis's standing instructions for the kit; merges on green with no open P1 (his queue).
Ending commit/tree: `8c789a4b30e2` (tree `bf24f4c6d17e`), the last commit of `ui/toast-short`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 2 files changed against
`origin/main` at that commit: `e2e/toast-over-sheet.spec.ts`, `src/app/theme.css`. The review notes below name the commit of each later change.

## Outcome

- On a phone a notice over an open sheet goes to the top; in a window both narrow and short (500×400) the sheet, at
  90 dvh, reached into that band. A phone's sheet is now at most `min(90dvh, 100dvh - 64px)`: the notice's band stays
  clear; a tall phone keeps its 90 dvh.

## Evidence

- Written first and failing: `toast-over-sheet.spec.ts` (500×400, the Invite sheet's Calendar).
- Prettier clean. On the preview (headless): 500×400, the notice 12–52 px, the sheet from 64 px; 390×844, the sheet from
  390 px, unchanged.
- Local Playwright did not run (a heavy app was open); CI is the run on record.

## Remaining obligations

- CI; Codex with no open P1.
