# Implementation-session handoff

Goal and attempt: FOLLOWUPS-ROOM (the Codex P2s left on #357 and #358), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `ui/followups-room` from `main`
Writable scope: this worktree only (`apps/studio`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis, «Sigue con lo que queda en la cola»; merges on green with no open P1.
Ending commit/tree: `d56f2c75e6a3` (tree `4fa1fdf5860a`), the last commit of `ui/followups-room`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 10 files changed against
`origin/main` at that commit: `e2e/muted-speech.spec.ts`, `e2e/two-screens.spec.ts`, `src/app/theme.css`, `src/features/voice/VideoStage.tsx`, `src/features/voice/livekit-room.ts`, `src/features/voice/muted-speech.test.ts`, `src/features/voice/muted-speech.ts`, `src/features/voice/room-view.test.ts`, `src/features/voice/room-view.ts`, `src/features/voice/useProjectRoom.ts`. The review notes below name the commit of each later change.

## Outcome

- **`muted-speech.ts`:** `mutedWatch(listen)` decides when to listen.
  - It listens from any moment the microphone is off.
  - It restarts on a new device.
  - It ends with the call.
- **`livekit-room.ts` (`mutedMicrophone`)** uses it.
  - It syncs at once, so a call that begins muted is listened to.
  - It also syncs on `ActiveDeviceChanged` and `Reconnected`.
- **`useProjectRoom`:** the muted hint clears when the call ends, in the conversation's `interrupted`.
- **`room-view.ts`:** `showScreenLabel`, «Show Luis’s screen · guest».
- **`VideoStage` (`AlsoSharing`):** after a press, the focus moves to the offer's first button.
- **`theme.css`:** the screen caption wraps and grows (`min-height`).

## Evidence

- These are the Codex P2s from `evaluacion-2026-10-13/follow-ups-p2.md`; the plans are muted-speech.md and
  two-screens.md.
- Written first and failing (commit `5a501735`):
  - `muted-speech.test.ts`: the watch's three cases;
  - `room-view.test.ts`: the label;
  - `muted-speech.spec.ts`: the hint goes with the call;
  - `two-screens.spec.ts`: the focus and the guest label.
- **After the change, locally:**
  - unit tests: 31/31;
  - muted-speech, two-screens, room-tiles, room-pin-fullscreen and call-end specs: 25/25;
  - typecheck and type-aware lint are clean.
- **Not covered:** the fixture's fake room stands in for `livekit-room.ts`, so its sync on connect and on a device
  change is covered by `mutedWatch`'s unit tests only.

## Remaining obligations

- CI; Codex with no open P1.
