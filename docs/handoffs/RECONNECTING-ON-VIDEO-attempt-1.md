# Implementation-session handoff

Goal and attempt: RECONNECTING-ON-VIDEO (the third gaps report, fault 5; Luis: «Procede»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `room/reconnecting-on-video` from `origin/main` (`f062d838`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Procede» (the seven faults, one PR each); merges on green with no open P1.
Ending commit/tree: `badcad609b2c` (tree `6b686d10fadb`), the last commit of `room/reconnecting-on-video`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 6 files changed against
`origin/main` at that commit: `e2e/reconnecting-on-video.spec.ts`, `fixtures/fake-livekit.ts`, `fixtures/room.tsx`, `src/app/theme.css`, `src/features/voice/RoomStage.tsx`, `docs/plans/reconnecting-on-video.md`. The review notes below name the commit of each later change.

## Outcome

- **`RoomStage.tsx`:** over video, while the call reconnects, the stage says «Reconnecting…» (`role="status"`)
  with the header's amber dot.
  - It sits at the top of `.stage-over-video`, above a card shown to everyone.
  - `OnVideo` now takes the room, so `RoomStage` keeps its length.
- **`theme.css`:**
  - the word on glass, centred;
  - on a narrow stage, where the corner rises to the top right, it keeps to the left.
- **The fixture:** `window.fixture.linkLost(true|false)` loses and restores the call's link, as LiveKit's
  Reconnecting and Reconnected events tell `onStatus`. The callbacks are kept by `connected(cb)`, so
  `connectRoom` keeps its length.

## Evidence

- Plan: `docs/plans/reconnecting-on-video.md`.
- Written first (commit of the tests): `reconnecting-on-video.spec.ts`. The check with cameras on failed; the one
  without video passed, as before.
- **Found in the capture:** on a phone the centred word ran under the corner's buttons. It keeps to the left now. Measured
  on a 390 px phone: the word spans 16–158 px and the corner starts at 246 px, so it is clear.
- **After the change, locally:**
  - reconnecting-on-video, room-basics, room-following, room-passage, room-people, room-pin-fullscreen,
    room-present, room-tiles, two-screens and room-made: 106/106;
  - type-aware lint, typecheck and Prettier are clean.

## Decisions and changes

- **Over the video, not instead of the line:** the pill sits in the stage's corner over the tiles; without video,
  Sophia's line says it as before.
- **Codex P1 on #403, after the ending commit: the word written twice.** The pill wrote «Reconnecting…» itself, beside
  `roomLine`'s own, against CONTRIBUTING's rule that copy lives in tested view helpers.
  - A unit check came first (`c3d45d0d`) and failed.
  - The fix (`c849e4fe`): `RECONNECTING` in `room-view.ts`, read by `roomLine` and the pill.
  - `reconnecting-on-video`, `room-people` and `dock-header`: 39/39; `room-view.test.ts` 25/25.

## Remaining obligations

- None.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
