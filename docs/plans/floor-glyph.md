# Take the floor has its own glyph

> 2026-11-23 · Luis: «Yes, all five» (`five-decisions.md`, 22, option B), then «A, person on a spot». Improvement 22
> of the independent evaluation of 2026-11-22. Studio only; no API change, no new text.

## Measured

- At 390, «Take the floor» is a 42 px square drawn with `hand`. «Raise hand» lives in React's menu with `handRaise`,
  which is the same hand plus a small wave.
- With the compact dock of #548 (640 px), both sit two squares apart as two hands.
- At 1280, «Take the floor» shows its words and no icon (the glyph is in the markup, 0 px wide).

## What changes

- `Icon.tsx` gains `floor`: a person on a lit spot (head, shoulders, the ellipse of light under them), on the 24 grid,
  stroke 1.5, round ends like the rest.
- «Take the floor» (`FloorAction`) draws `floor`. The hand now means one thing: asking for a turn.
- `hand` stays for Needs you's permission item; `handRaise` is unchanged.
- `phone-dock.md`'s table: «Take the floor · a person on a lit spot».
- The name, tip and words are unchanged: «Take the floor».

| Measure                         | Before                  | After                     |
| ------------------------------- | ----------------------- | ------------------------- |
| Glyph at 390 (dark and light)   | a hand                  | a person on a lit spot    |
| Hands drawn in the dock's row   | 2 with #548 at 640      | 1 (Raise hand)            |
| Square at 390                   | 42 × 42, warm           | 42 × 42, warm             |
| Glyph colour, light             | `rgb(150, 83, 40)`      | same                      |
| At 1280                         | words, no icon          | same                      |

## Checks

- `e2e/room-dock.spec.ts`: Take the floor's drawing has no finger (the hand's 1.5 radius arc) and has the spot's
  ellipse; Raise hand's still has fingers. With the old `hand` glyph, the finger check fails.
- The phone row's checks (seven 42 px squares, one row, names and tips) unchanged.
