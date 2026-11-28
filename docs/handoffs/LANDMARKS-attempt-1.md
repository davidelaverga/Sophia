# Handoff: each place has a main part and a first-level heading, attempt 1

Goal and attempt: LANDMARKS (`docs/plans/landmarks.md`; Luis 2026-11-27, «Sigue con la cola de mejoras de UI»),
attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/landmarks` from `origin/main`
`4e2ba1cbc`.
Changed files: `Places.tsx`, `Welcome.tsx`, `PersonalSpace.tsx`, `WorkSpace.tsx`, `personal.css`, `StudioShell.tsx`,
the Home fixture, `app-auth.spec.ts` (a locator), `e2e/landmarks.spec.ts`, the note, this record. Studio only.

## Outcome

Home, Personal, Work and the room each have one `main` and one `h1`, so a screen reader's landmark and heading lists
reach the page. Nothing moves on screen.

## Evidence

- Measured in the browser pane at 1280 × 800 and 390 × 844, before (stashed) and after: the three headings keep their
  size, line height, weight and box.
- Format, types and lint clean.

## Remaining obligations

- CI is the record for the new spec (the Playwright guard refuses while Opera is open).
- The guest's room has no `main` (the note's «Not covered»).
