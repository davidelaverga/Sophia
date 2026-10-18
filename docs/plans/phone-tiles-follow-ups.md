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
3. **A phone's strip tile holds one press, at its top-right corner:** Switch camera while it is there, Hide my tile
   otherwise. Hide my tile stays in the gallery, where both fit.
4. **That press draws a 28 px square, clear of the mute mark** at the top-left corner, as the strip's smaller initial
   and chip are. Its target is still 40 px, from the tile's corner, reaching over the mark and the chip, which aren't
   presses. Pin, on others' tiles beside a person pinned, is the same press.
5. **«In the call» gives your line Switch camera** when your tile isn't on the stage, on a phone only, as on the tile.
6. **On a touch screen the check is 40 px square,** as Join is beside it; on a phone, still one of the dock's 42 px
   squares.

## Checks (written first)

- **Unit** (`camera-flip.test.ts`): with nothing kept, the presses go round; after a refused switch the next press asks
  for the same camera; two presses before the first is answered go round.
- **Browser, `@phone`** (`e2e/camera-flip.spec.ts`):
  - where storage can't be written, the switch still goes to the next camera, then back;
  - a refused switch leaves the call where it was: the next press asks for the same camera;
  - in the gallery at 320 px, three across: Switch camera is 40 px square, clear of Hide my tile;
  - beside a shown screen, your tile has one press: Switch camera with your camera on, Hide my tile with it off;
  - beside a shown screen at 390 and 320 px, muted: the mark is clear of the press drawn, and its target is 40 px;
  - your tile in «+N»: «In the call» switches your camera.
- **Browser, `@phone`** (`e2e/call-devices.spec.ts`): turned sideways (844 × 390), the check beside Join is 40 px
  square, on Join's line.

## Limits

- With your camera on and two cameras, a phone's strip has no Hide my tile. A tile a fifth of a phone (51 px) holds
  one 40 px press; the camera's switch is the one a phone has nowhere else.
- In the call, the dock's device openers on a touch screen wider than a phone are still the 20 × 36 px tab: a follow-up,
  not this change.
