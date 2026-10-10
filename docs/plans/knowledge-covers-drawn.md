# Knowledge has drawn once every cover on screen has

> 2026-10-09 · Luis: «Procede con knowledge». Left from #202 (`ink-drawn.md`): on Knowledge the contrast and type
> checks waited for the first drawn cover only, so a later one still waiting went unmeasured. No change to the Studio.

## What was measured

- Today the fixture answers every cover's reads at once: when the first drawn cover shows, every cover on screen has
  drawn too (21 runs, desktop and phone, with the CPU slowed 6× too: 6 covers on a wide screen, 2 on a phone, none
  waiting). The gap is real only if covers come at different times, as an API's reads may.

## What changes

- Knowledge's last part in `e2e/drawn.ts` waits until every cover on screen has drawn (none `data-cover="waiting"`), on
  a wide screen and a phone alike, with no branch on the width, and one at least shows words (a page or lines: marks
  alone, covers that couldn't be read, would leave the checks nothing to measure). Covers out of reach never read, so
  only those on screen count.
- A part is a locator to be shown, or a wait of its own (`drawn()` awaits it).
- The fixture's `hold=covers` holds the demo library's covers until `window.fixture.releaseCovers()`, which lets them
  through one after another, 400 ms apart, as a slow API answers them.

## Checks (written first)

- `e2e/drawn.spec.ts`, desktop and phone, with `hold=covers`: when the list shows, a cover on screen still waits (held:
  whatever the runner's pace); let through, once Knowledge has drawn none does. With the old wait it failed (with the
  covers 400 ms apart from the start: 3 covers still waiting on a wide screen, 1 on a phone).
- `ink` and `type-scale`, unchanged, pass.
- Mutants, with a control that passes: the old first-cover wait, «waiting» not looked for, the wait not awaited, one
  cover measured, and the covers not held all fail. «One at least shows words» is a guard no check reaches (every
  cover reads in these fixtures).
