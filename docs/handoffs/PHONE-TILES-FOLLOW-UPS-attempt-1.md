# Implementation-session handoff

Goal and attempt: PHONE-TILES-FOLLOW-UPS (Codex P2s on #422, #430 and #434; then Luis 2026-10-18: «Procede con tu
recomendación de una pulsacion.»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-fix-phone-tiles`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-fix-phone-tiles`, branch `room/phone-tile-follow-ups` from
`origin/main` (`bbdb04cde`); `origin/main` merged in at `588c15e52` (main at `73b6a4077`, no conflicts)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no kit change.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-18, «Procede con tu recomendación de una pulsacion.»; merges on green with no open P1.
Ending commit/tree: `79402c977c6a` (tree `80b4f44cb1d2`), the last commit of `room/phone-tile-follow-ups`'s own that
changes code (later commits on the branch touch only the plan notes and this record). 10 files changed against
`origin/main` at that commit: `e2e/call-devices.spec.ts`, `e2e/camera-flip.spec.ts`, `src/app/theme.css`,
`src/features/voice/TileMenu.tsx`, `src/features/voice/VideoStage.tsx`, `src/features/voice/camera-flip.test.ts`,
`src/features/voice/camera-flip.ts`, `src/features/voice/useProjectRoom.ts`, `docs/plans/camera-flip.md`,
`docs/plans/phone-tiles-follow-ups.md`.

## Outcome

- A phone's camera switch follows the camera the call is on, where storage can't be written and after a refused switch.
- On a touch screen the switch is a 40 px square; turned sideways, the check beside Join is 40 px square too.
- On a phone's strip the mute mark is clear of your tile's press, whose target is still 40 px.
- Your tile in «+N»: «In the call» switches your camera.
- On a phone's strip, with your camera on and two cameras, your tile's one press, «Your tile», opens a menu of Switch
  camera and Hide my tile; with your camera off it is Hide my tile. The gallery and computers keep both presses.

## Evidence

- Plan: `docs/plans/phone-tiles-follow-ups.md` (and `camera-flip.md`, which points to it).
- The six P2s: each a test commit then its fix (`ac04b29a1`/`31d69ed91`, `09c04b04d`/`68f3fe2b5`,
  `3e64fdc04`/`83368a7c8`, `051dbdb98`/`749ac1ef6`, `6c6a271c3`/`146e666b8`, `f4e2f8f39`/`173118969`).
- **After the merge of main, before any change:** `camera-flip`, `call-devices`, `room-tiles`, `room-basics` and
  `host-controls`: 56/56; unit `camera-flip.test.ts` 5/5; type-aware lint and typecheck clean. Nothing to fix.
- **The menu, written first** (commit `8452ac128`): on that commit the eight new phone checks fail on «Your tile» not
  being found, and the controls pass (camera off: Hide my tile, no menu; the gallery at 320 px keeps two presses; a
  computer keeps Hide my tile): 8 failed, 8 passed.
- **After the fix** (`79402c977`): `camera-flip` 16/16; with `call-devices`, `room-tiles`, `room-basics`,
  `host-controls`, `dock-header`, `incoming-video`, `light-live`, `light-stage`, `micro-type`, `room-people`,
  `room-pin-fullscreen`, `room-present` and `two-screens`: 141 passed and one timeout before the page loaded (a gallery
  check, the dock never drawn, while another run shared the machine); run again with `room-tiles`, 37/37. Type-aware
  lint, typecheck and Prettier clean.
- **Captures** (menu open, a throwaway spec, deleted): 390 × 844 and 320 × 640, dark and light, and 560 × 844 dark. The
  menu is in the top layer, 160 × 104 px, 6 px over the press; nothing scrolls sideways; at each item's middle
  `document.elementFromPoint` is the item itself.

## Decisions and changes

- **Luis's decision:** «Procede con tu recomendación de una pulsacion.» On a phone's strip, when both apply, your
  tile's one press opens a menu of both; when one applies, the press is that one, as before.
- **The kit's menu** (`Menu`, `MenuItem`, `usePopover`), as the device menus use it; named «Your tile», the press
  and the menu alike; the kit's `more` icon, already a row's opener in People: no kit change.
- **The top layer, not a portal:** the tile's arrival leaves it a transform, so even a fixed box inside it is held and
  clipped (measured); a portal to `document.body` would leave the kit's popover wrap, whose press-outside check reads
  the page's tree. A manual popover holding the press's box keeps the menu in the tile's markup and over every clip.
- **At the press's start where its end runs off the screen:** your tile is always the strip's second, so on a phone up
  to 456 px the menu opens at the press's start; at 560 px, at its end.
- **`TilePresses`** takes the tile's presses out of `PersonTile`, which stood at the complexity limit.

## Remaining obligations

- In light, while the menu is open, the press under the finger keeps the shared `.round:hover` plane, faint over a
  camera's black; at rest it is the white square. Every press on a tile has it: a follow-up.
- The dock's device openers on a touch screen wider than a phone are still the 20 × 36 px tab: a follow-up.

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
