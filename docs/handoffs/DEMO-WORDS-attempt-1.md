# Handoff: new messages in the call, and whose role changed, attempt 1

Goal and attempt: DEMO-WORDS (`docs/plans/demo-words.md`; Luis 2026-11-27 approved both lines, «Sí, constrúyelos»;
findings 7 and 5 of the test before the demo), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/demo-words` from `origin/main`
`22d6d8d29`.
Changed files: `unread-title.ts` (+ test), `WhileAway.tsx`, `ProjectShell.tsx`, `role-notes.ts` (+ test),
`InProject.tsx`, two e2e specs, the note, this record. Studio only.

## Outcome

In the call all along, what came while the tab was elsewhere reads «N new messages»; a role change says «Marco is now a
viewer.» under its select.

## Evidence

- Walked in the browser pane: in the call «2 new messages», out of it «2 messages came while you were away»; Marco to
  viewer and editor, one line at 1280.
- Units 2666/2668 (the two Windows-only failures, as on main); lint, format and types clean.

## Remaining obligations

- CI is the record for the specs (the Playwright guard refuses while Opera is open).
