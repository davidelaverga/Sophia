# Handoff: People's empty sentence starts where the panel's tabs do, attempt 1

Goal and attempt: PANEL-EMPTY-EDGE (`docs/plans/panel-empty-edge.md`; Luis 2026-11-27, «Sigue con la cola de mejoras
de UI»), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/panel-empty-edge` from `origin/main`
`4e2ba1cbc`.
Changed files: `theme.css`, `e2e/panel-empty-edge.spec.ts`, the note, this record. Studio only.

## Outcome

People's sentence before anyone is in the call begins 16 px in, level with the tabs and the people rows, instead of
against the panel's edge.

## Evidence

- The note's table, measured in the browser pane at 1280 × 800 and 390 × 844.
- Format, types and lint clean.

## Remaining obligations

- CI is the record for the new spec (the Playwright guard refuses while Opera is open).
