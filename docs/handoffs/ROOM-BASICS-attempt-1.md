# Implementation-session handoff

Goal and attempt: ROOM-BASICS (how long the call has run, your own tile hidden, your mirror; Luis's QoL queue item 1),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `room/basics` from `origin/main` (`9b984ea0`)
Writable scope: this worktree only (`apps/studio`, `packages/ui`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Seguimos con quality of life»; merges on green with no open P1.
Ending commit/tree: `e13d2314b993` (tree `ea246ca8125e`), the last commit of `room/basics`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 14 files changed against
`origin/main` at that commit: `e2e/room-basics.spec.ts`, `fixtures/fake-livekit.ts`, `fixtures/fake-people.ts`, `src/app/theme.css`, `src/features/voice/DeviceMenu.tsx`, `src/features/voice/RoomDock.tsx`, `src/features/voice/VideoStage.tsx`, `src/features/voice/call-clock.test.ts`, `src/features/voice/call-clock.ts`, `src/features/voice/mirror-preference.ts`, `docs/plans/room-basics.md`, `packages/ui/src/Menu.tsx`, `packages/ui/src/menu-class.test.ts`, `packages/ui/src/menu-class.ts`. The review notes below name the commit of each later change.

## Outcome

- **`call-clock.ts`** (pure) gives the clock and its words. `CallClock` in `RoomDock`'s live controls, before Leave,
  reads `room.liveSince` with `useNow(1000)`. The phone dock's row of squares hides it.
- **`mirror-preference.ts`:**
  - one external store (`useSyncExternalStore`), kept in localStorage, on by default;
  - `VideoView` reads it;
  - `DeviceMenu` takes `mirror` and lists «Mirror my video» after the background.
- **Kit:** `MenuItem`'s `toggle` makes a `menuitemcheckbox` (`itemRole(checked, toggle)`).
- **`VideoStage`:**
  - `useSelfHidden` and `HiddenSelf`;
  - `TileAct`, the corner press: Pin, or Hide on your own tile;
  - `Tiles`, extracted to keep `VideoStage` under 60 lines.
  - Hiding moves the focus to «Show». The gallery's count includes the hidden slot.
- **Fixture:** `ownFeed` in `fake-people.ts`. `fake-livekit.ts` adds it while the viewer's camera is on.

## Evidence

- Plan: `docs/plans/room-basics.md`.
- **Written first and failing:** commits `5e4b9abe` and `45b568eb`.
  - `45b568eb` moved the mirror to the dock's menu, because a tile clips what overflows it.
  - Afterwards the spec gained `video=camera` (without cameras the stage is Sophia's light alone) and `fastForward`
    (`runFor` fired every timer of the room for 65 s).
- **After the change, locally:**
  - the kit and voice units: 233/233;
  - room-basics, room-tiles, room-people, room-dock, the device and dock specs, host-controls and two-screens: all
    green;
  - type-aware lint, typecheck and Prettier are clean;
  - the capture at 12:35 with the tile hidden.

## Remaining obligations

- None.
