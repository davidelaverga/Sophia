# Knowledge has drawn once every cover on screen has

> 2026-10-09 · Luis: «Procede con knowledge». Left from #202 (`ink-drawn.md`): on Knowledge the contrast and type
> checks waited for the first drawn cover only, so a later one still waiting went unmeasured. No change to the Studio.

## What was measured

- Today the fixture answers every cover's reads at once: when the first drawn cover shows, every cover on screen has
  drawn too (21 runs, desktop and phone, with the CPU slowed 6× too: 6 covers on a wide screen, 2 on a phone, none
  waiting). The gap is real only if covers come at different times, as an API's reads may.

## What changes

- Knowledge's last part in `e2e/drawn.ts` waits until every cover on screen has drawn (none `data-cover="waiting"`), on
  a wide screen and a phone alike, with no branch on the width. Covers out of reach never read, so only those on
  screen count.
- A part is a locator to be shown, or a wait of its own (`drawn()` awaits it).
- The fixture's `covers=slow` answers the demo library's covers one after another, 400 ms apart, so a check can see
  covers come after the list.

## Checks (written first)

- `e2e/drawn.spec.ts`, desktop and phone, with `covers=slow`: when the list shows, a cover on screen still waits (the
  slowdown applies); once Knowledge has drawn, none does. With the old wait it failed: 3 covers still waiting on a
  wide screen, 1 on a phone.
- `ink` and `type-scale`, unchanged, pass.
- Mutants, with a control that passes: the old first-cover wait, «waiting» not looked for, the wait not awaited, one
  cover measured, covers below the screen counted, and the fixture's slowdown dropped all fail.
