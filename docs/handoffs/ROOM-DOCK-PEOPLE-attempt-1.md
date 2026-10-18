# Implementation-session handoff

Goal and attempt: ROOM-DOCK-PEOPLE (informe-25 R1, R3 and R14; Luis: «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `room/aaa-dock-people` from `origin/main` (`f37006560`)
Writable scope: this worktree only (`apps/studio`, `packages/ui/src/Icon.tsx`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con la cola mientras Davide cierra la ventana y el nuevo informe-25»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `979705ff5e09` (tree `8163d14635ee`), the last commit of `room/aaa-dock-people`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`f37006560` at that commit: `e2e/app-auth.spec.ts`, `e2e/host-controls.spec.ts`, `e2e/light-stage.spec.ts`, `e2e/room-dock.spec.ts`, `src/app/theme.css`, `src/features/personal/personal.css`, `src/features/studio/PeoplePanel.tsx`, `docs/plans/room-dock-people.md`, `packages/ui/src/Icon.tsx`. The review notes below name the commit of each later change.

## Outcome

- Leave is the way out: its icon draws the door behind on the left and the arrow leaving it; at rest it wears the kit's danger tint (rose ink, rose at 0.08, edge 0.4) on a computer, a phone and in light, one step deeper under the pointer, last in the dock and in the header on Tasks; in the places bar its rose ink alone says it at rest and its plane answers the pointer.
- People stands on the panel's gutter: names and «Mute everyone» at x = 1077 (the tabs' line, where they were at 1069); each menu is the kit's 32 px square ending at Close's end (1428), not at the window's edge; on a phone the menus are 40 px inside their rows; «Mute everyone» is a 28 px pill.
- Names over video are one chip in either theme: black at 0.62 with the room's inks; in light «Show Marco’s screen» reads about 10:1 where it read 2.85:1.

## Evidence

- Written first (commit `45a5ef8cd` before the fix): at it, the 11 new tests in room-dock, host-controls (desktop and @phone) and light-stage fail on main's code for the measured reasons (names at 1069 and 8 on a phone, chips `rgba(251, 248, 243, 0.66)` in light, Leave `rgba(236, 235, 241, 0.66)` at rest, its path stroked on the right), and the places test in app-auth fails on Leave's ink; 26 existing tests in those files pass. The places test first lacked `?work=lost` and timed out on a disabled Join: corrected in the test commit before the fix was reapplied.
- Playwright through `safe-run.ps1`, two workers, at the fix (`979705ff5`): room-dock, host-controls, light-stage, app-auth, press-answers, room-honest, room-alive, room-people, room-tiles, two-screens, dock-header, light-mode, control-heights, chips-radii, focus-visible, micro-type, menu-scale, room-basics, room-pin-fullscreen and room-present 242/242.
- Unit: packages/ui and the CSS-reading tests; Prettier, `oxlint --type-aware` and `tsc --noEmit -p apps/studio` clean.
- Captures: `evaluacion-2026-10-17/capturas/after-r1-dock-desktop.png`, `after-r1-dock-phone.png`, `after-r1-dock-phone-light.png`, `after-r1-header-tasks.png`, `after-r1-header-tasks-light.png`, `after-r3-people-desktop.png` (names, tab and «Mute everyone» all at 1077), `after-r3-people-desktop-light.png`, `after-r3-people-confirm.png`, `after-r3-people-phone.png`, `after-r14-video-light.png`, `after-r14-video-dark.png`, `after-r14-screens-light.png`, `after-r14-strip-phone-light.png`.

## Decisions and changes

- Designed and attacked before coding (informe25-design workflow); applied the refuter's changes: the places bar gets its own hover plane (its bare squares would have left Leave's hover dead); the chip copies the dark room's inks (`#ecebf1`, text-2 at 0.66) rather than pure white; the People tests wait for the panel's slide before measuring; the chip tests carry the route abort and the unexpected afterEach.
- «Mute everyone» keeps its words (host-controls.spec names it), not the report's «Mute all».
- R12 (one dock row with the panel open on a computer) is split out: it changes phone-dock.md's «nothing changes on a computer» and waits on Luis.

## Remaining obligations

- R12 waits on Luis: icons with tips below 980 px of stage, or one of the alternatives in the plan.
- The chip copies the dark palette's inks by hand: if it moves, the chip follows (the rule says so). `lowContrast` measures a chip over its tile's plane, not live video.
- Open #425 (people volume) and #430 (`.tile-muted-corner`) touch the same rules: whichever lands second takes the gutter, the 32/40 px columns and the shared chip rule.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
