# What Sophia made keeps what its room holds

> 2026-11-23 · Luis: «Sí, arréglala», on a finding from fixing CI on #554. Follows `room-made-object.md`. Studio only;
> no API change, no new text.
> 2026-11-24 · Luis on the phone row, «se ve muy cargado y poco estético», then «B · la tarjeta abre»: see «On a phone,
> the object says less». One new glyph, pending Luis.

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

## On a phone, the object says less

Measured at 390 × 844 with the fit above in place: five things in one row (its icon, a title cut to «Fixture…» in
49 px, a kind cut to «REPORT…», Open filled, Show everyone outlined, Close), then her words, then «Asked by you» alone
on a line at the right.

On a stage ≤ 560 px wide (the same unnamed container query as the room's other phone rules):

- **The whole object opens the report.** Open covers the object, under its other controls; its words stay its name
  («Open»), its key O and its ring the object's edge. A chevron follows the title. Show everyone and Close stand over it.
- **Show everyone is a glyph,** `show` in the kit: a page between two pairs of waves. Its words stay its name and its
  tip. It is new, and pending Luis; Share your screen keeps its own.
- **Who asked joins the kind's line:** «Report · v1 · asked by you». The line of its own goes.
- From 560 px up, and on a computer, nothing changes.

| Two captions | Before | After |
| --- | --- | --- |
| 390 × 844, title | 49 px, «Fixture…» | 201 px of room; «Fixture report» whole (81 px) |
| 390 × 844, object | about 136 px tall | 102 px, 63 px over the captions |
| 375 × 667, object | about 106 px, «Fixt…» | 94 px, title whole, 15 px over the caption |
| 1280 × 800 | Open, Show everyone | same |

The results are the same in dark and light (headless captures, software Chromium through `safe-browser.cjs`; the
browser pane stopped delivering frames).

- **`e2e/room-made.spec.ts` (@phone):** the title is whole; who asked is on the kind's line and not on its own; Show
  everyone is ≤ 36 px wide and named; the centre of her words and of the title is Open's, while Close and Show everyone
  answer for their own points; a press on her words opens the report.
- **Seen failing without it** (the phone rule's width set to 1 px): the title was cut by 34 px.
- **Through `pw-gentle.ps1`:** `room-made`, `made-refusal`, `present-refused-exit`, `room-present` and `room-captions`,
  62 of 62.
