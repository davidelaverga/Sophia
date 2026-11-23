# Handoff: on a phone, Chat, People and Brief sit just above the dock, attempt 1

Goal and attempt: UI-CORNER-REACH (`docs/plans/corner-reach.md`; improvement 23 of the independent evaluation of
2026-11-22, option B of `five-decisions.md`, mock-up approved by Luis), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-23-corner-reach` from
`origin/main` `0d457778f`.
Ending commit/tree and changed files: content commit `1138bfea6` (`apps/studio/src/app/theme.css`,
`apps/studio/e2e/room-dock.spec.ts`, `apps/studio/e2e/room-captions.spec.ts`), then the note and this record.

## Outcome

- On a stage ≤ 560 px wide, the corner sits 8 px over the dock on the right.
- The captions, the video and the lens body end above it.
- Menus opened from the dock rise over it.
- From 560 to 800 px, and on a computer, nothing changes.

## Evidence

- Fixtures on the branch (:5181), browser pane, 390 × 844 touch, dark and light.
- Light, captions, gallery and shared screen were each measured.
- React's menu was opened over the corner.
- 700 × 900 and 1280 × 800 were measured unchanged.
- Each new check was seen failing in the page.
- `pnpm format:check`, `lint` and `typecheck` all return 0.
- Playwright through `pw-gentle.ps1` was not run because a heavy app was open. The PR's `pull_request` run is the record.

## Decisions and changes

- The corner's height is a CSS value, `--corner-h` (48 px, or 52 px under a finger), not a measurement. The dock's
  `--dock-h` stays the dock's alone.
- On a phone the corner drops to `z-index: 3`, under the dock's layer, because React's menu was drawn under it.
- The lobby's phone rule (`top: calc(var(--topbar) + 132px)`, which put the door under the corner) is left as it
  was. It now has 48 px to spare above it.

## Remaining obligations

- The PR is not merged, and its specs have not been run locally.

## Next bounded action

Luis reviews the PR. This closes the five decisions of `five-decisions.md`.

Source IDs consulted: `five-decisions.md`, `app/theme.css` (`.stage-corner`, `.stage-captions`, `.gallery`,
`.stage-body`, `.dock-wrap`), `RoomStage.tsx`, `RoomDock.tsx` (`--dock-h`), `e2e/room-dock.spec.ts`,
`e2e/room-captions.spec.ts`, `e2e/host-controls.spec.ts`.
