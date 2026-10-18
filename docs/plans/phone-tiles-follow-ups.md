# A phone's tiles and its check: follow-ups to Codex on #422, #430 and #434

> 2026-10-18 · six P2s, none a P1; the three PRs merged under the no-P1 rule, these close them. Studio only.

## The gaps, measured

The numbers are a phone's strip at 390 and 320 px (tiles of 65 and 51 px, `room-tiles.spec.ts`) and its gallery at
320 px, three across (tiles of 91 px).

1. **The switch reads the kept choice, not the camera in use (#422, `camera-flip.ts`).** Each press asks for the
   camera after `chosenDevices().videoinput`. Where storage can't be written that is always nothing, so every press asks
   for the second camera: the first flip works, the next asks for the camera already on. A refused switch is kept all
   the same (`deviceSwitch` keeps the choice for the next call first), so the next press skips the camera asked for.
2. **On a touch screen the switch is 30 × 40 px (#422, `theme.css`).** It takes `.tile-pin`'s 30 px width; the shared
   touch rule raises only the height.
3. **On a phone's strip the two presses overlap (#422, `VideoStage.tsx`).** Switch camera at the left and Hide my tile at
   the right, each 30 px and 8 px in: they share 27 px of a 51 px tile, 13 of a 65 px one, and the switch, drawn
   later, takes the press.
4. **The mute mark lies under the switch (#430, `theme.css`).** On a phone's strip the 12 px mark sits at (1, 1) to
   (13, 13) of your tile and the switch at (8, 8). At 320 px no 40 px square fits beside the mark: it would cover all
   but 9 px of the tile's width.
5. **Past the strip's tiles the switch goes with yours (#422, `VideoStage.tsx`).** The floor, the one showing and
   whoever speaks keep a tile before you (`tile-view.ts`), so yours can go into «+N»; «In the call» has no switch, and a
   phone's dock has no device menus.
6. **The check beside Join is a finger's size in portrait only (#434, `theme.css`).** The 42 px square is under
   `max-width: 600px`; on a phone turned sideways, or any touch screen wider than that, it is the computer's 20 × 36 px
   tab again.

## What changes

1. **The call's own camera:** `cameraPresses` (pure) keeps the camera the call is on, from the one kept for calls when
   its first press comes. A press moves it on at once, so a second press before the first is answered goes on from it,
   and a refused switch moves it back. `switchDevice` resolves whether the call switched. The presses are the tab's
   (one call at a time), not the video view's, so turning your camera off and on again keeps them; each call
   (`liveSince`) starts again.
2. **The switch is 40 px wide on a touch screen,** as a round button is.
3. **A phone's strip tile holds one press, at its top-right corner:** with both of yours (your camera on, two
   cameras), «Your tile», which opens a menu of Switch camera and Hide my tile (below); with one, that one. The gallery
   and computers keep both presses, where they fit.
4. **That press draws a 28 px square, clear of the mute mark** at the top-left corner, as the strip's smaller initial
   and chip are. Its target is still 40 px, from the tile's corner, reaching over the mark and the chip, which aren't
   presses. Pin, on others' tiles beside a person pinned, is the same press.
5. **«In the call» gives your line Switch camera** when your tile isn't on the stage, on a phone only, as on the tile.
6. **On a touch screen the check is 40 px square,** as Join is beside it; on a phone, still one of the dock's 42 px
   squares.

## One press, a menu of both (Luis, 2026-10-18)

Luis: «Procede con tu recomendación de una pulsacion.» It answers the first limit this note had: with your camera on
and two cameras, a phone's strip had Switch camera and no Hide my tile.

- **What:** on a phone's strip, when both apply, your tile's one press opens the kit's menu (`Menu`, `MenuItem`,
  `usePopover`, as `DeviceMenu.tsx` has them) with Switch camera and Hide my tile, in that order. It says
  `aria-haspopup="menu"` and `aria-expanded`; the focus goes to the first item on open; Escape closes and gives it back
  to the press; a press outside closes; an item closes the menu, gives the focus back to the press, then acts (Hide my
  tile then hands it to «Show», as before). With your camera off the press is Hide my tile, no menu.
- **Its name, «Your tile»,** for the menu too: plain, and about what it holds, the acts on your tile, not one of them.
  Both acts in the name («Switch camera or hide my tile») is long for a 28 px square and still leaves the menu to say
  them.
- **Its icon, the kit's `more`** (three dots), already the opener of a row's actions in People (`PeoplePanel.tsx`): no
  new icon.
- **Over the clips, measured.** The tile clips what it holds (`.tile { overflow: hidden }`), and its arrival (`animation:
  arrive … both`) leaves it `transform: matrix(1, 0, 0, 1, 0, 0)`, so even a `position: fixed` box inside it lands at
  the tile's own corner, clipped (measured at 390 and 320 px); the strip clips too. No menu in the Studio leaves its
  container today; sheets do, by a portal to `document.body`, but a menu moved there would leave the kit's popover wrap,
  whose press-outside check reads the page's tree. So the menu hangs from a layer in the top layer: a manual popover
  holding the press's box (`TileMenu.tsx`). It stays inside the tile's markup, so the kit's keys and press-outside
  check work as anywhere; it escapes every clip and the room's layers; presses go through the layer to the press under
  it. It follows the press if the page scrolls or resizes, and closes if the press goes (turned past a phone's width).
- **Where it opens:** over the tile, 6 px from the press (the kit's `menu-top`), at the press's end, or at its start
  when the end would come within 16 px of the screen's left edge. Your tile is always the strip's second (the call
  lists you first, `livekit-room.ts`; the tiles keep that order, `tile-view.ts`), so on a phone up to 456 px it opens
  at the press's start.
- **Measured** (captures, menu open, dark and light): 160 × 104 px; at 390 × 844 x 121–281, y 578–682, over the shown
  screen, the strip starting at 683; at 320 × 640 x 93–253, y 342–446, the strip at 447; at 560 px, at the press's end,
  x 58–218. Nothing scrolls sideways; at each item's middle `document.elementFromPoint` is the item itself.
- **The press keeps the strip's geometry** (`.tile-strip .tile-pin`): a 28 px square 4 px from the top-right corner,
  clear of the mute mark, its target 40 px from the tile's corner.

## Checks (written first)

- **Unit** (`camera-flip.test.ts`): with nothing kept, the presses go round; after a refused switch the next press asks
  for the same camera; two presses before the first is answered go round.
- **Browser, `@phone`** (`e2e/camera-flip.spec.ts`):
  - where storage can't be written, the switch still goes to the next camera, then back;
  - a refused switch leaves the call where it was: the next press asks for the same camera;
  - in the gallery at 320 px, three across: Switch camera is 40 px square, clear of Hide my tile;
  - in the gallery at 320 px, your tile keeps its two presses, no menu;
  - beside a shown screen with your camera off, your tile's one press is Hide my tile, no menu;
  - beside a shown screen at 390 and 320 px, camera on, two cameras: your tile has one press, «Your tile»; it opens a
    menu of exactly Switch camera and Hide my tile, the focus on the first, each item what a press at its middle
    reaches; Switch camera switches to the next camera and the focus is back on the press; Hide my tile hides your
    tile («Your tile is hidden», the focus on Show); Escape closes and the focus is back on the press; a press outside
    closes;
  - beside a shown screen at 390 and 320 px, muted: the mark is clear of the press drawn, and its target is 40 px;
  - your tile in «+N»: «In the call» switches your camera.
- **Browser, computer** (`e2e/camera-flip.spec.ts`): beside a shown screen, your tile keeps Hide my tile, no menu.
- **Browser, `@phone`** (`e2e/call-devices.spec.ts`): turned sideways (844 × 390), the check beside Join is 40 px
  square, on Join's line.

## Limits

- In light, while the menu is open, the press under the finger keeps the shared `.round:hover` plane (ink at 6 %),
  which over a camera's black reads as almost nothing; at rest it is the white square. Every press on a tile has it
  (Switch camera did, same colours before and after): a follow-up.
- In the call, the dock's device openers on a touch screen wider than a phone are still the 20 × 36 px tab: a follow-up,
  not this change.
