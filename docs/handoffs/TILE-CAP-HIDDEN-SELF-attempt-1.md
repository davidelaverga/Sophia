# Implementation-session handoff

Goal and attempt: TILE-CAP-HIDDEN-SELF (Codex P2 on #380, from the follow-up list; Luis: «Sigue con los P2 en local, sin subir
nada»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `room/tile-cap-hidden-self` from `origin/main` (`21516687`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con los P2 en local, sin subir nada»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `ddb16db0a947` (tree `d256f90cd086`), the last commit of `room/tile-cap-hidden-self`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 6 files changed against
`origin/main` at that commit: `e2e/room-tiles.spec.ts`, `src/app/theme.css`, `src/features/voice/VideoStage.tsx`, `src/features/voice/tile-view.test.ts`, `src/features/voice/tile-view.ts`, `docs/plans/room-basics.md`. The review notes below name the commit of each later change.

## Outcome

- Hiding your tile keeps the room's tile cap: «Your tile is hidden» takes one of the tiles people get, so the gallery stays at nine tiles (eight people's, Sophia's) and a phone's strip at five, on one row, the rest in «+N».
- On a phone's strip the placeholder fits its 65 px tile: an eye struck through over Show, its words kept for a screen reader.

## Evidence

- Plan: `docs/plans/room-basics.md`, «Follow-ups».
- **Written first:** `room-tiles.spec.ts` failed on main's code: ten tiles in the gallery, six on a phone's strip; then, with the cap fixed, the placeholder 19 px over its tile (found by the triage's refuter). `tile-view.test.ts`: `peopleTiles` wasn't there.
- **After the change, locally:** `room-tiles`, `room-basics`, `room-pin-fullscreen`, `two-screens`: 29/29; unit 8/8; typecheck, lint, Prettier clean.
- **Captures:** `evaluacion-2026-10-17/p2-hidden-self-phone-before.png` and `-after.png`.

## Decisions and changes

- **`peopleTiles(strip, selfHidden)`** in tile-view.ts, pure and unit-tested; the gallery's `data-count` now counts the placeholder in `useKeptTiles`.
- **The row check waits for the tiles' arrival animation,** which moved one tile 3 px.
- **The eye only in a phone's strip:** elsewhere the words fit and stay as they were.

## Remaining obligations

- None.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
