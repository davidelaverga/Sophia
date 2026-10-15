# Implementation-session handoff

Goal and attempt: MUTED-SPEECH («You're muted» when talking with the microphone off; item 3 of Luis's queue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `ui/muted-speech` from `main` (no API, not stacked)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `e147fdbcd398` (tree `fe7a2686d8c4`), the last commit of `ui/muted-speech`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`origin/main` at that commit: `e2e/muted-speech.spec.ts`, `fixtures/fake-livekit.ts`, `fixtures/room.tsx`, `src/features/voice/RoomDock.tsx`, `src/features/voice/livekit-room.ts`, `src/features/voice/muted-speech.test.ts`, `src/features/voice/muted-speech.ts`, `src/features/voice/useProjectRoom.ts`, `docs/plans/muted-speech.md`. The review notes below name the commit of each later change.

## Outcome

- **`muted-speech.ts`, the watch:** speech is loud samples (at least 0.25 on the meter) for half a second, gaps under
  200 ms bridged. Once said, it stays quiet for 20 seconds.
- **`muted-speech.ts`, the listening:** `hearWhileMuted` opens its own stream on the chosen microphone, analyses it ten
  times a second, and never sends it.
- **`livekit-room.ts`:**
  - `mutedMicrophone` listens while the microphone is off in the call. It syncs on every microphone change, a host's
    mute included (`TrackMuted`/`TrackUnmuted`, `LocalTrackPublished`, `setMicrophone`).
  - It lets the stream go when the call ends.
  - It reports through `onSpeakingMuted`.
- **`useProjectRoom`:** `mutedHint` holds for five seconds.
- **The dock** says «You're muted. Turn the microphone on to be heard.» as a status, only while the microphone is still
  off.
- **Fake room:** `window.fixture.speakMuted()` stands for speech on a muted microphone.

## Evidence

- Plan: `docs/plans/muted-speech.md`.
- Written first and failing (commit `9549d4db`): `muted-speech.test.ts`, 4 cases, and `muted-speech.spec.ts`, 2 cases.
- **After the change, locally:**
  - unit tests 4/4;
  - muted, room dock, call keys, call devices and call reactions specs: 27/27;
  - type-aware lint over the whole repo, typecheck and Prettier are clean.
- **Not exercised here:** the real microphone stream. The fixture's LiveKit is a fake, and the watch and the dock are
  what the tests prove.

## Remaining obligations

- CI; Codex with no open P1.
- **Not done:** joining with the microphone already off and never turning it on publishes no microphone track. The
  hint starts at the first microphone change, a host's mute included.
