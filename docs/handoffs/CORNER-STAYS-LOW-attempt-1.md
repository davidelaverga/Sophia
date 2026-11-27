# Handoff: the corner stays beside the dock, attempt 1

Goal and attempt: CORNER-STAYS-LOW (`docs/plans/corner-stays-low.md`; Luis 2026-11-27, on the fixture), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/corner-stays-low` from `origin/main`
`9c6034cee`.
Changed files: `theme.css`, `dock-fit.ts` (+ test), `useDockFit.ts`, `e2e/corner-stays-low.spec.ts`, the note, a
pointer in `corner-reach.md`, this record. Studio only.

## Outcome

Opening the panel no longer moves Chat, People and Brief: from 560 to 800 px they stay level with the dock, and go up
only where even the folded dock wouldn't fit beside them. Wherever they sit up, their tips open downwards, clear of the
top bar.

## Evidence

- The note's table, measured in the browser pane at 1100, 945, 1280, 390 × 844 and 375 × 667.
- Units 2663/2665 (the two Windows-only failures, `attention` and `browser-imports`, fail on main too); lint, format
  and types clean.

## Remaining obligations

- CI is the record for the new spec (the Playwright guard refused locally: Opera was open).
