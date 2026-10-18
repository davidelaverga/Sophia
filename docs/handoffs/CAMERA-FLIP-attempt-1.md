# Implementation-session handoff

Goal and attempt: CAMERA-FLIP (a follow-up of #412, phone devices; Luis: «Procede»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `room/camera-flip` from `origin/main`
(`8ea541a0`)
Writable scope: this worktree only (`apps/studio`, `packages/ui`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Procede»; merges on green with no open P1.
Ending commit/tree: `a343a762ca21` (tree `47566d99736a`), the last commit of `room/camera-flip`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`origin/main` at that commit: `e2e/camera-flip.spec.ts`, `src/app/theme.css`, `src/features/voice/RoomStage.tsx`, `src/features/voice/VideoStage.tsx`, `src/features/voice/camera-flip.test.ts`, `src/features/voice/camera-flip.ts`, `docs/plans/camera-flip.md`, `packages/ui/src/Icon.tsx`, `packages/ui/src/Tip.tsx`. The review notes below name the commit of each later change.

## Outcome

- On a phone, in a call, with your camera on and two cameras or more, your own tile offers «Switch camera». It moves to
  the next camera, round: a phone's front, then its back.
- On a computer it isn't there: Video settings chooses.
- The choice is kept for the next call, as a camera picked in the menu is.

## Evidence

- Plan: `docs/plans/camera-flip.md`.
- Written first (commit `4598267e`):
  - `camera-flip.test.ts` failed on the stub;
  - `camera-flip.spec.ts`: on that commit, the phone case failed (no button) and the computer case passed, as it
    should.
- **After the change, locally:** the flip, `room-tiles`, `room-people`, `room-basics`, `room-dock`, `two-screens` and
  `room-pin-fullscreen`: 57/57. Unit checks 2/2. Type-aware lint, typecheck and Prettier are clean.
- **Captures** (`evaluacion-2026-10-16/capturas/flip-1-phone.png`, `flip-2-tile.png`): your tile with Switch camera at
  its top-left and Hide my tile at its top-right; the icon reads as a camera turning.

## Decisions and changes

- **On your tile, not in the dock:** on a phone the dock keeps one row of squares (#412), and its device menus are
  hidden there.
- **Only at 600 px or less**, the same width that hides the dock's device menus.
- **`OnVideo` takes the room,** as #403 has it. The hook lives there, so `RoomStage` keeps its length, and the merge
  with #403 meets the same shape.
- **The kit:**
  - a `flip` icon;
  - a start-aligned tip, so a control at a left edge never pushes its tip past it.
- **The tile's 30 px press** stays as the tile's other press (Hide my tile, Pin) has it.
- **Main merged in (`c320d500b`), after #403 landed:** `OnVideo` keeps #403's reconnecting word over the video and adds the
  flip beside it. Typecheck and lint are clean; CI is the run on record for the merge.

## Remaining obligations

- None.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
