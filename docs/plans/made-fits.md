# What Sophia made: one row in the dock's material

> 2026-11-23 · Luis: «Sí, arréglala», on a finding from fixing CI on #554 (the object's words ran over the captions).
> 2026-11-24 · Luis on the phone row: «se ve muy cargado y poco estético»; on B and a lit card: «se ve cheap y como que
> no harmoniza»; then, of three directions drawn over the real room, the third, «el material del dock», with a screenshot
> of it («Pensé que era ese»). A one-line version was built first, from a misread of his choice, and replaced. Follows
> `room-made-object.md`.
> Studio only; no API change, no new words. One new glyph (`show`), approved by Luis on 2026-11-24 («Sí, déjalo»).

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

What she made is one row under her line, in the dock's own material: its glass, edge, radius and level, nothing of
its own.

- **What it is:** a quiet icon, its title, and under it its kind and version in mono («Report · v1»).
- **Open,** the room's primary, with its key O.
- **Show everyone and Close** are quiet glyphs, their words their names and tips. Show everyone's glyph is new: a page
  between two pairs of waves, never Share your screen's.
- **A failed read or a refusal** sits on its own line under the row, with its Try again.
- **Her description, its facts and who asked** are the chat card's and the viewer's, not the stage's.
- It is born as before, from her light, soft to sharp.

One row fits every stage, so nothing has to give way. The fit levels, the phone overlay and the earlier caption giving
way on a short phone (all earlier in this PR) are gone.

| Two captions | Before | After |
| --- | --- | --- |
| 1280 × 800 | card, 122 px; title cut at 69 px | one row, 49 px; title whole |
| 390 × 844 | title «Fixture…» in 49 px | one row, 52 px; title whole (161 px of room) |
| 375 × 667 | 98 px of words in a 31 px box, over the captions | one row, 14 px over both captions |
| 360 × 740 | words past its box | one row, 58 px over |
| 1366 × 657 | 14 px past its box | one row, 27 px over |

The results are the same in dark and light (headless captures, software Chromium through `safe-browser.cjs`).

## Checks

- **`e2e/room-made.spec.ts`:**
  - the notice brings one row: «Fixture report», «Report · v1», Open; its glass, edge, radius and blur are the dock's;
    no description on the stage;
  - @phone: the title whole, every part's middle on one row ≤ 44 px tall, each control the target of its own point;
  - at 1366 × 657, 390 × 844, 360 × 740 and 375 × 667, both captions shown, it ends above them and stays under her line.
- **Seen failing:** with the row stacked, the @phone test read a row 205 px tall.
- **Fences:** it stays on the over-stage glass list (`material.test.ts`) and casts the dock's level (`elevation.test.ts`).
- **Through `pw-gentle.ps1`:** `room-made`, `made-refusal`, `present-refused-exit`, `room-present`, `room-captions` and `light-shadows`, 66 of 66. The @phone one-row test failed with the row stacked (205 px tall).

## After the review (Codex P1s on #556, 2026-11-26)

- **Close's touch target:** it had left the round buttons, so the shared touch rule no longer lifted it, and it stayed
  32 × 32 px on touch while Open was 40 px tall. On `pointer: coarse`, Show everyone and Close are now at least
  40 × 40 px. Measured on the fixture at 390 × 844 with touch: Open 58 × 40, Show everyone 40 × 40, Close 40 × 40;
  the row stays one line, its title whole, nothing sideways. The @phone one-row test now checks both are 40 px.
- **The Open tip on narrow stages:** the rule it named was removed when the object became one row (`a4e47247b`). Open
  keeps its word, and under 760 px every tip in the Studio is hidden by the shared rule on main, not by this change.
- `pw-gentle.ps1` refused (Opera open); CI is the record for the spec.
