# Implementation-session handoff

Goal and attempt: PEOPLE-VOLUME (the QoL queue's third item, Luis 2026-10-16: «Sigue con lo que queda en la cola»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `room/people-volume` from `origin/main`
(`0fd3c915`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Sigue con lo que queda en la cola»; merges on green with no open P1.
Ending commit/tree: `d21976f95290` (tree `1ac7b874e4e4`), the last commit of `room/people-volume`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 10 files changed against
`origin/main` at that commit: `e2e/people-volume.spec.ts`, `fixtures/fake-livekit.ts`, `src/app/theme.css`, `src/features/studio/PeoplePanel.tsx`, `src/features/voice/livekit-room.ts`, `src/features/voice/people-volume.test.ts`, `src/features/voice/people-volume.ts`, `src/features/voice/useProjectRoom.ts`, `docs/handoffs/PEOPLE-VOLUME-attempt-1.md`, `docs/plans/people-volume.md`. The review notes below name the commit of each later change.

## Outcome

- **People:** each other person's row has «Volume for Marco», a menu that says «For you alone» and offers 100%, 75%,
  50%, 25% and Off. A guest's row has it too; your own doesn't.
- **What the square shows:** a speaker at full, the level itself in its place when turned down («50%»), and a struck
  speaker when Off. Nothing of it leaves the row.
- **What a level covers:** everything heard from that person, their voice and their shared screen's sound.
- **How long it lasts:** kept by person while you're in the call, so someone who joins again keeps it. Leaving the call
  sets everyone back to full.
- **Where a page can't set a sound's volume** (iPhone, iPad), the menu offers 100% and Off only.

## Evidence

- Plan: `docs/plans/people-volume.md`.
- **Written first (commit `bcf94bcf`):**
  - `people-volume.test.ts` failed: the module wasn't there;
  - on that commit, `people-volume.spec.ts` failed 3/3: no volume control.
- **The captures caught two faults, fixed test-first:**
  - the level first sat on a tag at the speaker's corner, and on a phone Marco's «Off» reached over Lucía's speaker;
  - the menu's head («Only you hear the change») broke over two lines.
  - The check that the control stays inside its row, and the new head, failed on `99b56d58` and pass on `0408fa9e`.
- **After the change, locally:**
  - `people-volume`, `host-controls`, `room-people`, `room-tiles`, `room`, `room-basics` and `call-devices`: 61/61;
  - `people-volume` again after the fix: 3/3;
  - `people-volume.test.ts`: 6/6;
  - Studio typecheck and Prettier: clean.
  - Lint: clean, apart from main's own `ProjectBody` length, which #423 fixes (see Remaining obligations).
- **Captures** (`evaluacion-2026-10-16/capturas/`):
  - `volume-1-menu-desktop.png` and `-phone.png`: the menu, «For you alone» on one line, 100% marked;
  - `volume-2-rows-desktop.png` and `-phone.png`: Marco Off with a struck speaker, Lucía at «50%» in her square, rows
    aligned with and without the admin's menu.

## Decisions and changes

- **Five levels, not a slider.** They cover «too loud» and «too quiet». A page can't raise a sound past full without
  Web Audio, which would change how every voice in the call plays.
- **The levels live in the connection (`people-volume.ts`), not in LiveKit's own `setVolume`.** LiveKit's puts no
  volume of 0 on a sound that arrives later (`if (this.elementVolume)` in its `attach`).
- **Off stops their sound coming,** as «Show others’ cameras» does for cameras: their audio tracks are let go, and a
  track they publish while Off isn't taken.
  - Muting alone wouldn't hold. LiveKit's `startAudio` unmutes every sound it has: on the dock's «Allow audio» and, on
    iPhone and iPad, each time the page shows again (`Room.startAudio`, livekit-client 2.22.3).
  - Until a track stops, what still plays is muted at 0.
  - At publish time only an Off person's track is let go. Anyone else's is LiveKit's to take, as ever, with no
    request more from here (review before push).
- **The admin's menu and the volume share one row-menu hook** (`useRowMenu`): Esc closes the menu only, and a choice
  hands the focus back first, as the admin's menu already did.
- **Sophia isn't in the panel,** so her voice keeps the call's.

## Remaining obligations

- **Main's lint:** it is red since #368 merged (`ProjectBody`, 63 lines); #423 fixes it. This branch takes main after
  #423 lands, then lint runs clean here too.
- **#369** rewrites the People panel (stop camera and screen, Mute everyone). Whichever of the two merges second takes
  the other's rows. Both are this session's.
- **On a phone,** «Show others’ cameras» (the incoming-video PR) is in the dock's Video settings, which a phone in a
  call hides. Once both are on main, People gets the switch too.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and livekit-client 2.22.3's
  source in `node_modules`.
