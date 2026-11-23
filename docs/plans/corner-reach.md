# On a phone, Chat, People and Brief sit just above the dock

> 2026-11-23 · Luis: «Yes, all five» (`five-decisions.md`, 23, option B), then «Sí, constrúyela» on the mock-up.
> Improvement 23 of the independent evaluation of 2026-11-22. Studio only; no API change, no new text.

## Measured

The room at 390 × 844, in a call, dark and light:

- The stage's corner (Chat, People, Brief) sat at y 164–215, under the lenses; the dock is at y 771.
- On a computer the corner sits level with the dock, and the reach on a phone is the opposite.

## What changes

When the stage is ≤ 560 px wide (a phone), the corner sits at `--floor` + `--dock-h` + 8 px from the bottom, on the
right gutter. This is the existing mechanism: the dock already publishes its height.

What ends above the dock ends above the corner instead: the captions, the gallery, a shared screen and the lens body.
The new variable `--corner-h` holds the corner's height: 48 px, or 52 px under a finger.

On a phone the corner sits under the dock's layer, so a menu opened from the dock (React, a device list) rises over
it where they meet.

The phone-only rule that put the corner at `top: 72px` with Sophia's light is gone, because the corner no longer
sits up there.

Nothing else moves:

- From 560 to 800 px the corner stays up at the lenses' line.
- On a computer it stays level with the dock.

| Measure (390 × 844, touch)          | Before         | After                   |
| ----------------------------------- | -------------- | ----------------------- |
| Corner                              | y 164–215      | y 711–762, 9 px over the dock |
| Captions end                        | y 754          | y 698 (12 px over the corner) |
| Lens body ends (no captions)        | y 748          | y 698                   |
| Gallery / shared screen end         | y 748          | y 698                   |
| React's menu where it meets the corner | —           | the menu is on top      |
| 700 px window; 1280                 | corner up top; level with the dock | same |

The results are the same in dark and light.

## Checks

- **`e2e/room-dock.spec.ts`,** under a mouse at 390 and on the phone project:
  - the corner sits 8–10 px over the dock, 16 px from the right edge, low on the screen;
  - the lens body ends above it;
  - with a shared screen, React's menu covers every point it shares with the corner.
- **Each check seen failing:**
  - with the corner back up top, the gap is 616 px and it is no longer low on the screen;
  - with the corner's old layer, the corner covered the menu.
- **`e2e/room-captions.spec.ts` (@phone):** the captions end above the corner as well as the dock.
