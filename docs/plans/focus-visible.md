# Where the keyboard is, a person sees

> 2026-10-10 · Luis: «Sigue con lo siguiente de la cola». The «$20» pass, a dimension past contrast: focus and
> motion, measured on every fixture page. No API change.

## What was measured

- Each page walked by Tab (up to 40 stops), each stop's look read focused and at rest, with the rows around it (a
  field draws its focus on its row, `:focus-within`):
  - one stop shows nothing: a task tile in the Unassigned lane (Tasks and the work space). Its own dashed edge
    (`[data-mark='free']`, and `'unknown'` the same) has the focus ring's weight and comes after it, so it wins.
  - every other stop on the twelve pages shows its focus.
- Measured apart (a probe, not this spec): with reduced motion asked for, no animation still runs on any page.

## What changes

- A task tile's focus ring wins over its mark's dashed edge, whatever their order (`.task-tile[data-mark]:focus-visible`).
- `e2e/focus-visible.spec.ts`: on each of the twelve fixture pages, once drawn and with transitions off, every stop
  Tab reaches shows something a person sees focused that it doesn't at rest, itself or its three rows: an outline
  with width and ink, a shadow, an edge or a ground with ink, an underline, a colour (a line field's focus is its
  bottom edge). The walk meets stops by element, not by name (two «Copy» presses are two), ends when it goes round
  or at 40, and measures one at least. Read by CSS alone: what a script sets on blur lands after both reads.

## Checks (written first)

- The new spec failed on Tasks and the work space (the unassigned tile), passed on the ten others; with the change,
  every page passes (twice).
- `work`, `room-work`: unchanged, pass.
- Mutants, with a control that passes: the mark winning again fails Tasks and the work space; the app's own focus
  ring removed fails nine pages of twelve.

## Left

- The spec walks the first 40 stops a page has: what lies past them (a long board's last tiles) is not walked.
