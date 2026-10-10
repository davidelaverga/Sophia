# Updates: a made thing's Open sits by its words

> 2026-10-09 · Luis: «Procede», after the «$20» evaluation. Measured on the demo's Updates: the readout's «Open» sat
> at the far end of its row, about 270 px from the words it opens, alone at the column's edge. No API change.

## What is wrong

- A line of «Since you last looked» is a grid of the mark, its words and its press; the words' column takes all the
  row's room, so «Open» lands at the column's right edge, far from the title it belongs to, and reads as a stray link.

## What changes

- The words' column takes the room its words need and no more; «Open» follows them on the same line. A long title
  still wraps before it. The meeting's recap sheet, which draws the same parts, is untouched (the rule is Updates').

## Checks (written first)

- `updates-digest.spec.ts`: in the demo, the readout's «Open» starts within 24 px of the end of its words, on their
  line.
