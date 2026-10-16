# Implementation-session handoff

Goal and attempt: HOST-MORE (everyone muted, a camera or a screen stopped by the host; Luis's queue item 3), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `api/host-more` from `api/archive-project`
(#368; stacked for the migration and amendment order)
Writable scope: this worktree only; no deploy, no hosted migration.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); DB tests in CI.
Existing authority: Luis's queue; merges on green with no open P1, after #368.
Ending commit/tree: `7a304bf31a70` (tree `f8a4ccac0968`), the last commit of `api/host-more`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 22 files changed against
`origin/api/archive-project` at that commit: `apps/api/src/app.ts`, `apps/api/src/diagnostics/sanitize.ts`, `apps/api/src/livekit.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/rooms.ts`, `e2e/host-controls.spec.ts`, `fixtures/fake-people.ts`, `fixtures/fixture-api.ts`, `src/api/client.ts`, `src/app/theme.css`, `src/features/studio/ActivitySheet.tsx`, `src/features/studio/PeoplePanel.tsx`, `src/features/voice/livekit-room.ts`, `src/features/work/labels.ts`, `db/migrations/0059_room_acts.sql`, `docs/plans/host-more.md`, `packages/contracts/amendments/A31-host-more.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/src/generated-types.ts`, `packages/persistence/src/activity.ts`, `packages/persistence/src/index.ts`, `packages/persistence/src/persistence.db.test.ts`. The review notes below name the commit of each later change.

## Outcome

- **Migration 0059:** `sophia.record_room_act(uuid,uuid,text)`.
  - `camera` and `screen` act on an active member; `mute_all` acts on the project.
  - Admins only; an unknown act is refused (22023).
  - 0056's `record_host_act` is untouched.
- **A31:** `stop-camera`, `stop-screen` and `mute-all`. The route body follows A24's.
- **`livekit.ts`:** `stopCamera` and `stopScreen` through `muteSources`; `muteEveryone` skips Sophia and unknown
  standings.
- **`routes/rooms.ts`:** `moreHostControls`, with a shared `hostRoom`.
- **Persistence:** `recordRoomAct`.
- **Readiness predicate**, and the sanitizer's event types and summary codes.
- **Studio:**
  - The People menu gains «Turn off camera» and «Stop screen sharing», with under-way and refused words for each.
  - `MuteEveryone` (a `ConfirmButton`) for admins while someone else's microphone is on.
  - `livekit-room.ts` stops this person's own share when the host mutes it.
  - Activity and pulse wording.
- **Fixtures:**
  - the stop and mute-all routes;
  - fake people whose camera and screen go off.

## Evidence

- Plan: `docs/plans/host-more.md`.
- Written first and failing (commit `92a8cb94`):
  - `persistence.db.test.ts` «room acts (0059)»;
  - `readiness.db.test.ts` without 0059;
  - `host-controls.spec.ts`: camera and screen stop, Mute everyone, and an editor without it.
- **After the change, locally:**
  - host-controls, project-activity, room-people, two-screens and room-tiles specs: 49/49;
  - contracts:check, typecheck and type-aware lint are clean;
  - labels unit test: 4/4;
  - captures checked the menu and the confirmation. The head first sat flush against the tabs, so it gained padding.
- **DB tests** run in CI only.

## Remaining obligations

- #368 merges first.
- The screen stop in a real call (LiveKit's remote mute reaching the local publication) is covered by the fixture
  only. A real-stack check belongs to the next real-stack video pass.
