# Implementation-session handoff

Goal and attempt: INCOMING-VIDEO (the QoL queue's third item, the audio-only half; Luis: «Sigue con lo que queda en la
cola»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `room/incoming-video-off` from `origin/main`
(`14e65afc`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Sigue con lo que queda en la cola»; merges on green with no open P1.
Ending commit/tree: `bb5100254570` (tree `970b63e43e69`), the last commit of `room/incoming-video-off`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`origin/main` at that commit: `e2e/incoming-video.spec.ts`, `fixtures/fake-livekit.ts`, `src/app/theme.css`, `src/features/voice/DeviceMenu.tsx`, `src/features/voice/RoomDock.tsx`, `src/features/voice/livekit-room.ts`, `src/features/voice/useProjectRoom.ts`, `docs/handoffs/INCOMING-VIDEO-attempt-1.md`, `docs/plans/incoming-video.md`. The review notes below name the commit of each later change.

## Outcome

- **«Show others’ cameras»** is a switch in the dock's Video settings, under «Mirror my video», on by default. Off:
  - this browser stops receiving the others' cameras: less data on a phone's connection, less to look at on a busy
    call;
  - while some video is left (your camera, a screen), the others keep their tiles with their initials;
  - with none left, the room shows its view without video, listing everyone, as a call without cameras does;
  - a shared screen still comes;
  - the others still see you.
- **On again,** the cameras come back. **For this call only:** the next one starts with them on.
- **The menu's switches are rows like its other items.** Before, the menu's row styles left checkbox items out, so
  «Mirror my video» (since #380) showed as a grey, centred button.

## Evidence

- Plan: `docs/plans/incoming-video.md`.
- **Written first (commit `b13536e9`):** on that commit, `incoming-video.spec.ts` failed 2/2, since the switch isn't
  there.
- **The spec's first claim was wrong,** found when it first ran in a browser (`f706653c`, main merged in). It said the
  others' tiles stay when no video is left. The room has its own view without video, which lists everyone, so the
  spec now checks both cases: no video left, and your camera on (commit `8212ab8f`, with the menu check).
  - With the implementation reversed on the merged tip, the revised spec failed 3/3. With it in place, it passed.
- **The menu check** (same commit): on the tip before the fix, the switches measured 26 px, filled
  `rgb(107, 107, 107)` and centred, where a row measures 32 px, unfilled and start-aligned. It passes after the fix
  (`f4ca5cdc`).
- **Locally, after the change:**
  - `incoming-video` 4/4;
  - with `call-devices`, `call-backgrounds`, `room-basics`, `room-pin-fullscreen`, `room-tiles`, `room-people` and
    `two-screens`: 55 of 56 passed before the spec was corrected; the 56th was the wrong claim above;
  - after the menu fix, with `room-basics`, `call-devices`, `call-backgrounds`, `host-controls`, `call-reactions` and
    `account-settings`: 34/34;
  - Studio typecheck and Prettier: clean.
  - Lint: clean, apart from main's own `ProjectBody` length, which #423 fixes (see Remaining obligations).
- **Captures** (`evaluacion-2026-10-16/capturas/`):
  - `incoming-1-menu.png`: Video settings with both switches as menu rows, each marked on;
  - `incoming-2-off.png`: your camera on, Lucía's and Marco's tiles with their initials and no video.

## Decisions and changes

- **Unsubscribed, not hidden:** hiding the video would still spend the data. At publish time only a camera published
  while they're off is let go; one published while they're on is LiveKit's to take, with no request more from here
  (review before push).
- **Cameras only:** a shared screen is what the call is looking at.
- **For this call only:** a switch kept from call to call would leave someone wondering where everyone's video went.
- **The menu fix is here** because this switch is the second item it hit. One prefix selector, `[role^='menuitem']`,
  covers every kind of item at the same specificity, at 32 px, and at 44 px on a touch screen.
- **On a phone in a call,** the dock's device menus aren't there (#412). The switch goes in the People panel with the
  per-person volume, once #369 is on main.

## Remaining obligations

- **Main's lint:** it is red since #368 merged (`ProjectBody`, 63 lines); #423 fixes it. This branch takes main after
  #423 lands, then lint runs clean here too.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
