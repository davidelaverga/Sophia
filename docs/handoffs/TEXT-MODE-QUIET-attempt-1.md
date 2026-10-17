# Implementation-session handoff

Goal and attempt: TEXT-MODE-QUIET (a fault found while building each person's volume; Luis: «Sigue con lo que queda
en la cola»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `room/text-mode-quiet` from `origin/main`
(`0fd3c915`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Sigue con lo que queda en la cola»; merges on green with no open P1.
Ending commit/tree: `f52902b2a6de` (tree `eb43b4eae666`), the last commit of `room/text-mode-quiet`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 4 files changed against
`origin/main` at that commit: `src/features/voice/livekit-room.ts`, `src/features/voice/sophia-voice.test.ts`, `src/features/voice/sophia-voice.ts`, `docs/plans/text-mode-quiet.md`. The review notes below name the commit of each later change.

## Outcome

- **In text mode Sophia is read, not heard, and now she stays unheard.** Her voice used to be silenced by muting its
  element, which LiveKit's `startAudio` undoes for every element it has:
  - on the dock's «Allow audio», pressed while the call is in text mode;
  - on iPhone and iPad, each time the page shows again once it has run there.
- **Now, while the call reads her,** her tracks are detached and their elements leave the page. Leaving text mode
  attaches them again, and a track that arrives meanwhile waits.
- **Her tracks stay subscribed.** Her signal reads the track, its mute state and LiveKit's speaking flag, never the
  element.

## Evidence

- Plan: `docs/plans/text-mode-quiet.md`.
- **The fault, from livekit-client 2.22.3's source:**
  - `Room.startAudio` sets `e.muted = false` on every attached element of every remote participant when `webAudioMix`
    is off, which is the Studio's setting;
  - on iOS, the same method installs a `visibilitychange` listener that calls it again whenever the page shows.
- **Written first (commit `d8226243`):** `sophia-voice.test.ts` failed, since the module wasn't there.
- **After the change, locally:**
  - `sophia-voice.test.ts`: 5/5;
  - the room's text-mode specs (`room`, `voice-chat`): 17/17;
  - Studio typecheck and Prettier: clean.
  - Lint: clean, with main merged in after #423 fixed main's own `ProjectBody` length.
- **No browser check of the fix itself:** the fixture's connection stands in for LiveKit there, so the unit check
  carries it. No capture: nothing changes on screen.

## Decisions and changes

- **Detached, not muted:** an element that isn't there can't be unmuted, by LiveKit or anything else.
- **Not unsubscribed:** her signal («Sophia is speaking», her light) reads the track and LiveKit's speaking flag, and an
  unsubscribed track would read as her being gone.
- **`sophia-voice.ts` holds the rule** and is unit-tested. `livekit-room.ts` only gives it attach and detach, the same
  ones every voice uses.

## Remaining obligations

- **The per-person volume (#425)** changes the same `remoteAudio`. Whichever merges second takes the other's lines;
  both are this session's.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and livekit-client 2.22.3's
  source in `node_modules`.
