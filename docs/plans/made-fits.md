# What Sophia made keeps what its room holds

> 2026-11-23 · Luis: «Sí, arréglala», on a finding from fixing CI on #554. Follows `room-made-object.md`. Studio only;
> no API change, no new text.

## Measured

The fixture room, a report just made and two captions from Sophia. The object sits under her line, and its room is the
lens body down to the captions.

- Squeezed, its box shrank to that room, and its words ran on over the captions:
  - at 375 × 667, 98 px of words in a 31 px box;
  - at 1366 × 657, 14 px past its box.
- Nothing saw it. The box never grew, so nothing that watched it was told. The spec measured the box, so it passed.
- On a phone, Open and Show everyone leave the title about 40 px. Its kind and version («Report · v1») broke onto two
  lines there.
- With #554 (the corner above the dock on a phone), the same happens at 390 × 844.

## What changes

The object never shrinks under its words. `StageMade` measures its room and keeps the first of these that fits
(`madeFit` in `made-view.ts`):

1. the whole object;
2. without its facts and who asked;
3. its one row: what it is, Open, Show everyone and Close. This row always stands and is never measured.

It measures again as the room changes (captions coming and going) or as it does (the record read).

- **Kind and version:** they stay on one line, ending in «…» where the title has no room.
- **On a very short phone stage** (≤ 560 px wide and ≤ 640 px tall, such as 375 × 667): her line, the object's one row
  and two captions don't fit together. While the object is there, the earlier, quieter caption gives way. The newest
  stays.

| Two captions                            | Before                     | After                       |
| --------------------------------------- | -------------------------- | --------------------------- |
| 1280 × 800                              | whole                      | same                        |
| 390 × 844                               | whole, 27 px over captions | same                        |
| 390 × 844 with #554                     | words 23 px past its box   | one row, 22 px over         |
| 360 × 740                               | words past its box         | one row, 23 px over         |
| 375 × 667                               | 98 px of words in 31 px    | one row, one caption, 22 px |
| 1366 × 657                              | 14 px past its box         | one row, 11 px over         |

The results are the same in dark and light.

## Checks

- **`made-view.test.ts`:** `madeFit` keeps the whole object when it fits and tries nothing else; it drops the facts
  before her words; and it keeps the one row without measuring it.
- **`e2e/room-made.spec.ts`:** the short-stage test now measures where the object's words end, not its box, at
  1366 × 657, 390 × 844, 360 × 740 and 375 × 667. Its title and Open are still shown, and the number of captions on
  screen is 2, or 1 at 375 × 667.
- **Seen failing without the fix:** 1366 × 657 at −30 px, 360 × 740 at −10 px, and 375 × 667 with both captions.
