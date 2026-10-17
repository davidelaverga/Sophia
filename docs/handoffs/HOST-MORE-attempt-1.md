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
`origin/api/archive-project` at that commit: `apps/api/src/app.ts`, `apps/api/src/diagnostics/sanitize.ts`, `apps/api/src/livekit.ts`, `apps/api/src/readiness.db.test.ts`, `apps/api/src/routes/rooms.ts`, `e2e/host-controls.spec.ts`, `fixtures/fake-people.ts`, `fixtures/fixture-api.ts`, `src/api/client.ts`, `src/app/theme.css`, `src/features/studio/ActivitySheet.tsx`, `src/features/studio/PeoplePanel.tsx`, `src/features/voice/livekit-room.ts`, `src/features/work/labels.ts`, `db/migrations/0060_room_acts.sql`, `docs/plans/host-more.md`, `packages/contracts/amendments/A31-host-more.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/src/generated-types.ts`, `packages/persistence/src/activity.ts`, `packages/persistence/src/index.ts`, `packages/persistence/src/persistence.db.test.ts`. The review notes below name the commit of each later change.

## Outcome

- **Migration 0060:** `sophia.record_room_act(uuid,uuid,text)`.
  - `camera` and `screen` act on an active member; `mute_all` acts on the project.
  - Admins only; an unknown act is refused (22023).
  - 0057's `record_host_act` is untouched.
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
  - `persistence.db.test.ts` «room acts (0060)»;
  - `readiness.db.test.ts` without 0060;
  - `host-controls.spec.ts`: camera and screen stop, Mute everyone, and an editor without it.
- **After the change, locally:**
  - host-controls, project-activity, room-people, two-screens and room-tiles specs: 49/49;
  - contracts:check, typecheck and type-aware lint are clean;
  - labels unit test: 4/4;
  - captures checked the menu and the confirmation. The head first sat flush against the tabs, so it gained padding.
- **DB tests** run in CI only.

## Decisions and changes

- **Stopping is muting:** a host's stop mutes the published tracks on the server (`muteSources`); only their owner
  turns them on again, and their Studio stops sharing when its screen is muted.
- **Codex P1 on #369, after the ending commit: the screen stop on a real server.** The crossing from the server to the
  sharer's own client was covered by the fixture only.
  - `host-controls.livekit.test.ts` (`90b3fd32`) has a member share a screen with its sound through rtc-node, with
    frames and samples flowing.
  - A host's `stopScreen` mutes both on the server, and the sharer's client hears `TrackMuted` for both publications.
  - Stopped again, nothing changes. Someone with no screen has nothing to stop, and their microphone stays as it was.
  - `pnpm test:livekit` on the pinned image, locally: 6/6. It passed on the code as it was: the check adds the
    coverage, not a fix.

## Remaining obligations

- #368 merges first.
- The browser SDK's own answer to that mute (the Studio stopping its share, `livekit-room.ts`) is the fixture's check,
  and the next real-stack video pass's.

## Next bounded action

- Luis: once #368 merges, merge this one on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the pinned
  `@livekit/rtc-node` 1.1.0's room events.

## Later change: #351's Codex P2s (same panel, same routes)

- **`removedJustNow`:** this admin's `room.host_removed` for the target in the last ten minutes. The remove route
  answers 204 when a retry finds the person gone.
- **`PeoplePanel`:**
  - `Pending` shows `SLOW_NOTE` past six seconds;
  - a removal moves the focus to the list.
- **`--corner-room`:** 144 px for three toggles (156 px on touch).
- **Evidence:**
  - tests first (`3a039a2e`): host-controls' slow note, the focus after a removal and the corner's room, plus
    `persistence.db.test.ts` «a removal just recorded»;
  - host-controls, room-people, room and dock-header specs: 56/56;
  - typecheck and lint are clean.
