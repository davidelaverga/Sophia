# What Sophia made: one line under hers

> 2026-11-23 · Luis: «Sí, arréglala», on a finding from fixing CI on #554 (the object's words ran over the captions).
> 2026-11-24 · Luis on the phone row: «se ve muy cargado y poco estético»; on B and a lit card: «se ve cheap y como que
> no harmoniza»; then, of three directions drawn over the real room, «2 · Una línea». Follows `room-made-object.md`.
> Studio only; no API change, no new words. One new glyph (`show`), pending Luis.

## Measured

The fixture room, a report just made and two captions from Sophia:

- The object was a glass card: an icon, its title, Open, Show everyone, Close, her description, its facts and who
  asked. Squeezed, its words ran on over the captions: 98 px of words in a 31 px box at 375 × 667, 14 px past its
  box at 1366 × 657. The spec measured the box, so it passed.
- On a phone its row held five things: the title was cut to «Fixture…» in 49 px, the kind to «REPORT…».
- Everything else on the stage is words over her light, with no box: her line, the captions, people's names. The card
  was the one app-like box there, and every fix that dressed it (a lit edge, a paper cover, a glow) made it stand out
  more.

## What changes

What she made is one line under hers, words on the stage as hers and the captions are:

- **Its name opens it.** The report's name, underlined in her violet, with a chevron. It is named «Open» and the
  name, and keeps its key O and its tip. Until the task's record is read, it shows the Studio's words, quieter, and
  waits.
- **Its kind and version** follow in mono: «Report · v1».
- **Show everyone and Close** are quiet glyphs, their words their names and tips. Show everyone's glyph is new: a page
  between two pairs of waves, never Share your screen's.
- **A failed read or a refusal** sits on its own line beneath, with its Try again.
- **Her description, its facts and who asked** are the chat card's and the viewer's, not the stage's.
- It is born as before, from her light, soft to sharp.

One line fits every stage, so nothing has to give way. The fit levels, the phone overlay and the earlier caption
giving way on a short phone (all earlier in this PR) are gone.

| Two captions | Before | After |
| --- | --- | --- |
| 1280 × 800 | glass card, 122 px; title cut at 69 px | one line, 28 px; name whole (93 px) |
| 390 × 844 | card, title «Fixture…» in 49 px | one line, 40 px (finger-sized glyphs); name whole |
| 375 × 667 | 98 px of words in a 31 px box | one line, 23 px over both captions |
| 360 × 740 | words past its box | one line, 68 px over |
| 1366 × 657 | 14 px past its box | one line, 46 px over |

The results are the same in dark and light (headless captures, software Chromium through `safe-browser.cjs`).

## Checks

- **`e2e/room-made.spec.ts`:**
  - the notice brings one line: «Open Fixture report», «Report · v1», no background, no description on the stage;
  - @phone: the name whole, every part on one row, Show everyone ≤ 40 px wide, each control the target of its own point;
  - at 1366 × 657, 390 × 844, 360 × 740 and 375 × 667, with both captions shown, its words end above them and it stays
    under her line.
- **Fences:** it no longer casts a shadow (`elevation.test.ts`) or wears the stage's glass (`material.test.ts`).
- **Seen failing:** with the row stacked, the @phone test read a row 141 px tall.
- **Through `pw-gentle.ps1`:** `room-made`, `made-refusal`, `present-refused-exit`, `room-present`, `room-captions` and
  `light-shadows`, 66 of 66.
