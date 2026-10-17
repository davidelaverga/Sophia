# Implementation-session handoff

Goal and attempt: PUSH-TO-TALK (Space held while muted; Luis's QoL queue item 2), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `room/push-to-talk` from `origin/main` (`9b984ea0`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Seguimos con quality of life»; merges on green with no open P1.
Ending commit/tree: `08646cc46beb` (tree `519a0f674048`), the last commit of `room/push-to-talk`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 11 files changed against
`origin/main` at that commit: `e2e/muted-speech.spec.ts`, `e2e/push-to-talk.spec.ts`, `fixtures/fake-livekit.ts`, `fixtures/room.tsx`, `src/app/shortcuts.ts`, `src/features/voice/RoomDock.tsx`, `src/features/voice/push-to-talk.test.ts`, `src/features/voice/push-to-talk.ts`, `src/features/voice/usePushToTalk.ts`, `docs/handoffs/PUSH-TO-TALK-attempt-1.md`, `docs/plans/push-to-talk.md`. The review notes below name the commit of each later change.

## Outcome

- **`push-to-talk.ts`** (pure): `pushToTalk(phase, key, call)` returns start, stop, swallow or null.
- **`usePushToTalk.ts`:**
  - capture-phase keydown and keyup on window;
  - blur stops, and unmounting stops;
  - refs hold the latest mic state.
- **`RoomDock`:** it uses the hook while live, says «Talking…», and the muted hint offers Space. The mini dock in
  other views doesn't, because their Space scrolls the page.
- **`shortcuts.ts`:** stray typing skips a key whose default was prevented, so the focus doesn't move to the chat's
  field when push to talk took Space.

## Evidence

- Plan: `docs/plans/push-to-talk.md`.
- **Written first and failing** (commit `1a5bee99`): `push-to-talk.test.ts`, `push-to-talk.spec.ts`, and the muted
  hint's words.
- The spec's «mic on» check counts only what was asked after Space, because joining asks for the microphone.
- **After the change, locally:**
  - the unit tests 3/3;
  - push-to-talk, muted-speech, room-chat, room-dock, call-keys and every conversation spec: 180/180;
  - commands, goal-controls, segmented-scale and work (stray typing): 220/220;
  - type-aware lint, typecheck and Prettier are clean.

## Decisions and changes

- **Codex P1, out-of-sight project** (`ceb89309` tests, `e158073d` fix): a project kept out of sight takes no Space
  (`ShortcutScope`), and «Talking» is said only with the microphone on.
- **Codex P1, slow enable** (tests, then the fix in the next commit):
  - With the browser still asking, Space let go turned the microphone off before it arrived. LiveKit then published
    the late enable, so it stayed on.
  - The fixture can hold the enable (`holdMicrophone` / `releaseMicrophone`), and the check failed on that.
  - The hook awaits the enable and turns it off again when Space is up by then. A press again before it arrives keeps
    it, and a second check covers that.
  - Push-to-talk: 35/35 over five repeats. Room, dock and device specs: 49/49. Lint and typecheck are clean.
- **Codex P1, a page hidden while Space is held** (`4fe4ae70` test, `ab7ceef4` fix):
  - A phone's app switch or a screen lock hides the page, and neither Space's release nor a blur may come.
  - The hook lets go on `visibilitychange` to hidden too.
  - Push-to-talk, room dock, header dock and call keys: 43/43.

## Remaining obligations

- None.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
