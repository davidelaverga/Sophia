# Implementation-session handoff

Goal and attempt: UIKIT-76 (a new project's first step; `informe-primer-proyecto-20.md` findings 2–3; Luis: «Sí,
mergea #310 y empieza con la PR 1»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/first-step` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no service code, no deploy, no
contract.
Runtime unit: Luis's Windows host (node's test runner; the Studio's preview in the app's browser pane); CI as the run on
record.
Existing authority: Luis's standing instructions for the kit (push to `ui/*`; one review round, then P2s to the
follow-up list); merges are Luis's, with no open P1. Spending: CI minutes only.
Ending commit/tree: `9bcf132f26be` (tree `8693c4544386`), the last commit of `ui/first-step`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 10 files changed against
`origin/main` at that commit: `e2e/first-step.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/room.tsx`, `src/app/theme.css`, `src/features/studio/StudioShell.tsx`, `src/features/studio/first-step.test.ts`, `src/features/studio/first-step.ts`, `src/features/voice/RoomStage.tsx`, `src/features/voice/room-view.ts`, `docs/plans/first-step.md`. The review notes below name the commit of each later change.

## Outcome

- See `docs/plans/first-step.md`. While a project is new (`isNew`: the ledger read and empty, no goal, nobody in the
  call), Sophia's line says «A new project · Start by telling Sophia what it's for.» with two quiet presses in it:
  «Talk it through» (joins the room) and «Write to Sophia» (opens the chat, where «Chat with Sophia» starts the typed
  conversation). Once anything is recorded, a goal exists or the call begins, the line is the room's again.
- `RoomLine` takes optional `presses`, drawn by Sophia's line under its note; the ledger is the brief's own read
  (viewer, cursor). The fixture's `fresh=1` is a project just made.

## Evidence

- Written first and failing (`654c7955`): `first-step.test.ts`, `e2e/first-step.spec.ts`, the fixture's `fresh=1`.
- Unit suite: # pass 1178 # fail 0 ; Prettier, type-aware lint and typecheck clean.
- On the preview: the step drew first under the stage's body, on the dock, a second primary over Join the room (moved
  into the line, both quiet); then «Write to Sophia» opened the chat with «Chat with Sophia».
- Local Playwright did not run (a heavy app was open); CI is the run on record.

## Decisions and changes

- Changed: the room's line for a new project. Preserved: the room for every project with a record, a goal or a call.
- Authority: not widened.

## Remaining obligations

- CI; Codex with no open P1 before merge.
