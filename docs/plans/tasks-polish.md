# Tasks, polished: the doer's name keeps its letters; a wrapping blocker keeps its left edge

Luis asked to keep polishing (2026-10-12). Measured on `room.html?demo=1&place=work` at 1280 × 800, dark, headless
Chromium (`evaluacion-2026-10-12/tasks-dark-1280.png`).

## What was measured

- **A name squeezed to one letter.** On the first tile the meta row holds the doer's name and the state chip «Waiting
  on a permission» on one line; the chip does not shrink, so `.task-tile-name` («Marco’s Claude Code», 116 px of
  words) is left 3 px wide and reads as a lone «l» before the chip.
- **A blocker centred under «Waiting on».** In the Blocked lane the blocker's press (`.lane-why .text-button`) wraps to
  two lines and, a button, centres them: the second line starts mid-lane while «Waiting on» stands at the lane's left.

## What changes

- The meta row wraps, with a 4 px row gap: the line is laid out with the name and the chip at their own size, so
  the chip drops under the name whole when the two do not fit, and the name is cut only when alone it is longer than
  the line. Nothing changes where both fit («Luis · Ready for review» stays one line); a `min-width` on the name was
  tried and dropped: it widened a short name past its words and made its chip drop for nothing.
- The blocker's press is left-aligned: its second line starts where its first does, under «Waiting on».

## Checks (written first)

- `work.spec.ts`: on the tile whose chip is «Waiting on a permission», the name's box holds its words whole (its
  width is its words' width) and the chip stands under it; on a tile with a short name the two share a line; the blocker press's computed `text-align` is `left`, and when it wraps, its line
  boxes share a left edge.

## Left

- The chip's words themselves («Waiting on a permission», 23 characters) are the longest state; a shorter wording is a
  product call, not this note's.
