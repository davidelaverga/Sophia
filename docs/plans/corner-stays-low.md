# The corner stays beside the dock when the panel opens

> 2026-11-27 · Luis, on the fixture with the Brief open: «¿Por qué la barra se mueve hacia arriba cuando se despliega
> el side chat? … el tooltip choca con los elementos del navbar de arriba». Studio only; no API change, no new text.

## Measured

- Window 1100 × 800, panel open: the stage is 720 px. Below 800 px a rule sent the corner (Chat, People, Brief) up to
  the lenses' line, 10 px under the top bar, so the press you had just made jumped from y 735 to y 58.
- Up there its tips still opened upwards (`side="top"`): over the top bar's tabs.

## What changes

- From 560 to 800 px the corner keeps its place, level with the dock. The dock centres in what the corner leaves
  (`--corner-room`) and gives way as it already does: words, then icons, then its extras folded.
- Only where even the folded dock would wrap beside it does the corner go up: `useDockFit` tries it low first
  (`fitBeside`, dock-fit.ts) and marks the stage `data-corner-up` otherwise. At 945 × 800, in a call with Sophia
  speaking, the folded dock needs 370 px and gets 365, so the corner goes up there, as before.
- Wherever the corner sits up (that mark, or a short phone's stage), its tips open downwards over the stage; a new
  message's peek opens under it too.
- A phone is unchanged (corner-reach.md): just above the dock when the stage is tall, up at the lenses on a short one.

| Measure                                   | Before                    | After                               |
| ----------------------------------------- | ------------------------- | ----------------------------------- |
| 1100 × 800, open or close the panel       | corner y 735 → 58         | y 735 both ways; dock 42 px clear   |
| 945 × 800, call, Sophia speaking, panel   | corner up                 | corner up (folded wouldn't fit)     |
| Tip with the corner up                    | over the top bar          | y 107–136, under the corner         |
| 390 × 844 / 375 × 667                     | above the dock / up       | same; tips up / down                |
| 1280, panel open (900 px stage)           | level with the dock       | same                                |

Theme doesn't matter here: only positions change.

## Checks

- Unit: `fitBeside` in dock-fit.test.ts (low while any layout fits; folded rather than move; up only past folded).
- E2E: `corner-stays-low.spec.ts` (the corner's top unchanged as the panel opens at 1100; up with the tip under it at
  945). Walked in the browser pane first; the Playwright guard refused locally (Opera open), so CI is the record.
