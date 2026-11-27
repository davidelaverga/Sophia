# Handoff: a role change reaches the other person's open tab, attempt 1

Goal and attempt: ROLE-FOLLOWS-AUDIENCE (`docs/plans/role-follows-audience.md`; Luis 2026-11-27, «Sigue con la cola
de mejoras de UI»; finding 5 of the test before the demo), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/role-follows-audience` from
`origin/main` `22d6d8d29`.
Changed files: `useAccess.ts`, `access-view.ts` (+ test), `ProjectShell.tsx`, the room fixture (`roleByAdmin`), a new
e2e spec, the note, this record. Studio only.

## Outcome

The viewer's membership is read again when the snapshot's `audienceRevision` rises, so an admin's role change reaches
an open tab without a reload (fixture: 208 ms, and back 212 ms).

## Evidence

- Fixture walk in the browser pane, and the same walk with the hook removed (Invite still there after 4 s).
- Units 2665/2667 (the two Windows-only failures, as on main); lint, format and types clean.

## Remaining obligations

- CI is the record for the new spec (the Playwright guard refuses locally while Opera is open).
- The admin's confirmation line is new text, proposed to Luis and not built.
