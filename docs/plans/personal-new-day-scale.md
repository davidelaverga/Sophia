# Personal's day pill and its new day's answers stand on the press scale

> 2026-10-20 · Luis: «Llevar a la escala», on the heights sweep of Personal's new-day state (the day pill at 26 px, the
> three answers at 44 px). The scale is `control-heights.md`'s: 24, 28, 32 or 36 px for a single-line press, measured
> on a desktop; a finger keeps its sizes. Studio only; no API change.

## What was measured

At `personal.html?demo=1&at=00:04` (nothing said today: her line, then «Light today», «Steady», «Heavy today»), on a
1280×800 desktop and a 390×844 phone, dark and light alike (a probe, not kept):

- **The day pill** (`.places .c3-daypill`): 26 px tall on the desktop (`height: 26px`), off the scale; 40 px on the
  phone, by the places' touch rule (`@media (pointer: coarse)`, min 40). Its words sit centred (their middle 0 px from
  the pill's), its chevron too; nothing overflows.
- **The three answers** (`.places .c3-starters button`, the `Ways` rows, under her line of a new day): 44 px tall on
  both (`min-height: 44px`; 10 px padding over a 20 px line is 40, so the minimum sets it). Off the scale on the desktop.
- `control-heights.spec.ts` doesn't see either: its Personal page is read at midday (`at=12:00`), where something was
  said today, so no answers are offered and the list sits at its end with no pill.

The same `Ways` rows carry a first conversation's three ways to start (`talk=new`); they are one component with one
rule, so they move with the answers.

## What changes

- **The pill is 28 px** (`height: 28px`), the scale's small press, as the bar's mark and crumb. Its line (16 px) stays
  centred by its flex; its padding and chevron are unchanged. The days' menu still hangs 6 px under it: `top` 42 → 44
  (10 + 28 + 6). A divider brought to the top by the menu still clears it (`scroll-margin-top: 44px`: the pill's foot
  is at 38, 6 px above). The band where the pill steps aside (the mask's 68 px, `PILL_BAND`) is unchanged: it is
  where the list fades, not the pill's size.
- **The answers are 36 px** on a desktop: `min-height: 36px`, padding 7 px over the 20 px line and its 1 px rule
  (the first row, ruled above too, is 36 by its padding alone; 8 px made them 37 and 38). A long way that wraps (the
  session to get ready for, on a phone) still grows with its lines: a minimum, not a height.
- **A finger keeps 44 px.** In the places' touch block (`@media (pointer: coarse)`, where the pill already takes 40)
  the rows take `min-height: 44px` and their 10 px padding again, so on a phone nothing moves, a wrapped way
  included. A row's own height, not an `::after` reaching past it (the `.text-button` pattern): the rows touch one
  another, and a target reaching into the next row would overlap its neighbour's.

## Checks

- `e2e/control-heights.spec.ts`: one more check, Personal on a new day (`at=00:04`) at 1280×500, short enough that
  the list scrolls and the pill shows at its end (at 1280×800 the shorter answers let the list fit, and the pill
  doesn't show: a page in the loop would pass without measuring it). It asserts the pill and the three answers are
  among the presses measured, then the scale. Its own test at the end of the file, not a line in the pages' list, so
  it merges cleanly beside the clock pinning on `ci/personal-fixture-clock`. Red first: 26 px for the pill and 44 px
  for each answer.
- `personal`, `personal-day-pill`, `personal-day-menu`, `personal-first-talk` and `control-heights`, desktop and phone,
  through the guard; headless captures of the new-day state before and after, dark and light, desktop and phone.
- `pnpm exec prettier --check`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`.

## Found while building: on a phone the days' menu opened over the pill

- Measured with the captures: on a touch screen the pill is 40 px (the places' touch rule), but the menu's `top` was
  the desktop's (10 + 26 + 6 = 42), so it opened over the pill's foot: 8 px over it before this change, 6 px after.
  On a desktop the gap is 6 px before and after.
- **Changed:** in the same touch block the menu hangs at 56 px (10 + 40 + 6), 6 px under the finger-sized pill.
- `e2e/personal-day-menu.spec.ts`, `@phone`: at `at=00:04` the pill opens the menu, whose top sits 6 px under the
  pill's foot once its entrance has settled. Red first: «Expected: 6 · Received: -6». At the end of the file, as
  above, beside the clock pinning.

