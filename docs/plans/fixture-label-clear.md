# The fixture's label clears the board's and Resources' tabs

> 2026-10-09 · Luis: «sigue evaluando e iterando», after the «$20» evaluation. Measured: on `work.html` and
> `resources.html` the yellow fixture label covers four of the project's tabs (Tasks, Knowledge, Updates, Resources).
> Fixture pages only; nothing the Studio builds changes.

## What is wrong

- The label sits at the top centre, over the project bar. The demo's pages (`?demo=1`) already moved theirs to a
  corner, and on a phone to a thin line along the top edge; the board and Resources have no demo and kept the top
  centre, so a presentation shows them with the tabs half hidden.

## What changes

- On those two pages the label takes the demo's place: the bottom-left corner, and on a phone a thin line along the
  top edge, its words kept for a screen reader. Its words don't change (they say what is simulated, and as whom).
- `?demo=1` isn't given to them: it switches the shared fixture data to the demo's project.

## Checks (written first)

- `fixture-label-clear.spec.ts`: on both pages, desktop and phone, the label still says «Simulated», and its box
  touches none of the app's controls.
