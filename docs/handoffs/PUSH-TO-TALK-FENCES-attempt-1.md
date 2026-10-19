# Implementation-session handoff

Goal and attempt: PUSH-TO-TALK-FENCES (two Codex P2s on #381, from the follow-up list; Luis: «Sigue con los P2 en local, sin subir
nada»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `room/push-to-talk-fences` from `origin/main` (`215166872`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con los P2 en local, sin subir nada»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `f42d9c92130a` (tree `1a1bcdda86e9`), the last commit of `room/push-to-talk-fences`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`origin/main` at that commit: `e2e/push-to-talk.spec.ts`, `fixtures/fake-livekit.ts`, `fixtures/room.tsx`, `src/features/voice/RoomDock.tsx`, `src/features/voice/push-to-talk.test.ts`, `src/features/voice/push-to-talk.ts`, `src/features/voice/useProjectRoom.ts`, `src/features/voice/usePushToTalk.ts`, `docs/plans/push-to-talk.md`. The review notes below name the commit of each later change.

## Outcome

- A slow microphone that arrives once Space is up still goes off again (the P1), but only while push to talk's own turn-off is the call's last microphone choice in the same call: the dock's microphone turned on meanwhile stays on, and a call joined again keeps its microphone and the saved «on».
- Space pressed again while push to talk's own mute is still settling talks again: the rule counts a microphone its own turn-off is still taking down as off.

## Evidence

- Three new e2e in `push-to-talk.spec.ts`: on main the dock case and the rejoin case end with a trailing `microphone:off`, and the re-press is never asked (`off, on, off`); with the fix all pass.
- `push-to-talk.test.ts`: 4/4 (the muting case new); on main the new case returns null.
- Playwright through `safe-run.ps1`, two workers: push-to-talk, device-check, room, room-tiles and voice-chat specs, 51/51 (the P1 late-arrival and the re-press-before-arrival tests unchanged).
- Prettier, `oxlint --type-aware` (size limits included) and `tsc --noEmit -p apps/studio` clean.

## Decisions and changes

- One fence for both P2s: `room.chosenStill()` (connection and a count of microphone choices, bumped before the setter's first wait). `muting` is that fence still holding, not the off's promise, so it can't clear before the snapshot catches up, and a dock click during the mute (a new choice) is never overridden by Space.
- Arrival and text mode's silence stay out of the count: a rejoin is fenced by the connection, and silence is an off.
- The hook takes the room object instead of a fourth parameter, and reads keys through a module `talkKey`, so it stays under 60 lines.
- The fixture's held mute queues later microphone changes behind it, as LiveKit's mute lock does; the existing `holdMicrophone` path is untouched.

## Remaining obligations

- Unchanged from main: a late push-to-talk «on» arriving in text mode still leaves text mode through switchMicrophone.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
