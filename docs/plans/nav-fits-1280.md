# The views' nav whole at 1280

Luis asked to keep polishing (2026-10-12). Measured on `room.html?demo=1&place=updates` and `…&place=conversations`
at 1280 × 800, the room idle (headless Chromium; `evaluacion-2026-10-12/updates-dark-1280.png`).

## What was measured

- The nav's seven views need 528 px (`scrollWidth`) and have 515 (`clientWidth`): on Conversations «Resources» is cut
  at the right under the fade, on Updates «Studio» is cut at the left («tudio»), the nav having scrolled to keep the
  current view clear. At 1366 the nav has 528 and stands whole. The header's end cluster is 392 px idle (the dock's
  Join pill 129, the connection pill 92, search 36, Invite 71, the account 28).
- Each view is its words with a 10 px lead on each side (13 px, 500), the row's gap 2.

## What changes

- A view's lead is 8 px on each side: the seven views need 500 px, 15 inside the room they have at 1280 with the room
  idle. In a call the dock is 189 px wide and the connection pill yields (#254), so the nav keeps 556: whole as well.
  The words, the size and the weight do not change; the gap between words goes from 20 to 16, still the row's own.

## Checks (written first)

- `widths.spec.ts`: at 1280 on Updates and on Conversations, the nav's `scrollWidth` is its `clientWidth` and neither
  end hides more (`data-more-start`, `data-more-end` absent); the first and the last view are whole in the row.

## Left

- Under 1280 the row still scrolls with its fades, as designed (#233); the current view keeps clear of them.

## After the review (Codex on #259)

- Under 760 px the nav's side padding subtracts the links' 8 px, not the former 10, so the first word starts at the page
  gutter again; widths.spec @phone reads the first word's left against the header's padding.
- The 1280 px test waits for the view to be drawn (the header's actions come with the snapshot and take width from the
  nav), then for the fonts, then polls.
