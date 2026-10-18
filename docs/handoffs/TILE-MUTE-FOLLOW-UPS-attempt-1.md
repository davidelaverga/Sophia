# Implementation-session handoff

Goal and attempt: TILE-MUTE-FOLLOW-UPS (Codex P2s on #411, from the follow-up list; Luis: «Sigue con la cola»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `room/tile-mute-follow-ups` from `origin/main`
(`c2dc1160`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con la cola»; merges on green with no open P1.
Ending commit/tree: `04f4b0c709c5` (tree `7401ef157e37`), the last commit of `room/tile-mute-follow-ups`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 7 files changed against
`origin/main` at that commit: `e2e/room-tiles.spec.ts`, `fixtures/fake-people.ts`, `src/app/theme.css`, `src/features/voice/VideoStage.tsx`, `src/features/voice/room-view.test.ts`, `src/features/voice/room-view.ts`, `docs/plans/muted-on-tiles.md`. The review notes below name the commit of each later change.

## Outcome

- **A viewer's microphone off shows as muted,** on tiles and in the list without video. Every person's token
  publishes a microphone: members and guests always, viewers since A06 (`rooms.ts` and `access.ts`).
- **On a phone's strip, muting takes nothing from the chip:** the mute is a 12 px mark at the tile's top-left, clear
  of the initial's circle even at 320 px. The chip keeps «muted» for a screen reader.

## Evidence

- Plan: `docs/plans/muted-on-tiles.md`, «Follow-ups».
- **Measured on main, before:** a guest's strip tile at 390 px gave the name 13 px unmuted and 0 px muted. At 320 px,
  muted, «guest» ran 8 px past the tile.
- **Written first (commit `e9f3d37f`):**
  - `room-view.test.ts` failed: a viewer's microphone off wasn't muted;
  - `room-tiles.spec.ts` failed: muted, the chip lost the name.
- **After the change, locally:**
  - unit 26/26;
  - `room-tiles` with the room, recap, review, passage, made, pin and muted-speech specs: 119/119;
  - `host-controls`, `room-people` and `room-basics`: 27/27;
  - Studio typecheck, lint and Prettier: clean.
- **Captures** (`evaluacion-2026-10-16/capturas/tile-mute-after-390.png`, `-320.png`): «N… guest» at 390 px as
  unmuted, «guest» whole at 320 px, and the mark at each muted tile's corner.

## Decisions and changes

- **The corner, not a smaller icon:** shrinking the icon and its margins still left the name 1 px at 390 px. The
  chip's width in a fifth of a phone holds the name and «guest» only.
- **Top-left:** a phone shows a tile's Pin at the top-right, and the initial stands centred above the chip.
- **The chip keeps the words** («muted», for a screen reader); the corner mark is drawn only (`aria-hidden`).
- **`muted=n`** in the fixture lets the nth other person come in muted.

## Remaining obligations

- **#422** (camera flip) puts your own tile's switch at its top-left on a phone. Once both are on main, your own muted
  tile with its camera on needs the two to share that corner: this is the follow-up list's «Prevent the two tile
  actions from overlapping».

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
